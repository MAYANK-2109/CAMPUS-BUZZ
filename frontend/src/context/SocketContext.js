/**
 * src/context/SocketContext.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages a single Socket.io connection for the authenticated user.
 * The socket is created once after login and torn down on logout.
 *
 * Components consume this via useSocket() to emit events / listen.
 */

import React, {
  createContext, useContext, useEffect, useRef, useState,
} from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

// REACT_APP_SOCKET_URL must be set to your backend URL in your hosting
// environment (e.g. Vercel dashboard → Environment Variables).
// Example: REACT_APP_SOCKET_URL=https://campus-buzz-backend.onrender.com
//
// In local development it falls back to http://localhost:5000.
// NOTE: Do NOT fall back to window.location.origin in production —
//       Vercel (and other serverless hosts) cannot run a Socket.io server.
const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL ||
  (process.env.REACT_APP_API_URL 
    ? process.env.REACT_APP_API_URL.replace(/\/api\/?$/, '') 
    : (process.env.NODE_ENV === 'production'
        ? window.location.origin          // same-origin → Render backend
        : 'http://localhost:5000'));       // local dev

export const SocketProvider = ({ children }) => {
  const { token, user }   = useAuth();
  const socketRef         = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Only connect when a valid token is present
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
      return;
    }

    // Bail out with a clear error if no backend URL is configured.
    // This prevents silent infinite-reconnect loops on Vercel / serverless hosts.
    if (!SOCKET_URL) {
      console.error(
        '[Socket] REACT_APP_SOCKET_URL is not set. ' +
        'Add it to your Vercel environment variables and redeploy.'
      );
      return;
    }

    // Create socket with JWT in handshake auth.
    // Start with 'polling' (HTTP long-poll) then upgrade to 'websocket'.
    // This is more reliable across different hosting platforms.
    const socket = io(SOCKET_URL, {
      auth:                 { token },
      transports:           ['polling', 'websocket'],
      reconnectionDelay:    3000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      setConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      setConnected(false);
    });

    socketRef.current = socket;

    // Cleanup on unmount or token change
    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within <SocketProvider>');
  return ctx;
};

export default SocketContext;
