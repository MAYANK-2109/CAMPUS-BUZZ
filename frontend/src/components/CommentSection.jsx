/**
 * src/components/CommentSection.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches and displays comments for a post, with an input to add new ones.
 * Fixed: error surfacing, Enter-key submit, proper API error handling.
 */

import React, { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Send } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const CommentSection = ({ postId }) => {
  const { user } = useAuth();
  const [comments,   setComments]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [text,       setText]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/posts/${postId}/comments`)
      .then(({ data }) => {
        if (!cancelled) {
          setComments(data.data || []);
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [postId]);

  // Focus input when section opens
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const { data } = await api.post(`/posts/${postId}/comments`, { text: trimmed });
      if (data?.data) {
        setComments(prev => [data.data, ...prev]);
        setText('');
      } else {
        setSubmitError('Unexpected response. Please try again.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to post comment.';
      setSubmitError(msg);
      console.error('[CommentSection] submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-gray-100 pt-3 px-4 pb-4">

      {/* Error banner */}
      {submitError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 mb-3">
          {submitError}
        </p>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-3 mb-4">
        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-600 overflow-hidden">
          {user?.avatarUrl
            ? <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
            : user?.displayName?.charAt(0)?.toUpperCase()}
        </div>
        <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-full px-4 py-2 bg-gray-50 focus-within:bg-white focus-within:border-gray-300 transition-all">
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment…"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none min-w-0"
            maxLength={500}
            disabled={submitting}
          />
          {text.trim() && (
            <button
              type="submit"
              disabled={submitting}
              className="text-blue-500 hover:text-blue-600 flex-shrink-0 transition-colors disabled:opacity-50"
            >
              {submitting
                ? <span className="w-4 h-4 border-2 border-blue-300 border-t-blue-500 rounded-full animate-spin block" />
                : <Send className="w-4 h-4" />
              }
            </button>
          )}
        </div>
      </form>

      {/* Comments list */}
      {loading ? (
        <div className="space-y-3 pl-10">
          {[1,2].map(i => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-7 h-7 rounded-full bg-gray-200 flex-shrink-0" />
              <div className="flex-1 space-y-1.5 pt-1">
                <div className="h-2.5 bg-gray-200 rounded w-1/3" />
                <div className="h-2 bg-gray-100 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-gray-400 pl-10">No comments yet. Be the first!</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-thin pr-1">
          {comments.map(c => (
            <div key={c._id} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-600 overflow-hidden">
                {c.author?.avatarUrl
                  ? <img src={c.author.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : c.author?.displayName?.charAt(0)?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <span className="text-sm font-semibold text-gray-900 mr-2">{c.author?.displayName}</span>
                <span className="text-sm text-gray-800 break-words">{c.text}</span>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommentSection;
