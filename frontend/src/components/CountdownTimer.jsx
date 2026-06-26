/**
 * src/components/Feed/CountdownTimer.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Live countdown display for #foodsplit and #cabsplit posts.
 * Rendered on the PostCard; shows urgency by colour-shifting as time runs out.
 */

import React from 'react';
import useCountdown from '../hooks/useCountdown';

const pad = (n) => String(n).padStart(2, '0');

const CountdownTimer = ({ expiresAt, hashtag }) => {
  const { hours, minutes, seconds, isExpired } = useCountdown(expiresAt);

  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold
                        text-red-400 bg-red-950/60 px-2 py-0.5 rounded-full border
                        border-red-700/40">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        Expired
      </span>
    );
  }

  // Colour shifts: green → yellow → red as deadline approaches
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const urgency =
    totalSeconds < 300  ? 'text-red-400 border-red-700/40 bg-red-950/60'       // < 5 min
    : totalSeconds < 1800 ? 'text-amber-400 border-amber-700/40 bg-amber-950/60' // < 30 min
    : 'text-emerald-400 border-emerald-700/40 bg-emerald-950/60';

  const label = hashtag === '#foodsplit' ? '🍕' : '🚕';

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono font-semibold
                      px-2 py-0.5 rounded-full border ${urgency}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {label} {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </span>
  );
};

export default CountdownTimer;
