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

// In production (Render), connect to the same origin as the page.
// Override with REACT_APP_SOCKET_URL if backend is on a different domain.
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

    // Create socket with JWT in handshake auth
    const socket = io(SOCKET_URL, {
      auth:              { token },
      transports:        ['websocket', 'polling'],
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
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
