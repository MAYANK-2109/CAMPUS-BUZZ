/**
 * src/App.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Root application component.
 * Desktop: 3-column layout (LeftSidebar | Feed | RightPanel).
 * Mobile: full-width feed + bottom tab bar.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider }   from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';

import Navbar      from './components/Layout/Navbar';
import RightPanel  from './components/Layout/RightPanel';

import ProtectedRoute from './components/ProtectedRoute';

import LoginPage      from './pages/LoginPage';
import FeedPage       from './pages/FeedPage';
import ClubFeedPage   from './pages/ClubFeedPage';
import CalendarPage   from './pages/CalendarPage';
import ComplaintsPage from './pages/ComplaintsPage';
import ForbiddenPage  from './pages/ForbiddenPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ProfilePage        from './pages/ProfilePage';
import UserProfilePage    from './pages/UserProfilePage';
import NotificationsPage  from './pages/NotificationsPage';
import ChatHubPage        from './pages/ChatHubPage';

/**
 * AuthLayout: wraps protected pages in the full 3-column shell.
 * - Left sidebar (Navbar) is always mounted; it renders itself as a bottom bar on mobile.
 * - Right panel is hidden on <lg screens via CSS.
 * - The `withRightPanel` prop controls whether the right panel is shown
 *   (only on Feed/Club pages where it makes sense).
 * - The `fullBleed` prop skips the cb-feed-col wrapper for pages that manage
 *   their own layout (e.g. ChatHubPage).
 */
const AuthLayout = ({ children, withRightPanel = false, fullBleed = false }) => (
  <div className="cb-app-shell">
    <Navbar />
    <main className={`cb-main ${withRightPanel ? 'cb-main--with-rp' : ''}`}>
      {fullBleed ? (
        children
      ) : (
        <div className="cb-feed-col">
          {children}
        </div>
      )}
      {withRightPanel && <RightPanel />}
    </main>
  </div>
);

const App = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <AuthProvider>
      <SocketProvider>
        <Routes>
          {/* ── Public ──────────────────────────────────────────────────────── */}
          <Route path="/login"     element={<LoginPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
          <Route path="/forbidden" element={<ForbiddenPage />} />

          {/* ── Feed (with right panel) ──────────────────────────────────── */}
          <Route
            path="/feed"
            element={
              <ProtectedRoute>
                <AuthLayout withRightPanel>
                  <FeedPage />
                </AuthLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/club"
            element={
              <ProtectedRoute>
                <AuthLayout withRightPanel>
                  <ClubFeedPage />
                </AuthLayout>
              </ProtectedRoute>
            }
          />

          {/* ── Other pages (no right panel) ─────────────────────────────── */}
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <AuthLayout>
                  <CalendarPage />
                </AuthLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/complaints"
            element={
              <ProtectedRoute>
                <AuthLayout>
                  <ComplaintsPage />
                </AuthLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <AuthLayout>
                  <ProfilePage />
                </AuthLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/:id"
            element={
              <ProtectedRoute>
                <AuthLayout>
                  <UserProfilePage />
                </AuthLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <AuthLayout>
                  <NotificationsPage />
                </AuthLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <AuthLayout fullBleed>
                  <ChatHubPage />
                </AuthLayout>
              </ProtectedRoute>
            }
          />

          {/* ── Catch-all ────────────────────────────────────────────────── */}
          <Route path="/" element={<Navigate to="/feed" replace />} />
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Routes>
      </SocketProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
