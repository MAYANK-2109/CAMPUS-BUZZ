/**
 * src/pages/NotificationsPage.jsx
 */

import React, { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageCircle, ThumbsDown, UserPlus, Bell, AtSign, Megaphone, CalendarPlus, Timer } from 'lucide-react';
import api from '../utils/api';

const TYPE_ICON = {
  like:         { Icon: Heart,          bg: 'bg-rose-100',   text: 'text-rose-500' },
  dislike:      { Icon: ThumbsDown,     bg: 'bg-orange-100', text: 'text-orange-500' },
  comment:      { Icon: MessageCircle,  bg: 'bg-blue-100',   text: 'text-blue-500' },
  new_post:     { Icon: Bell,           bg: 'bg-purple-100', text: 'text-purple-500' },
  follow:       { Icon: UserPlus,       bg: 'bg-green-100',  text: 'text-green-500' },
  mention:      { Icon: AtSign,         bg: 'bg-indigo-100', text: 'text-indigo-500' },
  announcement:  { Icon: Megaphone,     bg: 'bg-yellow-100',  text: 'text-yellow-600' },
  event_request:  { Icon: CalendarPlus,  bg: 'bg-violet-100',  text: 'text-violet-600' },
  expiry_warning: { Icon: Timer,          bg: 'bg-amber-100',   text: 'text-amber-600'  },
};

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/notifications')
      .then(({ data }) => {
        setNotifications(data.data);
        setLoading(false);
        // Mark all as read
        api.patch('/notifications/read').catch(() => {});
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                    <div className="h-2 bg-gray-100 rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="font-semibold text-gray-900 text-lg">No notifications yet</h2>
            <p className="text-gray-500 text-sm mt-2">When someone likes or comments on your posts, you'll see it here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => {
              const typeInfo = TYPE_ICON[n.type] || TYPE_ICON.like;
              const { Icon } = typeInfo;
              return (
                <div
                  key={n._id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    !n.isRead
                      ? 'bg-blue-50 border-blue-100 shadow-sm'
                      : 'bg-white border-gray-100 hover:border-gray-200'
                  }`}
                >
                  {/* Type icon */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${typeInfo.bg}`}>
                    <Icon className={`w-5 h-5 ${typeInfo.text}`} />
                  </div>

                  {/* Sender avatar */}
                  <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-sm font-bold text-gray-600 overflow-hidden -ml-6 border-2 border-white">
                    {n.sender?.avatarUrl
                      ? <img src={n.sender.avatarUrl} alt="" className="w-full h-full object-cover" />
                      : n.sender?.displayName?.charAt(0)?.toUpperCase() || '?'}
                  </div>

                  {/* Message */}
                  <div className="flex-1 min-w-0">
                      {/* For event_request, show the full message as the body */}
                      {n.type === 'event_request' ? (
                        <p className="text-sm text-gray-900 leading-snug">
                          <span className="font-semibold">{n.sender?.displayName || 'Someone'}</span>{' sent an event request — '}
                          {n.message?.split(':').slice(1).join(':').trim() || n.message}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-900 leading-snug">
                          <span className="font-semibold">{n.sender?.displayName || 'Someone'}</span>{' '}
                          {n.message?.replace(n.sender?.displayName || 'Someone', '').trim() || n.type.replace('_', ' ')}
                        </p>
                      )}
                    {n.post?.title && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">"{n.post.title}"</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </div>

                  {!n.isRead && <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
