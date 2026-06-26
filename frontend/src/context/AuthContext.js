/**
 * src/context/AuthContext.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Global authentication context.
 *
 * Provides: { user, token, login, logout, loading }
 * Persists token and user to localStorage for page-refresh resilience.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(null);
  const [loading, setLoading] = useState(true);  // True until hydration is complete

  // ── Hydrate from localStorage on mount ───────────────────────────────────
  useEffect(() => {
    const storedToken = localStorage.getItem('cb_token');
    const storedUser  = localStorage.getItem('cb_user');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        // Corrupt storage – clear it
        localStorage.removeItem('cb_token');
        localStorage.removeItem('cb_user');
      }
    }
    setLoading(false);
  }, []);

  // ── login: called after successful POST /api/auth/login ──────────────────
  const login = useCallback((userData, jwtToken) => {
    setUser(userData);
    setToken(jwtToken);
    localStorage.setItem('cb_token', jwtToken);
    localStorage.setItem('cb_user', JSON.stringify(userData));
  }, []);

  // ── logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('cb_token');
    localStorage.removeItem('cb_user');
  }, []);

  // ── refreshUser: re-fetch current user from /api/auth/me ─────────────────
  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      localStorage.setItem('cb_user', JSON.stringify(data.user));
    } catch {
      logout();
    }
  }, [logout]);

  const value = { user, token, login, logout, refreshUser, loading };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// ── Hook for consuming the context ───────────────────────────────────────────
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
};

export default AuthContext;
