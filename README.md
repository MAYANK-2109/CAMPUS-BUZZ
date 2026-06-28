<div align="center">

<img src="./frontend/public/logo.png" alt="Campus Buzz Logo" width="200" />

<br/>

```
 ██████╗  █████╗ ███╗   ███╗██████╗ ██╗   ██╗███████╗    ██████╗ ██╗   ██╗███████╗███████╗
██╔════╝ ██╔══██╗████╗ ████║██╔══██╗██║   ██║██╔════╝    ██╔══██╗██║   ██║╚══███╔╝╚══███╔╝
██║      ███████║██╔████╔██║██████╔╝██║   ██║███████╗    ██████╔╝██║   ██║  ███╔╝   ███╔╝ 
██║      ██╔══██║██║╚██╔╝██║██╔═══╝ ██║   ██║╚════██║    ██╔══██╗██║   ██║ ███╔╝   ███╔╝  
╚██████╗ ██║  ██║██║ ╚═╝ ██║██║     ╚██████╔╝███████║    ██████╔╝╚██████╔╝███████╗███████╗
 ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝      ╚═════╝ ╚══════╝    ╚═════╝  ╚═════╝ ╚══════╝╚══════╝
```

### 🎓 The All-in-One Campus Coordination Platform for NITRR

<br/>

<a href="https://drive.google.com/drive/folders/12sLIhtUqlvR8WThyVVnPdKA7BpHnj9MX?usp=drive_link">
  <img src="https://img.shields.io/badge/▶_Watch_Video_Demo-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="Watch Video Demo" height="40" />
</a>

