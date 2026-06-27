# 🗺️ Campus Buzz — Data Flow & Architecture

> How data moves through the Campus Buzz system: from browser to database and back, over REST and WebSocket channels.

---

## Table of Contents

- [System Overview](#-system-overview)
- [High-Level Architecture](#-high-level-architecture)
- [Authentication & OTP Flow](#-1-authentication--otp-flow)
- [Post Feed Flow](#-2-post-feed-flow)
- [Real-time Chat Flow](#-3-real-time-chat-flow)
- [Cab Tracker GPS Flow](#-4-cab-tracker-gps-flow)
- [Notification Flow](#-5-notification-flow)
- [Event Request Approval Flow](#-6-event-request-approval-flow)
- [Anonymous Complaint Flow](#-7-anonymous-complaint-flow)
- [Cron Job Lifecycle](#-8-cron-job-lifecycle)
- [Frontend State Architecture](#-9-frontend-state-architecture)
- [Database Index Strategy](#-10-database-index-strategy)

---

## 🌐 System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           INTERNET                                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
             ┌─────────────▼──────────────┐
             │       VERCEL (Frontend)     │
             │   React SPA (CRA)           │
             │   Port: 443 (HTTPS)         │
             └─────────────┬──────────────┘
                           │
               REST /api/*  +  WebSocket (Socket.io)
                           │
             ┌─────────────▼──────────────┐
             │      RENDER (Backend)       │
             │   Node.js + Express 4       │
             │   Socket.io 4 on HTTP       │
             │   Port: 5000                │
             │  ┌──────────────────────┐   │
             │  │  node-cron (*/5 min) │   │
             │  └──────────────────────┘   │
             └─────────────┬──────────────┘
                           │  mongoose
             ┌─────────────▼──────────────┐
             │      MONGODB ATLAS          │
             │   Database: campusbuzz      │
             │   Collections: 8            │
             └────────────────────────────┘
```

---

## 🏛️ High-Level Architecture

```
FRONTEND (React)                          BACKEND (Express + Socket.io)
───────────────────────                   ──────────────────────────────────────

┌──────────────────┐   HTTP REST          ┌──────────────────────────────────┐
│   AuthContext    │ ◄──────────────────► │  routes/index.js                 │
│  (token, user)   │                      │  /api/auth, /api/posts,          │
└────────┬─────────┘                      │  /api/events, /api/complaints,   │
         │                                │  /api/announcements,             │
         │ token                          │  /api/notifications, /api/users, │
         ▼                                │  /api/clubs, /api/rooms,         │
┌──────────────────┐                      │  /api/chat-rooms                 │
│  SocketContext   │ ◄── WebSocket ─────► │  socket/index.js                 │
│  (1 connection)  │                      │  JWT middleware → event handlers  │
└────────┬─────────┘                      └──────────┬───────────────────────┘
         │                                           │
         │ socket / axios                  ┌──────────▼───────────────────────┐
         ▼                                 │  MongoDB (Mongoose)               │
┌──────────────────┐                       │  Users, Posts, ChatRooms,        │
│  Pages &         │                       │  Messages, Events, Complaints,   │
│  Components      │                       │  Announcements, Notifications    │
└──────────────────┘                       └──────────────────────────────────┘
```

---

## 🔐 1. Authentication & OTP Flow

```
Browser                          Express Server                    MongoDB / SMTP
───────                          ──────────────                    ──────────────

POST /api/auth/register
  { rollNo, instituteEmail,
    password, role, displayName }
          │
          ▼
  Validate email regex:
  [a-z]{2+}\d{3}\.[a-z]+\d{4}@*.nitrr.ac.in
          │
  Check for existing email/rollNo
          │
  User.create({ isVerified: false })
          │
  user.generateOtp() → bcrypt hash stored as otpHash
          │
  sendEmail(OTP code) ─────────────────────────────────► SMTP → user inbox
          │
  ◄── { requiresVerification: true, instituteEmail }
          │
          ▼
  User enters 6-digit OTP code

POST /api/auth/verify-otp
  { instituteEmail, otp }
          │
  user.verifyOtp(otp) → compare against otpHash
  Check otpExpire (10 min) & otpAttempts (max 5)
          │
  user.isVerified = true, clear otp fields
          │
  JWT.sign({ id, role }, secret, 7d)
          │
  ◄── { token, user }
          │
          ▼
  localStorage.setItem('cb_token', token)
  AuthContext: { token, user } → available app-wide

─────────────────────────────────────────────────────────────────────────

POST /api/auth/login
  { instituteEmail, password }
          │
  User.findByEmailWithPassword() ← MongoDB (select +passwordHash)
          │
  bcrypt.compare(plain, hash)
          │ ✓ match
  Check isVerified:
    false + otpHash → resend OTP, return 403 requiresVerification
    false + no OTP  → auto-verify (legacy accounts)
    true            → issue JWT
          │
  ◄── { token, user }

─────────────────────────────────────────────────────────────────────────

POST /api/auth/forgot-password
  { instituteEmail }
          │
  user.getResetPasswordToken()
    → crypto.randomBytes(20) token
    → sha256 hash stored as resetPasswordToken
    → resetPasswordExpire = now + 10 min
          │
  sendEmail(resetUrl: CLIENT_URL/reset-password/:token)

PATCH /api/auth/reset-password/:token
  { password }
          │
  sha256(token) → find user with matching hash & unexpired
          │
  user.passwordHash = newPassword (pre-save hook re-hashes)
  Clear token fields → issue new JWT

─────────────────────────────────────────────────────────────────────────

Every subsequent protected request:

  Axios ──► Authorization: Bearer <token>
                      │
              [auth.js middleware]
              JWT.verify(token, secret)
              User.findById(decoded.id)
              req.user = user ──► controller
```

---

## 📰 2. Post Feed Flow

```
USER: Load Feed Page
          │
GET /api/posts?page=1&limit=10&hashtag=#cabsplit&feed=club
          │
  postController.getPosts()
  ┌────────────────────────────────────────────────────────────────┐
  │  Query: Post.find({ isActive: true, ...filters })              │
  │    .populate('author', 'displayName avatarUrl role')          │
  │    .populate('mentions', 'displayName')                       │
  │    .sort({ createdAt: -1 })                                   │
  │    .skip((page-1) * limit).limit(limit)                       │
  │  Index: { isActive: 1, createdAt: -1 }                        │
  └────────────────────────────────────────────────────────────────┘
          │
  ◄── [{ post1 }, { post2 }, ...]
          │
  PostFeed.jsx → PostCard.jsx per post
          │
  Per-post conditional UI:
  ┌──────────────────────────────────────────────────────┐
  │  #foodsplit / #cabsplit → CountdownTimer + Chat      │
  │  #resell                → Chat button (no timer)     │
  │  #lost / #found         → ContactModal (no chat)     │
  └──────────────────────────────────────────────────────┘

─────────────────────────────────────────────────────────────────────

USER: Get Trending Hashtags (RightPanel)
          │
GET /api/posts/trending-hashtags
          │
  Post.aggregate([
    $match: { isActive: true, hashtag: { $exists: true } },
    $group: { _id: '$hashtag', count: { $sum: 1 } },
    $sort:  { count: -1 },
    $limit: 5
  ])
          │
  ◄── [{ hashtag: '#cabsplit', count: 12 }, ...]

─────────────────────────────────────────────────────────────────────

USER: Create Post
          │
POST /api/posts
  { title, description, imageUrl(base64), hashtag, expiresAt?, totalFare? }
          │
  postController.createPost():
  ┌──────────────────────────────────────────────────────────┐
  │  Validate required fields                                │
  │  If #foodsplit/#cabsplit → require expiresAt             │
  │  Extract @mentions from description text                 │
  │  Post.create({ ... })                                    │
  │  For each follower → Notification{ type: 'new_post' }   │
  │  For each mention  → Notification{ type: 'mention' }    │
  └──────────────────────────────────────────────────────────┘
          │
  ◄── { success: true, post: { ... } }

─────────────────────────────────────────────────────────────────────

USER: Like a Post (toggle)
          │
POST /api/posts/:id/like
          │
  interactionController.toggleLike():
  ┌──────────────────────────────────────────────────────────┐
  │  If userId in likes[]  → $pull from likes (toggle off)  │
  │  Else                  → $push to likes,                 │
  │                          $pull from dislikes if needed   │
  │  If new like → Notification{ type: 'like' } to author   │
  └──────────────────────────────────────────────────────────┘
          │
  ◄── { likes: [...], dislikes: [...] }

─────────────────────────────────────────────────────────────────────

USER: Report a Post
          │
POST /api/posts/:id/report
          │
  Verify not author of post
  Fetch all Admin user IDs
  Notification.insertMany({ type:'report', ... }) for each Admin
          │
  ◄── { success: true, message: 'Report submitted.' }
```

---

## 💬 3. Real-time Chat Flow

### 3a. Post-Linked Room

```
USER clicks "Chat" on a #foodsplit post
          │
  socket.emit('joinRoom', { postId })
          │ ─────────────────────────────────────────► socket.on('joinRoom')
          │                                          Post.findById → verify isActive
          │                                          Verify hashtag ∈ {#foodsplit,#cabsplit,#resell}
          │                                          ChatRoom.findOrCreate(postId)
          │                                          ChatRoom.updateOne → $addToSet participants
          │                                          Message.find().sort().limit(50).populate()
          │                                                        │
          ◄─────────────────────────────────────────  socket.emit('joinedRoom', { roomId, history })
          │
  Chat UI renders history

USER sends message
          │
  socket.emit('sendMessage', { postId, text })
          │ ─────────────────────────────────────────► socket.on('sendMessage')
          │                                          ChatRoom.findOne({ postId }) → verify isActive
          │                                          Post.findById → verify isActive
          │                                          Message.create({ roomId, senderId, text })
          │                                         io.to(postId).emit('newMessage', payload)
          ◄──────────────────────────────────────── all sockets in room receive 'newMessage'

USER (post author) closes room
          │
  socket.emit('closeRoom', { postId })
          │ ─────────────────────────────────────────► Verify socket.user is post author
          │                                          ChatRoom.findOne → room.isActive = false
          │                                         io.to(postId).emit('roomClosed', { closedBy })
```

### 3b. Global Hub Room

```
USER opens Chat Hub
          │
GET /api/rooms
          │
  Returns globalRooms (isGlobal:true) + postRooms (isGlobal:false, postId not null)
  Each normalised with _roomType: 'global' | 'post'
          │
  ChatHubPage shows room list with hashtag badges

USER selects a room
          │
  socket.emit('joinGlobalRoom', { roomId })
          │ ─────────────────────────────────────────► socket.on('joinGlobalRoom')
          │                                          ChatRoom.findById → populate createdBy
          │                                          Verify isGlobal & isActive
          │                                          $addToSet participants
          │                                          Leave previous global room if different
          │                                          Message.find().limit(60)
          │                                          io.in(roomId).fetchSockets() → onlineCount
          │                                                        │
          ◄─── socket.emit('globalJoined', { room, history, onlineCount })
          │
  socket.to(roomId).emit('globalUserJoined', { userId, displayName })
  io.to(roomId).emit('onlineUsersUpdate', { roomId, users[] })

USER sends message
          │
  socket.emit('sendGlobalMsg', { roomId, text })
          │ ─────────────────────────────────────────► Message.create(...)
          │                                          ChatRoom.updateOne → lastMessageAt
          │                                         io.to(roomId).emit('globalMessage', payload)

USER creates a new room
          │
POST /api/rooms
  { name: 'Weekend Trek Planning', hashtag: '#misc' }
          │
  ChatRoom.create({ isGlobal: true, name, hashtag, createdBy, lastMessageAt: now })
          │
  ◄── { success: true, data: room }
```

---

## 🚕 4. Cab Tracker GPS Flow

```
DRIVER (post author) enables location sharing
          │
  CabTracker.jsx:
  navigator.geolocation.watchPosition(callback)
          │
  On each position update:
          │
  socket.emit('cabLocation', { postId, lat, lng })
          │ ─────────────────────────────────────────► socket.on('cabLocation')
          │                                            NO DATABASE WRITE
          │                                            socket.to(postId).emit('cabLocationUpdate', {
          │                                              postId, lat, lng,
          │                                              sharedBy: socket.user.displayName,
          │                                              ts: Date.now()
          │                                            })
          │
  ◄── All OTHER sockets in the same post room receive cabLocationUpdate
          │
  CabTracker.jsx: Leaflet marker moves in real time

 ╔══════════════════════════════════════════════════════╗
 ║  GPS coordinates are NEVER written to the database. ║
 ║  Pure WebSocket relay — privacy by design.          ║
 ╚══════════════════════════════════════════════════════╝
```

---

## 🔔 5. Notification Flow

```
TRIGGER EVENT: Someone likes your post
          │
  interactionController.toggleLike():
  ┌──────────────────────────────────────────────────────────┐
  │  Notification.create({                                   │
  │    recipient: post.author,                               │
  │    sender:    req.user._id,                              │
  │    type:      'like',                                    │
  │    post:      postId,                                    │
  │    message:   `${displayName} liked your post`           │
  │  })                                                      │
  └──────────────────────────────────────────────────────────┘

USER reads notifications:
          │
GET /api/notifications
          │
  Notification.find({ recipient: req.user._id })
    .sort({ createdAt: -1 }).limit(30)
    .populate('sender', 'displayName avatarUrl role')
    .populate('post', 'title')
  Index: { recipient:1, isRead:1, createdAt:-1 }
          │
  ◄── [{ notification1 }, ...]

GET /api/notifications/unread-count
          │
  Notification.countDocuments({ recipient, isRead: false })
          │
  ◄── { count: 5 }

PATCH /api/notifications/read  ← mark all as read

NOTIFICATION TYPES & TRIGGERS:
┌──────────────────┬────────────────────────────────────────────────────┐
│ Type             │ Trigger                                             │
├──────────────────┼────────────────────────────────────────────────────┤
│ like             │ interactionController.toggleLike (new like only)   │
│ dislike          │ interactionController.toggleDislike (new only)     │
│ comment          │ interactionController.addComment                   │
│ follow           │ interactionController.followClub (new follow only) │
│ mention          │ postController.createPost (@mention extraction)    │
│ new_post         │ postController.createPost (to all followers)       │
│ announcement     │ POST /api/announcements (to all followers)         │
│ event_request    │ eventController.createEvent (Student → all Admins) │
│ expiry_warning   │ cron/postExpiry.js notifyPreExpiry() (once/post)   │
│ report           │ POST /api/posts/:id/report (to all Admins)        │
└──────────────────┴────────────────────────────────────────────────────┘
```

---

## 📅 6. Event Request Approval Flow

```
STUDENT submits event:
          │
POST /api/events
  { title, date, time, venue, description, eventType, ... }
          │
  eventController.createEvent():
  ┌──────────────────────────────────────────────┐
  │  role === 'Student' → status: 'Pending'      │
  │  role === 'Club'    → status: 'Approved'     │
  │  role === 'Admin'   → status: 'Approved'     │
  │                                              │
  │  If Pending → Notification{ type: 'event_request' }  │
  │               sent to all Admin users        │
  └──────────────────────────────────────────────┘

ADMIN approves or rejects:
          │
PATCH /api/events/:id/status     (adminOnly middleware)
  { status: 'Approved' }
          │
  Event.findByIdAndUpdate → status updated
          │
  ◄── { success: true, data: event }

Status lifecycle:
  Pending ──► Approved  (visible on calendar to all students)
          ──► Rejected  (hidden from students)

RSVP toggle:
          │
POST /api/events/:id/rsvp
          │
  userId in rsvps[] → remove | else → push
          │
  ◄── { success: true, rsvpCount, rsvped: true|false }
```

---

## 🗳️ 7. Anonymous Complaint Flow

```
STUDENT submits complaint:
          │
POST /api/complaints
  { title, description }
          │
  Complaint.create({ author: req.user._id, status: 'Open' })

GET /api/complaints  (Student role):
          │
  complaintController.getComplaints():
  ┌──────────────────────────────────────────────────┐
  │  Complaint.find(...)                             │
  │  .select('-author')  ← author STRIPPED           │
  └──────────────────────────────────────────────────┘

GET /api/complaints  (Admin role):
          │
  ┌──────────────────────────────────────────────────┐
  │  Complaint.find(...)                             │
  │  .populate('author', 'displayName role')  ← VISIBLE │
  └──────────────────────────────────────────────────┘

GET /api/complaints/mine
  → Returns only the complaint IDs owned by req.user

GET /api/complaints/search?q=keyword
  → Keyword search across title + description (all users)

POST /api/complaints/:id/upvote
  → $addToSet / $pull toggle on upvotes[]

PATCH /api/complaints/:id/edit   (author only, status must be Open)
  { title, description }
  → Updates fields, sets isEdited = true

PATCH /api/complaints/:id        (Admin only)
  { status: 'Resolved', declineReason?: '...' }
  → Updates status

Status lifecycle:
  Open ──► Resolved
       ──► Declined           (with optional declineReason)
       ──► Resolved (Verified)
```

---

## ⏰ 8. Cron Job Lifecycle

```
server.js startup
          │
connectDB() resolves
          │
startPostExpiryCron()   ← cron/postExpiry.js
          │
  node-cron: '*/5 * * * *'

Every 5 minutes:
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  1. notifyPreExpiry()                                               │
│     Find: hashtag ∈ {#foodsplit,#cabsplit}, isActive=true,          │
│            expiryWarned=false,                                      │
│            expiresAt ∈ (now, now+35min]                             │
│     → Notification.insertMany({ type:'expiry_warning' }) per author │
│     → Post.updateMany → expiryWarned = true (prevents re-fire)      │
│                                                                     │
│  2. expireOldPosts()                                                │
│     Find: hashtag ∈ {#foodsplit,#cabsplit},                         │
│            expiresAt < now, isActive = true                         │
│     → Post.updateMany     → isActive = false  (soft delete)         │
│     → ChatRoom.updateMany → isActive = false  (close linked rooms)  │
│                                                                     │
│  3. closeIdleGlobalRooms()                                          │
│     Find: isGlobal=true, isActive=true,                             │
│            lastMessageAt < 2 hours ago                              │
│     → ChatRoom.updateMany → isActive = false                        │
│                                                                     │
│  4. expireAnnouncements()                                           │
│     Find: isActive=true, expiresAt < now                            │
│     → Announcement.updateMany → isActive = false                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Documents are NEVER hard-deleted. isActive = false preserves
chat message history and provides an audit trail.
```

---

## 🧩 9. Frontend State Architecture

```
App.jsx
  │
  ├── AuthProvider  (context/AuthContext.js)
  │     State:    { token, user, loading }
  │     Storage:  localStorage 'cb_token'
  │     Provides: login(), logout(), updateUser()
  │
  └── SocketProvider  (context/SocketContext.js)
        State:    { socket (ref), connected }
        Lifecycle:
          token present → io(SOCKET_URL, { auth: { token } })
                          transports: ['polling', 'websocket']
                          reconnectionAttempts: 5
          token removed → socket.disconnect()
        Provides: { socket, connected }

SOCKET_URL resolution order:
  1. process.env.REACT_APP_SOCKET_URL
  2. process.env.REACT_APP_API_URL (strip /api suffix)
  3. window.location.origin (production same-origin)
  4. 'http://localhost:5000' (local dev fallback)

Pages using socket (via useSocket() hook):
  ┌──────────────────────────────────────────────────────────────────┐
  │  ChatHubPage.jsx                                                 │
  │    emit: joinGlobalRoom, sendGlobalMsg, leaveGlobalRoom,         │
  │           closeGlobalRoom                                        │
  │    on:   globalJoined, globalMessage, onlineUsersUpdate,         │
  │           globalRoomClosed, roomsUpdated                         │
  │                                                                  │
  │  PostCard.jsx                                                    │
  │    emit: joinRoom, sendMessage, closeRoom, cabLocation           │
  │    on:   joinedRoom, newMessage, roomClosed, userJoined,         │
  │           cabLocationUpdate, roomError                           │
  └──────────────────────────────────────────────────────────────────┘

Route protection:
  <ProtectedRoute>  ← reads AuthContext, redirects to /login if no token
    <AuthLayout>    ← Navbar (left sidebar / bottom bar) + optional RightPanel
      <Page />
```

---

## 📊 10. Database Index Strategy

| Collection | Index | Purpose |
|------------|-------|---------|
| **User** | `instituteEmail` (unique) | Login lookup |
| **User** | `rollNo` (unique, sparse) | Roll-number check on register |
| **Post** | `{ isActive: 1, createdAt: -1 }` | Main feed query |
| **Post** | `{ hashtag: 1, expiresAt: 1, isActive: 1 }` | Cron expiry query |
| **ChatRoom** | `postId` | Post-linked room lookup |
| **ChatRoom** | `isGlobal` | Hub room filter |
| **ChatRoom** | `isActive` | Active room filter |
| **ChatRoom** | `lastMessageAt` | Idle room cleanup by cron |
| **Announcement** | `{ isActive: 1, expiresAt: 1, author: 1 }` | Active stories feed + cron |
| **Notification** | `{ recipient: 1, isRead: 1, createdAt: -1 }` | Notification centre |
| **Event** | `{ status: 1, date: 1 }` | Calendar view |
| **Complaint** | `status` | Complaint board filter |

---

<div align="center">

📄 **[Back to README](./README.md)** · 📡 **[API Reference](./docs/API.md)**

</div>
