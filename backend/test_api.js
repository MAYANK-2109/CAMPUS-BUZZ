const jwt = require('jsonwebtoken');
const http = require('http');
require('dotenv').config();

const token = jwt.sign({ id: '6a435d48dd5b123c0a1596a7' }, process.env.JWT_SECRET || 'campus_buzz_super_secret_key_change_in_production');

const req = http.request('http://localhost:5000/api/posts', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + token
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', data);
  });
});

req.on('error', console.error);
req.end();
