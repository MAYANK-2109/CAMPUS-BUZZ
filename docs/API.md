# 📡 Campus Buzz — API Reference

> Complete REST API documentation for the Campus Buzz backend.
> Base URL: `http://localhost:5000/api` (dev) | `https://your-backend.onrender.com/api` (prod)

All protected routes require the header:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## Table of Contents
- [Auth](#-auth)
- [Posts](#-posts)
- [Comments & Interactions](#-comments--interactions)
- [Events](#-events)
- [Complaints](#-complaints)
- [Announcements](#-announcements)
- [Notifications](#-notifications)
- [Users](#-users)
- [Chat Rooms](#-chat-rooms)

---

## 🔐 Auth

### Register
```
POST /api/auth/register
```
**Body:**
```json
{
  "instituteEmail": "jdoe123.btech2022@cse.nitrr.ac.in",
  "password": "SecurePass123!",
  "displayName": "John Doe",
  "role": "Student"
}
```
**Response `201`:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1...",
  "user": { "_id": "...", "displayName": "John Doe", "role": "Student", "instituteEmail": "..." }
}
```

---

### Login
```
POST /api/auth/login
```
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

---

### Forgot Password
```
POST /api/auth/forgot-password
```
**Body:** `{ "email": "jdoe123.btech2022@cse.nitrr.ac.in" }`
**Response `200`:** `{ "success": true, "message": "Reset email sent." }`

---

### Reset Password
```
PUT /api/auth/reset-password/:token
```
**Body:** `{ "password": "NewSecurePass456!" }`
**Response `200`:** `{ "success": true, "token": "eyJ...", "user": { ... } }`

---

## 📰 Posts

### Get Feed
```
GET /api/posts?page=1&limit=10&hashtag=#cabsplit&author=<userId>
```
**Auth:** ✅ | **Roles:** All

**Response `200`:**
```json
{
  "success": true,
  "posts": [
    {
      "_id": "...",
      "title": "Cab to Airport - share?",
      "description": "Leaving at 6 AM, 3 seats free. Total fare ₹800.",
      "imageUrl": "data:image/...",
      "hashtag": "#cabsplit",
      "totalFare": 800,
      "expiresAt": "2026-06-28T00:00:00.000Z",
      "isActive": true,
      "isExpired": false,
      "likes": ["userId1", "userId2"],
      "dislikes": [],
      "author": { "_id": "...", "displayName": "Ravi Kumar", "avatarUrl": null, "role": "Student" },
      "createdAt": "2026-06-27T14:00:00.000Z"
    }
  ],
  "page": 1,
  "totalPages": 5
}
```

---

### Create Post
```
POST /api/posts
```
**Auth:** ✅ | **Roles:** All

**Body:**
```json
{
  "title": "Lost my blue bottle near LH",
  "description": "Lost near Library Hall, contact if found.",
  "imageUrl": "data:image/jpeg;base64,...",
  "hashtag": "#lost",
  "customTags": ["library", "bottle"]
}
```
> For `#foodsplit` / `#cabsplit`: also include `"expiresAt": "2026-06-28T06:00:00Z"`
> For `#cabsplit`: optionally include `"totalFare": 600`

**Response `201`:** `{ "success": true, "post": { ... } }`

---

### Get Single Post
```
GET /api/posts/:id
```
**Response `200`:** `{ "success": true, "post": { ... } }`

---

### Delete Post
```
DELETE /api/posts/:id
```
**Auth:** ✅ | **Roles:** Author or Admin

**Response `200`:** `{ "success": true, "message": "Post deleted." }`

---

### Like / Dislike (toggle)
```
POST /api/posts/:id/like
POST /api/posts/:id/dislike
```
**Response `200`:** `{ "success": true, "likes": [...], "dislikes": [...] }`

---

### Save / Unsave (toggle)
```
POST /api/posts/:id/save
```
**Response `200`:** `{ "success": true, "saved": true }`

---

## 💬 Comments & Interactions

### Get Comments
```
GET /api/posts/:id/comments
```
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
**Body:** `{ "text": "I'll join!" }`
**Response `201`:** `{ "success": true, "comment": { ... } }`

---

### Delete Comment
```
DELETE /api/posts/:postId/comments/:commentId
```
**Roles:** Author of comment or Admin
**Response `200`:** `{ "success": true }`

---

### Follow / Unfollow User (toggle)
```
POST /api/users/:id/follow
```
**Response `200`:** `{ "success": true, "following": true }`

---

## 📅 Events

### Get Events (Calendar)
```
GET /api/events?month=6&year=2026&status=Approved
```
**Auth:** ✅

**Response `200`:**
```json
{
  "success": true,
  "events": [
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
**Auth:** ✅ | **Roles:** Any (Students → Pending, Clubs/Admin → Approved)

**Body:**
```json
{
  "title": "Python Workshop",
  "date": "2026-07-20",
  "time": "2:00 PM",
  "venue": "CS Department Seminar Hall",
  "description": "Hands-on Python basics for freshers.",
  "eventType": "Offline"
}
```

---

### RSVP (toggle)
```
POST /api/events/:id/rsvp
```
**Response `200`:** `{ "success": true, "rsvps": [...], "rsvped": true }`

---

### Update Event Status (Admin only)
```
PATCH /api/events/:id/status
```
**Body:** `{ "status": "Approved" }` | `{ "status": "Rejected" }`

---

### Delete Event
```
DELETE /api/events/:id
```
**Roles:** Creator or Admin

---

## 🗳️ Complaints

### Get All Complaints
```
GET /api/complaints?status=Open&page=1
```
> Students receive list **without** `author` field.
> Admins receive list **with populated** `author`.

---

### Submit Complaint
```
POST /api/complaints
```
**Body:**
```json
{
  "title": "Broken AC in CS-204",
  "description": "The AC in Room CS-204 has been non-functional for 3 weeks."
}
```
**Response `201`:** `{ "success": true, "complaint": { ... } }`

---

### Upvote Complaint (toggle)
```
POST /api/complaints/:id/upvote
```
**Response `200`:** `{ "success": true, "upvotes": [...] }`

---

### Update Complaint Status (Admin only)
```
PATCH /api/complaints/:id/status
```
**Body:**
```json
{
  "status": "Declined",
  "declineReason": "This falls outside the admin scope. Contact maintenance."
}
```

---

### Edit Complaint (own, while Open)
```
PUT /api/complaints/:id
```
**Body:** `{ "title": "...", "description": "..." }`

---

### Delete Complaint
```
DELETE /api/complaints/:id
```
**Roles:** Author (only if Open) or Admin

---

## 📣 Announcements (Stories)

### Get Active Announcements
```
GET /api/announcements
```
Returns announcements from clubs the user follows + own announcements.

---

### Create Announcement
```
POST /api/announcements
```
**Auth:** ✅ | **Roles:** Club or Admin

**Body:**
```json
{
  "text": "🎉 Our coding hackathon registrations are now open!",
  "imageUrl": "data:image/jpeg;base64,...",
  "durationHours": 24
}
```

---

### Mark as Seen
```
POST /api/announcements/:id/seen
```

---

### Delete Announcement
```
DELETE /api/announcements/:id
```
**Roles:** Author or Admin

---

## 🔔 Notifications

### Get Notifications
```
GET /api/notifications?page=1&limit=20
```
**Response `200`:**
```json
{
  "success": true,
  "notifications": [
    {
      "_id": "...",
      "type": "like",
      "message": "Priya Sharma liked your post",
      "sender": { "displayName": "Priya Sharma", "avatarUrl": null },
      "post": { "title": "Cab to Airport", "hashtag": "#cabsplit" },
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
**Response `200`:** `{ "success": true, "count": 3 }`

---

### Mark All as Read
```
PUT /api/notifications/read-all
```

---

### Mark Single as Read
```
PUT /api/notifications/:id/read
```

---

## 👤 Users

### Get Own Profile
```
GET /api/users/profile
```
**Response `200`:**
```json
{
  "success": true,
  "user": {
    "_id": "...",
    "displayName": "John Doe",
    "instituteEmail": "jdoe123.btech2022@cse.nitrr.ac.in",
    "role": "Student",
    "bio": "CSE 2022 batch. Loves competitive programming.",
    "avatarUrl": null,
    "followers": [],
    "following": ["clubId1"],
    "savedPosts": ["postId1", "postId2"]
  }
}
```

---

### Update Own Profile
```
PUT /api/users/profile
```
**Body:** `{ "displayName": "John D.", "bio": "Updated bio", "avatarUrl": "data:image/..." }`

---

### Get Public Profile
```
GET /api/users/:id
```
Returns public info + follower count (no savedPosts).

---

### Search Users
```
GET /api/users/search?q=priya&role=Club
```

---

## 🏠 Chat Rooms (Global Hub)

### List Active Global Rooms
```
GET /api/rooms
```
**Response `200`:**
```json
{
  "success": true,
  "rooms": [
    {
      "_id": "...",
      "name": "Airport Cab Group",
      "hashtag": "#cabsplit",
      "isGlobal": true,
      "isActive": true,
      "createdBy": { "displayName": "Ravi Kumar" },
      "participantCount": 5,
      "lastMessageAt": "2026-06-27T13:45:00.000Z"
    }
  ]
}
```

---

### Create Global Room
```
POST /api/rooms
```
**Body:**
```json
{
  "name": "Weekend Trek Planning",
  "hashtag": "#misc"
}
```
**Response `201`:** `{ "success": true, "room": { ... } }`

---

### Get Room Details
```
GET /api/rooms/:id
```

---

## ⚠️ Error Response Format

All error responses follow this shape:
```json
{
  "success": false,
  "message": "Human-readable error description",
  "stack": "..." // Only in development mode
}
```

**Common HTTP status codes:**
| Code | Meaning |
|------|---------|
| `400` | Bad request / validation failure |
| `401` | Not authenticated (missing or invalid JWT) |
| `403` | Forbidden (insufficient role) |
| `404` | Resource not found |
| `409` | Conflict (e.g., duplicate email) |
| `500` | Internal server error |

---

<div align="center">

📄 **[Back to README](../README.md)** · 🗺️ **[Data Flow](../DATA_FLOW.md)**

</div>
