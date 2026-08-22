/**
 * scripts/dev-db.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Local development MongoDB.
 *
 * Starts a real mongod on 127.0.0.1:27017 via mongodb-memory-server, which
 * downloads a standalone mongod binary on first run (no Homebrew/Docker needed).
 *
 * Data is persisted to backend/.mongo-data so accounts and posts survive a
 * restart. Delete that directory to reset the database.
 *
 * Run with:  npm run dev:db      (leave it running in its own terminal)
 *
 * This is a DEV-ONLY convenience. In production, point MONGO_URI at Atlas.
 */

const path = require('path');
const fs   = require('fs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const DB_PATH = path.join(__dirname, '..', '.mongo-data');
const PORT    = 27017;
const DB_NAME = 'campusbuzz';

(async () => {
  fs.mkdirSync(DB_PATH, { recursive: true });

  console.log('[dev-db] Starting mongod (first run downloads the binary — this can take a minute)…');

  const mongod = await MongoMemoryServer.create({
    instance: {
      port:          PORT,
      dbName:        DB_NAME,
      dbPath:        DB_PATH,
      storageEngine: 'wiredTiger',   // required for on-disk persistence
    },
  });

  console.log(`[dev-db] ✅ MongoDB ready at ${mongod.getUri(DB_NAME)}`);
  console.log(`[dev-db]    Data directory: ${DB_PATH}`);
  console.log('[dev-db]    Leave this process running. Ctrl-C to stop.\n');

  const shutdown = async () => {
    console.log('\n[dev-db] Shutting down mongod…');
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);
})().catch((err) => {
  console.error('[dev-db] Failed to start:', err.message);
  process.exit(1);
});
