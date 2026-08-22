/**
 * server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Campus Buzz – main server entry point.
 *
 * Startup sequence:
 *   1. Load environment variables.
 *   2. Connect to MongoDB.
 *   3. Configure Express middleware.
 *   4. Mount API routes.
 *   5. Initialise Socket.io on the HTTP server.
 *   6. Start the post-expiry cron job.
 *   7. Listen for connections.
 */

// ── 0. DNS override ─────────────────────────────────────────────────────────
// Some restricted networks (college, corporate) block SRV DNS lookups used by
// mongodb+srv:// URIs. Force Node.js to use Google's public DNS to resolve them.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

// ── 1. Environment ─────────────────────────────────────────────────────────
require('dotenv').config();

const http      = require('http');
const express   = require('express');
const cors      = require('cors');
const mongoose  = require('mongoose');

const routes    = require('./routes/index');
const { initSocket }          = require('./socket/index');
const { startPostExpiryCron } = require('./cron/postExpiry');
const rateLimit               = require('express-rate-limit');

const app        = express();
const httpServer = http.createServer(app);

// ── 2. MongoDB Connection ──────────────────────────────────────────────────
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // These options remove deprecation warnings
    });
    console.log(`[MongoDB] Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err.message);
    process.exit(1);
  }
};

// ── 3. Express Middleware ──────────────────────────────────────────────────
// CLIENT_URL can be a single URL or a comma-separated list of allowed origins.
// e.g. on Render: CLIENT_URL=https://campus-buzz.onrender.com,http://localhost:3000
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim().replace(/\/$/, ''))  // normalise: strip trailing slash
  .filter(Boolean);

if (process.env.NODE_ENV !== 'production') {
  // In dev, also allow the frontend (3000) and the backend's own origin,
  // because CRA's proxy forwards requests with origin = backend URL.
  // The backend origin is derived from PORT so this keeps working on any port
  // (5000 is unusable on macOS — Control Center's AirPlay Receiver owns it).
  const devPort = process.env.PORT || 5000;
  [
    'http://localhost:3000',
    `http://localhost:${devPort}`,
    `http://127.0.0.1:${devPort}`,
  ].forEach(url => {
    if (!allowedOrigins.includes(url)) allowedOrigins.push(url);
  });
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, mobile apps)
      if (!origin) return callback(null, true);
      // Normalise the incoming origin by stripping any trailing slash
      const normalised = origin.replace(/\/$/, '');
      if (allowedOrigins.includes(normalised)) return callback(null, true);
      callback(new Error(`CORS: origin "${origin}" not allowed.`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple request logger in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// ── 4. Rate Limiting ──────────────────────────────────────────────────────
// Auth routes: tighter limit to block brute-force login / registration spam
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many requests. Please wait 15 minutes and try again.' },
});

// General API: generous limit to stop scripted abuse
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max:      200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Rate limit exceeded. Please slow down.' },
});

// ── 5. API Routes ──────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter);
app.use('/api',      apiLimiter);
app.use('/api',      routes);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[GlobalErrorHandler]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── 6. Socket.io ───────────────────────────────────────────────────────────
initSocket(httpServer);
console.log('[Socket.io] Initialized.');

// ── 7 + 8. Connect DB → Start Cron → Listen ─────────────────────────────────
const PORT = process.env.PORT || 5000;

// HOST is optional. Left unset, Node binds dual-stack (IPv4 + IPv6), so both
// http://localhost and http://127.0.0.1 reach the server. Set it only to pin
// the server to one interface.
//
// Note: do not run this on port 5000 on macOS — Control Center (AirPlay
// Receiver) holds *:5000 and answers 403 with no CORS headers whenever this
// process is down, which the browser reports as a Socket.io CORS failure.
const HOST = process.env.HOST || null;

connectDB().then(() => {
  // Cron job requires an active DB connection
  startPostExpiryCron();

  const onListening = () => {
    console.log(`\n🚀 Campus Buzz backend running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Listening on: ${HOST || 'all interfaces'}:${PORT}`);
    console.log(`   API base:    http://localhost:${PORT}/api\n`);
  };

  if (HOST) httpServer.listen(PORT, HOST, onListening);
  else      httpServer.listen(PORT, onListening);
});

// A port collision is the most common local-dev failure — say so plainly
// instead of dumping a raw stack trace.
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[server] Port ${PORT} is already in use.`);
    if (PORT === 5000 || PORT === '5000') {
      console.error('[server] On macOS this is usually Control Center (AirPlay Receiver).');
      console.error('[server] Set a different PORT in backend/.env, or turn off');
      console.error('[server] System Settings > General > AirDrop & Handoff > AirPlay Receiver.\n');
    }
    process.exit(1);
  }
  console.error('[server] HTTP server error:', err);
  process.exit(1);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal) => {
  console.log(`\n[Server] ${signal} received. Graceful shutdown…`);
  await mongoose.connection.close();
  console.log('[MongoDB] Connection closed.');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason);
});
