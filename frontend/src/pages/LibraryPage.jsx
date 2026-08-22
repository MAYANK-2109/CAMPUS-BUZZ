/**
 * src/pages/LibraryPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Library seat reservation.
 *
 * Reached from Profile → Library. It sits behind the same ProtectedRoute as
 * every other page, so a student already signed in to Campus Buzz is never
 * asked to log in again — the existing JWT is reused by `api`.
 *
 * Layout: pick a date → pick a slot → pick a seat from the floor map.
 * The grid updates live via the `librarySeatUpdate` socket event, so a seat
 * taken by someone else greys out without a refresh.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Calendar, Clock, Zap, Check, X, ChevronLeft,
  Users, LayoutGrid, Ticket, BarChart3, QrCode, RefreshCw, Loader2,
} from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

// ── Date helpers (local wall-clock, matching the backend) ────────────────────
const toKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const MAX_ADVANCE_DAYS = 7;

const upcomingDates = () =>
  Array.from({ length: MAX_ADVANCE_DAYS + 1 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      key:   toKey(d),
      day:   d.toLocaleDateString(undefined, { weekday: 'short' }),
      num:   d.getDate(),
      month: d.toLocaleDateString(undefined, { month: 'short' }),
      isToday: i === 0,
    };
  });

const SEAT_TYPE_LABEL = {
  regular:    'Regular',
  computer:   'Computer',
  discussion: 'Discussion',
  quiet:      'Quiet zone',
};

const LibraryPage = () => {
  const { user }   = useAuth();
  const { socket } = useSocket();
  const navigate   = useNavigate();

  const dates = useMemo(upcomingDates, []);

  const [date,   setDate]   = useState(dates[0].key);
  const [slotId, setSlotId] = useState(null);

  const [slots, setSlots] = useState([]);
  const [seats, setSeats] = useState([]);
  const [myBookings, setMyBookings] = useState([]);

  const [loadingSlots, setLoadingSlots] = useState(true);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [busySeat, setBusySeat] = useState(null);

  const [error,  setError]  = useState('');
  const [notice, setNotice] = useState('');

  const [tab, setTab] = useState('book');   // book | mine | card | admin
  const [stats, setStats] = useState(null);

  // Two-step checkout: holding a seat reserves it for ~30s while we confirm.
  const [hold, setHold]           = useState(null);  // { seatId, seatCode, expiresAt }
  const [holdLeft, setHoldLeft]   = useState(0);     // seconds remaining
  const [confirming, setConfirming] = useState(false);

  // Digital library ID
  const [card, setCard]           = useState(null);
  const [loadingCard, setLoadingCard] = useState(false);

  const isAdmin = user?.role === 'Admin';

  // ── Load slots whenever the date changes ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true);
    api.get(`/library/slots?date=${date}`)
      .then(({ data }) => {
        if (cancelled) return;
        setSlots(data.data || []);
        // Default to the first slot that has not already ended.
        setSlotId(prev => {
          const stillValid = (data.data || []).some(s => s.id === prev && !s.isPast);
          if (stillValid) return prev;
          return (data.data || []).find(s => !s.isPast)?.id || null;
        });
      })
      .catch(err => !cancelled && setError(err.response?.data?.message || 'Failed to load slots.'))
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => { cancelled = true; };
  }, [date]);

  // ── Load the seat grid ────────────────────────────────────────────────────
  const loadSeats = useCallback(async () => {
    if (!slotId) { setSeats([]); return; }
    setLoadingSeats(true);
    try {
      const { data } = await api.get(`/library/seats?date=${date}&slotId=${slotId}`);
      setSeats(data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load seats.');
    } finally {
      setLoadingSeats(false);
    }
  }, [date, slotId]);

  useEffect(() => { loadSeats(); }, [loadSeats]);

  // ── My bookings ───────────────────────────────────────────────────────────
  const loadMyBookings = useCallback(async () => {
    try {
      const { data } = await api.get('/library/bookings/me');
      setMyBookings(data.data || []);
    } catch { /* non-fatal — the booking grid still works */ }
  }, []);

  useEffect(() => { loadMyBookings(); }, [loadMyBookings]);

  // ── Admin stats ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'admin' || !isAdmin) return;
    api.get(`/library/stats?date=${date}`)
      .then(({ data }) => setStats(data.data))
      .catch(() => setStats(null));
  }, [tab, isAdmin, date]);

  // ── Live seat updates ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    socket.emit('joinLibrary');

    const onUpdate = (payload) => {
      // Only react to the grid currently on screen.
      if (payload.date !== date || payload.slotId !== slotId) return;
      setSeats(prev => prev.map(s => {
        if (s._id !== payload.seatId) return s;
        const next = { ...s };
        // Never clobber our own flags from a broadcast — the server tells us a
        // seat changed, not whose it now is.
        if (payload.isBooked !== undefined) {
          next.isBooked = payload.isBooked;
          if (!payload.isBooked) next.isMine = false;
        }
        if (payload.isHeld !== undefined) {
          // A hold we placed ourselves is not "held by someone else".
          const mine = payload.holdBy && user?._id && String(payload.holdBy) === String(user._id);
          next.isHeld   = payload.isHeld && !mine;
          next.heldByMe = payload.isHeld ? !!mine : false;
        }
        return next;
      }));
    };

    socket.on('librarySeatUpdate', onUpdate);
    return () => {
      socket.off('librarySeatUpdate', onUpdate);
      socket.emit('leaveLibrary');
    };
  }, [socket, date, slotId, user?._id]);

  // ── Two-step checkout ─────────────────────────────────────────────────────
  // Step 1: claim the seat so nobody else can start booking it.
  const startHold = async (seat) => {
    setBusySeat(seat._id); setError(''); setNotice('');
    try {
      const { data } = await api.post('/library/holds', { seatId: seat._id, date, slotId });
      setHold({ seatId: seat._id, seatCode: seat.code, expiresAt: data.data.expiresAt });
      setSeats(prev => prev.map(s => s._id === seat._id ? { ...s, heldByMe: true } : s));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not hold that seat.');
      if (err.response?.status === 409) loadSeats();
    } finally {
      setBusySeat(null);
    }
  };

  // Give the seat back if the student changes their mind (or time runs out).
  const releaseHold = useCallback(async (silent = false) => {
    if (!hold) return;
    const { seatId } = hold;
    setHold(null);
    setSeats(prev => prev.map(s => s._id === seatId ? { ...s, heldByMe: false } : s));
    try {
      await api.delete('/library/holds', { data: { seatId, date, slotId } });
    } catch { /* the hold lapses on its own regardless */ }
    if (!silent) setNotice('Seat released.');
  }, [hold, date, slotId]);

  // Step 2: turn the hold into a real booking.
  const confirmBooking = async () => {
    if (!hold) return;
    setConfirming(true); setError(''); setNotice('');
    try {
      const { data } = await api.post('/library/bookings', { seatId: hold.seatId, date, slotId });
      setNotice(`Seat ${hold.seatCode} booked for ${slots.find(s => s.id === slotId)?.label}.`);
      setSeats(prev => prev.map(s =>
        s._id === hold.seatId
          ? { ...s, isBooked: true, isMine: true, heldByMe: false, bookingId: data.data._id }
          : s
      ));
      setHold(null);
      loadMyBookings();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not book that seat.');
      // Clearing local state is not enough — the server-side hold would keep
      // the seat blocked for the rest of its 30s window even though we can
      // never complete this booking. Hand it back explicitly.
      const dead = hold;
      setHold(null);
      api.delete('/library/holds', { data: { seatId: dead.seatId, date, slotId } }).catch(() => {});
      if (err.response?.status === 409) loadSeats();
    } finally {
      setConfirming(false);
    }
  };

  const cancel = async (bookingId, seatId) => {
    setBusySeat(seatId || bookingId); setError(''); setNotice('');
    try {
      await api.patch(`/library/bookings/${bookingId}/cancel`);
      setNotice('Booking cancelled.');
      setSeats(prev => prev.map(s =>
        s._id === seatId ? { ...s, isBooked: false, isMine: false, bookingId: undefined } : s
      ));
      loadMyBookings();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not cancel that booking.');
    } finally {
      setBusySeat(null);
    }
  };

  const checkIn = async (bookingId) => {
    setError(''); setNotice('');
    try {
      await api.patch(`/library/bookings/${bookingId}/check-in`);
      setNotice('Checked in. Enjoy your session.');
      loadMyBookings();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not check in.');
    }
  };

  // ── Hold countdown: tick every second, release automatically at zero ──────
  useEffect(() => {
    if (!hold) { setHoldLeft(0); return; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((new Date(hold.expiresAt) - Date.now()) / 1000));
      setHoldLeft(left);
      if (left === 0) {
        // The server has already stopped honouring it; clear the UI to match.
        setHold(null);
        setSeats(prev => prev.map(x => x._id === hold.seatId ? { ...x, heldByMe: false } : x));
        setError('Your hold on that seat expired. Pick a seat again.');
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hold]);

  // Drop the hold if the student navigates away mid-checkout.
  // The unmount cleanup runs once, so it must not close over `hold` directly —
  // it would capture whatever the value was on first render (null). A ref
  // always reads the current hold.
  const holdRef = useRef(null);
  useEffect(() => {
    holdRef.current = hold ? { ...hold, date, slotId } : null;
  }, [hold, date, slotId]);

  useEffect(() => () => {
    const h = holdRef.current;
    if (h) {
      api.delete('/library/holds', { data: { seatId: h.seatId, date: h.date, slotId: h.slotId } })
        .catch(() => {});
    }
  }, []);

  // ── Digital library ID ────────────────────────────────────────────────────
  const loadCard = useCallback(async () => {
    setLoadingCard(true);
    try {
      const { data } = await api.get('/library/id-card');
      setCard(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not generate your library ID.');
    } finally {
      setLoadingCard(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== 'card') return;
    loadCard();
    // The QR carries a short-lived signed token; refresh a little before it
    // lapses so the card on screen is always scannable.
    const id = setInterval(loadCard, 4 * 60 * 1000);
    return () => clearInterval(id);
  }, [tab, loadCard]);

  // ── Group seats by floor → section for the map ────────────────────────────
  const floors = useMemo(() => {
    const byFloor = {};
    seats.forEach(s => {
      byFloor[s.floor] ??= {};
      byFloor[s.floor][s.section] ??= [];
      byFloor[s.floor][s.section].push(s);
    });
    return Object.entries(byFloor).sort(([a], [b]) => Number(a) - Number(b));
  }, [seats]);

  const activeSlot = slots.find(s => s.id === slotId);
  const freeCount  = seats.filter(s => !s.isBooked).length;
  // Only one seat per slot, so at most one seat in this grid can be ours.
  const mySeatThisSlot = seats.find(s => s.isMine);

  const upcoming = myBookings.filter(
    b => b.date >= toKey(new Date()) && ['booked', 'checked_in'].includes(b.status)
  );

  return (
    <div className="lib-page">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="lib-header">
        <button className="lib-back" onClick={() => navigate('/profile')} aria-label="Back to profile">
          <ChevronLeft size={18} />
        </button>
        <div className="lib-header-title">
          <BookOpen size={20} />
          <div>
            <h1>Library</h1>
            <p>Reserve a seat — no separate login needed</p>
          </div>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="lib-tabs">
        <button className={`lib-tab ${tab === 'book' ? 'lib-tab--active' : ''}`} onClick={() => setTab('book')}>
          <LayoutGrid size={14} /> Book a seat
        </button>
        <button className={`lib-tab ${tab === 'mine' ? 'lib-tab--active' : ''}`} onClick={() => setTab('mine')}>
          <Ticket size={14} /> My bookings
          {upcoming.length > 0 && <span className="lib-tab-count">{upcoming.length}</span>}
        </button>
        <button className={`lib-tab ${tab === 'card' ? 'lib-tab--active' : ''}`} onClick={() => setTab('card')}>
          <QrCode size={14} /> Library ID
        </button>
        {isAdmin && (
          <button className={`lib-tab ${tab === 'admin' ? 'lib-tab--active' : ''}`} onClick={() => setTab('admin')}>
            <BarChart3 size={14} /> Occupancy
          </button>
        )}
      </div>

      {error  && <div className="lib-alert lib-alert--error"  onClick={() => setError('')}>{error}</div>}
      {notice && <div className="lib-alert lib-alert--ok"     onClick={() => setNotice('')}>{notice}</div>}

      {/* ── BOOK ─────────────────────────────────────────────────────────── */}
      {tab === 'book' && (
        <>
          <div className="lib-section-label"><Calendar size={13} /> Date</div>
          <div className="lib-date-strip">
            {dates.map(d => (
              <button
                key={d.key}
                className={`lib-date ${date === d.key ? 'lib-date--active' : ''}`}
                onClick={() => setDate(d.key)}
              >
                <span className="lib-date-day">{d.isToday ? 'Today' : d.day}</span>
                <span className="lib-date-num">{d.num}</span>
                <span className="lib-date-month">{d.month}</span>
              </button>
            ))}
          </div>

          <div className="lib-section-label"><Clock size={13} /> Time slot</div>
          {loadingSlots ? (
            <div className="lib-muted">Loading slots…</div>
          ) : (
            <div className="lib-slot-grid">
              {slots.map(s => (
                <button
                  key={s.id}
                  disabled={s.isPast}
                  className={`lib-slot ${slotId === s.id ? 'lib-slot--active' : ''} ${s.isPast ? 'lib-slot--past' : ''}`}
                  onClick={() => setSlotId(s.id)}
                  title={s.isPast ? 'This slot has ended' : `${s.available} of ${s.totalSeats} free`}
                >
                  <span className="lib-slot-label">{s.label}</span>
                  <span className="lib-slot-meta">
                    {s.isPast ? 'ended' : `${s.available} free`}
                  </span>
                </button>
              ))}
            </div>
          )}

          {activeSlot && !activeSlot.isPast && (
            <>
              <div className="lib-section-label">
                <LayoutGrid size={13} /> Seats
                <span className="lib-legend">
                  <span><i className="lib-dot lib-dot--free" /> free</span>
                  <span><i className="lib-dot lib-dot--taken" /> taken</span>
                  <span><i className="lib-dot lib-dot--held" /> being booked</span>
                  <span><i className="lib-dot lib-dot--mine" /> yours</span>
                </span>
              </div>

              {loadingSeats ? (
                <div className="lib-muted">Loading seat map…</div>
              ) : seats.length === 0 ? (
                <div className="lib-empty">
                  <BookOpen size={34} />
                  <p>No seats have been set up yet.</p>
                  {isAdmin && <p className="lib-muted">Add seats via <code>POST /api/library/seats</code>.</p>}
                </div>
              ) : (
                <>
                  {mySeatThisSlot ? (
                    <div className="lib-own-banner">
                      <Check size={14} />
                      <span>
                        You already have <strong>{mySeatThisSlot.code}</strong> for {activeSlot.label}.
                        Cancel it to move to a different seat, or pick another time slot.
                      </span>
                      <button
                        className="lib-btn lib-btn--danger"
                        disabled={busySeat === mySeatThisSlot._id}
                        onClick={() => cancel(mySeatThisSlot.bookingId, mySeatThisSlot._id)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="lib-availability">
                      <strong>{freeCount}</strong> of {seats.length} seats free · {activeSlot.label}
                    </div>
                  )}

                  {floors.map(([floor, sections]) => (
                    <div key={floor} className="lib-floor">
                      <div className="lib-floor-title">Floor {floor}</div>
                      {Object.entries(sections).map(([section, list]) => (
                        <div key={section} className="lib-section">
                          <div className="lib-section-name">{section}</div>
                          <div className="lib-seat-grid">
                            {list.map(seat => {
                              const cls = seat.isMine   ? 'lib-seat--mine'
                                        : seat.heldByMe ? 'lib-seat--holding'
                                        : seat.isBooked ? 'lib-seat--taken'
                                        : seat.isHeld   ? 'lib-seat--held'
                                        : 'lib-seat--free';
                              // Someone else's hold blocks the seat just like a booking does.
                              const locked = (seat.isBooked && !seat.isMine) || seat.isHeld;
                              return (
                                <button
                                  key={seat._id}
                                  className={`lib-seat ${cls}`}
                                  disabled={locked || busySeat === seat._id || (!!hold && !seat.heldByMe && !seat.isMine) || (!!mySeatThisSlot && !seat.isMine)}
                                  onClick={() => seat.isMine
                                    ? cancel(seat.bookingId, seat._id)
                                    : seat.heldByMe
                                      ? releaseHold()
                                      : startHold(seat)}
                                  title={
                                    seat.isMine   ? 'Your seat — click to cancel'
                                    : seat.heldByMe ? 'You are holding this seat — click to release'
                                    : seat.isHeld ? 'Someone is booking this seat right now'
                                    : seat.isBooked ? (seat.bookedBy ? `Booked by ${seat.bookedBy.displayName}` : 'Already booked')
                                    : `${seat.code} · ${SEAT_TYPE_LABEL[seat.seatType] || seat.seatType}${seat.hasPower ? ' · power' : ''}`
                                  }
                                >
                                  <span className="lib-seat-code">{seat.code.split('-').pop()}</span>
                                  {seat.hasPower && <Zap size={9} className="lib-seat-power" />}
                                  {seat.isMine && <Check size={11} />}
                                  {seat.heldByMe && <Clock size={10} />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {activeSlot?.isPast && (
            <div className="lib-empty"><Clock size={30} /><p>That slot has already ended.</p></div>
          )}

          {/* Checkout bar — visible only while we are holding a seat */}
          {hold && (
            <div className="lib-checkout">
              <div className="lib-checkout-info">
                <div className="lib-checkout-seat">{hold.seatCode}</div>
                <div>
                  <div className="lib-checkout-title">Confirm your seat</div>
                  <div className="lib-checkout-sub">
                    {activeSlot?.label} · held for you
                  </div>
                </div>
              </div>

              <div className={`lib-countdown ${holdLeft <= 10 ? 'lib-countdown--urgent' : ''}`}>
                <Clock size={13} />
                <span>{holdLeft}s</span>
                <div className="lib-countdown-track">
                  <div
                    className="lib-countdown-fill"
                    style={{ width: `${Math.min(100, (holdLeft / 30) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="lib-checkout-actions">
                <button className="lib-btn lib-btn--ghost" onClick={() => releaseHold()} disabled={confirming}>
                  Release
                </button>
                <button className="lib-btn lib-btn--primary" onClick={confirmBooking} disabled={confirming}>
                  {confirming ? <><Loader2 size={12} className="lib-spin" /> Booking…</> : <><Check size={13} /> Confirm</>}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── DIGITAL LIBRARY ID ───────────────────────────────────────────── */}
      {tab === 'card' && (
        <div className="lib-card-wrap">
          {loadingCard && !card ? (
            <div className="lib-muted">Generating your library ID…</div>
          ) : !card ? (
            <div className="lib-empty"><QrCode size={34} /><p>Could not load your library ID.</p></div>
          ) : (
            <>
              <div className="lib-id-card">
                <div className="lib-id-head">
                  <BookOpen size={15} />
                  <span>Campus Buzz · Library ID</span>
                </div>

                <div className="lib-id-body">
                  <div className="lib-id-person">
                    <div className="lib-id-avatar">
                      {card.user.avatarUrl
                        ? <img src={card.user.avatarUrl} alt="" />
                        : (card.user.displayName?.charAt(0)?.toUpperCase() || '?')}
                    </div>
                    <div className="lib-id-name">{card.user.displayName}</div>
                    <div className="lib-id-roll">{card.user.rollNo || card.user.instituteEmail}</div>
                    <div className="lib-id-role">{card.user.role}</div>
                  </div>

                  <div className="lib-id-qr">
                    <img src={card.qrDataUrl} alt="Library ID QR code" />
                  </div>
                </div>

                {card.todaysBooking ? (
                  <div className="lib-id-booking">
                    Today · <strong>{card.todaysBooking.seat?.code}</strong> ·{' '}
                    {card.todaysBooking.slot?.label}
                  </div>
                ) : (
                  <div className="lib-id-booking lib-id-booking--none">No seat booked today</div>
                )}
              </div>

              <div className="lib-id-note">
                <p>Show this at the library desk. The code is signed and refreshes every few minutes, so a screenshot won&rsquo;t work for long.</p>
                <button className="lib-btn lib-btn--ghost" onClick={loadCard} disabled={loadingCard}>
                  <RefreshCw size={12} className={loadingCard ? 'lib-spin' : ''} /> Refresh code
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── MY BOOKINGS ──────────────────────────────────────────────────── */}
      {tab === 'mine' && (
        <div className="lib-bookings">
          {myBookings.length === 0 ? (
            <div className="lib-empty"><Ticket size={34} /><p>No bookings yet.</p></div>
          ) : myBookings.map(b => {
            const active = ['booked', 'checked_in'].includes(b.status);
            const isToday = b.date === toKey(new Date());
            return (
              <div key={b._id} className={`lib-booking ${active ? '' : 'lib-booking--done'}`}>
                <div className="lib-booking-seat">{b.seat?.code || '—'}</div>
                <div className="lib-booking-body">
                  <div className="lib-booking-when">{b.date} · {b.slot?.label || b.slotId}</div>
                  <div className="lib-booking-meta">
                    Floor {b.seat?.floor} · {b.seat?.section}
                    <span className={`lib-status lib-status--${b.status}`}>{b.status.replace('_', ' ')}</span>
                  </div>
                </div>
                {active && (
                  <div className="lib-booking-actions">
                    {isToday && b.status === 'booked' && (
                      <button className="lib-btn lib-btn--ghost" onClick={() => checkIn(b._id)}>Check in</button>
                    )}
                    <button
                      className="lib-btn lib-btn--danger"
                      disabled={busySeat === b._id}
                      onClick={() => cancel(b._id, b.seat?._id)}
                    >
                      <X size={12} /> Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── ADMIN OCCUPANCY ──────────────────────────────────────────────── */}
      {tab === 'admin' && isAdmin && (
        <div className="lib-stats">
          {!stats ? (
            <div className="lib-muted">Loading occupancy…</div>
          ) : (
            <>
              <div className="lib-stat-row">
                <div className="lib-stat"><span>{stats.totalSeats}</span><label>Seats</label></div>
                <div className="lib-stat"><span>{stats.totalBookings}</span><label>Booked today</label></div>
                <div className="lib-stat"><span>{stats.overallOccupancyPct}%</span><label>Occupancy</label></div>
              </div>

              <div className="lib-section-label"><BarChart3 size={13} /> By slot — {stats.date || date}</div>
              {stats.slotStats.map(s => (
                <div key={s.id} className="lib-bar-row">
                  <span className="lib-bar-label">{s.label}</span>
                  <div className="lib-bar">
                    <div className="lib-bar-fill" style={{ width: `${s.occupancyPct}%` }} />
                  </div>
                  <span className="lib-bar-value">{s.booked}/{stats.totalSeats}</span>
                </div>
              ))}

              {stats.floorStats?.length > 0 && (
                <>
                  <div className="lib-section-label"><Users size={13} /> By floor</div>
                  <div className="lib-stat-row">
                    {stats.floorStats.map(f => (
                      <div key={f.floor} className="lib-stat"><span>{f.booked}</span><label>Floor {f.floor}</label></div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LibraryPage;
