/**
 * src/components/AnnouncementStories.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Instagram Stories-style ephemeral announcements.
 *
 * Features:
 *   - Horizontal scrollable ring strip at the top of the feed
 *   - Gradient ring = unseen, gray ring = seen
 *   - Club/Admin: first item is a "+" Create button
 *   - Click any ring → full-screen story viewer with auto-advancing progress bar
 *   - Create modal: text, image URL, duration 1-48hr
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { formatDistanceToNow } from 'date-fns';
import { X, Plus, Clock, Image, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const STORY_DURATION_MS = 6000; // each slide shows for 6 seconds

const DURATION_OPTIONS = [
  { label: '1 hour',   value: 1 },
  { label: '2 hours',  value: 2 },
  { label: '6 hours',  value: 6 },
  { label: '12 hours', value: 12 },
  { label: '24 hours', value: 24 },
  { label: '48 hours', value: 48 },
];

// ── Ring gradient for unseen stories (like Instagram)
const RING_GRADIENT = 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)';

// ── Helpers
const avatarInitial = (name) => (name || '?').charAt(0).toUpperCase();

const roleBg = (role) => {
  if (role === 'Club')  return '#7c3aed';
  if (role === 'Admin') return '#dc2626';
  return '#4f46e5';
};

// ── StoryRing: a single avatar circle in the strip
const StoryRing = ({ announcement, userId, onClick, isCreate = false, onCreateClick }) => {
  if (isCreate) {
    return (
      <button
        className="story-ring-btn story-ring-create"
        onClick={onCreateClick}
        title="Create announcement"
      >
        <div className="story-avatar-wrap">
          <div className="story-avatar" style={{ background: '#4f46e5' }}>
            <Plus size={20} color="#fff" />
          </div>
        </div>
        <span className="story-label">Your Story</span>
      </button>
    );
  }

  const seen = (announcement.seenBy || []).map(id => id?.toString()).includes(userId);
  const author = announcement.author;

  return (
    <button
      className="story-ring-btn"
      onClick={() => onClick(announcement)}
      title={author?.displayName}
    >
      <div className="story-avatar-wrap">
        <div
          className="story-ring"
          style={{ background: seen ? '#d1d5db' : RING_GRADIENT }}
        >
          <div className="story-avatar-inner">
            {author?.avatarUrl
              ? <img src={author.avatarUrl} alt="" className="story-avatar-img" />
              : <div className="story-avatar" style={{ background: roleBg(author?.role) }}>{avatarInitial(author?.displayName)}</div>
            }
          </div>
        </div>
      </div>
      <span className="story-label">{author?.displayName?.split(' ')[0] || 'Club'}</span>
    </button>
  );
};

// ── StoryViewer: full-screen overlay
const StoryViewer = ({ stories, startIndex = 0, onClose, userId, onDeleted }) => {
  const [idx, setIdx]       = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const { user } = useAuth();

  const story = stories[idx];

  const markSeen = useCallback(async (ann) => {
    if (!ann) return;
    const alreadySeen = (ann.seenBy || []).map(id => id?.toString()).includes(userId);
    if (!alreadySeen) {
      try { await api.post(`/announcements/${ann._id}/seen`); } catch { /* silent */ }
    }
  }, [userId]);

  const goNext = useCallback(() => {
    if (idx < stories.length - 1) { setIdx(i => i + 1); setProgress(0); }
    else onClose();
  }, [idx, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (idx > 0) { setIdx(i => i - 1); setProgress(0); }
  }, [idx]);

  // Mark current story seen
  useEffect(() => {
    markSeen(story);
  }, [story, markSeen]);

  // Progress bar auto-advance
  useEffect(() => {
    setProgress(0);
    const step = 100 / (STORY_DURATION_MS / 50);
    timerRef.current = setInterval(() => {
      setProgress(p => {
        if (p + step >= 100) { clearInterval(timerRef.current); goNext(); return 100; }
        return p + step;
      });
    }, 50);
    return () => clearInterval(timerRef.current);
  }, [idx, goNext]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await api.delete(`/announcements/${story._id}`);
      onDeleted?.(story._id);
      if (stories.length <= 1) onClose();
      else goNext();
    } catch { /* silent */ }
  };

  if (!story) return null;

  const canDelete = story.author?._id === user?._id || story.author === user?._id || user?.role === 'Admin';
  const timeLeft  = story.expiresAt ? formatDistanceToNow(new Date(story.expiresAt), { addSuffix: true }) : '';

  return (
    <div className="story-overlay" onClick={onClose}>
      <div className="story-card" onClick={e => e.stopPropagation()}>

        {/* Progress bars */}
        <div className="story-progress-row">
          {stories.map((_, i) => (
            <div key={i} className="story-progress-track">
              <div
                className="story-progress-fill"
                style={{ width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="story-header">
          <div className="story-header-left">
            <div className="story-viewer-avatar">
              {story.author?.avatarUrl
                ? <img src={story.author.avatarUrl} alt="" className="story-avatar-img" />
                : <div className="story-avatar" style={{ background: roleBg(story.author?.role) }}>{avatarInitial(story.author?.displayName)}</div>
              }
            </div>
            <div>
              <div className="story-viewer-name">{story.author?.displayName}</div>
              <div className="story-viewer-time">Expires {timeLeft}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {canDelete && (
              <button className="story-close-btn" onClick={handleDelete} title="Delete">
                <Trash2 size={18} />
              </button>
            )}
            <button className="story-close-btn" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        {/* Content */}
        <div className="story-content">
          {story.imageUrl && (
            <img src={story.imageUrl} alt="" className="story-image" />
          )}
          {story.text && (
            <div className="story-text-bubble">
              <p className="story-text">{story.text}</p>
            </div>
          )}
        </div>

        {/* Navigation tap zones */}
        <button className="story-nav story-nav-left" onClick={goPrev} />
        <button className="story-nav story-nav-right" onClick={goNext} />
      </div>
    </div>
  );
};

// ── CreateAnnouncementModal
const CreateAnnouncementModal = ({ onClose, onCreated }) => {
  const [text, setText]             = useState('');
  const [imageUrl, setImageUrl]     = useState('');
  const [duration, setDuration]     = useState(24);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim() && !imageUrl.trim()) {
      setError('Please add some text or an image URL.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/announcements', {
        text:          text.trim(),
        imageUrl:      imageUrl.trim() || undefined,
        durationHours: duration,
      });
      onCreated(data.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create announcement.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="story-create-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="story-create-modal">
        <div className="story-create-header">
          <span className="story-create-title">New Announcement</span>
          <button className="story-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="story-create-form">
          {error && <p className="story-create-error">{error}</p>}

          <div className="story-create-field">
            <label className="story-create-label">Message</label>
            <textarea
              className="story-create-textarea"
              placeholder="Share an announcement with your followers…"
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={500}
              rows={4}
            />
            <span className="story-create-charcount">{text.length}/500</span>
          </div>

          <div className="story-create-field">
            <label className="story-create-label">
              <Image size={14} style={{ display: 'inline', marginRight: 4 }} />
              Image URL (optional)
            </label>
            <input
              className="story-create-input"
              placeholder="https://…"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
            />
          </div>

          <div className="story-create-field">
            <label className="story-create-label">
              <Clock size={14} style={{ display: 'inline', marginRight: 4 }} />
              Disappears after
            </label>
            <div className="story-duration-grid">
              {DURATION_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`story-duration-btn${duration === opt.value ? ' story-duration-btn--active' : ''}`}
                  onClick={() => setDuration(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="story-create-submit"
            disabled={loading}
          >
            {loading ? 'Posting…' : 'Share Announcement'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ── Main AnnouncementStories component
const AnnouncementStories = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [viewerAnn,     setViewerAnn]     = useState(null);  // announcement to open in viewer
  const [showCreate,    setShowCreate]    = useState(false);
  const [loading,       setLoading]       = useState(true);

  const isClubOrAdmin = user?.role === 'Club' || user?.role === 'Admin';
  const userId = user?._id;

  const fetchAnnouncements = useCallback(async () => {
    try {
      const { data } = await api.get('/announcements');
      setAnnouncements(data.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const handleCreated = (ann) => {
    setAnnouncements(prev => [ann, ...prev]);
  };

  const handleDeleted = (id) => {
    setAnnouncements(prev => prev.filter(a => a._id !== id));
  };

  const handleMarkSeen = (id) => {
    setAnnouncements(prev =>
      prev.map(a => a._id === id
        ? { ...a, seenBy: [...(a.seenBy || []), userId] }
        : a
      )
    );
  };

  // Nothing to show
  if (!loading && announcements.length === 0 && !isClubOrAdmin) return null;

  return (
    <>
      <div className="stories-strip-wrap">
        <div className="stories-strip">
          {/* Create button for club/admin */}
          {isClubOrAdmin && (
            <StoryRing isCreate onCreateClick={() => setShowCreate(true)} />
          )}

          {/* Announcement rings */}
          {loading
            ? [1, 2, 3].map(i => (
                <div key={i} className="story-ring-btn">
                  <div className="story-avatar-wrap">
                    <div className="story-ring" style={{ background: '#e5e7eb' }}>
                      <div className="story-avatar-inner">
                        <div className="story-avatar" style={{ background: '#f3f4f6' }} />
                      </div>
                    </div>
                  </div>
                  <span className="story-label" style={{ background: '#e5e7eb', color: 'transparent', borderRadius: 4 }}>Loading</span>
                </div>
              ))
            : announcements.map(ann => (
                <StoryRing
                  key={ann._id}
                  announcement={ann}
                  userId={userId}
                  onClick={(a) => {
                    setViewerAnn(a);
                    handleMarkSeen(a._id);
                  }}
                />
              ))
          }
        </div>
      </div>

      {/* Story viewer */}
      {viewerAnn && (
        <StoryViewer
          stories={announcements}
          startIndex={announcements.findIndex(a => a._id === viewerAnn._id)}
          onClose={() => setViewerAnn(null)}
          userId={userId}
          onDeleted={handleDeleted}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateAnnouncementModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
};

export default AnnouncementStories;
