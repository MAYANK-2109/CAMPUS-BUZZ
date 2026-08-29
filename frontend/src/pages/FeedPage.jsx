/**
 * src/pages/FeedPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Main feed page — combines Student Feed + Club/Admin Feed in one view.
 * A toggle button at the top-right of the sticky filter row switches between
 * modes with a slide + fade animation and a distinct institutional theme.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PenSquare, Megaphone, Home, Sparkles } from 'lucide-react';
import PostCard        from '../components/PostCard';
import CreatePostForm  from '../components/CreatePostForm';
import AnnouncementStories from '../components/AnnouncementStories';
import api             from '../utils/api';
import { useAuth }     from '../context/AuthContext';

const HASHTAG_FILTERS = ['all', '#foodsplit', '#resell', '#lost', '#found'];

/* ─── small hook: fetch posts for a given mode ───────────────────────────── */
function usePostFeed(isClubMode) {
  const [posts,       setPosts]      = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [loadingMore, setLoadingMore]= useState(false);
  const [error,       setError]      = useState('');
  const [page,        setPage]       = useState(1);
  const [totalPages,  setTotalPages] = useState(1);
  const [filter,      setFilter]     = useState('all');

  const fetchPosts = useCallback(async (pageNum = 1, activeFilter = filter, reset = false) => {
    pageNum === 1 ? setLoading(true) : setLoadingMore(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: pageNum, limit: 10 });
      // Cab rides live in the dedicated Ride Split discovery flow.
      params.set('excludeHashtag', '#cabsplit');
      if (isClubMode) {
        params.set('feed', 'club');
      } else {
        if (activeFilter !== 'all') params.set('hashtag', activeFilter);
      }
      const { data } = await api.get(`/posts?${params}`);
      setPosts(prev => reset || pageNum === 1 ? data.data : [...prev, ...data.data]);
      setTotalPages(data.pagination.pages);
      setPage(pageNum);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load posts.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [isClubMode]);

  useEffect(() => {
    setPage(1);
    setFilter('all');
    fetchPosts(1, 'all', true);
  }, [isClubMode]);

  const handleFilterChange = f => { setFilter(f); setPage(1); fetchPosts(1, f, true); };
  const loadMore = () => fetchPosts(page + 1, filter);

  return {
    posts, setPosts, loading, loadingMore, error,
    page, totalPages, filter, handleFilterChange, loadMore,
    refetch: () => fetchPosts(1, filter, true),
  };
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
const FeedPage = () => {
  const { user } = useAuth();
  const isCreator = user?.role === 'Club' || user?.role === 'Admin';

  const [clubMode,  setClubMode]  = useState(false);
  const [animOut,   setAnimOut]   = useState(false);
  const [showForm,  setShowForm]  = useState(false);

  const feed = usePostFeed(clubMode);

  /**
   * Deep link: /feed?post=<id>
   *
   * Notifications tell people to "check the post to verify", so they have to be
   * able to land on it. The target is usually not on page 1 of the feed (and
   * with pagination may not be reachable at all), so it is fetched directly and
   * pinned above the feed rather than scrolled to.
   */
  const location = useLocation();
  const navigate = useNavigate();
  const [focusedPost, setFocusedPost] = useState(null);
  const [focusError,  setFocusError]  = useState('');

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('post');
    if (!id) { setFocusedPost(null); setFocusError(''); return; }

    let cancelled = false;
    setFocusError('');
    api.get(`/posts/${id}`)
      .then(({ data }) => { if (!cancelled) setFocusedPost(data.data); })
      .catch(() => {
        // Deleted, expired, or sold since the notification was sent.
        if (!cancelled) { setFocusedPost(null); setFocusError('That post is no longer available.'); }
      });
    return () => { cancelled = true; };
  }, [location.search]);

  const clearFocus = () => { setFocusedPost(null); setFocusError(''); navigate('/feed', { replace: true }); };

  /**
   * Deep link: /feed?hashtag=%23foodsplit
   *
   * Find BOT answers "I'm hungry" with a Food Split button, and that button has
   * to land on the food-split filter rather than the unfiltered feed. Applied
   * once per URL change; the filter is left alone afterwards so the user can
   * still change it by hand.
   */
  useEffect(() => {
    const tag = new URLSearchParams(location.search).get('hashtag');
    if (tag && HASHTAG_FILTERS.includes(tag) && tag !== feed.filter) {
      feed.handleFilterChange(tag);
    }
    // Keyed on location.search only, on purpose: including feed.filter would
    // re-run on every filter change and fight the user each time they picked a
    // different tab by hand.
  }, [location.search]);

  const toggleClubMode = () => {
    setAnimOut(true);
    setTimeout(() => {
      setClubMode(v => !v);
      setAnimOut(false);
    }, 200);
  };

  /* Inject CSS animations once */
  useEffect(() => {
    const id = 'club-mode-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes feedSlideIn {
        from { opacity: 0; transform: translateY(18px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0)    scale(1);    }
      }
      @keyframes feedSlideOut {
        from { opacity: 1; transform: translateY(0)     scale(1);    }
        to   { opacity: 0; transform: translateY(-12px) scale(0.98); }
      }
      @keyframes pulseGlow {
        0%,100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.45); }
        50%      { box-shadow: 0 0 0 7px rgba(124,58,237,0);  }
      }
      @keyframes bannerIn {
        from { opacity: 0; transform: translateY(-10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .feed-slide-in  { animation: feedSlideIn  .38s cubic-bezier(.16,1,.3,1) both; }
      .feed-slide-out { animation: feedSlideOut .20s ease-in both; }
      .club-toggle-glow { animation: pulseGlow 2.2s ease-in-out infinite; }
      .banner-in { animation: bannerIn .35s cubic-bezier(.16,1,.3,1) both; }
    `;
    document.head.appendChild(style);
  }, []);

  /* ── Skeleton ─────────────────────────────────────────────────────────── */
  const Skeleton = () => (
    <div className="space-y-6">
      {[...Array(3)].map((_, i) => (
        <div key={i} className={`border rounded-2xl overflow-hidden shadow-sm animate-pulse ${
          clubMode ? 'bg-slate-50/60 border-slate-200' : 'bg-white border-gray-100'
        }`}>
          <div className="flex items-center gap-3 p-4">
            <div className={`w-10 h-10 rounded-full ${clubMode ? 'bg-slate-200' : 'bg-gray-200'}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-3 rounded w-28 ${clubMode ? 'bg-slate-200' : 'bg-gray-200'}`} />
              <div className={`h-2 rounded w-20 ${clubMode ? 'bg-slate-100' : 'bg-gray-100'}`} />
            </div>
          </div>
          <div className={`h-44 ${clubMode ? 'bg-slate-100' : 'bg-gray-100'}`} />
          <div className="p-4 space-y-2">
            <div className={`h-3 rounded w-full ${clubMode ? 'bg-slate-100' : 'bg-gray-200'}`} />
            <div className={`h-3 rounded w-4/5 ${clubMode ? 'bg-slate-100' : 'bg-gray-100'}`} />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="feed-surface min-h-screen pb-16 transition-colors duration-500"
      style={{
        background: clubMode
          ? '#f0f2ef'
          : undefined,
      }}
    >
      {/* ── Announcement Stories — hidden in club mode ─────────────── */}
      <div
        className="overflow-hidden transition-all duration-500"
        style={{
          maxHeight: clubMode ? 0 : 220,
          opacity:   clubMode ? 0 : 1,
          transitionTimingFunction: 'cubic-bezier(.4,0,.2,1)',
        }}
      >
        <AnnouncementStories />
      </div>

      {/* ── Sticky filter bar ─────────────────────────────────────────── */}
      <div
        className="feed-toolbar sticky top-0 z-30 backdrop-blur-md border-b transition-all duration-500 px-4 py-2.5"
        style={{
          background: clubMode ? 'rgba(246,247,245,0.96)' : undefined,
          borderColor: clubMode ? '#d2d7d2' : undefined,
        }}
      >
        <div className="max-w-xl mx-auto flex items-center gap-2">

          {/* Hashtag filters — faded out in club mode */}
          <div
            className="flex gap-2 overflow-x-auto scrollbar-hide flex-1 transition-all duration-300"
            style={{ opacity: clubMode ? 0 : 1, pointerEvents: clubMode ? 'none' : 'auto' }}
          >
            {HASHTAG_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => feed.handleFilterChange(f)}
                className={`flex-shrink-0 px-4 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                  feed.filter === f
                    ? 'feed-filter-active text-white shadow-sm'
                    : 'bg-white/80 border-gray-200/90 text-gray-600 hover:border-slate-400 hover:bg-white'
                }`}
              >
                {f === 'all' ? '✦ All' : f}
              </button>
            ))}
          </div>

          {/* Club mode label — shown in place of filters */}
          {clubMode && (
            <div className="flex-1 flex items-center gap-2 min-w-0 banner-in">
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-300 flex-shrink-0 whitespace-nowrap">
                Club &amp; Admin
              </span>
              <span className="text-sm font-bold text-slate-900 truncate">Official Feed</span>
            </div>
          )}

          {/* ── The toggle button ──────────────────────────────────── */}
          <button
            id="club-mode-toggle"
            onClick={toggleClubMode}
            title={clubMode ? 'Back to Student Feed' : 'Switch to Club Feed'}
            className={`
              flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full
              text-xs font-bold border-2 transition-all duration-300 select-none
              ${clubMode
                ? 'bg-slate-800 text-white border-slate-800 shadow-md club-toggle-glow'
                : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500 hover:bg-slate-50 shadow-sm'
              }
            `}
          >
            {clubMode
              ? <><Home     className="w-3.5 h-3.5" strokeWidth={2.5} /><span className="hidden sm:inline">Student</span></>
              : <><Megaphone className="w-3.5 h-3.5" strokeWidth={2} /><span className="hidden sm:inline">Clubs</span></>
            }
            <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${clubMode ? 'bg-white/80' : 'bg-slate-400'}`} />
          </button>
        </div>
      </div>

      {/* ── Club mode banner ──────────────────────────────────────────── */}
      {clubMode && (
        <div className="max-w-xl mx-auto px-4 pt-5 pb-0 banner-in">
          <div className="flex items-center justify-between bg-slate-800 rounded-2xl px-5 py-4 shadow-md">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-slate-300" strokeWidth={1.8} />
                <span className="text-[9px] uppercase tracking-widest font-bold text-slate-300">Official Channel</span>
              </div>
              <h2 className="text-white font-extrabold text-lg leading-tight">Club Feed</h2>
              <p className="text-slate-300 text-xs mt-0.5">Announcements &amp; events from clubs &amp; admin</p>
            </div>
            {isCreator && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl border border-white/30 transition-all active:scale-95"
              >
                <span className="text-sm leading-none">+</span> Post
              </button>
            )}
          </div>
          {isCreator && (
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-700">
              <span className="font-bold">Pro-tip:</span> Embed Google Forms or other content by pasting an iframe URL in the description.
            </div>
          )}
        </div>
      )}

      {/* ── Feed content ─────────────────────────────────────────────── */}
      <div
        key={clubMode ? 'club' : 'student'}
        className={`max-w-xl mx-auto px-4 pt-5 ${animOut ? 'feed-slide-out' : 'feed-slide-in'}`}
      >
        {feed.loading ? (
          <Skeleton />
        ) : feed.error ? (
          <div className="text-center py-16">
            <p className="text-red-500 mb-4">{feed.error}</p>
            <button onClick={feed.refetch} className="text-sm text-blue-600 hover:underline">Try again</button>
          </div>
        ) : feed.posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 ${
              clubMode ? 'bg-slate-100' : 'bg-gray-100'
            }`}>
              {clubMode
                ? <span className="text-4xl select-none animate-bounce">📢</span>
                : <PenSquare className="w-9 h-9 text-gray-400" strokeWidth={1.5} />
              }
            </div>
            <h2 className={`font-bold text-xl mb-2 ${clubMode ? 'text-slate-900' : 'text-gray-900'}`}>
              {clubMode ? 'No announcements yet' : 'Nothing here yet'}
            </h2>
            <p className={`text-sm mb-6 max-w-xs leading-relaxed ${clubMode ? 'text-slate-600' : 'text-gray-500'}`}>
              {clubMode
                ? (isCreator
                    ? 'Be the first to post an official announcement or event update.'
                    : 'No clubs have posted yet. Check back soon!')
                : (feed.filter === 'all'
                    ? 'Be the first to post something!'
                    : `No ${feed.filter} posts right now.`)
              }
            </p>
            {((clubMode && isCreator) || (!clubMode && feed.filter === 'all')) && (
              <button
                onClick={() => setShowForm(true)}
                className={`flex items-center gap-2 px-6 py-2.5 text-white text-sm font-bold rounded-full transition-all shadow-md hover:shadow-lg active:scale-95 ${
                  clubMode
                    ? 'bg-slate-800 hover:bg-slate-700'
                    : 'bg-gray-900 hover:bg-gray-800'
                }`}
              >
                + {clubMode ? 'Create Announcement' : 'Create Post'}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Deep-linked post, pinned above the feed */}
            {focusError && (
              <div className="mb-3 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
                <span>{focusError}</span>
                <button onClick={clearFocus} className="font-semibold hover:underline">Dismiss</button>
              </div>
            )}
            {focusedPost && (
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-t-xl bg-slate-50 border border-b-0 border-slate-300 text-xs font-semibold text-slate-700">
                  <span>Showing the post from your notification</span>
                  <button onClick={clearFocus} className="hover:underline">Back to feed</button>
                </div>
                <div className="ring-2 ring-slate-300 rounded-b-xl overflow-hidden">
                  <PostCard
                    post={focusedPost}
                    onPostDeleted={() => clearFocus()}
                  />
                </div>
              </div>
            )}

            <div className="space-y-0">
              {feed.posts.map((post, i) => (
                <div key={post._id} className="feed-slide-in" style={{ animationDelay: `${i * 35}ms` }}>
                  <PostCard
                    post={post}
                    onPostDeleted={id => feed.setPosts(p => p.filter(x => x._id !== id))}
                  />
                </div>
              ))}
            </div>
            {feed.page < feed.totalPages && (
              <div className="mt-2 pb-8 text-center">
                <button
                  onClick={feed.loadMore}
                  disabled={feed.loadingMore}
                  className={`px-6 py-2 text-sm font-semibold border rounded-lg transition-colors shadow-sm disabled:opacity-50 ${
                    clubMode
                      ? 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {feed.loadingMore ? (
                    <span className="flex items-center gap-2 justify-center">
                      <span className={`w-3.5 h-3.5 border-2 rounded-full animate-spin ${
                        clubMode ? 'border-slate-200 border-t-slate-600' : 'border-gray-300 border-t-gray-600'
                      }`} />
                      Loading…
                    </span>
                  ) : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Floating create button ─────────────────────────────────────── */}
      <button
        onClick={() => setShowForm(true)}
        className={`fixed bottom-24 md:bottom-6 right-6 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all duration-300 z-20 ${
          clubMode
            ? 'bg-slate-800 hover:bg-slate-700 shadow-slate-300'
            : 'feed-create-button'
        } text-white`}
        title={clubMode ? 'Create Club Post' : 'Create Post'}
      >
        {clubMode ? <Megaphone className="w-6 h-6" strokeWidth={2} /> : <PenSquare className="w-6 h-6" strokeWidth={2} />}
      </button>

      {showForm && (
        <CreatePostForm
          onPostCreated={p => { feed.setPosts(prev => [p, ...prev]); setShowForm(false); }}
          onClose={() => setShowForm(false)}
          isClubOrAdmin={isCreator}
        />
      )}
    </div>
  );
};

export default FeedPage;
