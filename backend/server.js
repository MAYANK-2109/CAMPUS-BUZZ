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

// ── 1. Environment ─────────────────────────────────────────────────────────
require('dotenv').config();

const http      = require('http');
const express   = require('express');
const cors      = require('cors');
const mongoose  = require('mongoose');

const routes    = require('./routes/index');
const { initSocket }          = require('./socket/index');
const { startPostExpiryCron } = require('./cron/postExpiry');

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
app.use(
  cors({
    origin:      process.env.CLIENT_URL || 'http://localhost:3000',
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

// ── 4. API Routes ──────────────────────────────────────────────────────────
app.use('/api', routes);

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

// ── 5. Socket.io ───────────────────────────────────────────────────────────
initSocket(httpServer);
console.log('[Socket.io] Initialized.');

// ── 6 + 7. Connect DB → Start Cron → Listen ─────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  // Cron job requires an active DB connection
  startPostExpiryCron();

  httpServer.listen(PORT, () => {
    console.log(`\n🚀 Campus Buzz backend running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   API base:    http://localhost:${PORT}/api\n`);
  });
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
