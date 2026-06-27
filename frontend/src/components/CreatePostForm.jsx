/**
 * src/components/Feed/CreatePostForm.jsx
 */

import React, { useState, useRef, useCallback } from 'react';
import { X, Image, Hash, Clock, AtSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

const HASHTAGS = ['#foodsplit', '#cabsplit', '#resell', '#lost', '#found'];
const TIMED    = new Set(['#foodsplit', '#cabsplit']);

const HASHTAG_COLORS = {
  '#foodsplit': 'bg-orange-100 text-orange-800 border-orange-200',
  '#cabsplit':  'bg-blue-100 text-blue-800 border-blue-200',
  '#resell':    'bg-green-100 text-green-800 border-green-200',
  '#lost':      'bg-red-100 text-red-800 border-red-200',
  '#found':     'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const CreatePostForm = ({ onPostCreated, onClose, isClubOrAdmin = false }) => {
  const [form, setForm] = useState({ title: '', description: '', imageUrl: '', hashtag: '', expiresAt: '', customTagsStr: '', totalFare: '', linkedEvent: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [upcomingEvents, setUpcomingEvents] = useState([]);

  // Fetch upcoming approved events for Club/Admin to link
  React.useEffect(() => {
    if (!isClubOrAdmin) return;
    const today = new Date().toISOString().split('T')[0];
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    api.get(`/events?from=${today}&to=${future}`)
      .then(({ data }) => setUpcomingEvents(data.data?.filter(e => e.status === 'Approved') || []))
      .catch(() => {});
  }, [isClubOrAdmin]);

  // @mention autocomplete
  const [mentionQuery, setMentionQuery]     = useState('');
  const [mentionResults, setMentionResults] = useState([]);
  const [showMentions, setShowMentions]     = useState(false);
  const mentionTimer = useRef(null);
  const descRef      = useRef(null);

  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  // Detect @mention trigger in description
  const handleDescriptionChange = (e) => {
    const val = e.target.value;
    setForm(p => ({ ...p, description: val }));

    // Find if we're currently typing a @mention
    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const mentionMatch = textBefore.match(/@([\w.]*)$/);

    if (mentionMatch) {
      const query = mentionMatch[1];
      setMentionQuery(query);
      clearTimeout(mentionTimer.current);
      mentionTimer.current = setTimeout(async () => {
        if (query.length >= 1) {
          try {
            const { data } = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
            setMentionResults(data.data || []);
            setShowMentions(true);
          } catch { setShowMentions(false); }
        } else {
          setMentionResults([]);
          setShowMentions(false);
        }
      }, 200);
    } else {
      setShowMentions(false);
      setMentionResults([]);
    }
  };

  // Insert selected mention into description
  const insertMention = useCallback((user) => {
    const textarea = descRef.current;
    if (!textarea) return;
    const val = textarea.value;
    const cursor = textarea.selectionStart;
    const textBefore = val.slice(0, cursor);
    const replaced = textBefore.replace(/@[\w.]*$/, `@${user.displayName} `);
    const newVal = replaced + val.slice(cursor);
    setForm(p => ({ ...p, description: newVal }));
    setShowMentions(false);
    setMentionResults([]);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(replaced.length, replaced.length);
    }, 0);
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.description.trim()) return setError('Title & description are required.');
    if (!form.hashtag) return setError('You must select a primary hashtag.');
    if (!form.imageUrl?.trim()) return setError('An image URL is required.');
    if (TIMED.has(form.hashtag) && !form.expiresAt) return setError(`Expiry time required for ${form.hashtag}.`);

    setLoading(true);
    try {
      const customTags = form.customTagsStr.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        hashtag: form.hashtag,
        customTags,
        ...(form.imageUrl && { imageUrl: form.imageUrl.trim() }),
        ...(TIMED.has(form.hashtag) && { expiresAt: form.expiresAt }),
        ...(form.hashtag === '#cabsplit' && form.totalFare && { totalFare: Number(form.totalFare) }),
        ...(form.linkedEvent && { linkedEvent: form.linkedEvent }),
      };
      const { data } = await api.post('/posts', payload);
      onPostCreated?.(data.data);
      onClose?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create post.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-0 sm:px-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg bg-white sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button onClick={onClose} className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-gray-900">New Post</h2>
          <button
            type="submit"
            form="create-post-form"
            disabled={loading}
            className="text-sm font-bold text-blue-500 hover:text-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Sharing…' : 'Share'}
          </button>
        </div>

        {/* Form */}
        <form id="create-post-form" onSubmit={handleSubmit} className="px-5 py-4 space-y-4 max-h-[80vh] overflow-y-auto scrollbar-thin">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 animate-fade-in-up">{error}</p>
          )}

          {/* Title */}
          <input
            className="w-full text-lg font-semibold placeholder-gray-300 border-0 outline-none text-gray-900 bg-transparent"
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="Post title…"
            maxLength={120}
            required
          />

          {/* Description with @mention autocomplete */}
          <div className="relative">
            <textarea
              ref={descRef}
              className="w-full text-sm text-gray-700 placeholder-gray-400 border-0 outline-none resize-none bg-transparent leading-relaxed"
              name="description"
              value={form.description}
              onChange={handleDescriptionChange}
              placeholder="Write a caption… use @Name to mention someone"
              rows={4}
              maxLength={2000}
              required
            />
            {/* Mention autocomplete dropdown */}
            {showMentions && mentionResults.length > 0 && (
              <div className="absolute left-0 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden mt-1">
                {mentionResults.map(u => (
                  <button
                    key={u._id}
                    type="button"
                    onMouseDown={() => insertMention(u)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {u.avatarUrl
                        ? <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                        : <span className="text-xs font-bold text-indigo-600">{u.displayName?.charAt(0)?.toUpperCase()}</span>
                      }
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-900">{u.displayName}</span>
                      <span className="text-xs text-gray-400 ml-1.5">{u.role}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3">
            {/* Image URL */}
            <div className="flex items-center gap-3">
              <Image className="w-5 h-5 text-gray-400 flex-shrink-0" strokeWidth={1.8} />
              <input
                className="flex-1 text-sm text-gray-700 placeholder-gray-400 outline-none bg-transparent"
                name="imageUrl"
                value={form.imageUrl}
                onChange={handleChange}
                placeholder="Add image URL (optional)"
              />
            </div>

            {/* Custom tags */}
            <div className="flex items-center gap-3">
              <Hash className="w-5 h-5 text-gray-400 flex-shrink-0" strokeWidth={1.8} />
              <input
                className="flex-1 text-sm text-gray-700 placeholder-gray-400 outline-none bg-transparent"
                name="customTagsStr"
                value={form.customTagsStr}
                onChange={handleChange}
                placeholder="Custom tags (comma separated: tech, fest, nitrr)"
              />
            </div>

            {/* Action hashtag */}
            <div className="flex items-center gap-2 flex-wrap">
              {HASHTAGS.map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, hashtag: h }))}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                    form.hashtag === h
                      ? HASHTAG_COLORS[h]
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {h === 'None' ? 'No Action' : h}
                </button>
              ))}
            </div>

            {/* Expiry time for timed hashtags */}
            {TIMED.has(form.hashtag) && (
              <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-100 rounded-xl animate-fade-in-up">
                <Clock className="w-5 h-5 text-orange-500 flex-shrink-0" strokeWidth={1.8} />
                <input
                  type="datetime-local"
                  className="flex-1 text-sm text-gray-700 outline-none bg-transparent"
                  name="expiresAt"
                  value={form.expiresAt}
                  onChange={handleChange}
                  min={new Date().toISOString().slice(0, 16)}
                />
              </div>
            )}

            {/* Total fare for cabsplit */}
            {form.hashtag === '#cabsplit' && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl animate-fade-in-up">
                <span className="text-blue-500 font-bold text-base flex-shrink-0">₹</span>
                <input
                  type="number"
                  className="flex-1 text-sm text-gray-700 outline-none bg-transparent"
                  name="totalFare"
                  value={form.totalFare}
                  onChange={handleChange}
                  placeholder="Total cab fare (optional, e.g. 350)"
                  min="0"
                  step="1"
                />
              </div>
            )}
            {/* Link to Calendar Event (Club/Admin only) */}
            {isClubOrAdmin && upcomingEvents.length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                <span className="text-indigo-500 text-lg flex-shrink-0">📅</span>
                <select
                  className="flex-1 text-sm text-gray-700 outline-none bg-transparent"
                  name="linkedEvent"
                  value={form.linkedEvent}
                  onChange={handleChange}
                >
                  <option value="">Link to a Campus Event (optional)</option>
                  {upcomingEvents.map(ev => (
                    <option key={ev._id} value={ev._id}>
                      {ev.title} — {new Date(ev.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePostForm;
