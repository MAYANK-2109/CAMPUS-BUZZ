/**
 * src/components/Layout/RightPanel.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Desktop-only right panel (hidden on mobile/tablet).
 * Upper: Today's events mini-calendar widget.
 * Lower: Club search with auto-search, history, popular clubs, follow/unfollow.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format, isSameDay, parseISO, isToday } from 'date-fns';
import { Search, X, Clock, MapPin, Users, Check } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

const HISTORY_KEY = 'cb_club_search_history';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const getHistory = () => {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
};
const saveHistory = (term) => {
  const h = getHistory().filter(t => t !== term);
  const next = [term, ...h].slice(0, 5);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
};
const clearHistory = () => localStorage.removeItem(HISTORY_KEY);

/* ─── Club card ───────────────────────────────────────────────────────────── */
const ClubCard = ({ club, currentUserId, onFollowToggle }) => {
  const [following, setFollowing] = useState(
    (club.followers || []).map(id => id.toString()).includes(currentUserId)
  );
  const [count, setCount] = useState((club.followers || []).length);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/users/${club._id}/follow`);
      setFollowing(data.following);
      setCount(data.followers);
      onFollowToggle?.();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cb-club-card">
      <div className="cb-club-avatar">
        {club.avatarUrl
          ? <img src={club.avatarUrl} alt={club.displayName} className="w-full h-full object-cover" />
          : <span className="text-sm font-bold text-gray-700">{club.displayName?.charAt(0)?.toUpperCase()}</span>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{club.displayName}</p>
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <Users className="w-3 h-3" />
          {count} follower{count !== 1 ? 's' : ''}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={loading}
        className={`cb-follow-btn ${following ? 'cb-follow-btn--following' : 'cb-follow-btn--not'}`}
      >
        {loading
          ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : following
            ? <><Check className="w-3 h-3" /> Following</>
            : 'Follow'
        }
      </button>
    </div>
  );
};

/* ─── Today Events widget ─────────────────────────────────────────────────── */
const TodayEvents = () => {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();

  useEffect(() => {
    const from = format(today, 'yyyy-MM-dd');
    api.get(`/events?from=${from}&to=${from}`)
      .then(({ data }) => setEvents(data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // intentionally runs once on mount

  const todayEvents = events.filter(ev =>
    isSameDay(parseISO(ev.date), today) && ev.status === 'Approved'
  );

  return (
    <div className="cb-rp-section">
      {/* Date header */}
      <div className="cb-rp-date-header">
        <div>
          <p className="text-3xl font-black text-gray-900 leading-none">{format(today, 'd')}</p>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-0.5">
            {format(today, 'EEEE, MMM yyyy')}
          </p>
        </div>
        <div className="cb-today-dot" />
      </div>

      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
        Today's Events
      </p>

      {loading ? (
        <div className="space-y-2">
          {[1,2].map(i => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : todayEvents.length === 0 ? (
        <div className="text-center py-5">
          <p className="text-2xl mb-1">🎉</p>
          <p className="text-xs text-gray-400">No events today — enjoy the break!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {todayEvents.map(ev => (
            <div key={ev._id} className="cb-event-pill">
              <div className="cb-event-stripe" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{ev.title}</p>
                <div className="flex items-center gap-2 mt-0.5 text-gray-400">
                  {ev.time && (
                    <span className="flex items-center gap-1 text-[10px]">
                      <Clock className="w-3 h-3" />{ev.time}
                    </span>
                  )}
                  {ev.venue && (
                    <span className="flex items-center gap-1 text-[10px] truncate">
                      <MapPin className="w-3 h-3" />{ev.venue}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Main RightPanel ─────────────────────────────────────────────────────── */
const RightPanel = () => {
  const { user } = useAuth();
  const [query, setQuery]       = useState('');
  const [clubs, setClubs]       = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [history, setHistory]   = useState(getHistory());
  const [loadingClubs, setLoadingClubs] = useState(true);
  const inputRef = useRef(null);

  // Fetch all clubs once
  useEffect(() => {
    api.get('/clubs')
      .then(({ data }) => { setClubs(data.data || []); })
      .catch(() => {})
      .finally(() => setLoadingClubs(false));
  }, []);

  // Auto-search on query change (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!query.trim()) { setFiltered([]); return; }
      const q = query.toLowerCase();
      setFiltered(clubs.filter(c => c.displayName?.toLowerCase().includes(q)));
      saveHistory(query.trim());
      setHistory(getHistory());
    }, 250);
    return () => clearTimeout(t);
  }, [query, clubs]);

  const clearSearch = () => { setQuery(''); setFiltered([]); };

  const popularClubs = [...clubs].sort((a, b) => (b.followers?.length || 0) - (a.followers?.length || 0)).slice(0, 4);

  const showHistory  = !query.trim() && history.length > 0;
  const showPopular  = !query.trim() && history.length === 0;
  const showResults  = query.trim().length > 0;

  return (
    <aside className="cb-right-panel hidden lg:flex flex-col gap-4">

      {/* ── Upper: Today's Events ─────────────────────────────────────────── */}
      <TodayEvents />

      {/* ── Lower: Club Search ────────────────────────────────────────────── */}
      <div className="cb-rp-section flex-1">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Clubs</p>

        {/* Search input */}
        <div className="cb-search-wrap">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search clubs…"
            className="cb-search-input"
          />
          {query && (
            <button onClick={clearSearch} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="mt-3 space-y-0">

          {/* Search results */}
          {showResults && (
            loadingClubs ? (
              <div className="h-8 flex items-center justify-center">
                <span className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No clubs found for "{query}"</p>
            ) : (
              filtered.map(club => (
                <ClubCard
                  key={club._id}
                  club={club}
                  currentUserId={user?._id}
                  onFollowToggle={() => {}}
                />
              ))
            )
          )}

          {/* Search history */}
          {showHistory && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Recent Searches</span>
                <button
                  onClick={() => { clearHistory(); setHistory([]); }}
                  className="text-[10px] text-blue-500 hover:text-blue-600 font-semibold"
                >
                  Clear
                </button>
              </div>
              {history.map((term, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(term)}
                  className="cb-history-item"
                >
                  <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700 truncate">{term}</span>
                </button>
              ))}
            </>
          )}

          {/* Popular clubs */}
          {showPopular && (
            <>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Popular Clubs</p>
              {loadingClubs
                ? [1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse mb-2" />)
                : popularClubs.map(club => (
                    <ClubCard
                      key={club._id}
                      club={club}
                      currentUserId={user?._id}
                      onFollowToggle={() => {}}
                    />
                  ))
              }
            </>
          )}
        </div>
      </div>
    </aside>
  );
};

export default RightPanel;