<br/><br/>

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io)
[![Express](https://img.shields.io/badge/Express-4.21-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

<br/>

[🗺️ Data Flow Architecture](./DATA_FLOW.md) · [📡 API Reference](./docs/API.md)

<br/>

</div>

---

## 👥 Team UNKNOWNS (Contributors)
- Mayank Kumar Sahu
- Nandish Agarwal
- Nikhil Kumar Singh
- Mayank Kumar Chandrikapure (L)

---

## 📋 Table of Contents

- [✨ What is Campus Buzz?](#-what-is-campus-buzz)
- [🗺️ Data Flow Architecture](#️-data-flow-architecture)
- [🎯 Features](#-features)
- [🏗️ Tech Stack](#️-tech-stack)
- [🗂️ Project Structure](#️-project-structure)
- [⚡ Quick Start](#-quick-start)
- [🔐 Environment Variables](#-environment-variables)
- [📡 API Overview](#-api-overview)
- [🔌 Socket Events](#-socket-events)
- [👥 User Roles](#-user-roles)
- [🗃️ Data Models](#️-data-models)
- [⏰ Background Jobs](#-background-jobs)
- [🚀 Deployment](#-deployment)

---

## ✨ What is Campus Buzz?

**Campus Buzz** is a real-time campus coordination web platform built exclusively for **NIT Raipur (NITRR)** students, clubs, and administrators. It unifies social posting, event management, live chat, anonymous complaints, and club announcements — accessible only with a verified `@nitrr.ac.in` email.

> _"One platform. Every beat of campus life."_

---

## 🗺️ Data Flow Architecture

Here is a high-level overview of how data flows through Campus Buzz:

```text
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
For more in-depth details on the socket events, cron jobs, and database schema, please check the [Data Flow Architecture](./DATA_FLOW.md) document.

---

## 🎯 Features

<table>
<tr>
<td width="50%">

### 🌊 Post Feed
- Role-aware feed for all users
- Hashtag-driven posts: `#foodsplit` `#cabsplit` `#resell` `#lost` `#found`
- Like / Dislike / Comment / Save (bookmark)
- @mention support with push notifications
- Post reporting (notifies all Admins)
- Trending hashtags sidebar
- Club-only feed for club posts

</td>
<td width="50%">

### 💬 Real-time Chat
- **Post-linked rooms**: auto-created for `#foodsplit`, `#cabsplit`, `#resell` posts
- **Global Hub rooms**: hashtag-categorised community rooms (`#general`, `#sports`, `#placement`, etc.)
- Live online-user presence list per room
- Message history on join (last 50–60 messages)
- Rooms auto-close after 2 hrs of inactivity
- Creator or Admin can manually close a room

</td>
</tr>
<tr>
<td width="50%">

### 📅 Event Calendar
- Monthly calendar view of campus events
- Club & Admin publish events directly (auto-Approved)
- Students submit event requests (status: Pending → Admin review)
- RSVP toggle per event
- Online (meeting link + passcode) & Offline (map link) event types

</td>
<td width="50%">

### 🚕 Cab Tracker
- Real-time GPS sharing via Socket.io
- Live Leaflet map inside cab-split post chat
- Driver shares location; all room members see it update live
- GPS coordinates are **never stored** in the database (WebSocket relay only)

</td>
</tr>
<tr>
<td width="50%">

### 📣 Announcements (Stories)
- Instagram-style ephemeral stories, 1–48 hr lifespan
- Only Club & Admin accounts can publish
- Followers receive an in-app notification on creation
- Seen-by tracking per announcement
- Soft-deleted by cron when expired

</td>
<td width="50%">

### 🗳️ Anonymous Complaints
- Author identity hidden from other students; visible only to Admins
- Upvote toggle to surface urgent issues
- Author can edit their own complaint while it is still `Open`
- Admin status management: `Open → Resolved / Declined / Resolved (Verified)`
- Keyword search for duplicate detection

</td>
</tr>
<tr>
<td width="50%">

### 🔔 Notifications
- In-app notifications for: `like`, `dislike`, `comment`, `follow`, `mention`, `announcement`, `event_request`, `expiry_warning`, `report`
- Unread badge count (polled by frontend)
- Mark-all-read in one action

</td>
<td width="50%">

### 🔐 Auth & Roles
- NITRR institute email-only registration
- **OTP email verification** required before first login
- JWT-based sessions (7-day tokens)
- Role-based access: **Student · Club · Admin**
- Forgot password via email reset link
- Change password when already logged in

</td>
</tr>
</table>

---

## 🏗️ Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React | 18.3.1 | UI framework |
| **Routing** | React Router DOM | 6.28.0 | SPA navigation |
| **Styling** | Tailwind CSS + Custom CSS | 3.4.17 | Design system |
| **Icons** | Lucide React | 1.21.0 | Icon library |
| **HTTP Client** | Axios | 1.7.9 | REST API calls |
| **Date Utilities** | date-fns | 3.6.0 | Date formatting |
| **Maps** | React Leaflet | 4.2.1 | GPS cab tracker map |
| **Real-time (FE)** | Socket.io-client | 4.8.1 | WebSocket client |
| **Backend** | Node.js + Express | 18+ / 4.21 | REST API server |
| **Database** | MongoDB Atlas + Mongoose | 8.9.1 | Data persistence |
| **Real-time (BE)** | Socket.io | 4.8.1 | WebSocket server |
| **Auth** | JSON Web Tokens | 9.0.2 | Stateless auth |
| **Passwords** | Bcryptjs | 2.4.3 | Password hashing (salt: 12) |
| **Email** | Nodemailer + Gmail SMTP | 9.0.1 | OTP & password reset emails |
| **Scheduler** | node-cron | 3.0.3 | Background maintenance jobs |
| **Validation** | express-validator | 7.2.1 | Input validation |

---

## 🗂️ Project Structure

```
CAMPUS-BUZZ/
├── 📁 backend/                        # Express + Socket.io API server
│   ├── 📁 controllers/
│   │   ├── authController.js          #   Register (OTP), login, verify-otp, resend-otp,
│   │   │                              #     forgot-password, reset-password, getMe
│   │   ├── postController.js          #   CRUD posts, trending hashtags
│   │   ├── interactionController.js   #   Like/dislike/save, comments, follow, saved posts
│   │   ├── eventController.js         #   Events CRUD, requestEvent, updateStatus, RSVP
│   │   ├── complaintController.js     #   Complaints CRUD, upvote, edit, status, search, mine
│   │   ├── notificationController.js  #   getNotifications, getUnreadCount, markAllRead
│   │   └── userController.js          #   updateProfile, changePassword, getUserProfile
│   ├── 📁 models/
│   │   ├── User.js                    #   Roles, OTP fields, email regex, password hash
│   │   ├── Post.js                    #   Hashtag posts, expiry, likes/dislikes, mentions
│   │   ├── ChatRoom.js                #   Post-linked & global hub rooms
│   │   ├── Message.js                 #   Chat messages
│   │   ├── Announcement.js            #   Ephemeral stories (1–48 hr)
│   │   ├── Event.js                   #   Campus events with RSVP
│   │   ├── Complaint.js               #   Anonymous complaints
│   │   └── Notification.js            #   In-app notifications
│   ├── 📁 routes/
│   │   ├── index.js                   #   All API routes
│   │   └── userRoutes.js              #   /users/profile, /users/change-password, /users/:id
│   ├── 📁 middleware/
│   │   ├── auth.js                    #   JWT verification (protect)
│   │   ├── rbac.js                    #   requireRole, adminOnly, clubOrAdmin
│   │   └── validate.js                #   express-validator helper
│   ├── 📁 socket/
│   │   └── index.js                   #   Socket.io server (post rooms + global hub)
│   ├── 📁 cron/
│   │   └── postExpiry.js              #   Every-5-min maintenance job
│   ├── 📁 utils/
│   │   └── sendEmail.js               #   Nodemailer email helper
│   ├── server.js                      # 🚀 Entry point
│   └── .env                           # Environment config (not committed)
│
└── 📁 frontend/                       # React SPA (Create React App)
    └── 📁 src/
        ├── 📁 pages/
        │   ├── LoginPage.jsx           #   Register / Login / OTP verification
        │   ├── FeedPage.jsx            #   Main post feed
        │   ├── ClubFeedPage.jsx        #   Club-only post feed
        │   ├── ChatHubPage.jsx         #   Full-screen chat hub
        │   ├── CalendarPage.jsx        #   Event calendar
        │   ├── ComplaintsPage.jsx      #   Complaints board
        │   ├── ProfilePage.jsx         #   Own profile + saved posts
        │   ├── UserProfilePage.jsx     #   Public profile view
        │   ├── NotificationsPage.jsx   #   Notification centre
        │   ├── ResetPasswordPage.jsx   #   Password reset (via email link)
        │   └── ForbiddenPage.jsx       #   403 page
        ├── 📁 components/
        │   ├── PostFeed.jsx            #   Post list
        │   ├── PostCard.jsx            #   Post card + chat trigger + cab tracker
        │   ├── CreatePostForm.jsx      #   New post modal
        │   ├── CommentSection.jsx      #   Comments
        │   ├── AnnouncementStories.jsx #   Stories carousel
        │   ├── CabTracker.jsx          #   Leaflet GPS map
        │   ├── CountdownTimer.jsx      #   Post expiry countdown
        │   ├── HashtagBadge.jsx        #   Hashtag pill
        │   ├── ContactModal.jsx        #   Contact info for #lost/#found posts
        │   └── 📁 Layout/             #   Navbar, RightPanel
        ├── 📁 context/
        │   ├── AuthContext.js          #   JWT token + user state
        │   └── SocketContext.js        #   Single persistent socket connection
        ├── 📁 hooks/                   #   Custom React hooks
        ├── 📁 utils/                   #   Axios instance + helpers
        └── App.jsx                     #   Router + AuthLayout shell
```

---

## ⚡ Quick Start

### Prerequisites

```bash
node --version   # >= 18.0.0
npm --version    # >= 9.0.0
```

You also need a **MongoDB Atlas** cluster and a **Gmail App Password** for email sending.

### 1️⃣ Clone

```bash
git clone https://github.com/MAYANK-2109/CAMPUS-BUZZ.git
cd CAMPUS-BUZZ
```

### 2️⃣ Backend

```bash
cd backend
npm install
# create .env — see Environment Variables section below
npm run dev      # nodemon hot-reload
# OR
npm start        # production
```

Backend starts at **http://localhost:5000**

### 3️⃣ Frontend

```bash
cd frontend
npm install
# create .env — see Environment Variables section below
npm start        # CRA dev server at http://localhost:3000
```

The CRA dev server proxies all `/api/*` requests to `http://localhost:5000` automatically (set via `"proxy"` in `frontend/package.json`).

---

## 🔐 Environment Variables

### `backend/.env`

```env
# ── Server ───────────────────────────────────
PORT=5000
NODE_ENV=development

# ── MongoDB ──────────────────────────────────
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/campusbuzz

# ── JWT ──────────────────────────────────────
JWT_SECRET=your_super_secret_key_min_32_chars
JWT_EXPIRES_IN=7d

# ── CORS ─────────────────────────────────────
CLIENT_URL=http://localhost:3000

# ── SMTP (Gmail App Password) ─────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=your_gmail@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
FROM_NAME=CampusBuzz
FROM_EMAIL=noreply@campusbuzz.com
```

### `frontend/.env`

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SOCKET_URL=http://localhost:5000
```

> **Production:** In Vercel, set `REACT_APP_API_URL` and `REACT_APP_SOCKET_URL` to your Render backend URL.

---

## 📡 API Overview

All routes are mounted under `/api`. All routes except auth endpoints require `Authorization: Bearer <token>`.

| Domain | Method + Path | Auth | Role Guard | Description |
|--------|--------------|:----:|:----------:|-------------|
| **Auth** | `POST /auth/register` | ❌ | — | Register; sends OTP email |
| | `POST /auth/login` | ❌ | — | Login with email + password |
| | `POST /auth/verify-otp` | ❌ | — | Verify email with OTP code |
| | `POST /auth/resend-otp` | ❌ | — | Re-send OTP (rate-limited 30s) |
| | `POST /auth/forgot-password` | ❌ | — | Send password reset link |
| | `PATCH /auth/reset-password/:token` | ❌ | — | Reset password via token |
| | `GET /auth/me` | ✅ | — | Return current user from token |
| **Posts** | `GET /posts` | ✅ | — | Paginated feed (`?feed=club`, `?hashtag=`) |
| | `POST /posts` | ✅ | — | Create a post |
| | `GET /posts/trending-hashtags` | ✅ | — | Top 5 hashtags by post count |
| | `GET /posts/:id` | ✅ | — | Get single post |
| | `PATCH /posts/:id` | ✅ | Author | Update post |
| | `DELETE /posts/:id` | ✅ | Author/Admin | Delete post |
| | `POST /posts/:id/like` | ✅ | — | Toggle like |
| | `POST /posts/:id/dislike` | ✅ | — | Toggle dislike |
| | `POST /posts/:id/save` | ✅ | — | Toggle save (bookmark) |
| | `GET /posts/:id/comments` | ✅ | — | Get comments |
| | `POST /posts/:id/comments` | ✅ | — | Add comment |
| | `POST /posts/:id/report` | ✅ | Non-author | Report post (notifies Admins) |
| **Events** | `GET /events` | ✅ | — | List events (Approved only for Students) |
| | `POST /events` | ✅ | — | Create event (Club/Admin → Approved; Student → Pending) |
| | `POST /events/request` | ✅ | — | Explicit event request route |
| | `POST /events/:id/rsvp` | ✅ | — | Toggle RSVP |
| | `PATCH /events/:id/status` | ✅ | Admin | Approve or reject event |
| | `DELETE /events/:id` | ✅ | Admin | Delete event |
| **Complaints** | `GET /complaints` | ✅ | — | List complaints (author hidden from Students) |
| | `GET /complaints/mine` | ✅ | — | Get current user's complaint IDs |
| | `GET /complaints/search` | ✅ | — | Keyword search for duplicates |
| | `POST /complaints` | ✅ | — | Submit complaint |
| | `POST /complaints/:id/upvote` | ✅ | — | Toggle upvote |
| | `PATCH /complaints/:id/edit` | ✅ | Author | Edit title/description (Open only) |
| | `PATCH /complaints/:id` | ✅ | Admin | Update status |
| **Announcements** | `GET /announcements` | ✅ | — | Active stories from followed clubs |
| | `POST /announcements` | ✅ | Club/Admin | Create announcement |
| | `POST /announcements/:id/seen` | ✅ | — | Mark announcement as seen |
| | `DELETE /announcements/:id` | ✅ | Author/Admin | Soft-delete announcement |
| **Notifications** | `GET /notifications` | ✅ | — | Last 30 notifications |
| | `GET /notifications/unread-count` | ✅ | — | Unread notification count |
| | `PATCH /notifications/read` | ✅ | — | Mark all as read |
| **Users** | `GET /users` | ✅ | — | List users (`?role=`) |
| | `GET /users/search` | ✅ | — | Autocomplete by displayName |
| | `GET /users/me/saved` | ✅ | — | Get own saved posts |
| | `PATCH /users/profile` | ✅ | — | Update own profile |
| | `PATCH /users/change-password` | ✅ | — | Change password (requires current password) |
| | `GET /users/:id` | ✅ | — | Public user profile |
| | `POST /users/:id/follow` | ✅ | — | Toggle follow |
| **Clubs** | `GET /clubs` | ✅ | — | List all Club + Admin accounts |
| **Rooms** | `GET /rooms` | ✅ | — | List active rooms (global + post-linked) |
| | `GET /rooms/hashtags` | ✅ | — | List allowed hashtag slugs |
| | `POST /rooms` | ✅ | — | Create global hub room |
| | `POST /rooms/from-post/:postId` | ✅ | — | Find or create room for a post |
| | `GET /rooms/:id/messages` | ✅ | — | Last 60 messages for a room |
| | `DELETE /rooms/:id` | ✅ | Creator/Admin | Close a global room |
| | `PATCH /chat-rooms/:postId/close` | ✅ | Author/Admin | Close a post-linked room |

> 📄 Full request/response details: [`docs/API.md`](./docs/API.md)

---

## 🔌 Socket Events

All socket connections require a valid JWT passed as `socket.handshake.auth.token`.

### Post-Linked Rooms

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `joinRoom` | `{ postId }` |
| Client → Server | `sendMessage` | `{ postId, text }` |
| Client → Server | `closeRoom` | `{ postId }` |
| Client → Server | `cabLocation` | `{ postId, lat, lng }` |
| Server → Client | `joinedRoom` | `{ roomId, history[] }` |
| Server → Client | `newMessage` | `{ _id, roomId, senderId, senderName, senderRole, text, timestamp }` |
| Server → Client | `roomClosed` | `{ postId, closedBy, message }` |
| Server → Client | `cabLocationUpdate` | `{ postId, lat, lng, sharedBy, ts }` |
| Server → Client | `userJoined` | `{ userId, displayName }` |
| Server → Client | `roomError` | `{ message }` |

### Global Hub Rooms

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `joinGlobalRoom` | `{ roomId }` |
| Client → Server | `sendGlobalMsg` | `{ roomId, text }` |
| Client → Server | `leaveGlobalRoom` | `{ roomId }` |
| Client → Server | `closeGlobalRoom` | `{ roomId }` |
| Server → Client | `globalJoined` | `{ roomId, room, history[], onlineCount }` |
| Server → Client | `globalMessage` | `{ _id, roomId, senderId, senderName, senderAvatar, senderRole, text, timestamp }` |
| Server → Client | `globalUserJoined` | `{ userId, displayName }` |
| Server → Client | `globalUserLeft` | `{ userId, displayName }` |
| Server → Client | `globalRoomClosed` | `{ roomId, closedBy }` |
| Server → Client | `onlineUsersUpdate` | `{ roomId, users[] }` |
| Server → Client | `roomsUpdated` | *(broadcast — triggers clients to re-fetch room list)* |
| Server → Client | `roomError` | `{ message }` |

---

## 👥 User Roles

| Role | How to Register | Capabilities |
|------|----------------|--------------|
| **Student** | NITRR student email format | Post, comment, like/dislike/save, follow clubs, join all chats, submit complaints & event requests, report posts |
| **Club** | NITRR staff/club email | All Student permissions + publish events (auto-Approved), create announcements, close own global rooms |
| **Admin** | NITRR staff email | All Club permissions + approve/reject events & complaints, view complaint authors, close any global room |

---

## 🗃️ Data Models

```
User
  rollNo, instituteEmail, passwordHash (bcrypt), role: Student|Club|Admin
  displayName, bio, avatarUrl
  isVerified, otpHash, otpExpire, otpAttempts, lastOtpSentAt
  followers[], following[], savedPosts[]
  resetPasswordToken, resetPasswordExpire

Post
  title, description, imageUrl, author → User
  hashtag: #foodsplit | #cabsplit | #resell | #lost | #found
  customTags[], likes[], dislikes[], mentions[]
  expiresAt (required for #foodsplit/#cabsplit)
  totalFare (optional, #cabsplit only)
  isActive, expiryWarned

ChatRoom
  postId → Post (null for global rooms)
  isGlobal, name, hashtag, createdBy → User
  participants[], isActive, lastMessageAt

Message
  roomId → ChatRoom, senderId → User
  text, timestamp

Announcement
  author → User, text, imageUrl
  durationHours (1–48), expiresAt, isActive, seenBy[]

Event
  title, date, time, venue, description
  eventType: Online | Offline
  meetingLink, passcode (Online only)
  mapLink (Offline only)
  createdBy → User
  status: Approved | Pending | Rejected
  rsvps[]

Complaint
  title, description, author → User (hidden from Students)
  status: Open | Resolved | Declined | Resolved (Verified)
  declineReason, upvotes[], isEdited

Notification
  recipient → User, sender → User
  type: like | dislike | comment | follow | mention |
        announcement | event_request | expiry_warning | report
  post → Post, announcement → Announcement
  isRead, message
```

---

## ⏰ Background Jobs

A single cron job runs **every 5 minutes** (`*/5 * * * *`), started after the DB connects:

| Task | What it does |
|------|-------------|
| **Pre-expiry warning** | Finds `#foodsplit`/`#cabsplit` posts expiring within the next 35 min, sends one `expiry_warning` notification to the author, sets `expiryWarned = true` to prevent re-firing |
| **Post expiry** | Soft-deletes posts where `expiresAt < now` & `isActive = true`; also sets linked ChatRoom `isActive = false` |
| **Idle global room cleanup** | Closes global hub rooms where `lastMessageAt < 2 hours ago` |
| **Announcement expiry** | Soft-deletes announcements where `expiresAt < now` |

> Documents are **never hard-deleted** by the cron — `isActive = false` preserves message/chat history integrity.

---

## 🚀 Deployment

### Recommended Stack

| Service | Purpose |
|---------|---------|
| [**Render**](https://render.com) | Backend Node.js server |
| [**Vercel**](https://vercel.com) | Frontend React app |
| [**MongoDB Atlas**](https://www.mongodb.com/atlas) | Database (M0 free cluster) |

### Backend (Render)
1. Connect GitHub repo → **Web Service**
2. Build command: `npm install` | Start command: `npm start`
3. Set all env vars from `backend/.env`
4. Set `NODE_ENV=production` and `CLIENT_URL=https://your-vercel-app.vercel.app`

### Frontend (Vercel)
1. Connect GitHub repo → Framework: **Create React App**
2. Root directory: `frontend`
3. Environment variables:
   - `REACT_APP_API_URL=https://your-render-backend.onrender.com/api`
   - `REACT_APP_SOCKET_URL=https://your-render-backend.onrender.com`

> **DNS Note:** The backend sets DNS to Google's servers (`8.8.8.8`) at startup to resolve MongoDB Atlas SRV records that may be blocked on restrictive campus networks.

---

<div align="center">

Made with ❤️ for **NIT Raipur** | Built by **UNKNOWNS**

[![GitHub](https://img.shields.io/badge/GitHub-MAYANK--2109-181717?style=for-the-badge&logo=github)](https://github.com/MAYANK-2109)

</div>
