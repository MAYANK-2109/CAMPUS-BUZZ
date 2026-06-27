# 📡 Campus Buzz — API Reference

> Complete REST API documentation based on `backend/routes/index.js` and `backend/routes/userRoutes.js`.
> Base URL: `http://localhost:5000/api` (dev) | `https://your-backend.onrender.com/api` (prod)

All protected routes require:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## Table of Contents
- [Auth](#-auth)
- [Posts](#-posts)
- [Events](#-events)
- [Complaints](#-complaints)
- [Announcements](#-announcements)
- [Notifications](#-notifications)
- [Users](#-users)
- [Clubs](#-clubs)
- [Chat Rooms](#-chat-rooms)

---

## 🔐 Auth

### Register
```
POST /api/auth/register
```
**Auth:** ❌

**Body:**
```json
{
  "rollNo": "21CSE123",
  "instituteEmail": "jdoe123.btech2022@cse.nitrr.ac.in",
  "password": "SecurePass123!",
  "displayName": "John Doe",
  "role": "Student"
}
```

**Response `201`** — OTP sent, user not yet active:
```json
{
  "success": true,
  "requiresVerification": true,
  "instituteEmail": "jdoe123.btech2022@cse.nitrr.ac.in",
  "message": "Verification code sent to your email."
}
```

> If the email already exists but is unverified, responds `200` with a fresh OTP resent.

---

### Verify OTP
```
POST /api/auth/verify-otp
```
**Auth:** ❌

**Body:**
```json
{ "instituteEmail": "jdoe123.btech2022@cse.nitrr.ac.in", "otp": "482913" }
```

**Response `200`:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1...",
  "user": { "_id": "...", "displayName": "John Doe", "role": "Student", "isVerified": true, ... }
}
```

> Max 5 incorrect attempts before account is locked until a new OTP is requested. OTP expires in 10 minutes.

---

### Resend OTP
```
POST /api/auth/resend-otp
```
**Auth:** ❌

**Body:** `{ "instituteEmail": "jdoe123.btech2022@cse.nitrr.ac.in" }`

**Response `200`:** `{ "success": true, "message": "A new verification code has been sent." }`

> Rate-limited: one resend per 30 seconds per user.

---

### Login
```
POST /api/auth/login
```
**Auth:** ❌

**Body:**
```json
{
  "instituteEmail": "jdoe123.btech2022@cse.nitrr.ac.in",
  "password": "SecurePass123!"
}
```

**Response `200`:**
```json
{ "success": true, "token": "eyJ...", "user": { ... } }
```

> If account is unverified, responds `403` with `requiresVerification: true` and re-sends OTP.

---

### Forgot Password
```
POST /api/auth/forgot-password
```
**Auth:** ❌

**Body:** `{ "instituteEmail": "jdoe123.btech2022@cse.nitrr.ac.in" }`

**Response `200`:** `{ "success": true, "data": "Email sent" }`

> Sends a password-reset link to the user's email. Link is valid for 10 minutes.

---

### Reset Password
```
PATCH /api/auth/reset-password/:token
```
**Auth:** ❌

**Body:** `{ "password": "NewSecurePass456!" }`

**Response `200`:** `{ "success": true, "token": "eyJ...", "user": { ... } }`

---

### Get Current User
```
GET /api/auth/me
```
**Auth:** ✅

**Response `200`:** `{ "success": true, "user": { ... } }`

---

## 📰 Posts

### Get Feed
```
GET /api/posts?page=1&limit=10&hashtag=#cabsplit&feed=club&author=<userId>
```
**Auth:** ✅

Query params:
| Param | Description |
|-------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Items per page |
| `hashtag` | Filter by hashtag (e.g. `#foodsplit`) |
| `feed=club` | Return only Club/Admin posts |
| `author` | Filter by author ID |

**Response `200`:**
```json
{
  "success": true,
  "posts": [
    {
      "_id": "...",
      "title": "Cab to Airport — share?",
      "description": "Leaving at 6 AM, 3 seats free.",
      "imageUrl": "data:image/...",
      "hashtag": "#cabsplit",
      "totalFare": 800,
      "expiresAt": "2026-06-28T00:00:00.000Z",
      "isActive": true,
      "isExpired": false,
      "likes": ["userId1"],
      "dislikes": [],
      "customTags": [],
      "mentions": [],
      "author": { "_id": "...", "displayName": "Ravi Kumar", "avatarUrl": null, "role": "Student" },
      "createdAt": "2026-06-27T14:00:00.000Z"
    }
  ]
}
```

---

### Get Trending Hashtags
```
GET /api/posts/trending-hashtags
```
**Auth:** ✅

**Response `200`:**
```json
{
  "success": true,
  "data": [
    { "hashtag": "#cabsplit", "count": 12 },
    { "hashtag": "#foodsplit", "count": 9 }
  ]
}
```

> Returns top 5 hashtags by active post count.

---

### Create Post
```
POST /api/posts
```
**Auth:** ✅

**Body:**
```json
{
  "title": "Lost my blue bottle near LH",
  "description": "Lost near Library Hall. @jdoe123 please help find.",
  "imageUrl": "data:image/jpeg;base64,...",
  "hashtag": "#lost",
  "customTags": ["library", "bottle"]
}
```

For `#foodsplit` / `#cabsplit` — also include:
```json
{ "expiresAt": "2026-06-28T06:00:00Z" }
```

For `#cabsplit` — optionally include:
```json
{ "totalFare": 600 }
```

**Response `201`:** `{ "success": true, "post": { ... } }`

---

### Get Single Post
```
GET /api/posts/:id
```
**Auth:** ✅

**Response `200`:** `{ "success": true, "post": { ... } }`

---

### Update Post
```
PATCH /api/posts/:id
```
**Auth:** ✅ | **Role:** Author

**Body:** Any subset of `{ title, description, imageUrl, customTags }`

**Response `200`:** `{ "success": true, "post": { ... } }`

---

### Delete Post
```
DELETE /api/posts/:id
```
**Auth:** ✅ | **Role:** Author or Admin

**Response `200`:** `{ "success": true, "message": "Post deleted." }`

---

### Toggle Like
```
POST /api/posts/:id/like
```
**Auth:** ✅

**Response `200`:** `{ "success": true, "likes": [...], "dislikes": [...] }`

> Removes the like if the user already liked it. Also removes an existing dislike when adding a like.

---

### Toggle Dislike
```
POST /api/posts/:id/dislike
```
**Auth:** ✅

**Response `200`:** `{ "success": true, "likes": [...], "dislikes": [...] }`

---

### Toggle Save (Bookmark)
```
POST /api/posts/:id/save
```
**Auth:** ✅

**Response `200`:** `{ "success": true, "saved": true }`

---

### Get Comments
```
GET /api/posts/:id/comments
```
**Auth:** ✅

**Response `200`:**
```json
{
  "success": true,
  "comments": [
    {
      "_id": "...",
      "text": "I'm in! DM me.",
      "author": { "_id": "...", "displayName": "Priya Sharma", "role": "Student" },
      "createdAt": "..."
    }
  ]
}
```

---

### Add Comment
```
POST /api/posts/:id/comments
```
**Auth:** ✅

**Body:** `{ "text": "I'll join the cab!" }`

**Response `201`:** `{ "success": true, "comment": { ... } }`

---

### Report Post
```
POST /api/posts/:id/report
```
**Auth:** ✅ | **Constraint:** Cannot report your own post

**Response `200`:** `{ "success": true, "message": "Report submitted. Our team will review it." }`

> Sends a `report` notification to every Admin account.

---

## 📅 Events

### Get Events
```
GET /api/events
```
**Auth:** ✅

> Students see only `Approved` events. Admins see all statuses.

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "title": "Annual Tech Fest 2026",
      "date": "2026-07-15T00:00:00.000Z",
      "time": "10:00 AM",
      "venue": "Main Auditorium",
      "eventType": "Offline",
      "mapLink": "https://goo.gl/maps/...",
      "status": "Approved",
      "createdBy": { "_id": "...", "displayName": "TechClub NITRR" },
      "rsvps": ["userId1"]
    }
  ]
}
```

---

### Create Event
```
POST /api/events
```
**Auth:** ✅

**Body:**
```json
{
  "title": "Python Workshop",
  "date": "2026-07-20",
  "time": "2:00 PM",
  "venue": "CS Seminar Hall",
  "description": "Hands-on Python basics.",
  "eventType": "Offline"
}
```

For online events, include `meetingLink` and `passcode`. For offline, include `mapLink`.

> Club/Admin → `status: Approved` immediately. Student → `status: Pending`, notifies all Admins.

**Response `201`:** `{ "success": true, "data": { ...event } }`

---

### Request Event (explicit route)
```
POST /api/events/request
```
**Auth:** ✅

Same body as Create Event. Always sets `status: Pending` regardless of role.

---

### Toggle RSVP
```
POST /api/events/:id/rsvp
```
**Auth:** ✅

**Response `200`:** `{ "success": true, "rsvpCount": 5, "rsvped": true }`

---

### Update Event Status
```
PATCH /api/events/:id/status
```
**Auth:** ✅ | **Role:** Admin only

**Body:** `{ "status": "Approved" }` or `{ "status": "Rejected" }`

**Response `200`:** `{ "success": true, "data": { ...event } }`

---

### Delete Event
```
DELETE /api/events/:id
```
**Auth:** ✅ | **Role:** Admin only

**Response `200`:** `{ "success": true }`

---

## 🗳️ Complaints

### Get Complaints
```
GET /api/complaints?status=Open
```
**Auth:** ✅

> **Students** receive the list with `author` field removed (anonymised).
> **Admins** receive the list with `author` populated.

---

### Get My Complaint IDs
```
GET /api/complaints/mine
```
**Auth:** ✅

**Response `200`:** `{ "success": true, "data": ["complaintId1", "complaintId2"] }`

> Returns only the IDs of complaints submitted by the current user — used by the frontend to identify owned complaints.

---

### Search Complaints
```
GET /api/complaints/search?q=broken+ac
```
**Auth:** ✅

**Response `200`:** `{ "success": true, "data": [{ ...complaint }] }`

> Keyword search across `title` and `description`. Used for duplicate detection before submitting.

---

### Submit Complaint
```
POST /api/complaints
```
**Auth:** ✅

**Body:**
```json
{
  "title": "Broken AC in CS-204",
  "description": "The AC in Room CS-204 has been non-functional for 3 weeks."
}
```

**Response `201`:** `{ "success": true, "data": { ...complaint } }`

---

### Toggle Upvote
```
POST /api/complaints/:id/upvote
```
**Auth:** ✅

**Response `200`:** `{ "success": true, "upvotes": [...] }`

---

### Edit Complaint
```
PATCH /api/complaints/:id/edit
```
**Auth:** ✅ | **Role:** Author only | **Constraint:** Status must be `Open`

**Body:** `{ "title": "Updated title", "description": "Updated description" }`

**Response `200`:** `{ "success": true, "data": { ...complaint, "isEdited": true } }`

---

### Update Complaint Status
```
PATCH /api/complaints/:id
```
**Auth:** ✅ | **Role:** Admin only

**Body:**
```json
{
  "status": "Declined",
  "declineReason": "Outside admin scope. Contact maintenance."
}
```

Valid statuses: `Open`, `Resolved`, `Declined`, `Resolved (Verified)`

**Response `200`:** `{ "success": true, "data": { ...complaint } }`

---

## 📣 Announcements

### Get Active Announcements
```
GET /api/announcements
```
**Auth:** ✅

Returns active, non-expired announcements from clubs the current user follows, plus the user's own announcements.

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "text": "Hackathon registrations now open!",
      "imageUrl": null,
      "durationHours": 24,
      "expiresAt": "2026-06-28T14:00:00.000Z",
      "isActive": true,
      "seenBy": [],
      "author": { "_id": "...", "displayName": "TechClub NITRR", "role": "Club" },
      "createdAt": "..."
    }
  ]
}
```

---

### Create Announcement
```
POST /api/announcements
```
**Auth:** ✅ | **Role:** Club or Admin

**Body:**
```json
{
  "text": "🎉 Our coding hackathon registrations are now open!",
  "imageUrl": "data:image/jpeg;base64,...",
  "durationHours": 24
}
```

> Must include at least one of `text` or `imageUrl`. `durationHours` is clamped to `[1, 48]`.
> Sends an `announcement` notification to all followers.

**Response `201`:** `{ "success": true, "data": { ...announcement } }`

---

### Mark Announcement as Seen
```
POST /api/announcements/:id/seen
```
**Auth:** ✅

**Response `200`:** `{ "success": true }`

---

### Delete Announcement
```
DELETE /api/announcements/:id
```
**Auth:** ✅ | **Role:** Author or Admin

Sets `isActive = false` (soft delete).

**Response `200`:** `{ "success": true }`

---

## 🔔 Notifications

### Get Notifications
```
GET /api/notifications
```
**Auth:** ✅

Returns the last 30 notifications for the current user.

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "type": "like",
      "message": "Priya Sharma liked your post",
      "sender": { "displayName": "Priya Sharma", "avatarUrl": null, "role": "Student" },
      "post": { "_id": "...", "title": "Cab to Airport" },
      "isRead": false,
      "createdAt": "..."
    }
  ]
}
```

---

### Get Unread Count
```
GET /api/notifications/unread-count
```
**Auth:** ✅

**Response `200`:** `{ "success": true, "count": 3 }`

---

### Mark All as Read
```
PATCH /api/notifications/read
```
**Auth:** ✅

**Response `200`:** `{ "success": true }`

---

## 👤 Users

### List Users
```
GET /api/users?role=Admin&limit=50
```
**Auth:** ✅

Returns `_id`, `displayName`, `avatarUrl`, `rollNo`, `role`. Max 100 results.

---

### Search Users (Autocomplete)
```
GET /api/users/search?q=priya
```
**Auth:** ✅

Returns up to 8 users matching `displayName` (case-insensitive). Used for @mention autocomplete.

**Response `200`:** `{ "success": true, "data": [{ "_id", "displayName", "avatarUrl", "role" }] }`

---

### Get Saved Posts
```
GET /api/users/me/saved
```
**Auth:** ✅

**Response `200`:** `{ "success": true, "data": [{ ...post }] }`

---

### Update Own Profile
```
PATCH /api/users/profile
```
**Auth:** ✅

**Body:** Any subset of `{ "displayName", "bio", "avatarUrl" }`

**Response `200`:** `{ "success": true, "data": { ...safeUser } }`

---

### Change Password
```
PATCH /api/users/change-password
```
**Auth:** ✅

**Body:**
```json
{ "currentPassword": "OldPass123!", "newPassword": "NewPass456!" }
```

**Response `200`:** `{ "success": true, "message": "Password changed successfully." }`

---

### Get Public User Profile
```
GET /api/users/:id
```
**Auth:** ✅

Returns: `displayName`, `avatarUrl`, `role`, `bio`, `followers`, `following`, `createdAt`, `rollNo`, `instituteEmail`.

**Response `200`:** `{ "success": true, "data": { ...user } }`

---

### Toggle Follow
```
POST /api/users/:id/follow
```
**Auth:** ✅

Toggles follow/unfollow. On new follow → creates a `follow` notification for the followed user.

**Response `200`:** `{ "success": true, "following": true }`

---

## 🏛️ Clubs

### List Clubs & Admins
```
GET /api/clubs
```
**Auth:** ✅

Returns all accounts with `role: Club` or `role: Admin`, sorted by `displayName`.

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "displayName": "TechClub NITRR",
      "avatarUrl": null,
      "role": "Club",
      "bio": "Coding and tech events.",
      "followers": ["userId1"],
      "following": []
    }
  ]
}
```

---

## 🏠 Chat Rooms

### List Active Rooms
```
GET /api/rooms
```
**Auth:** ✅

Returns both global hub rooms and active post-linked rooms, each tagged with `_roomType: 'global' | 'post'`.

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "_roomType": "global",
      "name": "Airport Cab Group",
      "hashtag": "#cabsplit",
      "isGlobal": true,
      "isActive": true,
      "createdBy": { "displayName": "Ravi Kumar", "role": "Student" },
      "lastMessageAt": "2026-06-27T13:45:00.000Z"
    },
    {
      "_id": "...",
      "_roomType": "post",
      "name": "Lost my blue bottle near LH",
      "hashtag": "#lost",
      "isGlobal": false,
      "postId": { "title": "...", "hashtag": "#lost", "author": "..." }
    }
  ]
}
```

---

### Get Allowed Hashtags
```
GET /api/rooms/hashtags
```
**Auth:** ✅

**Response `200`:** `{ "success": true, "data": ["#general", "#announcements", "#foodsplit", ...] }`

---

### Create Global Room
```
POST /api/rooms
```
**Auth:** ✅

**Body:**
```json
{ "name": "Weekend Trek Planning", "hashtag": "#misc" }
```

**Response `201`:** `{ "success": true, "data": { ...room } }`

---

### Find or Create Room for a Post
```
POST /api/rooms/from-post/:postId
```
**Auth:** ✅

Finds an existing active room for the given post, or creates one if none exists.

**Response `200`:** `{ "success": true, "data": { ...room } }`

---

### Get Room Messages
```
GET /api/rooms/:id/messages
```
**Auth:** ✅

Returns the last 60 messages for the room, oldest first.

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "text": "I'm in!",
      "senderId": { "displayName": "Priya", "avatarUrl": null, "role": "Student" },
      "timestamp": "..."
    }
  ]
}
```

---

### Close a Global Room
```
DELETE /api/rooms/:id
```
**Auth:** ✅ | **Role:** Room creator or Admin

Sets `isActive = false`.

**Response `200`:** `{ "success": true, "message": "Room closed." }`

---

### Close a Post-Linked Room
```
PATCH /api/chat-rooms/:postId/close
```
**Auth:** ✅ | **Role:** Post author or Admin

**Response `200`:** `{ "success": true, "message": "Chat room closed." }`

---

## ⚠️ Error Response Format

All errors follow this structure:
```json
{
  "success": false,
  "message": "Human-readable description",
  "stack": "..."
}
```
> `stack` is only included when `NODE_ENV=development`.

| Code | Meaning |
|------|---------|
| `400` | Bad request / validation failure |
| `401` | Not authenticated (missing or invalid JWT) |
| `403` | Forbidden (insufficient role, or email unverified) |
| `404` | Resource not found |
| `409` | Conflict (duplicate email or roll number) |
| `422` | Mongoose validation error |
| `429` | Rate limit (OTP resend throttle / too many OTP attempts) |
| `500` | Internal server error |

---

<div align="center">

📄 **[Back to README](../README.md)** · 🗺️ **[Data Flow](../DATA_FLOW.md)**

</div>
