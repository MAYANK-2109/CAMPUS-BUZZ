require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const User = require('./models/User');
const Post = require('./models/Post');
const ChatRoom = require('./models/ChatRoom');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const globalRooms = await ChatRoom.find({ isGlobal: true, isActive: true })
      .populate('createdBy', 'displayName avatarUrl role')
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .lean();
    console.log('globalRooms count:', globalRooms.length);
    const postRooms = await ChatRoom.find({ isGlobal: false, isActive: true, postId: { $ne: null } })
      .populate('createdBy', 'displayName avatarUrl role')
      .populate('postId', 'title hashtag author')
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .lean();
    console.log('postRooms count:', postRooms.length);
  } catch (e) {
    console.error('Error fetching rooms:', e);
  }
  process.exit();
}
test();
