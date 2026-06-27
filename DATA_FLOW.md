# 🗺️ Campus Buzz — Data Flow & Architecture

> A deep-dive into how data moves through the Campus Buzz system: from browser to database and back, through REST and WebSocket channels.

---

## Table of Contents

- [System Overview](#-system-overview)
- [High-Level Architecture](#-high-level-architecture)
- [Authentication Flow](#-1-authentication-flow)
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
│                          INTERNET / CDN                             │
└────────────────────────┬────────────────────────────────────────────┘
                         │
           ┌─────────────▼──────────────┐
           │       VERCEL (Frontend)     │
           │   React SPA (CRA + Nginx)   │
           │   Port: 443 (HTTPS)         │
           └─────────────┬──────────────┘
                         │
               REST /api/*  +  WebSocket (Socket.io)
                         │
           ┌─────────────▼──────────────┐
           │      RENDER (Backend)       │
           │   Node.js 18 + Express 4    │
           │   Socket.io 4 on HTTP       │
           │   Port: 5000                │
           │  ┌──────────────────────┐   │
           │  │  node-cron (*/5 min) │   │
           │  └──────────────────────┘   │
           └─────────────┬──────────────┘
                         │  mongoose 8
           ┌─────────────▼──────────────┐
           │      MONGODB ATLAS          │
           │   Database: campusbuzz      │
           │   Collections: 8            │
           └────────────────────────────┘
```

---

## 🏛️ High-Level Architecture

```
FRONTEND (React)                       BACKEND (Express + Socket.io)
─────────────────────                  ──────────────────────────────────────

┌──────────────────┐  HTTP REST        ┌──────────────────────────────────┐
│   AuthContext    │ ◄──────────────── │  routes/index.js                 │
│  (JWT token)     │                   │  /api/auth, /api/posts,          │
└────────┬─────────┘                   │  /api/events, /api/complaints,   │
         │                             │  /api/notifications, /api/users  │
         │ token                       └──────────┬───────────────────────┘
         ▼                                        │
┌──────────────────┐                   ┌──────────▼───────────────────────┐
│  SocketContext   │ ◄── WebSocket ─── │  socket/index.js                 │
│  (1 connection)  │                   │  JWT middleware → event handlers  │
└────────┬─────────┘                   └──────────┬───────────────────────┘
         │                                        │
         │ socket / axios                ┌─────────▼────────────────────────┐
         ▼                               │  MongoDB (via Mongoose)           │
┌──────────────────┐                    │  Users, Posts, ChatRooms,         │
│   Pages /        │                    │  Messages, Events, Complaints,    │
│   Components     │                    │  Announcements, Notifications     │
└──────────────────┘                    └──────────────────────────────────┘
```

---

## 🔐 1. Authentication Flow

```
Browser                       Express Server                    MongoDB
────────                      ──────────────                    ───────

POST /api/auth/register
  { instituteEmail, password,
    displayName, role }
        │
        ▼
  [express-validator]
  validates email regex:
  [a-z]{2,}\d{3}\.[a-z]+\d{4}@*.nitrr.ac.in
        │
        ▼
  bcrypt.hash(password, 12) ──────────────────────► User.create({ ... })
                                                            │
        ◄───────────── { token, user } ────────────── JWT.sign(id, secret, 7d)

─────────────────────────────────────────────────────────────────────────

POST /api/auth/login
  { instituteEmail, password }
        │
        ▼
  User.findByEmailWithPassword(email)  ◄───── MongoDB (select +passwordHash)
        │
        ▼
  bcrypt.compare(plain, hash)
        │  ✓ match
        ▼
  JWT.sign({ id, role }, secret, 7d)
        │
        ◄───── { token, user: { _id, displayName, role, ... } }
        │
        ▼
  localStorage.setItem('cb_token', token)
  AuthContext: { token, user } → available app-wide

─────────────────────────────────────────────────────────────────────────

Every subsequent request:

  Axios request ──► Authorization: Bearer <token>
                            │
                    [auth.js middleware]
                    JWT.verify(token, secret)
                    User.findById(decoded.id)
                    req.user = user  ──► controller
```

---

## 📰 2. Post Feed Flow

```
USER ACTION: Loads Feed Page
        │
        ▼
GET /api/posts?page=1&limit=10
        │
        ▼
  postController.getPosts()
  ┌────────────────────────────────────────────────────────────────┐
  │  Query: Post.find({ isActive: true })                          │
  │    .populate('author', 'displayName avatarUrl role')          │
  │    .populate('mentions', 'displayName')                       │
  │    .sort({ createdAt: -1 })                                   │
  │    .skip((page-1) * limit).limit(limit)                       │
  │                                                                │
  │  Index used: { isActive: 1, createdAt: -1 }                   │
  └────────────────────────────────────────────────────────────────┘
        │
        ◄──── [{ post1 }, { post2 }, ...]
        │
        ▼
  PostFeed.jsx renders PostCard.jsx for each post
        │
        ▼
  Per-post conditional UI:
  ┌─────────────────────────────────────────────────────┐
  │  #foodsplit / #cabsplit  → CountdownTimer + Chat     │
  │  #resell                 → Chat button (no timer)    │
  │  #lost / #found          → ContactModal (no chat)    │
  │  (other)                 → Plain post card           │
  └─────────────────────────────────────────────────────┘

USER ACTION: Like a post
        │
        ▼
POST /api/posts/:id/like
        │
  postController.likePost():
  ┌──────────────────────────────────────────────────────────┐
  │  If user in likes[] → pull (toggle off)                  │
  │  Else → push to likes[], pull from dislikes[] if needed  │
  │  If new like → create Notification{ type:'like', ... }   │
  └──────────────────────────────────────────────────────────┘
        │
        ◄──── { likes: [...], dislikes: [...] }
        │
        ▼
  PostCard re-renders with updated counts

USER ACTION: Create Post
        │
        ▼
POST /api/posts
  { title, description, imageUrl(base64), hashtag, expiresAt? }
        │
  postController.createPost():
  ┌──────────────────────────────────────────────────────────┐
  │  Validate required fields                                │
  │  If #foodsplit/#cabsplit → require expiresAt             │
  │  Extract @mentions from description                      │
  │  Post.create({ ... })                                    │
  │  Create Notification{ type:'new_post' } for followers   │
  │  Create Notification{ type:'mention' } for mentioned    │
  └──────────────────────────────────────────────────────────┘
        │
        ◄──── { post: { ... } }
```

---

## 💬 3. Real-time Chat Flow

### 3a. Post-Linked Room

```
USER clicks "Chat" on a #foodsplit post
        │
        ▼
  Frontend: socket.emit('joinRoom', { postId })
        │                                              Socket.io Server
        │ ─────────────────────────────────────────► socket.on('joinRoom')
        │                                                      │
        │                                          Post.findById(postId)
        │                                            → verify isActive
        │                                            → verify hashtag ∈ {#foodsplit,#cabsplit,#resell}
        │                                          ChatRoom.findOrCreate(postId)
        │                                          Message.find({ roomId }).limit(50)
        │                                                      │
        ◄─────────────────────────────────────────  socket.emit('joinedRoom', { roomId, history })
        │
        ▼
  Chat UI renders history

USER sends message
        │
        ▼
  socket.emit('sendMessage', { postId, text })
        │ ─────────────────────────────────────────► socket.on('sendMessage')
        │                                          ChatRoom.findOne({ postId })
        │                                            → verify room.isActive
        │                                          Post.findById → verify isActive
        │                                          Message.create({ roomId, senderId, text })
        │                                                      │
        │                                         io.to(postId).emit('newMessage', payload)
        │                                                      │
        ◄──────────────────────────────────────── all sockets in room receive 'newMessage'
        │
        ▼
  Chat UI appends new message bubble
```

### 3b. Global Hub Room

```
USER opens Chat Hub  →  GET /api/rooms (lists all active global rooms)
        │
        ▼
  ChatHubPage shows room list with hashtag badges

USER selects room "#general"
        │
        ▼
  socket.emit('joinGlobalRoom', { roomId })
        │ ─────────────────────────────────────────► socket.on('joinGlobalRoom')
        │                                          ChatRoom.findById(roomId)
        │                                            .populate('createdBy')
        │                                          ChatRoom.updateOne → $addToSet participants
        │                                          Message.find({ roomId }).limit(60)
        │                                          io.in(roomId).fetchSockets() → onlineCount
        │                                                      │
        ◄─── socket.emit('globalJoined', { room, history, onlineCount })
        │
        │   io.to(roomId).emit('onlineUsersUpdate', { users[] })
        ◄── (all room members receive updated user list)

USER sends message
        │
        ▼
  socket.emit('sendGlobalMsg', { roomId, text })
        │ ─────────────────────────────────────────► Message.create(...)
        │                                          ChatRoom.updateOne → lastMessageAt
        │                                         io.to(roomId).emit('globalMessage', payload)
        ◄────────────────────────────────────────── all room members receive message
```

---

## 🚕 4. Cab Tracker GPS Flow

```
DRIVER (post author) shares location
        │
        ▼
  CabTracker.jsx: navigator.geolocation.watchPosition(...)
        │
  Every position update:
        │
        ▼
  socket.emit('cabLocation', { postId, lat, lng })
        │ ─────────────────────────────────────────► socket.on('cabLocation')
        │                                            NO DATABASE WRITE
        │                                            socket.to(postId).emit('cabLocationUpdate', {
        │                                              postId, lat, lng, sharedBy, ts: Date.now()
        │                                            })
        │
        ◄── All OTHER sockets in the post room receive the update
        │
        ▼
  CabTracker.jsx: leaflet map marker moves in real-time

 ╔══════════════════════════════════════════════════════╗
 ║  NOTE: GPS coordinates are NEVER persisted to DB.   ║
 ║  Pure WebSocket relay. Privacy by design.           ║
 ╚══════════════════════════════════════════════════════╝
```

---

## 🔔 5. Notification Flow

```
TRIGGER EVENT (e.g., someone likes your post)
        │
        ▼
  postController.likePost():
  ┌──────────────────────────────────────────────────────────┐
  │  Notification.create({                                   │
  │    recipient: post.author,   ← who receives it           │
  │    sender: req.user._id,     ← who caused it            │
  │    type: 'like',                                         │
  │    post: postId,                                         │
  │    message: `${displayName} liked your post`             │
  │  })                                                      │
  └──────────────────────────────────────────────────────────┘
        │
        ▼ (stored in MongoDB)

USER READS notifications:
        │
GET /api/notifications
        │
  notificationController.getNotifications():
  ┌──────────────────────────────────────────────────────────┐
  │  Notification.find({ recipient: req.user._id })          │
  │    .populate('sender', 'displayName avatarUrl')          │
  │    .populate('post', 'title hashtag')                    │
  │    .sort({ createdAt: -1 })                              │
  │                                                          │
  │  Index: { recipient:1, isRead:1, createdAt:-1 }          │
  └──────────────────────────────────────────────────────────┘
        │
        ◄──── [{ notification1 }, ...]

GET /api/notifications/unread-count
        │
        ◄──── { count: 5 }
        │
        ▼
  NotificationsPage badge updates

NOTIFICATION TYPES & TRIGGERS:
┌──────────────────┬──────────────────────────────────────────────────┐
│ Type             │ Trigger                                           │
├──────────────────┼──────────────────────────────────────────────────┤
│ like             │ Someone likes your post                           │
│ dislike          │ Someone dislikes your post                        │
│ comment          │ Someone comments on your post                     │
│ follow           │ Someone follows your club account                  │
│ mention          │ You are @mentioned in a post                      │
│ new_post         │ A club you follow publishes a new post            │
│ announcement     │ A club you follow creates a new story             │
│ event_request    │ Admin: a student submitted an event request       │
│ expiry_warning   │ Cron: your #foodsplit/#cabsplit post expires soon  │
│ report           │ Admin: a post was reported (future use)           │
└──────────────────┴──────────────────────────────────────────────────┘
```

---

## 📅 6. Event Request Approval Flow

```
STUDENT submits event request:
        │
POST /api/events
  { title, date, time, venue, description, eventType }
        │
  eventController.createEvent():
  ┌──────────────────────────────────────────────┐
  │  If role === 'Student' → status: 'Pending'   │
  │  If role === 'Club' or 'Admin' → 'Approved'  │
  │                                              │
  │  If Pending → Notification{ type:'event_request' }  │
  │               sent to ALL Admin users        │
  └──────────────────────────────────────────────┘

ADMIN reviews pending events:
        │
GET /api/events?status=Pending
        │
  eventController.getEvents():
  Query filtered by status (Admin-only for Pending/Rejected)

ADMIN approves:
        │
PATCH /api/events/:id/status
  { status: 'Approved' }  (Admin only, rbac middleware)
        │
  Event.findByIdAndUpdate({ status: 'Approved' })
        │
        ▼
  Event now visible on public calendar to all students

                  ┌────────────┐
    Rejected ◄────┤  Pending   ├────► Approved ──► visible on calendar
                  └────────────┘
```

---

## 🗳️ 7. Anonymous Complaint Flow

```
STUDENT submits complaint:
        │
POST /api/complaints
  { title, description }
        │
  complaintController.createComplaint():
  Complaint.create({ author: req.user._id, status: 'Open', ... })
                │
                ▼
  complaint stored with author reference

GET /api/complaints (Student request):
        │
  complaintController.getComplaints():
  ┌──────────────────────────────────────────────────────┐
  │  Complaint.find({ status filter })                   │
  │  .select('-author')   ← author STRIPPED for Students │
  │  ← privacy enforced at controller layer              │
  └──────────────────────────────────────────────────────┘

GET /api/complaints (Admin request):
        │
  ┌──────────────────────────────────────────────────────┐
  │  Complaint.find(...)                                 │
  │  .populate('author', 'displayName role')  ← VISIBLE  │
  └──────────────────────────────────────────────────────┘

STUDENT upvotes:
        │
POST /api/complaints/:id/upvote
  → $addToSet / $pull toggle

ADMIN updates status:
        │
PATCH /api/complaints/:id/status
  { status: 'Resolved', declineReason?: '...' }
  (Admin only — rbac.js enforces this)

STATUS LIFECYCLE:
  Open  ──►  Resolved
        ──►  Declined (+ declineReason)
        ──►  Resolved (Verified)
```

---

## ⏰ 8. Cron Job Lifecycle

```
server.js startup
        │
connectDB() resolves
        │
startPostExpiryCron()
        │
  node-cron schedules: '*/5 * * * *'
        │
  ┌─────────────────────────────────────────────────────────────────────┐
  │  Every 5 minutes:                                                   │
  │                                                                     │
  │  1. notifyPreExpiry()                                               │
  │     └─ Find posts: hashtag∈{#foodsplit,#cabsplit},                  │
  │                    isActive=true, expiryWarned=false,               │
  │                    expiresAt ∈ (now, now+35min]                     │
  │     └─ Notification.insertMany(expiry_warning notifications)        │
  │     └─ Post.updateMany → expiryWarned = true (prevents re-fire)     │
  │                                                                     │
  │  2. expireOldPosts()                                                │
  │     └─ Find posts: hashtag∈{#foodsplit,#cabsplit},                  │
  │                    expiresAt < now, isActive = true                 │
  │     └─ Post.updateMany  → isActive = false  (soft delete)           │
  │     └─ ChatRoom.updateMany → isActive = false (close chat rooms)    │
  │                                                                     │
  │  3. closeIdleGlobalRooms()                                          │
  │     └─ ChatRoom.updateMany: isGlobal=true, isActive=true,           │
  │                             lastMessageAt < 2hr ago                 │
  │     └─ → isActive = false                                           │
  │                                                                     │
  │  4. expireAnnouncements()                                           │
  │     └─ Announcement.updateMany: isActive=true, expiresAt < now      │
  │     └─ → isActive = false                                           │
  └─────────────────────────────────────────────────────────────────────┘

SOFT-DELETE PHILOSOPHY:
  Documents are NEVER hard-deleted by the cron.
  isActive = false preserves:
    ✓ Chat history integrity (messages reference roomId)
    ✓ Audit trail for complaints and events
    ✓ Post data for analytics (future use)
```

---

## 🧩 9. Frontend State Architecture

```
App.jsx
  │
  ├── AuthProvider (context/AuthContext.js)
  │     State: { token, user, loading }
  │     Storage: localStorage 'cb_token'
  │     Provides: login(), logout(), updateUser()
  │
  └── SocketProvider (context/SocketContext.js)
        State: { socket (ref), connected }
        Lifecycle:
          token present  → io(SOCKET_URL, { auth: { token } })
          token removed  → socket.disconnect()
        Provides: { socket, connected }

Per-page data fetching:
  ┌───────────────────────────────────────────────────────────────┐
  │  Each page manages its own local state via useState/useEffect │
  │  + Axios (configured with baseURL + Authorization header)    │
  │                                                               │
  │  ChatHubPage.jsx — also uses useSocket() to:                  │
  │    • emit joinGlobalRoom / sendGlobalMsg                      │
  │    • listen for globalMessage / onlineUsersUpdate             │
  │                                                               │
  │  PostCard.jsx — uses useSocket() to:                          │
  │    • emit joinRoom / sendMessage / closeRoom / cabLocation    │
  │    • listen for joinedRoom / newMessage / roomClosed          │
  │    • listen for cabLocationUpdate → CabTracker marker move   │
  └───────────────────────────────────────────────────────────────┘

Context tree:
  <AuthProvider>
    <SocketProvider>          ← depends on token from AuthProvider
      <BrowserRouter>
        <Routes>
          <ProtectedRoute>   ← reads AuthContext, redirects to /login if no token
            <AuthLayout>     ← Navbar + main + optional RightPanel
              <Page />
```

---

## 📊 10. Database Index Strategy

| Collection | Index | Purpose |
|------------|-------|---------|
| **User** | `instituteEmail` (unique) | Fast login lookup |
| **User** | `rollNo` (unique, sparse) | Roll-no based search |
| **Post** | `{ isActive: 1, createdAt: -1 }` | Main feed query |
| **Post** | `{ hashtag: 1, expiresAt: 1, isActive: 1 }` | Cron expiry query |
| **ChatRoom** | `postId` | Post-linked room lookup |
| **ChatRoom** | `isGlobal`, `isActive`, `lastMessageAt` | Hub room queries + cron |
| **Announcement** | `{ isActive: 1, expiresAt: 1, author: 1 }` | Stories feed + cron |
| **Notification** | `{ recipient: 1, isRead: 1, createdAt: -1 }` | Notification centre |
| **Event** | `{ status: 1, date: 1 }` | Calendar view |
| **Complaint** | `status` | Complaint board filter |

---

<div align="center">

📄 **[Back to README](./README.md)** · 📡 **[API Reference](./docs/API.md)**

</div>
