/**
 * src/components/PostCard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Instagram-inspired post card with likes, dislikes, comments, hashtag actions.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ThumbsDown, MessageCircle, Trash2, Bookmark, Share2, MoreHorizontal, Flag, ShoppingBag } from 'lucide-react';
import HashtagBadge   from './HashtagBadge';
import CountdownTimer from './CountdownTimer';
import ContactModal   from './ContactModal';
import CommentSection from './CommentSection';
import { useAuth }    from '../context/AuthContext';
import api            from '../utils/api';

const CHAT_HASHTAGS    = new Set(['#foodsplit', '#cabsplit', '#resell']);
const CONTACT_HASHTAGS = new Set(['#lost', '#found']);
const TIMED_HASHTAGS   = new Set(['#foodsplit', '#cabsplit']);

const PostCard = ({ post: initialPost, onPostDeleted, hideDelete = false }) => {
  const { user }   = useAuth();
  const navigate = useNavigate();
  const [post, setPost] = useState(initialPost);

  const [showChat,     setShowChat]     = useState(false);
  const [showContact,  setShowContact]  = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [liking,       setLiking]       = useState(false);
  const [disliking,    setDisliking]    = useState(false);
  const [roomClosed,   setRoomClosed]   = useState(false);
  const [isSaved,      setIsSaved]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [shareToast,   setShareToast]   = useState(false);
  const [showMenu,     setShowMenu]     = useState(false);
  const [reporting,    setReporting]    = useState(false);
  const [reportDone,   setReportDone]   = useState(false);
  const [reportToast,  setReportToast]  = useState(false);
  const [markingSold,  setMarkingSold]  = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const userId      = user?._id;
  const isAuthor    = userId === post.author?._id;
  const isAdmin     = user?.role === 'Admin';

  const hasLiked    = (post.likes    || []).map(id => id?.toString()).includes(userId);
  const hasDisliked = (post.dislikes || []).map(id => id?.toString()).includes(userId);

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

  // ── Report ───────────────────────────────────────────────────────────────
  const handleReport = async () => {
    if (reporting || reportDone) return;
    setReporting(true);
    try {
      await api.post(`/posts/${post._id}/report`);
      setReportDone(true);
      setReportToast(true);
      setTimeout(() => setReportToast(false), 3000);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit report.');
    } finally {
      setReporting(false);
    }
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

  // ── Mark as Sold (#resell only) ─────────────────────────────────────────
  const handleMarkAsSold = async () => {
    if (!window.confirm('Mark this item as sold? This will close the chat room.')) return;
    setMarkingSold(true);
    try {
      await api.patch(`/chat-rooms/${post._id}/close`);
      setRoomClosed(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to close room.');
    } finally {
      setMarkingSold(false);
    }
  };

  const handleHashtagAction = async () => {
    if (CHAT_HASHTAGS.has(post.hashtag)) {
      try {
        const { data } = await api.post(`/rooms/from-post/${post._id}`);
        navigate(`/chat?room=${data.data._id}`);
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to open chat room.');
      }
    }
    else if (CONTACT_HASHTAGS.has(post.hashtag)) setShowContact(true);
  };

  // ── Render description with @mention links ───────────────────────────────
  const renderDescription = (text) => {
    if (!text) return null;
    const mentionMap = {};
    (post.mentions || []).forEach(m => {
      if (m?.displayName) mentionMap[m.displayName.toLowerCase()] = m._id;
    });
    const parts = text.split(/(@[\S]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const handle = part.slice(1);
        const uid = mentionMap[handle.toLowerCase()];
        if (uid) {
          return <Link key={i} to={`/profile/${uid}`} className="text-indigo-600 font-medium hover:underline">{part}</Link>;
        }
      }
      return <span key={i}>{part}</span>;
    });
  };

  // ── Save (bookmark) ────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (saving) return;
    // Optimistic toggle
    setIsSaved(prev => !prev);
    setSaving(true);
    try {
      const { data } = await api.post(`/posts/${post._id}/save`);
      setIsSaved(data.saved);
    } catch (err) {
      // Revert on failure
      setIsSaved(prev => !prev);
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [post._id, saving]);

  // ── Share (copy link) ───────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/feed?post=${post._id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
      }
    } catch (err) {
      // User cancelled share or clipboard unavailable
      console.error(err);
    }
  }, [post._id, post.title]);

  const ctaLabel = roomClosed ? null : ({
    '#foodsplit': '🍕 Join Foodsplit',
    '#cabsplit':  '🚕 Join Cabsplit',
    '#resell':    'Chat to Buy',
    '#lost':      'View Contact',
    '#found':     'View Contact',
  }[post.hashtag] || null);

  const ctaClosedLabel = roomClosed ? (
    {
      '#foodsplit': 'Order Closed 🔒',
      '#cabsplit':  'Ride Full 🔒',
      '#resell':    'Sold 🔒',
    }[post.hashtag] || null
  ) : null;

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

          {/* Options — 3-dot context menu: Delete (author/admin) + Report (non-author) */}
          {!hideDelete && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(v => !v)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="More options"
                id={`post-menu-${post._id}`}
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px] animate-[fadeIn_0.1s_ease_forwards]">
                  {/* Delete — only author or admin */}
                  {(isAuthor || isAdmin) && (
                    <button
                      onClick={() => { setShowMenu(false); handleDelete(); }}
                      disabled={deleting}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
                      id={`post-delete-${post._id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                      {deleting ? 'Deleting…' : 'Delete Post'}
                    </button>
                  )}
                  {/* Mark as Sold — #resell author only, while room is open */}
                  {isAuthor && post.hashtag === '#resell' && !roomClosed && (
                    <button
                      onClick={() => { setShowMenu(false); handleMarkAsSold(); }}
                      disabled={markingSold}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50 transition-colors font-medium"
                      id={`post-sold-${post._id}`}
                    >
                      <ShoppingBag className="w-4 h-4" />
                      {markingSold ? 'Closing…' : '✅ Mark as Sold'}
                    </button>
                  )}
                  {/* Report — only non-authors */}
                  {!isAuthor && (
                    <button
                      onClick={() => { setShowMenu(false); handleReport(); }}
                      disabled={reporting || reportDone}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors font-medium ${
                        reportDone
                          ? 'text-gray-400 cursor-default'
                          : 'text-amber-600 hover:bg-amber-50'
                      }`}
                      id={`post-report-${post._id}`}
                    >
                      <Flag className="w-4 h-4" />
                      {reportDone ? 'Reported ✓' : reporting ? 'Reporting…' : 'Report Post'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Report submitted toast */}
          {reportToast && (
            <span
              className="absolute right-0 -bottom-8 whitespace-nowrap
                         text-[11px] font-medium bg-amber-700 text-white px-2.5 py-1
                         rounded-full shadow-lg pointer-events-none z-40
                         animate-[fadeIn_0.15s_ease_forwards]"
            >
              🚩 Report submitted
            </span>
          )}
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

            {/* CTA — three mutually-exclusive states */}
            {ctaLabel && !isExpired && (
              <button
                onClick={handleHashtagAction}
                className="text-xs font-semibold px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-full transition-colors"
              >
                {ctaLabel}
              </button>
            )}
            {ctaClosedLabel && (
              <span className="text-xs text-gray-400 font-semibold italic">
                {ctaClosedLabel}
              </span>
            )}
            {!roomClosed && isExpired && (ctaLabel || post.hashtag !== 'None') && (
              <span className="text-xs text-gray-400 italic">Expired</span>
            )}

            {/* ── Right-side actions: Share + Save ─────────────────────────── */}
            <div className="ml-auto flex items-center gap-2">
              {/* Share */}
              <div className="relative">
                <button
                  onClick={handleShare}
                  className="p-1.5 group transition-transform active:scale-90 rounded-full hover:bg-gray-100"
                  aria-label="Share post"
                  title="Copy link"
                >
                  <Share2 className="w-5 h-5 text-gray-500 group-hover:text-blue-500 transition-colors" />
                </button>
                {/* Clipboard toast */}
                {shareToast && (
                  <span
                    className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap
                               text-[11px] font-medium bg-gray-900 text-white px-2.5 py-1
                               rounded-full shadow-lg pointer-events-none
                               animate-[fadeIn_0.15s_ease_forwards]"
                  >
                    🔗 Link copied!
                  </span>
                )}
              </div>

              {/* Save (Bookmark) */}
              <button
                onClick={handleSave}
                disabled={saving}
                className={`p-1.5 group transition-transform active:scale-90 rounded-full hover:bg-amber-50 ${
                  saving ? 'opacity-50' : ''
                }`}
                aria-label={isSaved ? 'Unsave post' : 'Save post'}
                title={isSaved ? 'Unsave' : 'Save'}
              >
                <Bookmark
                  className={`w-5 h-5 transition-all duration-150 ${
                    isSaved
                      ? 'fill-amber-500 text-amber-500 scale-110'
                      : 'text-gray-500 group-hover:text-amber-500'
                  }`}
                />
              </button>
            </div>
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

          {/* ── CabSplit Fare Badge ──────────────────────────────────────── */}
          {post.hashtag === '#cabsplit' && post.totalFare != null && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-3 py-1.5">
              <span className="text-base font-bold">🚕</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-blue-500">Total Fare</span>
              <span className="text-sm font-bold text-blue-700">₹{post.totalFare.toLocaleString('en-IN')}</span>
            </div>
          )}

          {post.description && (
            <div className="mt-0.5">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {renderDescription(post.description)}
              </p>
              
              {/* ── Google Forms Embed (Club/Admin only) ────────────────────── */}
              {(post.author?.role === 'Club' || post.author?.role === 'Admin') &&
                post.description.match(/(https:\/\/(?:docs\.google\.com\/forms\/|forms\.gle\/)[^\s]+)/) && (
                <div className="mt-3 w-full rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-50">
                  <iframe
                    src={post.description.match(/(https:\/\/(?:docs\.google\.com\/forms\/|forms\.gle\/)[^\s]+)/)[1]}
                    width="100%"
                    height="450"
                    frameBorder="0"
                    marginHeight="0"
                    marginWidth="0"
                    title="Embedded Form"
                    className="w-full bg-white"
                  >
                    Loading form…
                  </iframe>
                </div>
              )}
            </div>
          )}

          {/* ── Linked Event Badge ─────────────────────────────────── */}
          {post.linkedEvent && (
            <Link
              to="/calendar"
              className="mt-3 flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2.5 hover:bg-indigo-100 transition-colors group"
            >
              <span className="text-xl">📅</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Campus Event</p>
                <p className="text-sm font-semibold text-indigo-900 truncate">
                  {post.linkedEvent?.title || 'View on Calendar'}
                </p>
                {post.linkedEvent?.date && (
                  <p className="text-xs text-indigo-500 mt-0.5">
                    {new Date(post.linkedEvent.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {post.linkedEvent.venue ? ` · ${post.linkedEvent.venue}` : ''}
                  </p>
                )}
              </div>
              <span className="text-indigo-400 group-hover:text-indigo-600 transition-colors text-xs font-medium">View →</span>
            </Link>
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

      {/* Chat modal has been migrated to global Chat Hub */}
      {showContact && (
        <ContactModal post={post} onClose={() => setShowContact(false)} />
      )}
    </>
  );
};

export default PostCard;
