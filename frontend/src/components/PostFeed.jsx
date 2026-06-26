/**
 * src/components/Feed/PostFeed.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Main student feed. Layout is handled by the 3-column shell in App.jsx.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PenSquare } from 'lucide-react';
import PostCard        from './PostCard';
import CreatePostForm  from './CreatePostForm';
import api             from '../utils/api';
import { useAuth }     from '../context/AuthContext';

const HASHTAG_FILTERS = ['all', '#foodsplit', '#cabsplit', '#resell', '#lost', '#found'];

const PostFeed = () => {
  const { user }                 = useAuth();
  const [posts,        setPosts]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [error,        setError]        = useState('');
  const [page,         setPage]         = useState(1);
  const [totalPages,   setTotalPages]   = useState(1);
  const [activeFilter, setActiveFilter] = useState('all');
  const [showForm,     setShowForm]     = useState(false);

  const fetchPosts = useCallback(async (pageNum = 1, filter = activeFilter, reset = false) => {
    pageNum === 1 ? setLoading(true) : setLoadingMore(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: pageNum, limit: 10 });
      if (filter !== 'all') params.set('hashtag', filter);
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
  }, [activeFilter]);

  useEffect(() => { fetchPosts(1, activeFilter, true); }, [fetchPosts]);

  const handleFilterChange = filter => { setActiveFilter(filter); setPage(1); };

  return (
    <div className="min-h-screen pb-16" style={{ background: 'transparent' }}>

      {/* ── Sticky Filter row ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 py-2.5">
        <div className="max-w-xl mx-auto flex gap-2 overflow-x-auto scrollbar-hide">
          {HASHTAG_FILTERS.map(filter => (
            <button
              key={filter}
              onClick={() => handleFilterChange(filter)}
              className={`flex-shrink-0 px-4 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                activeFilter === filter
                  ? 'bg-gray-900 border-gray-900 text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {filter === 'all' ? '✦ All' : filter}
            </button>
          ))}
        </div>
      </div>

      {/* ── Feed ──────────────────────────────────────────────────────────── */}
      <div className="max-w-xl mx-auto px-4 pt-6">

        {loading ? (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm animate-pulse">
                <div className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-28" />
                    <div className="h-2 bg-gray-100 rounded w-20" />
                  </div>
                </div>
                <div className="h-52 bg-gray-100" />
                <div className="p-4 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-full" />
                  <div className="h-3 bg-gray-100 rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-red-500 mb-4">{error}</p>
            <button onClick={() => fetchPosts(1, activeFilter, true)} className="btn-ghost text-sm">Try again</button>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-5 animate-float">
              <PenSquare className="w-9 h-9 text-gray-400" strokeWidth={1.5} />
            </div>
            <h2 className="font-bold text-gray-900 text-xl mb-2">Nothing here yet</h2>
            <p className="text-gray-500 text-sm mb-6">
              {activeFilter === 'all' ? 'Be the first to post something!' : `No ${activeFilter} posts right now.`}
            </p>
            {activeFilter === 'all' && (
              <button onClick={() => setShowForm(true)} className="btn-primary">Create Post</button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-0">
              {posts.map((post, i) => (
                <div key={post._id} className="post-card-enter" style={{ animationDelay: `${i * 40}ms` }}>
                  <PostCard
                    post={post}
                    onPostDeleted={id => setPosts(p => p.filter(x => x._id !== id))}
                  />
                </div>
              ))}
            </div>

            {page < totalPages && (
              <div className="mt-2 pb-8 text-center">
                <button
                  onClick={() => fetchPosts(page + 1, activeFilter)}
                  disabled={loadingMore}
                  className="btn-ghost text-sm min-w-[140px]"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2 justify-center">
                      <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                      Loading…
                    </span>
                  ) : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Floating create button ─────────────────────────────────────────── */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gray-900 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-gray-800 active:scale-90 transition-all duration-150 z-20"
        title="Create Post"
      >
        <PenSquare className="w-6 h-6" strokeWidth={2} />
      </button>

      {showForm && (
        <CreatePostForm
          onPostCreated={p => { setPosts(prev => [p, ...prev]); setShowForm(false); }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
};

export default PostFeed;
