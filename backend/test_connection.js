const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config();

// Override DNS to use Google's public resolver (bypasses college network blocking)
dns.setServers(['8.8.8.8', '8.8.4.4']);

console.log('Testing MongoDB connection...');
console.log('URI starts with:', process.env.MONGO_URI?.substring(0, 40) + '...');

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected successfully!');
    process.exit(0);
  })
  .catch((e) => {
    console.error('❌ MongoDB Error:', e.message);
    process.exit(1);
  });
