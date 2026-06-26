/**
 * src/hooks/useCountdown.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Custom hook that calculates time remaining until `expiresAt`.
 * Returns { hours, minutes, seconds, isExpired } and updates every second.
 * Cleans up its interval on unmount to prevent memory leaks.
 */

import { useState, useEffect } from 'react';

/**
 * @param {string|Date} expiresAt  ISO string or Date object.
 * @returns {{ hours: number, minutes: number, seconds: number, isExpired: boolean }}
 */
const useCountdown = (expiresAt) => {
  const getTimeLeft = () => {
    const diff = new Date(expiresAt) - Date.now();
    if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, isExpired: true };

    return {
      hours:     Math.floor(diff / (1000 * 60 * 60)),
      minutes:   Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
      seconds:   Math.floor((diff % (1000 * 60)) / 1000),
      isExpired: false,
    };
  };

  const [timeLeft, setTimeLeft] = useState(getTimeLeft);

  useEffect(() => {
    if (timeLeft.isExpired) return; // No need to tick if already expired

    const interval = setInterval(() => {
      const next = getTimeLeft();
      setTimeLeft(next);
      if (next.isExpired) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  return timeLeft;
};

export default useCountdown;
