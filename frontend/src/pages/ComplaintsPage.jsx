/**
 * src/pages/ComplaintsPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Anonymous complaints board.
 * Features: upvotes, similar-complaint detection while filing, author edit.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ThumbsUp, Pencil, X, Check } from 'lucide-react';
import api         from '../utils/api';
import { useAuth } from '../context/AuthContext';

const STATUS_STYLES = {
  Open:                 'bg-orange-100 text-orange-800 border-orange-200',
  Resolved:             'bg-amber-100 text-amber-800 border-amber-200',
  Declined:             'bg-red-100 text-red-800 border-red-200',
  'Resolved (Verified)': 'bg-green-100 text-green-800 border-green-200',
};

// Stop words excluded from the similarity search
const STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','has','have','had','be','been',
  'do','does','did','will','would','could','should','may','might','can',
  'of','in','on','at','to','for','with','by','from','as','and','or','but',
  'not','this','that','these','those','it','we','i','you','they','he','she',
]);

const extractKeywords = (text) =>
  text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

/* ─── UpvoteButton ─────────────────────────────────────────────────────────── */
const UpvoteButton = ({ complaintId, initialCount, initialVoted, onUpvoted }) => {
  const [count,   setCount]   = useState(initialCount);
  const [voted,   setVoted]   = useState(initialVoted);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/complaints/${complaintId}/upvote`);
      setCount(data.upvotes);
      setVoted(data.upvoted);
      onUpvoted?.(complaintId, data.upvotes);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
        voted
          ? 'border-blue-400 bg-blue-50 text-blue-700'
          : 'border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50'
      }`}
    >
      <ThumbsUp className="w-3.5 h-3.5" />
      {count}
    </button>
  );
};

/* ─── InlineEditForm ───────────────────────────────────────────────────────── */
const InlineEditForm = ({ complaint, onSaved, onCancel }) => {
  const [form,  setForm]  = useState({ title: complaint.title, description: complaint.description });
  const [saving, setSaving] = useState(false);
  const [err,   setErr]   = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const { data } = await api.patch(`/complaints/${complaint._id}/edit`, form);
      onSaved(data.data);
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Failed to save.');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t border-gray-100 pt-3">
      {err && <p className="text-xs text-red-600">{err}</p>}
      <input
        className="input-base text-sm font-semibold"
        value={form.title}
        onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
        maxLength={150}
        required
      />
      <textarea
        className="input-base resize-none text-sm"
        value={form.description}
        onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
        rows={4}
        maxLength={2000}
        required
      />
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors">
          <Check className="w-3.5 h-3.5" />{saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
          <X className="w-3.5 h-3.5" />Cancel
        </button>
      </div>
    </form>
  );
};

