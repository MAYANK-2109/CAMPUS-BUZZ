/**
 * src/pages/CalendarPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Month-view calendar displaying campus events.
 * Students see a "Request Event" form; Club/Admin can directly create events.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, parseISO,
} from 'date-fns';
import api         from '../utils/api';
import { useAuth } from '../context/AuthContext';

const getCalendarDays = (month) => {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end   = endOfWeek(endOfMonth(month),     { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CalendarPage = () => {
  const { user } = useAuth();
  const isCreator = user?.role === 'Club' || user?.role === 'Admin';
  const isAdmin   = user?.role === 'Admin';

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events,       setEvents]       = useState([]);
  const [selectedDay,  setSelectedDay]  = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [showForm,     setShowForm]     = useState(false);
  const [formLoading,  setFormLoading]  = useState(false);
  const [formError,    setFormError]    = useState('');
  const [form, setForm] = useState({
    title: '', date: '', time: '', venue: '', description: '',
    eventType: 'Offline', meetingLink: '', passcode: '', mapLink: ''
  });

  const days = getCalendarDays(currentMonth);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const to   = format(endOfMonth(currentMonth),   'yyyy-MM-dd');
      const { data } = await api.get(`/events?from=${from}&to=${to}`);
      setEvents(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const eventsForDay = (day) => events.filter((ev) => isSameDay(parseISO(ev.date), day));

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    try {
      const { data } = await api.post('/events', form);
      setEvents((prev) => [...prev, data.data]);
      setShowForm(false);
      setForm({ title: '', date: '', time: '', venue: '', description: '', eventType: 'Offline', meetingLink: '', passcode: '', mapLink: '' });
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to submit event.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.patch(`/events/${id}/status`, { status: 'Approved' });
      setEvents((prev) => prev.map((ev) => ev._id === id ? { ...ev, status: 'Approved' } : ev));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve event.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-12">
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Campus Calendar</h1>
            <p className="text-sm text-gray-500">Events & Announcements</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            {isCreator ? '+ Create Event' : '+ Request Event'}
          </button>
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between mb-4 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
          <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))} className="p-1 text-gray-400 hover:text-gray-900 font-bold text-lg">‹</button>
          <h2 className="font-semibold text-gray-900 text-lg">{format(currentMonth, 'MMMM yyyy')}</h2>
          <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))} className="p-1 text-gray-400 hover:text-gray-900 font-bold text-lg">›</button>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" /></div>
        ) : error ? (
          <div className="text-center text-red-500 py-8">{error}</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
              {WEEKDAYS.map(d => <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">{d}</div>)}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day) => {
                const dayEvents   = eventsForDay(day);
                const inMonth     = isSameMonth(day, currentMonth);
                const isSelected  = selectedDay && isSameDay(day, selectedDay);
                const todayClass  = isToday(day);

                return (
                  <button
                    key={day.toString()}
                    onClick={() => setSelectedDay(isSameDay(day, selectedDay) ? null : day)}
                    className={`min-h-[80px] p-2 border-b border-r border-gray-100 text-left transition-colors flex flex-col items-center sm:items-start ${!inMonth ? 'bg-gray-50/50 text-gray-400' : 'bg-white hover:bg-gray-50'} ${isSelected ? 'ring-2 ring-inset ring-blue-500 z-10' : ''}`}
                  >
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full mb-1 text-xs font-medium ${todayClass ? 'bg-blue-500 text-white' : (inMonth ? 'text-gray-700' : 'text-gray-400')}`}>
                      {format(day, 'd')}
                    </span>
                    <div className="w-full space-y-1 hidden sm:block">
                      {dayEvents.slice(0, 2).map(ev => (
                        <div key={ev._id} className={`truncate text-[10px] px-1.5 py-0.5 rounded font-medium ${ev.status === 'Pending' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                          {ev.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && <span className="text-gray-500 text-[10px] pl-1">+{dayEvents.length - 2} more</span>}
                    </div>
                    {/* Mobile dots indicator */}
                    <div className="sm:hidden flex gap-0.5 mt-auto mb-1">
                       {dayEvents.slice(0,3).map((ev, i) => <div key={i} className={`w-1.5 h-1.5 rounded-full ${ev.status === 'Pending' ? 'bg-orange-400' : 'bg-blue-500'}`} />)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Day details */}
        {selectedDay && (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4 text-lg border-b border-gray-100 pb-2">{format(selectedDay, 'EEEE, d MMMM yyyy')}</h3>
            {eventsForDay(selectedDay).length === 0 ? (
              <p className="text-gray-500 text-sm">No events scheduled.</p>
            ) : (
              <div className="space-y-4">
                {eventsForDay(selectedDay).map(ev => (
                  <div key={ev._id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 bg-gray-50 border border-gray-100 rounded-lg p-4">
                    <div>
                      <p className="font-semibold text-gray-900 text-base">
                        {ev.title}
                        <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full font-medium ${ev.eventType === 'Online' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                          {ev.eventType || 'Offline'}
                        </span>
                      </p>
                      <p className="text-sm text-gray-600 mt-1"><span className="font-medium">{ev.time}</span> • {ev.venue}</p>
                      
                      {ev.eventType === 'Online' && ev.meetingLink && (
                        <div className="mt-2 flex items-center gap-2">
                          <a href={ev.meetingLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline font-medium">Join Meeting</a>
                          {ev.passcode && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">Passcode: {ev.passcode}</span>}
                        </div>
                      )}
                      
                      {(ev.eventType === 'Offline' || !ev.eventType) && ev.mapLink && (
                        <div className="mt-2">
                          <a href={ev.mapLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline font-medium">View on Map</a>
                        </div>
                      )}

                      {ev.description && <p className="text-sm text-gray-700 mt-2">{ev.description}</p>}
                      <p className="text-xs text-gray-400 mt-3">Organized by {ev.createdBy?.displayName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${ev.status === 'Approved' ? 'bg-green-50 text-green-700 border-green-200' : ev.status === 'Rejected' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                        {ev.status}
                      </span>
                      {isAdmin && ev.status === 'Pending' && (
                        <button onClick={() => handleApprove(ev._id)} className="text-xs bg-white border border-gray-300 hover:border-green-500 text-gray-700 hover:text-green-600 font-medium px-3 py-1 rounded-full transition-colors shadow-sm">
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">{isCreator ? 'Create Event' : 'Request Event'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-900">✕</button>
            </div>

            {!isCreator && (
              <p className="text-xs text-orange-800 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-4">
                Your request will be reviewed by an Admin before appearing on the calendar.
              </p>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}

              <input className="input-base" name="title" value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} placeholder="Event Title" required />
              <input className="input-base" name="venue" value={form.venue} onChange={e => setForm(p => ({...p, venue: e.target.value}))} placeholder="Venue" required />
              
              {isCreator && (
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <input type="radio" name="eventType" value="Offline" checked={form.eventType === 'Offline'} onChange={e => setForm(p => ({...p, eventType: e.target.value, meetingLink: '', passcode: ''}))} className="accent-blue-600" />
                    Offline
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <input type="radio" name="eventType" value="Online" checked={form.eventType === 'Online'} onChange={e => setForm(p => ({...p, eventType: e.target.value, mapLink: ''}))} className="accent-blue-600" />
                    Online
                  </label>
                </div>
              )}

              {isCreator && form.eventType === 'Online' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input className="input-base" name="meetingLink" value={form.meetingLink} onChange={e => setForm(p => ({...p, meetingLink: e.target.value}))} placeholder="Meeting Link (e.g. Zoom/Meet)" />
                  <input className="input-base" name="passcode" value={form.passcode} onChange={e => setForm(p => ({...p, passcode: e.target.value}))} placeholder="Passcode (Optional)" />
                </div>
              )}

              {isCreator && form.eventType === 'Offline' && (
                <input className="input-base" name="mapLink" value={form.mapLink} onChange={e => setForm(p => ({...p, mapLink: e.target.value}))} placeholder="Google Maps Link (Optional)" />
              )}
              
              <div className="grid grid-cols-2 gap-3">
                <input className="input-base" type="date" name="date" value={form.date} onChange={e => setForm(p => ({...p, date: e.target.value}))} required />
                <input className="input-base" type="time" name="time" value={form.time} onChange={e => setForm(p => ({...p, time: e.target.value}))} required />
              </div>

              <textarea className="input-base resize-none" name="description" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} placeholder="Description (optional)" rows={3} maxLength={3000} />

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={formLoading} className="w-full btn-primary">
                  {formLoading ? 'Submitting…' : (isCreator ? 'Create' : 'Request')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
