/**
 * src/pages/ComplaintsPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Anonymous complaints board.
 */

import React, { useState, useEffect, useCallback } from 'react';
import api         from '../utils/api';
import { useAuth } from '../context/AuthContext';

const STATUS_STYLES = {
  Open:     'bg-orange-100 text-orange-800 border-orange-200',
  Resolved: 'bg-green-100 text-green-800 border-green-200',
};

const ComplaintsPage = () => {
  const { user }  = useAuth();
  const isAdmin   = user?.role === 'Admin';

  const [complaints, setComplaints] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showForm,   setShowForm]   = useState(false);
  const [filter,     setFilter]     = useState('');
  const [form, setForm]   = useState({ title: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState('');

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      const { data } = await api.post('/complaints', form);
      setComplaints((prev) => [data.data, ...prev]);
      setForm({ title: '', description: '' });
      setShowForm(false);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to submit complaint.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusToggle = async (complaint) => {
    const newStatus = complaint.status === 'Open' ? 'Resolved' : 'Open';
    try {
      const { data } = await api.patch(`/complaints/${complaint._id}`, { status: newStatus });
      setComplaints((prev) => prev.map((c) => c._id === complaint._id ? data.data : c));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status.');
    }
  };

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
            <span>
              Author information is stripped server-side. Your complaint is fully anonymous.
            </span>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {['', 'Open', 'Resolved'].map((s) => (
            <button
              key={s || 'all'}
              onClick={() => setFilter(s)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-full border transition-all ${
                filter === s
                  ? 'bg-gray-900 border-gray-900 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s || 'All'}
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
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-gray-500">No complaints filed yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {complaints.map((c) => (
              <div key={c._id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_STYLES[c.status]}`}>
                        {c.status}
                      </span>
                      {isAdmin && c.author && (
                        <span className="text-xs text-gray-500 font-medium">
                          by {c.author.displayName} ({c.author.rollNo})
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 text-base">{c.title}</h3>
                    <p className="text-gray-700 text-sm mt-1.5 leading-relaxed">{c.description}</p>
                    <p className="text-xs text-gray-400 mt-3 font-medium">
                      {new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => handleStatusToggle(c)}
                      className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                        c.status === 'Open'
                          ? 'border-gray-300 text-gray-700 hover:border-green-500 hover:text-green-600 hover:bg-green-50'
                          : 'border-gray-300 text-gray-700 hover:border-orange-500 hover:text-orange-600 hover:bg-orange-50'
                      }`}
                    >
                      {c.status === 'Open' ? 'Mark Resolved' : 'Reopen'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5 border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">File a Complaint</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-900">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
              
              <input className="input-base font-semibold" value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} placeholder="Subject" maxLength={150} required />
              <textarea className="input-base resize-none" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} placeholder="Describe the issue anonymously..." rows={5} maxLength={2000} required />
              
              <button type="submit" disabled={submitting} className="w-full btn-primary bg-gray-900 hover:bg-gray-800 text-white mt-2">
                {submitting ? 'Submitting…' : 'Submit Anonymously'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplaintsPage;
