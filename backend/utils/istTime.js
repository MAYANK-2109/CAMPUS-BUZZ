/**
 * utils/istTime.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Campus wall-clock time, always in India Standard Time.
 *
 * Everything the library books — "today", whether a slot has ended, when the
 * expiry cron retires a booking — is a statement about the clock on the wall at
 * NIT Raipur, not about the server's clock.
 *
 * That distinction is not academic. Render runs its containers in UTC, which is
 * IST-5:30, so server-local arithmetic gets two things badly wrong:
 *
 *   • Between 00:00 and 05:30 IST the server is still on the previous date, so
 *     "today" resolves to yesterday and students cannot book the current day.
 *   • Slot end times are compared 5½ hours early, so the 20:00–22:00 slot still
 *     looks open at 23:30 IST and the cron retires bookings hours late.
 *
 * Reading the clock through Intl with an explicit timeZone makes the result
 * identical on a laptop in Raipur and a container in Oregon. IST has no DST and
 * has been UTC+5:30 since 1945, but going through the tz database rather than
 * hardcoding an offset means this stays correct if that ever changes.
 */

const IST_TIMEZONE = 'Asia/Kolkata';

// en-CA formats dates as YYYY-MM-DD, which is exactly the key format we store.
// hourCycle h23 keeps midnight as "00" rather than "24".
const IST_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone:  IST_TIMEZONE,
  year:      'numeric',
  month:     '2-digit',
  day:       '2-digit',
  hour:      '2-digit',
  minute:    '2-digit',
  hourCycle: 'h23',
});

/** Break a Date into IST calendar/clock parts. */
const istParts = (when = new Date()) => {
  const p = Object.fromEntries(
    IST_FORMATTER.formatToParts(when).map(part => [part.type, part.value])
  );
  return {
    year:   p.year,
    month:  p.month,
    day:    p.day,
    hour:   Number(p.hour),
    minute: Number(p.minute),
  };
};

/** "YYYY-MM-DD" for the given instant, as it reads on a calendar in India. */
const toDateKey = (when = new Date()) => {
  const { year, month, day } = istParts(when);
  return `${year}-${month}-${day}`;
};

/** Today's date key in IST. */
const todayKey = () => toDateKey();

/** Minutes since IST midnight, right now. */
const nowMinutes = () => {
  const { hour, minute } = istParts();
  return hour * 60 + minute;
};

/** Minutes since midnight for a "HH:MM" string. */
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** A date key is valid if it is well-formed and parseable. */
const isValidDateKey = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/**
 * Has this slot finished, on this date, as of now in IST?
 * Date keys sort lexicographically, so plain string comparison is enough.
 */
const slotHasPassed = (dateKey, slot) => {
  const today = todayKey();
  if (dateKey > today) return false;   // future date
  if (dateKey < today) return true;    // past date
  return nowMinutes() >= toMinutes(slot.end);
};

/** Whole days from one date key to another (both IST calendar days). */
const daysBetween = (fromKey, toKey) =>
  Math.round((Date.parse(toKey) - Date.parse(fromKey)) / 86_400_000);

module.exports = {
  IST_TIMEZONE,
  istParts,
  toDateKey,
  todayKey,
  nowMinutes,
  toMinutes,
  isValidDateKey,
  slotHasPassed,
  daysBetween,
};
