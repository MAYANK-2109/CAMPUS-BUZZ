<div align="center">

<br/>

```
 ██████╗ █████╗ ███╗   ███╗██████╗ ██╗   ██╗███████╗
██╔════╝██╔══██╗████╗ ████║██╔══██╗██║   ██║╚══███╔╝
██║     ███████║██╔████╔██║██████╔╝██║   ██║  ███╔╝ 
██║     ██╔══██║██║╚██╔╝██║██╔═══╝ ██║   ██║ ███╔╝  
╚██████╗██║  ██║██║ ╚═╝ ██║██║     ╚██████╔╝███████╗
 ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝      ╚═════╝ ╚══════╝
                        BUZZ
```

### 🎓 The All-in-One Campus Coordination Platform for NITRR

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io)
[![Express](https://img.shields.io/badge/Express-4.21-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

<br/>

[🚀 Live Demo](#) · [📖 API Docs](./docs/API.md) · [🗺️ Architecture](./DATA_FLOW.md) · [🐛 Report Bug](#) · [✨ Request Feature](#)

<br/>

</div>

---

## 📋 Table of Contents

- [✨ What is Campus Buzz?](#-what-is-campus-buzz)
- [🎯 Features at a Glance](#-features-at-a-glance)
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
- [🤝 Contributing](#-contributing)

---

## ✨ What is Campus Buzz?

**Campus Buzz** is a real-time campus coordination web platform built exclusively for **NIT Raipur (NITRR)** students, clubs, and administrators. It solves the fragmentation of campus life by unifying social posting, event management, live chat, anonymous complaints, and club announcements — all in one place, accessible only with a verified `@nitrr.ac.in` email.

> _"One platform. Every beat of campus life."_

---

## 🎯 Features at a Glance

<table>
<tr>
<td width="50%">

### 🌊 Smart Feed
- Role-aware post feed (Student / Club / Admin)
- Hashtag-driven posts: `#foodsplit` `#cabsplit` `#resell` `#lost` `#found`
- Like / Dislike / Comment / Save
- @mention support with push notifications
- Club-only feed for announcements & promotions

</td>
<td width="50%">

### 💬 Real-time Chat Hub
- **Post-linked rooms**: auto-created for `#foodsplit`, `#cabsplit`, `#resell` posts
- **Global Hub rooms**: hashtag-categorised community rooms (`#general`, `#sports`, `#placement`…)
- Live online-user presence lists
- 60-message history on join
- Auto-close after 2 hrs of inactivity

</td>
</tr>
<tr>
<td width="50%">

### 📅 Event Calendar
- Full monthly / list calendar view
- Club & Admin publish events directly
- Students submit event *requests* → Admin approval flow
- RSVP tracking
- Online (with meeting link + passcode) & Offline (with map link) event types

</td>
<td width="50%">

### 🚕 Cab Tracker
- Real-time GPS sharing via Socket.io
- Live Leaflet map embedded inside cab-split post chat
- Shared by the driver; visible to all room members
- No location stored in DB — pure WebSocket relay

</td>
</tr>
<tr>
<td width="50%">

### 📣 Stories / Announcements
- Instagram-style ephemeral stories (1–48 hr lifespan)
- Only Club & Admin accounts can publish
- Auto-notifies followers on creation
- Seen-by tracking

</td>
<td width="50%">

### 🗳️ Anonymous Complaints
- Fully anonymous to other students (author shown only to Admins)
- Upvote system to surface urgent issues
- Admin status management: `Open → Resolved / Declined / Resolved (Verified)`
- Decline reason field

</td>
</tr>
<tr>
<td width="50%">

### 🔔 Notification Centre
- In-app notifications for: `like`, `dislike`, `comment`, `follow`, `mention`, `announcement`, `event_request`, `expiry_warning`
- Unread badge count
- One-click read-all

</td>
<td width="50%">

### 🔐 Auth & RBAC
- NITRR email-only registration
- JWT-based authentication (7-day tokens)
- Role-based access control: **Student · Club · Admin**
- Password reset via email OTP
- Bcrypt password hashing (salt rounds: 12)

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
| **Maps** | React Leaflet | 4.2.1 | GPS cab tracker |
| **Real-time (FE)** | Socket.io-client | 4.8.1 | WebSocket client |
| **Backend** | Node.js + Express | 18+ / 4.21 | REST API server |
| **Database** | MongoDB Atlas + Mongoose | 8.9.1 | Data persistence |
| **Real-time (BE)** | Socket.io | 4.8.1 | WebSocket server |
| **Auth** | JSON Web Tokens | 9.0.2 | Stateless auth |
| **Passwords** | Bcryptjs | 2.4.3 | Password hashing |
| **Email** | Nodemailer + Gmail SMTP | 9.0.1 | Password reset |
| **Scheduler** | node-cron | 3.0.3 | Background jobs |
| **Validation** | express-validator | 7.2.1 | Input validation |

---

## 🗂️ Project Structure

```
CAMPUS-BUZZ/
├── 📁 backend/                     # Express + Socket.io API server
│   ├── 📁 controllers/             # Business logic handlers
│   │   ├── authController.js       #   Register, login, password reset
│   │   ├── postController.js       #   CRUD posts, like/dislike/save
│   │   ├── interactionController.js#   Comments, follows, notifications
│   │   ├── eventController.js      #   Events CRUD + RSVP
│   │   ├── complaintController.js  #   Complaints + upvote + admin actions
│   │   ├── notificationController.js#  Notifications read/list
│   │   └── userController.js       #   Profile update, search
│   ├── 📁 models/                  # Mongoose schemas
│   │   ├── User.js                 #   Roles, email validation, password hashing
│   │   ├── Post.js                 #   Hashtag posts with expiry + likes
│   │   ├── ChatRoom.js             #   Post-linked & global chat rooms
│   │   ├── Message.js              #   Chat messages
│   │   ├── Announcement.js         #   Ephemeral stories (1–48 hr)
│   │   ├── Event.js                #   Campus events with RSVP
│   │   ├── Complaint.js            #   Anonymous complaints
│   │   └── Notification.js         #   In-app notifications
│   ├── 📁 routes/
│   │   ├── index.js                #   All API routes mounted here
│   │   └── userRoutes.js           #   User-specific sub-routes
│   ├── 📁 middleware/
│   │   ├── auth.js                 #   JWT verification middleware
│   │   ├── rbac.js                 #   Role-based access control
│   │   └── validate.js             #   express-validator helper
│   ├── 📁 socket/
│   │   └── index.js                #   Socket.io server (post rooms + global hub)
│   ├── 📁 cron/
│   │   └── postExpiry.js           #   Every-5-min maintenance job
│   ├── 📁 utils/                   # Shared utilities
│   ├── server.js                   # 🚀 Entry point
│   └── .env                        # Environment config (not committed)
│
└── 📁 frontend/                    # React SPA
    ├── 📁 src/
    │   ├── 📁 pages/               # Route-level page components
    │   │   ├── FeedPage.jsx        #   Main post feed
    │   │   ├── ClubFeedPage.jsx    #   Club-only feed
    │   │   ├── ChatHubPage.jsx     #   Full-screen chat hub
    │   │   ├── CalendarPage.jsx    #   Event calendar
    │   │   ├── ComplaintsPage.jsx  #   Complaints board
    │   │   ├── ProfilePage.jsx     #   Own profile + saved posts
    │   │   ├── UserProfilePage.jsx #   Public profile view
    │   │   ├── NotificationsPage.jsx#  Notification centre
    │   │   └── LoginPage.jsx       #   Auth gate
    │   ├── 📁 components/          # Reusable UI components
    │   │   ├── PostFeed.jsx        #   Infinite-scroll post list
    │   │   ├── PostCard.jsx        #   Individual post card + chat trigger
    │   │   ├── CreatePostForm.jsx  #   New post modal
    │   │   ├── CommentSection.jsx  #   Nested comments
    │   │   ├── AnnouncementStories.jsx # Stories carousel
    │   │   ├── CabTracker.jsx      #   Leaflet GPS map
    │   │   ├── CountdownTimer.jsx  #   Post expiry countdown
    │   │   ├── HashtagBadge.jsx    #   Coloured hashtag pill
    │   │   └── 📁 Layout/          #   Navbar + RightPanel
    │   ├── 📁 context/
    │   │   ├── AuthContext.js      #   JWT token + user state
    │   │   └── SocketContext.js    #   Single persistent socket connection
    │   ├── 📁 hooks/               # Custom React hooks
    │   ├── 📁 utils/               # Axios instance + helpers
    │   └── App.jsx                 # Router + layout shell
    └── .env                        # Frontend env config
```

---

## ⚡ Quick Start

### Prerequisites

```bash
node --version   # >= 18.0.0
npm --version    # >= 9.0.0
```

You also need a **MongoDB Atlas** cluster and a **Gmail App Password** for email.

### 1️⃣ Clone

```bash
git clone https://github.com/MAYANK-2109/CAMPUS-BUZZ.git
cd CAMPUS-BUZZ
```

### 2️⃣ Backend Setup

```bash
cd backend
npm install
```

Create `backend/.env` (see [Environment Variables](#-environment-variables) below), then:

```bash
npm run dev          # Development with hot-reload (nodemon)
# or
npm start            # Production
```

Server starts at **http://localhost:5000**

### 3️⃣ Frontend Setup

```bash
cd frontend
npm install
```

Create `frontend/.env`, then:

```bash
npm start            # Starts CRA dev server at http://localhost:3000
```

The frontend proxies all `/api/*` requests to `http://localhost:5000` automatically.

---

## 🔐 Environment Variables

### `backend/.env`

```env
# ── Server ───────────────────────────────────
PORT=5000
NODE_ENV=development                    # or 'production'

# ── MongoDB ──────────────────────────────────
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/campusbuzz

# ── JWT ──────────────────────────────────────
JWT_SECRET=your_super_secret_key_here   # Min 32 chars, change in production!
JWT_EXPIRES_IN=7d

# ── CORS ─────────────────────────────────────
CLIENT_URL=http://localhost:3000        # Comma-separated list in production

# ── SMTP (Gmail) ─────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=your_gmail@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx      # Gmail App Password (16 chars)
FROM_NAME=CampusBuzz
FROM_EMAIL=noreply@campusbuzz.com
```

### `frontend/.env`

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SOCKET_URL=http://localhost:5000
```

> **Production (Vercel + Render):** Set `REACT_APP_API_URL` and `REACT_APP_SOCKET_URL` to your Render backend URL in Vercel's environment settings.

---

## 📡 API Overview

All routes are prefixed with `/api`.

| Domain | Base Path | Auth Required | Description |
|--------|-----------|:-------------:|-------------|
| **Auth** | `/api/auth` | ❌ | Register, login, forgot/reset password |
| **Posts** | `/api/posts` | ✅ | CRUD, like, dislike, save, comments |
| **Events** | `/api/events` | ✅ | CRUD, RSVP, admin approval |
| **Complaints** | `/api/complaints` | ✅ | Submit, upvote, admin status update |
| **Announcements** | `/api/announcements` | ✅ | Club/Admin stories |
| **Notifications** | `/api/notifications` | ✅ | List, mark read, count |
| **Users** | `/api/users` | ✅ | Profile, follow/unfollow, search |
| **Chat Rooms** | `/api/rooms` | ✅ | List/create global hub rooms |

> 📄 See [`docs/API.md`](./docs/API.md) for full endpoint documentation with request/response examples.

---

## 🔌 Socket Events

Campus Buzz uses **two types of Socket.io rooms**:

### Post-Linked Rooms (Chat per post)
```
Client → Server                     Server → Client
─────────────────────               ─────────────────────
joinRoom     { postId }         →   joinedRoom   { roomId, history }
sendMessage  { postId, text }   →   newMessage   { payload }
closeRoom    { postId }         →   roomClosed   { postId, closedBy }
cabLocation  { postId,lat,lng } →   cabLocationUpdate { lat, lng, sharedBy }
```

### Global Hub Rooms
```
Client → Server                     Server → Client
─────────────────────               ─────────────────────────
joinGlobalRoom  { roomId }      →   globalJoined       { roomId, history, room, onlineCount }
sendGlobalMsg   { roomId,text } →   globalMessage      { payload }
leaveGlobalRoom { roomId }      →   globalUserLeft     { userId, displayName }
closeGlobalRoom { roomId }      →   globalRoomClosed   { roomId, closedBy }
                                →   onlineUsersUpdate  { roomId, users[] }
                                →   roomsUpdated       (broadcast)
```

> All socket connections require a valid **JWT** in `socket.handshake.auth.token`.

---

## 👥 User Roles

| Role | Registration | Capabilities |
|------|-------------|--------------|
| **Student** | `@*.nitrr.ac.in` format email | Post, comment, follow clubs, join chats, submit complaints & event requests |
| **Club** | `@*.nitrr.ac.in` admin email | All Student permissions + publish events, create announcements, close their own rooms |
| **Admin** | `@*.nitrr.ac.in` admin email | All Club permissions + approve/reject events, manage complaints, view complaint authors, close any global room |

---

## 🗃️ Data Models

```
User ──────────────────────────────────────────────────────
  rollNo, instituteEmail, passwordHash, role
  displayName, bio, avatarUrl
  followers[], following[], savedPosts[]
  resetPasswordToken, resetPasswordExpire

Post ──────────────────────────────────────────────────────
  title, description, imageUrl, author → User
  hashtag: #foodsplit|#cabsplit|#resell|#lost|#found
  customTags[], likes[], dislikes[], mentions[]
  expiresAt, totalFare, isActive, expiryWarned

ChatRoom ──────────────────────────────────────────────────
  postId → Post (null for global rooms)
  isGlobal, name, hashtag, createdBy → User
  participants[], isActive, lastMessageAt

Message ───────────────────────────────────────────────────
  roomId → ChatRoom, senderId → User
  text, timestamp

Announcement ──────────────────────────────────────────────
  author → User, text, imageUrl
  durationHours, expiresAt, isActive, seenBy[]

Event ─────────────────────────────────────────────────────
  title, date, time, venue, description
  eventType: Online|Offline
  meetingLink, passcode, mapLink
  createdBy → User, status: Approved|Pending|Rejected
  rsvps[]

Complaint ─────────────────────────────────────────────────
  title, description, author → User (hidden from Students)
  status: Open|Resolved|Declined|Resolved (Verified)
  declineReason, upvotes[], isEdited

Notification ──────────────────────────────────────────────
  recipient → User, sender → User
  type: like|dislike|comment|follow|mention|
        announcement|event_request|expiry_warning|report
  post → Post, announcement → Announcement
  isRead, message
```

---

## ⏰ Background Jobs

A single cron job runs **every 5 minutes** (`*/5 * * * *`):

| Task | Logic |
|------|-------|
| **Pre-expiry warning** | Finds `#foodsplit` / `#cabsplit` posts expiring in ≤35 min → sends `expiry_warning` notification to author (once per post via `expiryWarned` flag) |
| **Post expiry** | Soft-deletes posts where `expiresAt < now` & `isActive = true` → also deactivates linked ChatRoom |
| **Idle global room cleanup** | Closes global hub rooms with `lastMessageAt < 2 hours ago` |
| **Announcement expiry** | Soft-deletes announcements where `expiresAt < now` |

---

## 🚀 Deployment

### Recommended Stack

| Service | Purpose |
|---------|---------|
| [**Render**](https://render.com) | Backend Node.js server (free tier) |
| [**Vercel**](https://vercel.com) | Frontend React app (free tier) |
| [**MongoDB Atlas**](https://www.mongodb.com/atlas) | Database (M0 free cluster) |

### Render (Backend)

1. Connect your GitHub repo → **Web Service**
2. Build command: `npm install`
3. Start command: `npm start`
4. Set all environment variables from [`backend/.env`](#-environment-variables)
5. Set `NODE_ENV=production` and `CLIENT_URL=https://your-vercel-app.vercel.app`

### Vercel (Frontend)

1. Connect your GitHub repo → **Framework Preset: Create React App**
2. Root directory: `frontend`
3. Set environment variables:
   - `REACT_APP_API_URL=https://your-render-backend.onrender.com/api`
   - `REACT_APP_SOCKET_URL=https://your-render-backend.onrender.com`

> **DNS Note:** The backend uses Google DNS (`8.8.8.8`) to resolve MongoDB Atlas SRV records, which may be blocked on restrictive college networks.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

Please follow conventional commit format: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`

---

<div align="center">

Made with ❤️ for **NIT Raipur** | Built by **Mayank**

[![GitHub](https://img.shields.io/badge/GitHub-MAYANK--2109-181717?style=for-the-badge&logo=github)](https://github.com/MAYANK-2109)

</div>
