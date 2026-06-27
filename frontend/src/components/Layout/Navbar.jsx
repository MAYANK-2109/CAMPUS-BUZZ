/**
 * src/components/Layout/Navbar.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Instagram-style LEFT sidebar for desktop, bottom tab bar for mobile.
 * - Logo + "CampusBuzz" brand at top (centered on desktop)
 * - Vertical nav links with icons + labels
 * - Notification bell with unread badge
 * - User avatar + role badge + logout at bottom
 */

import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home, Megaphone, Calendar, ShieldAlert,
  Bell, LogOut, User, ChevronUp, MessageSquare,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';

const NAV_ITEMS = [
  { label: 'Feed',       to: '/feed',       Icon: Home },
  { label: 'Club Feed',  to: '/club',       Icon: Megaphone },
  { label: 'Calendar',   to: '/calendar',   Icon: Calendar },
  { label: 'Complaints', to: '/complaints', Icon: ShieldAlert },
  { label: 'Chat',       to: '/chat',       Icon: MessageSquare },
];

const Navbar = () => {
  const { user, logout }          = useAuth();
  const navigate                  = useNavigate();
  const [menuOpen, setMenuOpen]   = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const menuRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const fetchUnread = () => {
      api.get('/notifications/unread-count')
        .then(({ data }) => { if (!cancelled) setUnreadCount(data.count || 0); })
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  const roleBadge = {
    Student: 'bg-blue-50 text-blue-700 border-blue-200',
    Club:    'bg-purple-50 text-purple-700 border-purple-200',
    Admin:   'bg-red-50   text-red-700   border-red-200',
  }[user?.role] || '';

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          DESKTOP  –  Left vertical sidebar
          ═══════════════════════════════════════════════════════════ */}
      <aside className="cb-sidebar hidden md:flex flex-col">

        {/* Brand */}
        <NavLink to="/feed" className="cb-brand">
          <img
            src="/logo.png"
            alt="CampusBuzz logo"
            className="w-9 h-9 object-contain flex-shrink-0"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
          <span className="cb-brand-name">CampusBuzz</span>
        </NavLink>

        {/* Nav links */}
        <nav className="cb-nav">
          {NAV_ITEMS.map(({ label, to, Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                `cb-nav-item${isActive ? ' cb-nav-active' : ''}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="cb-nav-icon" strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className="cb-nav-label">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          {/* Notifications */}
          <NavLink
            to="/notifications"
            title="Notifications"
            className={({ isActive }) =>
              `cb-nav-item${isActive ? ' cb-nav-active' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Bell className="cb-nav-icon" strokeWidth={isActive ? 2.5 : 1.8} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </span>
                <span className="cb-nav-label">Notifications</span>
              </>
            )}
          </NavLink>
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User block */}
        <div className="cb-user-block" ref={menuRef}>
          <button
            id="user-menu-btn"
            onClick={() => setMenuOpen(v => !v)}
            className="cb-user-btn"
            title={user?.displayName}
          >
            <div className="cb-avatar-ring">
              <div className="cb-avatar-inner">
                {user?.avatarUrl
                  ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-xs font-bold text-gray-700">{user?.displayName?.charAt(0)?.toUpperCase() || '?'}</span>
                }
              </div>
            </div>
            <div className="flex-1 min-w-0 text-left hidden xl:block">
              <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{user?.displayName}</p>
              <span className={`text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-full border ${roleBadge}`}>
                {user?.role}
              </span>
            </div>
            <ChevronUp
              className={`w-4 h-4 text-gray-400 hidden xl:block transition-transform ${menuOpen ? 'rotate-180' : ''}`}
              strokeWidth={2}
            />
          </button>

          {/* Popup menu */}
          {menuOpen && (
            <div className="cb-user-menu">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900 truncate">{user?.displayName}</p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{user?.instituteEmail}</p>
              </div>
              <NavLink
                to="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                <User className="w-4 h-4" strokeWidth={1.8} /> View Profile
              </NavLink>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
              >
                <LogOut className="w-4 h-4" strokeWidth={2} /> Log Out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════
          MOBILE  –  Bottom tab bar
          ═══════════════════════════════════════════════════════════ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-200 flex items-center justify-around px-2 pb-safe">
        {NAV_ITEMS.map(({ label, to, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all ${
                isActive ? 'text-gray-900' : 'text-gray-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.8} />
                <span className="text-[9px] font-semibold">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <NavLink
          to="/notifications"
          className={({ isActive }) =>
            `relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all ${
              isActive ? 'text-gray-900' : 'text-gray-400'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className="relative">
                <Bell className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.8} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
              <span className="text-[9px] font-semibold">Alerts</span>
            </>
          )}
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all ${
              isActive ? 'text-gray-900' : 'text-gray-400'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className={`w-5 h-5 rounded-full overflow-hidden flex items-center justify-center ${isActive ? 'ring-2 ring-gray-900' : ''} bg-gray-200`}>
                {user?.avatarUrl
                  ? <img src={user.avatarUrl} alt="me" className="w-full h-full object-cover" />
                  : <span className="text-[9px] font-bold text-gray-700">{user?.displayName?.charAt(0)?.toUpperCase()}</span>
                }
              </div>
              <span className="text-[9px] font-semibold">Profile</span>
            </>
          )}
        </NavLink>
      </nav>
    </>
  );
};

export default Navbar;
