/**
 * scripts/seed-library.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a starter seat layout so the library grid is usable immediately.
 *
 *   node scripts/seed-library.js          # add any missing seats
 *   node scripts/seed-library.js --reset  # delete ALL seats first, then add
 *
 * Safe to re-run: seats are upserted by their unique `code`, so existing seats
 * and their bookings are left untouched.
 *
 * Admins can add or remove seats at runtime via the API instead of this script:
 *   POST   /api/library/seats  { floor, section, count }
 *   DELETE /api/library/seats/:id
 */

require('dotenv').config();
const mongoose   = require('mongoose');
const LibrarySeat = require('../models/LibrarySeat');

// floor, section, seat count, type, power sockets.
// `prefix` is explicit rather than derived from the section name: deriving it
// by truncation made "Reading Hall A" and "Reading Hall B" collide on the same
// seat codes, so one section silently overwrote the other.
const LAYOUT = [
  { floor: 1, section: 'Reading Hall A', prefix: 'RHA', count: 24, seatType: 'regular',    hasPower: true  },
  { floor: 1, section: 'Reading Hall B', prefix: 'RHB', count: 24, seatType: 'regular',    hasPower: false },
  { floor: 2, section: 'Quiet Zone',     prefix: 'QZ',  count: 18, seatType: 'quiet',      hasPower: true  },
  { floor: 2, section: 'Computer Lab',   prefix: 'CL',  count: 12, seatType: 'computer',   hasPower: true  },
  { floor: 3, section: 'Discussion',     prefix: 'DSC', count: 10, seatType: 'discussion', hasPower: true  },
];

const codeFor = (floor, prefix, i) =>
  `F${floor}-${prefix}-${String(i).padStart(2, '0')}`;

// Guard against a future edit reintroducing duplicate prefixes.
const prefixes = LAYOUT.map(r => `${r.floor}-${r.prefix}`);
if (new Set(prefixes).size !== prefixes.length) {
  throw new Error('[seed-library] LAYOUT has duplicate floor+prefix pairs — seat codes would collide.');
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  if (process.argv.includes('--reset')) {
    const { deletedCount } = await LibrarySeat.deleteMany({});
    console.log(`[seed-library] --reset: removed ${deletedCount} existing seat(s).`);
  }

  let created = 0;
  let existing = 0;

  for (const row of LAYOUT) {
    for (let i = 1; i <= row.count; i++) {
      const code = codeFor(row.floor, row.prefix, i);
      const res = await LibrarySeat.updateOne(
        { code },
        {
          $setOnInsert: {
            code,
            floor:    row.floor,
            section:  row.section,
            seatType: row.seatType,
            hasPower: row.hasPower,
            isActive: true,
          },
        },
        { upsert: true }
      );
      if (res.upsertedCount) created++; else existing++;
    }
  }

  const total = await LibrarySeat.countDocuments({ isActive: true });
  console.log(`[seed-library] created ${created}, already present ${existing}.`);
  console.log(`[seed-library] ${total} active seat(s) across ${LAYOUT.length} sections.`);

  await mongoose.disconnect();
})().catch(err => {
  console.error('[seed-library] failed:', err.message);
  process.exit(1);
});
