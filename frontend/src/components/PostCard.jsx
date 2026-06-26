/**
 * src/components/PostCard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Instagram-inspired post card with likes, dislikes, comments, hashtag actions.
 */

import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { Heart, ThumbsDown, MessageCircle, Trash2, Send, MoreHorizontal } from 'lucide-react';
import HashtagBadge   from './HashtagBadge';
import CountdownTimer from './CountdownTimer';
import ContactModal   from './ContactModal';
import ChatRoom       from '../Chat/ChatRoom';
import CommentSection from './CommentSection';
import { useAuth }    from '../context/AuthContext';
import api            from '../utils/api';

const CHAT_HASHTAGS    = new Set(['#foodsplit', '#cabsplit', '#resell']);
const CONTACT_HASHTAGS = new Set(['#lost', '#found']);
const TIMED_HASHTAGS   = new Set(['#foodsplit', '#cabsplit']);

const PostCard = ({ post: initialPost, onPostDeleted, hideDelete = false }) => {
  const { user }   = useAuth();
  const [post, setPost] = useState(initialPost);

  const [showChat,     setShowChat]     = useState(false);
  const [showContact,  setShowContact]  = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [liking,       setLiking]       = useState(false);
  const [disliking,    setDisliking]    = useState(false);

  const userId      = user?._id;
  const isAuthor    = userId === post.author?._id;
  const isAdmin     = user?.role === 'Admin';

  const hasLiked    = (post.likes    || []).map(id => id.toString()).includes(userId);
  const hasDisliked = (post.dislikes || []).map(id => id.toString()).includes(userId);

  // ── Like ──────────────────────────────────────────────────────────────────
  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    try {
      const { data } = await api.post(`/posts/${post._id}/like`);
      // Use server counts; rebuild sparse like/dislike arrays by count for display
      setPost(p => ({
        ...p,
        likes:    data.liked    ? [...(p.likes||[]).filter(id=>id!==userId), userId]    : (p.likes||[]).filter(id=>id!==userId),
        dislikes: data.disliked ? [...(p.dislikes||[]).filter(id=>id!==userId), userId] : (p.dislikes||[]).filter(id=>id!==userId),
        _likeCount:    data.likes,
        _dislikeCount: data.dislikes,
      }));
    } catch (err) { console.error(err); }
    finally { setLiking(false); }
  };

  // ── Dislike ───────────────────────────────────────────────────────────────
  const handleDislike = async () => {
    if (disliking) return;
    setDisliking(true);
    try {
      const { data } = await api.post(`/posts/${post._id}/dislike`);
      setPost(p => ({
        ...p,
        dislikes: data.disliked ? [...(p.dislikes||[]).filter(id=>id!==userId), userId] : (p.dislikes||[]).filter(id=>id!==userId),
        likes:    data.liked    ? [...(p.likes||[]).filter(id=>id!==userId), userId]    : (p.likes||[]).filter(id=>id!==userId),
        _likeCount:    data.likes,
        _dislikeCount: data.dislikes,
      }));
    } catch (err) { console.error(err); }
    finally { setDisliking(false); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm('Delete this post?')) return;
    setDeleting(true);
    try {
      await api.delete(`/posts/${post._id}`);
      onPostDeleted?.(post._id);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete post.');
      setDeleting(false);
    }
  };

  const handleHashtagAction = () => {
    if (CHAT_HASHTAGS.has(post.hashtag)) setShowChat(true);
    else if (CONTACT_HASHTAGS.has(post.hashtag)) setShowContact(true);
  };

  const ctaLabel = {
    '#foodsplit': '🍕 Join Foodsplit',
    '#cabsplit':  '🚕 Join Cabsplit',
    '#resell':    'Chat to Buy',
    '#lost':      'View Contact',
    '#found':     'View Contact',
  }[post.hashtag] || null;

  const isExpired = post.expiresAt && new Date(post.expiresAt) < new Date();

  return (
    <>
      <article className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 mb-6 max-w-xl mx-auto">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <Link to={`/profile/${post.author?._id}`} className="block flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 via-pink-500 to-orange-400 p-[2px]">
                <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                  {post.author?.avatarUrl ? (
                    <img src={post.author.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-gray-700">
                      {post.author?.displayName?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  )}
                </div>
              </div>
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <Link to={`/profile/${post.author?._id}`} className="text-sm font-semibold text-gray-900 leading-none hover:underline">
                  {post.author?.displayName}
                </Link>
                {post.author?.role !== 'Student' && (
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                    post.author?.role === 'Club'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {post.author?.role}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">
                  {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : ''}
                </span>
                {post.hashtag !== 'None' && <HashtagBadge hashtag={post.hashtag} />}
                {TIMED_HASHTAGS.has(post.hashtag) && post.expiresAt && (
                  <CountdownTimer expiresAt={post.expiresAt} hashtag={post.hashtag} />
                )}
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center gap-1">
            {!hideDelete && (isAuthor || isAdmin) && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-1.5 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                {deleting ? <div className="w-4 h-4 border-2 border-gray-300 border-t-red-400 rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* ── Image ─────────────────────────────────────────────────────────── */}
        {post.imageUrl && (
          <div className="w-full bg-gray-50">
            <img
              src={post.imageUrl}
              alt={post.title}
              className="w-full h-auto max-h-[500px] object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* ── Action Bar (Instagram-style) ──────────────────────────────────── */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-4">
            {/* Like */}
            <button
              onClick={handleLike}
              disabled={liking}
              className={`flex items-center gap-1.5 group transition-transform active:scale-90 ${liking ? 'opacity-50' : ''}`}
              aria-label="Like"
            >
              <Heart
                className={`w-6 h-6 transition-all duration-150 ${
                  hasLiked
                    ? 'fill-rose-500 text-rose-500 scale-110'
                    : 'text-gray-700 group-hover:text-rose-500'
                }`}
              />
              <span className={`text-sm font-semibold ${hasLiked ? 'text-rose-500' : 'text-gray-700'}`}>
                {post._likeCount ?? post.likes?.length ?? 0}
              </span>
            </button>

            {/* Comment */}
            <button
              onClick={() => setShowComments(v => !v)}
              className="flex items-center gap-1.5 group transition-transform active:scale-90"
              aria-label="Comment"
            >
              <MessageCircle className={`w-6 h-6 transition-colors ${showComments ? 'text-blue-500' : 'text-gray-700 group-hover:text-blue-500'}`} />
            </button>

            {/* Dislike */}
            <button
              onClick={handleDislike}
              disabled={disliking}
              className={`flex items-center gap-1.5 group transition-transform active:scale-90 ${disliking ? 'opacity-50' : ''}`}
              aria-label="Dislike"
            >
              <ThumbsDown
                className={`w-5 h-5 transition-all duration-150 ${
                  hasDisliked
                    ? 'fill-orange-500 text-orange-500 scale-110'
                    : 'text-gray-700 group-hover:text-orange-500'
                }`}
              />
              <span className={`text-sm font-semibold ${hasDisliked ? 'text-orange-500' : 'text-gray-700'}`}>
                {post._dislikeCount ?? post.dislikes?.length ?? 0}
              </span>
            </button>

            {/* CTA */}
            {ctaLabel && !isExpired && (
              <button
                onClick={handleHashtagAction}
                className="ml-auto text-xs font-semibold px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-full transition-colors"
              >
                {ctaLabel}
              </button>
            )}
            {ctaLabel && isExpired && (
              <span className="ml-auto text-xs text-gray-400 italic">Expired</span>
            )}
          </div>
        </div>

        {/* ── Content ───────────────────────────────────────────────────────── */}
        <div className="px-4 pt-1 pb-3">
          <p className="text-sm text-gray-900 leading-relaxed">
            <Link to={`/profile/${post.author?._id}`} className="font-semibold mr-1.5 hover:underline">
              {post.author?.displayName}
            </Link>
            {post.title}
          </p>
          {post.description && (
            <p className="text-sm text-gray-700 mt-0.5 leading-relaxed line-clamp-3">
              {post.description}
            </p>
          )}

          {/* Custom tags */}
          {post.customTags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {post.customTags.map((tag, i) => (
                <span key={i} className="text-sm text-blue-600 font-medium hover:underline cursor-pointer">
                  #{tag.replace(/^#/, '')}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Comments Section ──────────────────────────────────────────────── */}
        {showComments && <CommentSection postId={post._id} />}
      </article>

      {showChat && (
        <ChatRoom postId={post._id} postTitle={post.title} hashtag={post.hashtag} onClose={() => setShowChat(false)} />
      )}
      {showContact && (
        <ContactModal post={post} onClose={() => setShowContact(false)} />
      )}
    </>
  );
};

export default PostCard;
