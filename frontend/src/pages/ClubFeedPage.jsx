/**
 * src/pages/ClubFeedPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Club & Admin section – a distinct feed filtered to Club/Admin posts.
 */

import React, { useState, useEffect, useCallback } from 'react';
import PostCard       from '../components/PostCard';
import CreatePostForm from '../components/CreatePostForm';
import api            from '../utils/api';
import { useAuth }    from '../context/AuthContext';

const ClubFeedPage = () => {
  const { user }   = useAuth();
  const isCreator  = user?.role === 'Club' || user?.role === 'Admin';

  const [posts,      setPosts]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showForm,   setShowForm]   = useState(false);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPosts = useCallback(async (pageNum = 1, reset = false) => {
    pageNum === 1 ? setLoading(true) : setLoadingMore(true);
    setError('');
    try {
      const { data } = await api.get(`/posts?feed=club&page=${pageNum}&limit=12`);
      setPosts((prev) => reset || pageNum === 1 ? data.data : [...prev, ...data.data]);
      setTotalPages(data.pagination.pages);
      setPage(pageNum);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load club feed.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { fetchPosts(1, true); }, [fetchPosts]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-12">
      <div className="max-w-xl mx-auto px-4 py-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-widest font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">
                Club & Admin
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Club Feed</h1>
            <p className="text-sm text-gray-500">Official announcements & events</p>
          </div>

          {isCreator && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
            >
              <span className="text-lg">+</span> Post
            </button>
          )}
        </div>

        {/* ── Embed / iframe note ─────────────────────────────────────────── */}
        {isCreator && (
          <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-800 shadow-sm">
            <span className="font-bold">Pro-tip:</span> You can embed Google Forms or other content by pasting an iframe URL in the description.
          </div>
        )}

        {/* ── Feed ───────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse shadow-sm">
                <div className="flex gap-3 mb-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-full" />
                  <div className="flex flex-col gap-2 pt-1 flex-1">
                    <div className="h-3 bg-gray-200 rounded w-1/4" />
                    <div className="h-2 bg-gray-200 rounded w-1/5" />
                  </div>
                </div>
                <div className="h-40 bg-gray-100 rounded-lg w-full mb-3" />
                <div className="h-3 bg-gray-200 rounded w-full mb-2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500 mb-3">{error}</p>
            <button onClick={() => fetchPosts(1, true)} className="text-sm text-blue-600 hover:underline">
              Try again
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📢</p>
            <p className="text-gray-500 text-sm">No club announcements yet.</p>
          </div>
        ) : (
          <>
            <div className="space-y-6">
              {posts.map((post) => (
                <PostCard key={post._id} post={post} onPostDeleted={(id) => setPosts(p => p.filter(x => x._id !== id))} />
              ))}
            </div>

            {page < totalPages && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => fetchPosts(page + 1)}
                  disabled={loadingMore}
                  className="px-6 py-2 text-sm font-semibold border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showForm && <CreatePostForm onPostCreated={p => setPosts([p, ...posts])} onClose={() => setShowForm(false)} />}
    </div>
  );
};

export default ClubFeedPage;