/* ─── Main page ────────────────────────────────────────────────────────────── */
const ComplaintsPage = () => {
  const { user }  = useAuth();
  const isAdmin   = user?.role === 'Admin';

  const [complaints, setComplaints] = useState([]);
  const [myIds,       setMyIds]       = useState(new Set());   // IDs filed by current user
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showForm,   setShowForm]   = useState(false);
  const [filter,     setFilter]     = useState('');
  const [form,       setForm]       = useState({ title: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState('');

  // Similar complaints (shown while typing title)
  const [similar,      setSimilar]      = useState([]);
  const [searchingDup, setSearchingDup] = useState(false);
  const dupTimer = useRef(null);

  // Declining modal
  const [declineTarget, setDeclineTarget] = useState(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declining,     setDeclining]     = useState(false);

  // Editing
  const [editingId, setEditingId] = useState(null);

  // Fetch IDs of complaints filed by this user
  useEffect(() => {
    if (isAdmin) return;
    api.get('/complaints/mine')
      .then(({ data }) => setMyIds(new Set(data.data)))
      .catch(() => {});
  }, [isAdmin]);

  const isMyComplaint = (c) => myIds.has(c._id);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: 50 });
      if (filter) params.set('status', filter);
      const { data } = await api.get(`/complaints?${params}`);
      setComplaints(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load complaints.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchComplaints(); }, [fetchComplaints]);

  // Live duplicate search as user types the title
  const handleTitleChange = (val) => {
    setForm(p => ({ ...p, title: val }));
    clearTimeout(dupTimer.current);
    const kws = extractKeywords(val);
    if (kws.length === 0) { setSimilar([]); return; }
    setSearchingDup(true);
    dupTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/complaints/search?q=${encodeURIComponent(val)}`);
        setSimilar(data.data || []);
      } catch { setSimilar([]); }
      finally { setSearchingDup(false); }
    }, 400);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      const { data } = await api.post('/complaints', form);
      const newId = data.data._id;
      setMyIds((prev) => new Set([...prev, newId]));
      setComplaints(prev => [data.data, ...prev]);
      setForm({ title: '', description: '' });
      setSimilar([]);
      setShowForm(false);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to submit complaint.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusToggle = async (complaint, forceStatus = null) => {
    const newStatus = forceStatus || (complaint.status === 'Open' ? 'Resolved' : 'Open');
    try {
      const { data } = await api.patch(`/complaints/${complaint._id}`, { status: newStatus });
      setComplaints(prev => prev.map(c => c._id === complaint._id ? data.data : c));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status.');
    }
  };

  const handleVerify = async (complaint) => {
    try {
      const { data } = await api.patch(`/complaints/${complaint._id}`, { status: 'Resolved (Verified)' });
      setComplaints(prev => prev.map(c => c._id === complaint._id ? data.data : c));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to verify.');
    }
  };

  const handleReopen = async (complaint) => {
    try {
      const { data } = await api.patch(`/complaints/${complaint._id}`, { status: 'Open' });
      setComplaints(prev => prev.map(c => c._id === complaint._id ? data.data : c));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reopen.');
    }
  };

  const handleDeclineSubmit = async (e) => {
    e.preventDefault();
    if (!declineReason.trim()) return;
    setDeclining(true);
    try {
      const { data } = await api.patch(`/complaints/${declineTarget._id}`, { status: 'Declined', declineReason: declineReason.trim() });
      setComplaints(prev => prev.map(c => c._id === declineTarget._id ? data.data : c));
      setDeclineTarget(null);
      setDeclineReason('');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to decline complaint.');
    } finally {
      setDeclining(false);
    }
  };

  // Upvote directly from the "similar complaints" suggestion panel
  const handleSimilarUpvote = async (id) => {
    try {
      const { data } = await api.post(`/complaints/${id}/upvote`);
      setSimilar(prev => prev.map(c => c._id === id ? { ...c, upvoteCount: data.upvotes } : c));
    } catch { /* silent */ }
  };

  const closeForm = () => { setShowForm(false); setSimilar([]); setForm({ title: '', description: '' }); };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-12">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Complaints</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isAdmin ? 'Visible to Admins only.' : 'Completely anonymous board.'}
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            File Issue
          </button>
        </div>

        {/* Privacy banner */}
        {!isAdmin && (
          <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800 flex items-start gap-3 shadow-sm">
            <span className="text-xl leading-none">🛡️</span>
            <span>Author information is stripped server-side. Your complaint is fully anonymous.</span>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { value: '',                    label: 'All'      },
            { value: 'Open',                label: '🔴 Open'  },
            { value: 'Resolved',            label: '🟡 Resolved' },
            { value: 'Resolved (Verified)', label: '✅ Verified' },
            { value: 'Declined',            label: '❌ Declined' },
          ].map(({ value, label }) => (
            <button
              key={value || 'all'}
              onClick={() => setFilter(value)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-full border transition-all ${
                filter === value ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse shadow-sm">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center text-red-500 py-8">{error}</div>
        ) : complaints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shadow-inner animate-pulse">
                <span className="text-5xl select-none">🛡️</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md border border-gray-100">
                <span className="text-lg">📝</span>
              </div>
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              {filter ? `No ${filter} complaints` : 'The board is clean'}
            </h3>
            <p className="text-sm text-gray-500 max-w-xs mb-6 leading-relaxed">
              {filter
                ? `No complaints with status "${filter}" have been filed yet. Try a different filter.`
                : 'Be the first to raise an issue. All complaints are anonymous — your identity is never stored.'}
            </p>
            {!filter && (
              <button
                onClick={() => setShowForm(true)}
                className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-full transition-all shadow-md hover:shadow-lg active:scale-95"
              >
                📢 File the First Issue
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {complaints.map(c => {
              const isAuthor  = c.author?._id === user?._id || (!c.author && false); // author is stripped for non-admins
              const myUpvotes = (c.upvotes || []).map(id => id?.toString()).filter(Boolean);
              const voted     = myUpvotes.includes(user?._id?.toString());
              const count     = (c.upvotes || []).length;

              return (
                <div key={c._id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Badges row */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_STYLES[c.status]}`}>
                          {c.status}
                        </span>
                        {c.isEdited && (
                          <span className="text-[10px] font-semibold text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">edited</span>
                        )}
                        {!isAdmin && isMyComplaint(c) && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200 uppercase tracking-wider">
                            My Complaint
                          </span>
                        )}
                        {isAdmin && c.author && (
                          <span className="text-xs text-gray-500 font-medium">
                            by {c.author.displayName} ({c.author.rollNo})
                          </span>
                        )}
                      </div>

                      {editingId === c._id ? (
                        <InlineEditForm
                          complaint={c}
                          onSaved={updated => {
                            setComplaints(prev => prev.map(x => x._id === c._id ? { ...x, ...updated } : x));
                            setEditingId(null);
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <>
                          <h3 className="font-semibold text-gray-900 text-base">{c.title}</h3>
                          <p className="text-gray-700 text-sm mt-1.5 leading-relaxed">{c.description}</p>

                           {c.status === 'Resolved (Verified)' && (
                            <div className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs font-semibold text-green-800">
                              <span className="text-sm">✅</span>
                              <span>Resolution verified by author.</span>
                            </div>
                          )}

                          {!isAdmin && c.status === 'Resolved' && isMyComplaint(c) && (
                            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                              <p className="text-xs font-semibold text-amber-900 mb-2">
                                🟡 Admin marked this as resolved. Has your issue been fixed?
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleVerify(c)}
                                  className="inline-flex items-center justify-center text-xs font-bold px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors shadow-sm"
                                >
                                  Yes, Resolved
                                </button>
                                <button
                                  onClick={() => handleReopen(c)}
                                  className="inline-flex items-center justify-center text-xs font-bold px-3 py-1.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-md transition-colors shadow-sm"
                                >
                                  No, Reopen
                                </button>
                              </div>
                            </div>
                          )}

                          {!isAdmin && c.status === 'Resolved' && !isMyComplaint(c) && (
                            <div className="mt-3 flex items-center gap-2 bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700 font-medium">
                              <span>🟡 Resolved by admin — awaiting author confirmation.</span>
                            </div>
                          )}

                          {c.status === 'Declined' && c.declineReason && (
                            <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-900">
                              <strong className="font-semibold text-red-950 block mb-1">Reason for declination:</strong>
                              {c.declineReason}
                            </div>
                          )}

                          <div className="flex items-center gap-3 mt-3">
                            <p className="text-xs text-gray-400 font-medium">
                              {new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                            {/* Author edit button — only shown when author checks out */}
                            {((isAdmin && c.author && c.author._id === user?._id) || (!isAdmin && isMyComplaint(c))) && (
                              <button
                                onClick={() => setEditingId(c._id)}
                                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Right column: upvote + admin actions */}
                    <div className="flex flex-col gap-2 flex-shrink-0 items-end">
                      <UpvoteButton
                        complaintId={c._id}
                        initialCount={count}
                        initialVoted={voted}
                        onUpvoted={(id, newCount) =>
                          setComplaints(prev => prev.map(x => x._id === id ? { ...x, upvotes: Array(newCount).fill(null) } : x))
                        }
                      />

                      {isAdmin && (
                        <>
                          {c.status === 'Open' ? (
                            <>
                              <button
                                onClick={() => handleStatusToggle(c, 'Resolved')}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:border-green-500 hover:text-green-600 hover:bg-green-50 transition-colors"
                              >
                                Resolve
                              </button>
                              <button
                                onClick={() => setDeclineTarget(c)}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:border-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                Decline
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleStatusToggle(c, 'Open')}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:border-orange-500 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                            >
                              Reopen
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* File Complaint Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={closeForm}>
          <div className="w-full max-w-lg bg-white border border-gray-200 rounded-xl shadow-xl p-6 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5 border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">File a Complaint</h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-900"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}

              {/* Title + live duplicate panel */}
              <div>
                <input
                  className="input-base font-semibold"
                  value={form.title}
                  onChange={e => handleTitleChange(e.target.value)}
                  placeholder="Subject"
                  maxLength={150}
                  required
                />

                {/* Similar complaints panel */}
                {(searchingDup || similar.length > 0) && (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-bold text-amber-800 mb-2">
                      {searchingDup ? 'Checking for similar complaints…' : `${similar.length} similar complaint${similar.length > 1 ? 's' : ''} found`}
                    </p>
                    {!searchingDup && similar.map(s => (
                      <div key={s._id} className="flex items-center justify-between gap-3 bg-white border border-amber-100 rounded-lg px-3 py-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{s.title}</p>
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${STATUS_STYLES[s.status]}`}>{s.status}</span>
                          <span className="text-[10px] text-gray-400 ml-2">{s.upvoteCount} upvote{s.upvoteCount !== 1 ? 's' : ''}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSimilarUpvote(s._id)}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors flex-shrink-0"
                        >
                          <ThumbsUp className="w-3 h-3" /> Upvote
                        </button>
                      </div>
                    ))}
                    {!searchingDup && (
                      <p className="text-[10px] text-amber-700 mt-1">You can upvote an existing complaint or continue filing your own below.</p>
                    )}
                  </div>
                )}
              </div>

              <textarea
                className="input-base resize-none"
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Describe the issue anonymously..."
                rows={5}
                maxLength={2000}
                required
              />

              <button type="submit" disabled={submitting} className="w-full btn-primary bg-gray-900 hover:bg-gray-800 text-white mt-2">
                {submitting ? 'Submitting…' : 'Submit Anonymously'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Decline Reason Modal */}
      {declineTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={() => setDeclineTarget(null)}>
          <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5 border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">Decline Complaint</h2>
              <button onClick={() => setDeclineTarget(null)} className="text-gray-400 hover:text-gray-900"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleDeclineSubmit} className="space-y-4">
              <p className="text-sm text-gray-600">Please provide a reason for declining this complaint. This will be visible to the student.</p>
              <textarea
                className="input-base resize-none"
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                placeholder="Reason for declination..."
                rows={4}
                maxLength={1000}
                required
              />
              <button type="submit" disabled={declining} className="w-full btn-primary bg-red-600 hover:bg-red-700 text-white mt-2 border-none">
                {declining ? 'Declining…' : 'Decline Complaint'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplaintsPage;
