/**
 * src/pages/FoodSplitPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Food Split — group food orders, mirroring RideSplitPage.
 *
 * Same shape as the ride page on purpose: search, a list of open splits, a post
 * modal, and creator controls to close or cancel. A student who has used one
 * should not have to learn the other. Colour is the only deliberate difference
 * (amber rather than emerald) so the two pages are distinguishable at a glance.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Check, CheckCircle2, Clock3, IndianRupee, Loader2, MapPin,
  Plus, UtensilsCrossed, Users, X, XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import api from '../utils/api';
import ChatRoom from '../Chat/ChatRoom';
import { useAuth } from '../context/AuthContext';

/** Datalist hints. Free text is still accepted — this is a shortcut, not a list. */
const RESTAURANTS = [
  "Domino's Pizza", 'Paradise Biryani', 'Burger King', 'KFC', 'Subway',
  'Cafe Coffee Day', 'Bikanervala', 'Haldiram', 'Chai Point', 'Campus Canteen',
];

const DROP_POINTS = [
  'Hostel 1 Gate', 'Hostel 3 Gate', 'Hostel 5 Gate', 'Girls Hostel Gate',
  'Main Gate', 'Library Entrance', 'Academic Block', 'Sports Complex',
];

/** A split is "closing soon" inside this window — surfaced so people act. */
const SOON_MS = 45 * 60 * 1000;

const normalise = (split) => ({
  ...split,
  peopleJoined: Number(split.peopleJoined || 1),
});

/* ═══════════════════════════════════════════════════════════════════════════
   Post modal
   ═══════════════════════════════════════════════════════════════════════════ */
function PostFoodSplitModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    restaurant: '', cuisine: '', dropLocation: '', date: '', time: '',
    maxPeople: 4, totalFare: '', note: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.restaurant.trim())   return setError('Which restaurant are you ordering from?');
    if (!form.dropLocation.trim()) return setError('Where should the food be dropped?');
    if (!form.date || !form.time)  return setError('Pick the date and time you are placing the order.');

    // Date and time are two inputs because a datetime-local picker is painful
    // on Android. Combined here; the browser parses this as local time, which
    // is what the student meant.
    const orderTime = new Date(`${form.date}T${form.time}`);
    if (Number.isNaN(orderTime.getTime()) || orderTime <= new Date()) {
      return setError('The order time has to be in the future.');
    }

    setLoading(true);
    try {
      await api.post('/posts', {
        title: `${form.restaurant.trim()} — group order`,
        description: form.note.trim() || `Ordering from ${form.restaurant.trim()}. Join in and split the bill.`,
        hashtag: '#foodsplit',
        ...(form.totalFare !== '' && { totalFare: Number(form.totalFare) }),
        food: {
          restaurant:   form.restaurant.trim(),
          cuisine:      form.cuisine.trim(),
          dropLocation: form.dropLocation.trim(),
          orderTime:    orderTime.toISOString(),
          maxPeople:    Number(form.maxPeople),
        },
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not post this food split. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog" aria-modal="true" aria-label="Post a food split"
    >
      <div className="w-full max-w-xl max-h-[92dvh] overflow-y-auto rounded-t-[2rem] sm:rounded-[2rem] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Share an order</p>
            <h2 className="mt-0.5 text-xl font-black text-slate-950">Post a food split</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
          {error && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Restaurant</span>
              <input list="fs-restaurants" value={form.restaurant} onChange={set('restaurant')} required
                     placeholder="Domino's Pizza" className="fs-input" />
              <datalist id="fs-restaurants">
                {RESTAURANTS.map((r) => <option key={r} value={r} />)}
              </datalist>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Cuisine (optional)</span>
              <input value={form.cuisine} onChange={set('cuisine')} placeholder="Pizza, biryani…" className="fs-input" />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Drop location</span>
              <input list="fs-drops" value={form.dropLocation} onChange={set('dropLocation')} required
                     placeholder="Hostel 5 Gate" className="fs-input" />
              <datalist id="fs-drops">
                {DROP_POINTS.map((d) => <option key={d} value={d} />)}
              </datalist>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Date</span>
              <input type="date" value={form.date} onChange={set('date')} required
                     min={new Date().toISOString().slice(0, 10)} className="fs-input" />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Order time</span>
              <input type="time" value={form.time} onChange={set('time')} required className="fs-input" />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Max people</span>
              <input type="number" min={2} max={15} value={form.maxPeople} onChange={set('maxPeople')} required
                     className="fs-input" />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Approx. total ₹ (optional)</span>
              <input type="number" min={0} value={form.totalFare} onChange={set('totalFare')}
                     placeholder="Leave blank to decide later" className="fs-input" />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Note (optional)</span>
              <textarea rows={2} value={form.note} onChange={set('note')} maxLength={300}
                        placeholder="Ordering 2 large pizzas, anyone want in?" className="fs-input resize-none" />
            </label>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-amber-700 disabled:opacity-60">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Posting…' : 'Post food split'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Split card
   ═══════════════════════════════════════════════════════════════════════════ */
function FoodCard({ split, onJoin, joining, isOwner, onEnd, ending }) {
  const food = split.food || {};
  const maxPeople = food.maxPeople || 4;
  const joined = Math.min(split.peopleJoined, maxPeople);
  const perPerson = split.totalFare ? Math.ceil(Number(split.totalFare) / maxPeople) : null;
  const orderTime = food.orderTime ? new Date(food.orderTime) : null;
  const closingSoon = orderTime && orderTime - Date.now() < SOON_MS;

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-lg">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-amber-600 text-white shadow-sm">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-black text-slate-950">{food.restaurant}</h3>
              {food.cuisine && (
                <span className="mt-0.5 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                  {food.cuisine}
                </span>
              )}
            </div>
          </div>
          {closingSoon && (
            <span className="flex-none rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-600">
              Closing soon
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <p className="flex items-center gap-2 min-w-0">
            <MapPin className="h-4 w-4 flex-none text-slate-400" />
            <span className="truncate">Drop at <span className="font-semibold text-slate-800">{food.dropLocation}</span></span>
          </p>
          <p className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 flex-none text-slate-400" />
            {orderTime ? format(orderTime, "EEE d MMM, h:mm a") : 'Time not set'}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-bold text-slate-800">{joined}/{maxPeople} joined</span>
          <div className="flex gap-1">
            {Array.from({ length: maxPeople }).map((_, i) => (
              <span key={i} className={`h-1.5 w-3 rounded-full ${i < joined ? 'bg-amber-500' : 'bg-slate-200'}`} />
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            {perPerson !== null ? (
              <>
                <p className="text-xs font-semibold text-slate-400">
                  <IndianRupee className="inline h-3 w-3" />{Number(split.totalFare).toLocaleString('en-IN')} total
                </p>
                <p className="mt-0.5 text-2xl font-black tracking-tight text-amber-600">
                  ₹{perPerson.toLocaleString('en-IN')}
                  <span className="ml-1 text-xs font-bold text-amber-600/70">/ person</span>
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-slate-500">Cost decided after ordering</p>
            )}
          </div>

          <button
            type="button"
            disabled={(split.isFull && !split.isJoined) || joining}
            onClick={() => onJoin(split)}
            className={`flex min-w-[108px] items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              split.isFull && !split.isJoined
                ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                : split.isJoined
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'bg-slate-950 text-white shadow-md hover:bg-slate-800'
            }`}
          >
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : split.isJoined ? <Check className="h-4 w-4" /> : null}
            {joining ? 'Joining…' : split.isJoined ? 'Open chat' : split.isFull ? 'Full' : 'Join split'}
          </button>
        </div>
      </div>

      {/* Creator controls. Close confirms the order and keeps the chat open;
          cancel calls it off and shuts the chat. Styled apart because they look
          alike but mean opposite things to somebody waiting on food. */}
      {isOwner && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3 sm:px-6">
          <button type="button" disabled={Boolean(ending)} onClick={() => onEnd(split, 'close')}
                  title="Stop taking people and send everyone the order details"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {ending === 'close' ? 'Closing…' : 'Close split'}
          </button>
          <button type="button" disabled={Boolean(ending)} onClick={() => onEnd(split, 'cancel')}
                  title="Call the order off and tell everyone who joined"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50">
            <XCircle className="h-3.5 w-3.5" />
            {ending === 'cancel' ? 'Cancelling…' : 'Cancel split'}
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-xs text-slate-500 sm:px-6">
        <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-slate-200 font-bold text-slate-600">
          {split.author?.avatarUrl
            ? <img src={split.author.avatarUrl} alt="" className="h-full w-full object-cover" />
            : split.author?.displayName?.charAt(0)?.toUpperCase()}
        </div>
        Posted by <span className="font-bold text-slate-700">{split.author?.displayName || 'Campus Buzz user'}</span>
      </div>
    </article>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════════════ */
export default function FoodSplitPage() {
  const { user } = useAuth();
  const [splits, setSplits]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [posting, setPosting]   = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [endingId, setEndingId]   = useState(null);   // `${id}:${action}`
  const [chatSplit, setChatSplit] = useState(null);

  // Every open split, soonest order first. The backend still supports a
  // ?restaurant= filter — the UI simply does not expose one, because the list
  // is short enough to scan and a search box over an empty page reads as broken.
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/food-splits');
      setSplits((data.data || []).map(normalise));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load food splits right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const join = async (split) => {
    if (split.isJoined) { setChatSplit(split); return; }
    setJoiningId(split._id);
    try {
      const { data } = await api.post(`/food-splits/${split._id}/join`);
      setSplits((prev) => prev.map((s) => (
        s._id === split._id
          ? { ...s, isJoined: true, peopleJoined: data.peopleJoined || s.peopleJoined + 1 }
          : s
      )));
      setChatSplit({ ...split, isJoined: true });
    } catch (err) {
      alert(err.response?.data?.message || 'Could not join this food split.');
    } finally {
      setJoiningId(null);
    }
  };

  /**
   * Ends a split the current user created. The confirm text spells out which
   * message the others receive — "close" and "cancel" are one word apart and
   * mean opposite things to somebody who is waiting to eat.
   */
  const end = async (split, action) => {
    if (endingId) return;
    const where = split.food?.restaurant || 'this order';
    const prompt = action === 'cancel'
      ? `Cancel the ${where} split?\n\n• Everyone who joined is told the order is OFF\n• The listing and its chat are removed\n\nThis cannot be undone.`
      : `Close the ${where} split?\n\n• Everyone who joined gets the full order details\n• No new people can join\n• The chat stays open to settle items and payment\n\nThis cannot be undone.`;
    if (!window.confirm(prompt)) return;

    setEndingId(`${split._id}:${action}`);
    try {
      const { data } = await api.patch(`/food-splits/${split._id}/${action}`);
      setSplits((prev) => prev.filter((s) => s._id !== split._id));
      setChatSplit((c) => (c?._id === split._id && action === 'cancel' ? null : c));
      alert(data.message);
    } catch (err) {
      alert(err.response?.data?.message || `Could not ${action} this food split.`);
    } finally {
      setEndingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Campus Buzz</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Food Split</h1>
        <p className="mt-1 text-sm text-slate-500">
          Share a delivery, split the bill, and skip the minimum-order problem.
        </p>
      </header>

      <div className="mb-6">
        <button type="button" onClick={() => setPosting(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:bg-amber-700 sm:w-auto">
          <Plus className="h-4 w-4" />
          Post food split
        </button>
      </div>

      {error && <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading food splits…
        </div>
      ) : splits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <UtensilsCrossed className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-3 font-bold text-slate-900">No open food splits</h2>
          <p className="mt-1 text-sm text-slate-500">
            Be the first — post one and let others join.
          </p>
          <button type="button" onClick={() => setPosting(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-700">
            <Plus className="h-4 w-4" /> Post food split
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {splits.map((split) => (
            <FoodCard
              key={split._id}
              split={split}
              onJoin={join}
              joining={joiningId === split._id}
              isOwner={(split.author?._id || split.author) === user?._id}
              onEnd={end}
              ending={endingId?.startsWith(`${split._id}:`) ? endingId.split(':')[1] : null}
            />
          ))}
        </div>
      )}

      {posting && (
        <PostFoodSplitModal
          onClose={() => setPosting(false)}
          onCreated={() => { setPosting(false); load(); }}
        />
      )}

      {chatSplit && (
        <ChatRoom
          postId={chatSplit._id}
          postTitle={chatSplit.food?.restaurant || chatSplit.title}
          hashtag="#foodsplit"
          isAuthor={(chatSplit.author?._id || chatSplit.author) === user?._id}
          onClose={() => setChatSplit(null)}
        />
      )}
    </div>
  );
}
