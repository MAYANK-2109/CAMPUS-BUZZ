const mongoose = require('mongoose');
const User = require('./backend/models/User');
const Post = require('./backend/models/Post');
const Comment = require('./backend/models/Comment');

async function test() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/campus-buzz');
    const user = await User.findOne();
    const post = await Post.findOne();
    if (!user || !post) { console.log('No user or post'); return; }
    
    const comment = await Comment.create({ post: post._id, author: user._id, text: 'Test comment' });
    await comment.populate('author', 'displayName avatarUrl role');
    console.log("COMMENT POPULATED SUCCESSFULLY:", comment);
  } catch(e) {
    console.error("ERROR:", e);
  } finally {
    process.exit(0);
  }
}
test();
