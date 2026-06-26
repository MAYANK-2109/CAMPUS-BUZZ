/**
 * src/components/Shared/ProtectedRoute.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps React Router routes to enforce authentication and optional role gating.
 *
 * Usage:
 *   <ProtectedRoute>                        → any authenticated user
 *   <ProtectedRoute roles={['Club','Admin']}> → Club or Admin only
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  const location          = useLocation();

  // While hydrating from localStorage, render nothing to avoid flash
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-violet-400" />
      </div>
    );
  }

  // Not logged in → redirect to login, preserving the intended URL
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role gate: if `roles` prop is provided, check membership
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return children;
};

export default ProtectedRoute;
