/**
 * src/Chat/ChatRoom.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen overlay chat room powered by Socket.io.
 *
 * Lifecycle:
 *   1. On mount  → emit `joinRoom({ postId })` to enter the socket.io room.
 *   2. On `joinedRoom` event → set history from server.
 *   3. On `newMessage`  → append message to state.
 *   4. On `roomError`   → surface error to user.
 *   5. On `roomClosed`  → show closed banner, disable input.
 *   6. On unmount → leave the room gracefully (socket cleanup handled by context).
 *
 * Props:
 *   postId    {string}   MongoDB _id of the parent post.
 *   postTitle {string}   Title shown in the header.
 *   hashtag   {string}   #foodsplit | #cabsplit | #resell
 *   isAuthor  {boolean}  Whether the current user is the post author.
 *   onClose   {Function} Callback to close the overlay.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth }   from '../context/AuthContext';
import CabTracker    from '../components/CabTracker';

// ── Hashtag → accent color map ────────────────────────────────────────────────
const HASHTAG_ACCENT = {
  '#foodsplit': 'text-orange-400 border-orange-500/40',
  '#cabsplit':  'text-blue-400 border-blue-500/40',
  '#resell':    'text-purple-400 border-purple-500/40',
};

const HASHTAG_HEADER_BG = {
  '#foodsplit': 'from-orange-950/80 to-gray-900',
  '#cabsplit':  'from-blue-950/80 to-gray-900',
  '#resell':    'from-purple-950/80 to-gray-900',
};

const ChatRoom = ({ postId, postTitle, hashtag, isAuthor = false, onClose, onRoomClosed }) => {
  const { socket, connected } = useSocket();
  const { user }              = useAuth();

  const [messages,   setMessages]   = useState([]);
  const [text,       setText]       = useState('');
  const [joined,     setJoined]     = useState(false);
  const [error,      setError]      = useState('');
  const [sending,    setSending]    = useState(false);
  const [roomClosed, setRoomClosed] = useState(false);
  const [closing,    setClosing]    = useState(false);

  const bottomRef   = useRef(null);
  const inputRef    = useRef(null);
  const hasJoined   = useRef(false); // Guard against double-join in Strict Mode

  // ── Scroll to bottom whenever messages change ───────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Focus input once joined ─────────────────────────────────────────────────
  useEffect(() => {
    if (joined) inputRef.current?.focus();
  }, [joined]);

  // ── Socket event setup ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || hasJoined.current) return;

    // ── joinedRoom: receive room history ──────────────────────────────────────
    const handleJoined = ({ history }) => {
      setMessages(history.map(normaliseMessage));
      setJoined(true);
      setError('');
    };

    // ── newMessage: live message from server ──────────────────────────────────
    const handleNewMessage = (msg) => {
      setMessages((prev) => [...prev, normaliseMessage(msg)]);
    };

    // ── roomError: server-side error ──────────────────────────────────────────
    const handleRoomError = ({ message }) => {
      setError(message);
      setJoined(false);
    };

    // ── userJoined: notification ──────────────────────────────────────────────
    const handleUserJoined = ({ displayName }) => {
      setMessages((prev) => [
        ...prev,
        { _id: Date.now(), isSystem: true, text: `${displayName} joined the room.` },
      ]);
    };

    // ── roomClosed: poster has closed the room ────────────────────────────────
    const handleRoomClosed = ({ message: msg }) => {
      setRoomClosed(true);
      setMessages((prev) => [
        ...prev,
        { _id: Date.now(), isSystem: true, isClosed: true, text: msg || 'This room has been closed by the poster.' },
      ]);
      // Notify parent (PostCard) to update the CTA button
      onRoomClosed?.();
    };

    socket.on('joinedRoom',  handleJoined);
    socket.on('newMessage',  handleNewMessage);
    socket.on('roomError',   handleRoomError);
    socket.on('userJoined',  handleUserJoined);
    socket.on('roomClosed',  handleRoomClosed);

    // Emit joinRoom only once
    hasJoined.current = true;
    socket.emit('joinRoom', { postId });

    return () => {
      socket.off('joinedRoom',  handleJoined);
      socket.off('newMessage',  handleNewMessage);
      socket.off('roomError',   handleRoomError);
      socket.off('userJoined',  handleUserJoined);
      socket.off('roomClosed',  handleRoomClosed);
    };
  }, [socket, postId]);

  // ── Close on Escape ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // ── Close room (poster only) ────────────────────────────────────────────────
  const handleCloseRoom = useCallback(() => {
    if (!socket || closing || roomClosed) return;
    if (!window.confirm('Close this room? Participants will no longer be able to send messages.')) return;
    setClosing(true);
    socket.emit('closeRoom', { postId });
    // roomClosed event will flip state for everyone including us
    setClosing(false);
  }, [socket, postId, closing, roomClosed]);

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = useCallback((e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !socket || sending || roomClosed) return;

    setSending(true);
    socket.emit('sendMessage', { postId, text: trimmed });
    setText('');
    setSending(false);
    inputRef.current?.focus();
  }, [text, socket, postId, sending, roomClosed]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const accent     = HASHTAG_ACCENT[hashtag]    || 'text-violet-400 border-violet-500/40';
  const headerBg   = HASHTAG_HEADER_BG[hashtag] || 'from-violet-950/80 to-gray-900';

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
                 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Chat room for ${postTitle}`}
    >
      {/* Panel */}
      <div
        className="relative w-full sm:max-w-lg h-[85vh] sm:h-[70vh]
                   bg-gray-900 border border-gray-700/60
                   rounded-t-3xl sm:rounded-3xl shadow-2xl
                   flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className={`flex-shrink-0 bg-gradient-to-r ${headerBg}
                         border-b border-gray-700/60 px-4 py-3`}>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              {/* Drag handle (mobile) */}
              <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-3 sm:hidden" />
              <span className={`text-xs font-bold ${accent.split(' ')[0]}`}>
                {hashtag}
              </span>
              <h2 className="text-sm font-semibold text-white mt-0.5 truncate">
                {postTitle}
              </h2>
            </div>

            <div className="flex items-center gap-3 ml-3 flex-shrink-0">
              {/* Connection indicator */}
              <span
                title={connected ? 'Connected' : 'Reconnecting…'}
                className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`}
              />

              {/* Close Room — visible to poster only */}
              {isAuthor && !roomClosed && (
                <button
                  onClick={handleCloseRoom}
                  disabled={closing || !joined}
                  title="Close this room"
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg
                             bg-red-600/20 border border-red-500/40 text-red-400
                             hover:bg-red-600/40 hover:text-red-300
                             disabled:opacity-40 disabled:cursor-not-allowed
                             transition-colors flex-shrink-0"
                >
                  {closing ? 'Closing…' : '🔒 Close Room'}
                </button>
              )}

              {/* Closed badge in header */}
              {roomClosed && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 border border-gray-600">
                  Closed
                </span>
              )}

              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
                aria-label="Close chat"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────────── */}
        {error && (
          <div className="flex-shrink-0 bg-red-950/60 border-b border-red-700/40
                           px-4 py-2 text-sm text-red-400">
            ⚠ {error}
          </div>
        )}

        {/* ── Messages area ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scroll-smooth">
          {!joined && !error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2
                                border-violet-500 mx-auto mb-2" />
                <p className="text-sm">Joining room…</p>
              </div>
            </div>
          )}

          {messages.map((msg) =>
            msg.isSystem ? (
              /* System / join messages */
              <p key={msg._id}
                 className={`text-center text-xs italic py-1 ${
                   msg.isClosed
                     ? 'text-red-400 font-semibold'
                     : 'text-gray-600'
                 }`}>
                {msg.text}
              </p>
            ) : (
              <MessageBubble key={msg._id} msg={msg} currentUserId={user?._id} />
            )
          )}

          {messages.length === 0 && joined && !roomClosed && (
            <p className="text-center text-gray-600 text-sm py-8">
              No messages yet. Say hello! 👋
            </p>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── CabSplit live tracker ─────────────────────────────────────── */}
        {hashtag === '#cabsplit' && joined && (
          <CabTracker
            postId={postId}
            isAuthor={isAuthor}
            socket={socket}
          />
        )}

        {/* ── Input area ───────────────────────────────────────────────────── */}
        {roomClosed ? (
          /* Closed state banner replaces the input bar */
          <div className="flex-shrink-0 border-t border-gray-700/60
                          bg-gray-900/80 backdrop-blur-sm px-4 py-4
                          flex items-center justify-center gap-2">
            <span className="text-sm text-gray-500">🔒</span>
            <p className="text-sm text-gray-500 italic">This room is closed. No new messages can be sent.</p>
          </div>
        ) : (
          <form
            onSubmit={handleSend}
            className="flex-shrink-0 border-t border-gray-700/60
                       bg-gray-900/80 backdrop-blur-sm px-4 py-3 flex gap-2"
          >
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={joined ? 'Type a message…' : 'Joining room…'}
              disabled={!joined || !connected}
              maxLength={1000}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl
                         px-3 py-2 text-sm text-white placeholder-gray-500
                         focus:outline-none focus:border-violet-500/60
                         disabled:opacity-50 transition-colors"
            />
            <button
              type="submit"
              disabled={!text.trim() || !joined || !connected || sending}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500
                         disabled:opacity-40 disabled:cursor-not-allowed
                         text-white rounded-xl text-sm font-semibold
                         transition-colors flex-shrink-0"
            >
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// ── MessageBubble sub-component ───────────────────────────────────────────────
/**
 * Renders a single chat message aligned left (others) or right (self).
 */
const MessageBubble = ({ msg, currentUserId }) => {
  const isSelf = msg.senderId === currentUserId ||
                 msg.senderId?._id === currentUserId;

  const senderName = msg.senderName
    || msg.senderId?.displayName
    || 'Unknown';

  const time = msg.timestamp
    ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
      {/* Sender name – only for others */}
      {!isSelf && (
        <span className="text-xs text-gray-500 mb-1 ml-1">{senderName}</span>
      )}

      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm break-words
                       ${isSelf
                         ? 'bg-violet-600 text-white rounded-br-sm'
                         : 'bg-gray-800 text-gray-100 rounded-bl-sm border border-gray-700/60'
                       }`}>
        {msg.text}
      </div>

      <span className="text-[10px] text-gray-600 mt-0.5 mx-1">{time}</span>
    </div>
  );
};

/**
 * normaliseMessage
 * Ensures message objects from history (populated senderId) and live
 * events (flat senderId string) are in a consistent shape.
 */
const normaliseMessage = (msg) => ({
  ...msg,
  senderId:   msg.senderId?._id || msg.senderId,
  senderName: msg.senderName || msg.senderId?.displayName || 'Unknown',
});

export default ChatRoom;
