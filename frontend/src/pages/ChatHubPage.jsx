/**
 * src/pages/ChatHubPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Discord-style global chat hub.
 *
 * Layout:
 *   Left  – room list with search + "Create Room" button
 *   Right – chat window with message history, input, close-room control
 *
 * Real-time via Socket.io:
 *   joinGlobalRoom / sendGlobalMsg / closeGlobalRoom / leaveGlobalRoom
 *   listens: globalJoined / globalMessage / globalRoomClosed / roomsUpdated
 *            onlineUsersUpdate (new)
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { Search, Plus, SendHorizonal, X, Hash, Users, MessageSquare, FileText, ExternalLink, ChevronRight, ChevronDown, ChevronLeft, Lock, Check, Clock, UserPlus } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

// ── Hashtag → colour mapping ─────────────────────────────────────────────────
const HASHTAG_COLORS = {
  '#general': '#5865f2',
  '#announcements': '#eb459e',
  '#foodsplit': '#f0a500',
  '#cabsplit': '#57f287',
  '#resell': '#fe454f',
  '#lost': '#ed4245',
  '#found': '#57f287',
  '#sports': '#fe8c00',
  '#tech': '#00b0f4',
  '#cultural': '#f47fff',
  '#placement': '#23a55a',
  '#hostel': '#faa61a',
  '#library': '#b5cefe',
  '#events': '#ff7043',
  '#misc': '#72767d',
};

const hashtagColor = (tag) => HASHTAG_COLORS[tag] || '#5865f2';
const hashtagEmoji = () => '#';

/**
 * senderIdOf
 * Normalises a message's senderId to a plain string id, regardless of whether
 * it arrives as:
 *   • a string ObjectId        (live socket `globalMessage` payload)
 *   • a populated user object   (REST history → { _id, displayName, … })
 *   • the full auth user object (optimistic message → senderId: user)
 */
const senderIdOf = (msg) => {
  const s = msg?.senderId;
  if (!s) return '';
  if (typeof s === 'string') return s;
  return (s._id || s).toString();
};

const roleBadgeStyle = (role) => {
  if (role === 'Club') return { background: 'rgba(114,137,218,0.2)', color: '#7289da' };
  if (role === 'Admin') return { background: 'rgba(237,66,69,0.2)', color: '#ed4245' };
  return null;
};

const avatarBg = (name) => {
  const colours = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#f0a500', '#00b0f4'];
  let h = 0;
  for (let i = 0; i < (name?.length || 0); i++) h = (h * 31 + name.charCodeAt(i)) % colours.length;
  return colours[h];
};

function formatDay(date) {
  const d = new Date(date);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
}

// ── Avatar component ─────────────────────────────────────────────────────────
const Avatar = ({ user, size = 38 }) => {
  const role = user?.senderRole || user?.senderId?.role;
  const bg = roleBadgeStyle(role)?.background || '#4f46e5';

  const avatar = user?.senderAvatar || user?.senderId?.avatarUrl;
  const name = user?.senderName || user?.senderId?.displayName || '?';

  return (
    <div
      className="ch-msg-avatar"
      style={{ width: size, height: size, background: avatar ? 'transparent' : bg }}
    >
      {avatar
        ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        : name.charAt(0).toUpperCase()}
    </div>
  );
};

// ── Online Users Panel ────────────────────────────────────────────────────────
const OnlineUsersPanel = ({ users, currentUserId }) => {
  const [expanded, setExpanded] = useState(false);
  if (!users || users.length === 0) return null;

  const bg = (name) => {
    const colours = ['#5865f2','#57f287','#fee75c','#eb459e','#ed4245','#f0a500','#00b0f4'];
    let h = 0;
    for (let i = 0; i < (name?.length || 0); i++) h = (h * 31 + name.charCodeAt(i)) % colours.length;
    return colours[h];
  };

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 14px', background: 'rgba(0,0,0,0.15)', flexShrink: 0 }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <Users size={13} color="#57f287" />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#57f287', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Online — {users.length}
        </span>
        {expanded
          ? <ChevronDown size={12} color="#57f287" style={{ marginLeft: 'auto' }} />
          : <ChevronRight size={12} color="#57f287" style={{ marginLeft: 'auto' }} />}
      </button>
      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
        {users.slice(0, expanded ? undefined : 6).map(u => (
          <div key={u._id} title={u.displayName + (u._id === currentUserId ? ' (You)' : '')} style={{
            width: 28, height: 28, borderRadius: '50%',
            background: u.avatarUrl ? 'transparent' : bg(u.displayName),
            border: u._id === currentUserId ? '2px solid #57f287' : '2px solid rgba(255,255,255,0.1)',
            overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#fff', position: 'relative',
          }}>
            {u.avatarUrl
              ? <img src={u.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : u.displayName?.charAt(0)?.toUpperCase()}
            <span style={{ position: 'absolute', bottom: 0, right: 0, width: 7, height: 7, borderRadius: '50%', background: '#57f287', border: '1.5px solid #1e2124' }} />
          </div>
        ))}
        {!expanded && users.length > 6 && (
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2c2f33', border: '2px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#72767d' }}>
            +{users.length - 6}
          </div>
        )}
      </div>
      {expanded && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {users.map(u => (
            <div key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#57f287', flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: u._id === currentUserId ? '#57f287' : '#dcddde', fontWeight: u._id === currentUserId ? 700 : 400 }}>
                {u.displayName}{u._id === currentUserId ? ' (You)' : ''}
              </span>
              {u.role && u.role !== 'Student' && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 20, background: roleBadgeStyle(u.role)?.background, color: roleBadgeStyle(u.role)?.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {u.role}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── The one category whose rooms require creator approval (mirrors backend) ──
// Rooms under every other hashtag are open to anyone.
const APPROVAL_HASHTAG = '#general';

/**
 * ── Join Requests Panel ──────────────────────────────────────────────────────
 * Shown to the room creator (the room's admin). Lists everyone who has asked
 * to join and lets them approve or decline each request.
 */
const JoinRequestsPanel = ({ room, onClose, onDecided }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [busyId, setBusyId]     = useState(null);
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/rooms/${room._id}/join-requests`);
      setRequests(data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }, [room._id]);

  useEffect(() => { load(); }, [load]);

  const decide = async (userId, action) => {
    setBusyId(userId); setError('');
    try {
      await api.patch(`/rooms/${room._id}/join-requests/${userId}`, { action });
      setRequests(prev => prev.map(r =>
        (r.user?._id === userId)
          ? { ...r, status: action === 'approve' ? 'approved' : 'declined' }
          : r
      ));
      onDecided?.();
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} request.`);
    } finally {
      setBusyId(null);
    }
  };

  const pending  = requests.filter(r => r.status === 'pending');
  const decided  = requests.filter(r => r.status !== 'pending');

  return (
    <div className="ch-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ch-modal" style={{ maxWidth: 440 }}>
        <div className="ch-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserPlus size={17} />
          Join Requests
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#72767d', display: 'flex' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#72767d', marginBottom: 12 }}>
          {room.name}
        </div>

        {error && (
          <div style={{ color: '#ed4245', fontSize: 13, marginBottom: 12, background: 'rgba(237,66,69,0.1)', padding: '8px 12px', borderRadius: 8 }}>
            ⚠ {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: '#72767d', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
            Loading requests…
          </div>
        ) : requests.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
            No one has asked to join yet.
          </div>
        ) : (
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {pending.map(r => (
              <div key={r.user?._id} className="ch-request-row">
                <div className="ch-request-avatar">
                  {r.user?.avatarUrl
                    ? <img src={r.user.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : (r.user?.displayName?.charAt(0)?.toUpperCase() || '?')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ch-request-name">{r.user?.displayName || 'Unknown'}</div>
                  <div className="ch-request-meta">{r.user?.rollNo || r.user?.instituteEmail || ''}</div>
                </div>
                <button
                  className="ch-request-btn ch-request-btn--approve"
                  disabled={busyId === r.user?._id}
                  onClick={() => decide(r.user._id, 'approve')}
                >
                  <Check size={13} /> Accept
                </button>
                <button
                  className="ch-request-btn ch-request-btn--decline"
                  disabled={busyId === r.user?._id}
                  onClick={() => decide(r.user._id, 'decline')}
                >
                  <X size={13} /> Decline
                </button>
              </div>
            ))}

            {decided.length > 0 && (
              <>
                <div className="ch-rooms-section-label" style={{ marginTop: 14 }}>Decided</div>
                {decided.map(r => (
                  <div key={r.user?._id} className="ch-request-row" style={{ opacity: 0.65 }}>
                    <div className="ch-request-avatar">
                      {r.user?.displayName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ch-request-name">{r.user?.displayName || 'Unknown'}</div>
                      <div className="ch-request-meta">{r.status}</div>
                    </div>
                    <span className={`ch-request-tag ch-request-tag--${r.status}`}>
                      {r.status === 'approved' ? 'Accepted' : 'Declined'}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Create Room Modal ─────────────────────────────────────────────────────────
const CreateRoomModal = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [hashtag, setHashtag] = useState(APPROVAL_HASHTAG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const HASHTAGS = Object.keys(HASHTAG_COLORS);

  // Only #general rooms are approval-gated; the rest are open to everyone.
  const gated = hashtag === APPROVAL_HASHTAG;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Room name is required.'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/rooms', { name: name.trim(), hashtag });
      onCreate(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ch-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ch-modal">
        <div className="ch-modal-title">Create a Room</div>
        <form onSubmit={submit}>
          {error && (
            <div style={{ color: '#ed4245', fontSize: 13, marginBottom: 12, background: 'rgba(237,66,69,0.1)', padding: '8px 12px', borderRadius: 8 }}>
              ⚠ {error}
            </div>
          )}
          <label className="ch-modal-label">Room Name</label>
          <input
            className="ch-modal-input"
            placeholder="e.g. Food Buddies"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
          />
          <label className="ch-modal-label">Category</label>
          <select
            className="ch-modal-select"
            value={hashtag}
            onChange={(e) => setHashtag(e.target.value)}
          >
            {HASHTAGS.map(h => (
              <option key={h} value={h}>
                {hashtagEmoji(h)} {h}{h === APPROVAL_HASHTAG ? ' — approval required' : ''}
              </option>
            ))}
          </select>

          {gated ? (
            <div className="ch-modal-note">
              <Lock size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                You&rsquo;ll be the admin of this {APPROVAL_HASHTAG} room. Anyone who
                wants in has to request to join, and you approve or decline each request.
              </span>
            </div>
          ) : (
            <div className="ch-modal-note" style={{ background: '#f9fafb', color: '#6b7280' }}>
              <Users size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Open room — anyone can join without approval.</span>
            </div>
          )}

          <div className="ch-modal-actions">
            <button type="button" className="ch-modal-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="ch-modal-confirm" disabled={loading}>
              {loading ? 'Creating…' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main ChatHubPage ──────────────────────────────────────────────────────────
const ChatHubPage = () => {
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();

  // Rooms state
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRoom, setActiveRoom] = useState(null); // full room object
  const [showCreate, setShowCreate] = useState(false);

  // Approval-gated rooms
  const [showRequests, setShowRequests] = useState(false); // creator's requests panel
  const [requestingId, setRequestingId] = useState(null);  // room awaiting our request call
  const [gateNotice, setGateNotice]     = useState('');    // inline feedback in the room list

  // Chat state
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [closingRoom, setClosingRoom] = useState(false);
  const [roomClosed, setRoomClosed] = useState(false);
  const [markingSold, setMarkingSold] = useState(false);

  // Online users in active global room
  const [onlineUsers, setOnlineUsers] = useState([]);

  // System messages (join/leave/close notifications)
  const [sysMessages, setSysMessages] = useState([]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const activeRoomRef = useRef(null);  // keep socket callbacks in sync
  activeRoomRef.current = activeRoom;

  // ── Fetch rooms ─────────────────────────────────────────────────────────────
  const fetchRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const { data } = await api.get('/rooms');
      setRooms(data.data || []);
    } catch (err) {
      console.error('[ChatHub] fetchRooms error', err);
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  // ── Auto-selection will be defined below handleSelectRoom

  // ── Socket listeners ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onGlobalJoined = ({ roomId, room, history }) => {
      if (roomId !== activeRoomRef.current?._id) return;
      setMessages(history.map(m => ({ ...m, _type: 'msg' })));
      setSysMessages([]);
      setRoomClosed(false);
    };

    const onGlobalMessage = (payload) => {
      if (payload.roomId !== activeRoomRef.current?._id) return;
      setMessages(prev => {
        // If this echo confirms one of OUR optimistic messages, replace it
        // in place (same sender + same text) instead of appending a duplicate.
        const optimisticIdx = prev.findIndex(
          m => m.isOptimistic &&
               m.text === payload.text &&
               senderIdOf(m) === senderIdOf(payload)
        );
        if (optimisticIdx !== -1) {
          const next = [...prev];
          next[optimisticIdx] = { ...payload, _type: 'msg' };
          return next;
        }
        // Guard against the same persisted message arriving twice.
        if (payload._id && prev.some(m => m._id === payload._id)) return prev;
        return [...prev, { ...payload, _type: 'msg' }];
      });
    };

    const onGlobalRoomClosed = ({ roomId, closedBy }) => {
      setRooms(prev => prev.filter(r => r._id !== roomId));
      if (roomId === activeRoomRef.current?._id) {
        setRoomClosed(true);
        setSysMessages(prev => [...prev, `[Closed] Room closed by ${closedBy}`]);
      }
    };

    const onRoomsUpdated = () => { fetchRooms(); };

    const onGlobalUserJoined = ({ displayName }) => {
      if (activeRoomRef.current) {
        setSysMessages(prev => [...prev, `${displayName} joined the room`]);
      }
    };

    const onGlobalUserLeft = ({ displayName }) => {
      if (activeRoomRef.current) {
        setSysMessages(prev => [...prev, `${displayName} left the room`]);
      }
    };

    const onOnlineUsersUpdate = ({ roomId, users }) => {
      if (roomId === activeRoomRef.current?._id) setOnlineUsers(users);
    };

    // ── Approval-flow events ─────────────────────────────────────────────────
    // Someone asked to join a room we admin — refresh so the badge updates.
    const onJoinRequestReceived = ({ roomName, user }) => {
      fetchRooms();
      setSysMessages(prev => [...prev, `${user?.displayName || 'Someone'} asked to join ${roomName}`]);
    };

    // Our own request was accepted or declined.
    const onJoinRequestDecided = ({ roomId, roomName, status }) => {
      setRooms(prev => prev.map(r =>
        r._id === roomId
          ? { ...r, myAccess: status, canEnter: status === 'approved' }
          : r
      ));
      setGateNotice(
        status === 'approved'
          ? `You were accepted into ${roomName}.`
          : `Your request to join ${roomName} was declined.`
      );
      if (status === 'declined' && activeRoomRef.current?._id === roomId) {
        setActiveRoom(null);
        setMessages([]);
      }
    };

    // The server refused (or revoked) our access to a room.
    const onRoomAccessDenied = ({ roomId, status, message }) => {
      setRooms(prev => prev.map(r =>
        r._id === roomId ? { ...r, myAccess: status, canEnter: false } : r
      ));
      setGateNotice(message || 'You do not have access to that room.');
      if (activeRoomRef.current?._id === roomId) {
        setActiveRoom(null);
        setMessages([]);
      }
    };

    // A member was removed from a room we're sitting in.
    const onRoomAccessRevoked = ({ roomId, userId }) => {
      if (userId !== user?._id) return;
      if (activeRoomRef.current?._id === roomId) {
        setActiveRoom(null);
        setMessages([]);
        setGateNotice('Your access to that room was revoked.');
      }
    };

    socket.on('joinRequestReceived', onJoinRequestReceived);
    socket.on('joinRequestDecided',  onJoinRequestDecided);
    socket.on('roomAccessDenied',    onRoomAccessDenied);
    socket.on('roomAccessRevoked',   onRoomAccessRevoked);

    socket.on('globalJoined', onGlobalJoined);
    socket.on('globalMessage', onGlobalMessage);
    socket.on('globalRoomClosed', onGlobalRoomClosed);
    socket.on('roomsUpdated', onRoomsUpdated);
    socket.on('globalUserJoined', onGlobalUserJoined);
    socket.on('globalUserLeft', onGlobalUserLeft);
    socket.on('onlineUsersUpdate', onOnlineUsersUpdate);

    return () => {
      socket.off('joinRequestReceived', onJoinRequestReceived);
      socket.off('joinRequestDecided',  onJoinRequestDecided);
      socket.off('roomAccessDenied',    onRoomAccessDenied);
      socket.off('roomAccessRevoked',   onRoomAccessRevoked);
      socket.off('globalJoined', onGlobalJoined);
      socket.off('globalMessage', onGlobalMessage);
      socket.off('globalRoomClosed', onGlobalRoomClosed);
      socket.off('roomsUpdated', onRoomsUpdated);
      socket.off('globalUserJoined', onGlobalUserJoined);
      socket.off('globalUserLeft', onGlobalUserLeft);
      socket.off('onlineUsersUpdate', onOnlineUsersUpdate);
    };
  }, [socket, fetchRooms, user?._id]);

  // ── Auto-scroll messages ────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sysMessages]);

  // ── Ask the room's creator for access ───────────────────────────────────────
  const handleRequestJoin = useCallback(async (room) => {
    // Never ask to join a room we created — the server rejects it with a 400
    // and there is nothing sensible to show the user.
    const creatorId = room.createdBy?._id || room.createdBy;
    if (creatorId && user?._id && String(creatorId) === String(user._id)) {
      setRooms(prev => prev.map(r =>
        r._id === room._id ? { ...r, myAccess: 'creator', canEnter: true } : r
      ));
      return;
    }

    setRequestingId(room._id);
    setGateNotice('');
    try {
      await api.post(`/rooms/${room._id}/join-request`);
      // Reflect the new state immediately; the creator decides from their side.
      setRooms(prev => prev.map(r =>
        r._id === room._id ? { ...r, myAccess: 'pending', canEnter: false } : r
      ));
      setGateNotice(`Request sent to ${room.createdBy?.displayName || 'the room admin'}.`);
    } catch (err) {
      const status = err.response?.data?.status;
      if (status) {
        setRooms(prev => prev.map(r =>
          r._id === room._id
            ? { ...r, myAccess: status, canEnter: status === 'approved' }
            : r
        ));
      }
      setGateNotice(err.response?.data?.message || 'Failed to send request.');
    } finally {
      setRequestingId(null);
    }
  }, [user?._id]);

  // ── Select a room ────────────────────────────────────────────────────────────
  const handleSelectRoom = useCallback(async (room) => {
    // Post-linked rooms (#resell / #foodsplit / #cabsplit) open here like any
    // other room. This used to redirect to the post on the feed instead, which
    // — together with the socket handlers rejecting non-global rooms — meant
    // clicking a post chat bounced you out of the hub and there was no way to
    // reach the conversation at all.
    //
    // Approval-gated room we are not a member of: never open it. The backend
    // enforces this too — this just avoids a guaranteed 403 round-trip.
    if (room.requiresApproval && room.canEnter === false) {
      setGateNotice('');
      return;
    }

    if (activeRoom?._id === room._id) return;

    // Leave previous room via socket
    if (activeRoom && socket) {
      socket.emit('leaveGlobalRoom', { roomId: activeRoom._id });
    }

    setActiveRoom(room);
    setMessages([]);
    setSysMessages([]);
    setRoomClosed(false);
    setMsgText('');
    setOnlineUsers([]);
    setLoadingMsgs(true);

    // Fetch history via REST (fast fallback before socket confirms)
    try {
      const { data } = await api.get(`/rooms/${room._id}/messages?limit=40`);
      setMessages(data.data.map(m => ({ ...m, _type: 'msg' })));
      setHasMore(data.hasMore || false);
    } catch (err) {
      console.error('[ChatHub] fetch messages error', err);
    } finally {
      setLoadingMsgs(false);
    }

    // Join via socket for live updates
    if (socket && connected) {
      socket.emit('joinGlobalRoom', { roomId: room._id });
    }

    setTimeout(() => inputRef.current?.focus(), 150);
  }, [activeRoom, socket, connected, navigate]);

  // ── Auto-select room from URL ──────────────────────────────────────────────
  useEffect(() => {
    if (rooms.length > 0 && !activeRoom) {
      const params = new URLSearchParams(location.search);
      const roomId = params.get('room');
      if (roomId) {
        const targetRoom = rooms.find(r => r._id === roomId);
        if (targetRoom) {
          handleSelectRoom(targetRoom);
        }
      }
    }
  }, [rooms, activeRoom, location.search, handleSelectRoom]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = msgText.trim();
    if (!text || !activeRoom || roomClosed || sending) return;
    
    // Optimistic UI Update
    const tempId = 'temp-' + Date.now();
    const optimisticMsg = {
      _id: tempId,
      text,
      senderId: user,
      timestamp: new Date().toISOString(),
      _type: 'msg',
      isOptimistic: true
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setMsgText(''); // Clear input immediately
    
    if (socket && !connected) {
      socket.connect(); // Force reconnect attempt
    }

    setSending(true);
    if (socket) {
      socket.emit('sendGlobalMsg', { roomId: activeRoom._id, text });
    }
    setSending(false);
  }, [msgText, activeRoom, socket, roomClosed, sending, connected, user]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Close room ───────────────────────────────────────────────────────────────
  const handleCloseRoom = async () => {
    if (!activeRoom || closingRoom) return;
    if (!window.confirm('Are you sure you want to close this room? This cannot be undone.')) return;
    setClosingRoom(true);
    try {
      await api.delete(`/rooms/${activeRoom._id}`);
      // Socket will broadcast globalRoomClosed which updates UI
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to close room.');
    } finally {
      setClosingRoom(false);
    }
  };

  // ── Mark as Sold (#resell post-linked rooms, seller only) ────────────────────
  // Same action as the button on the post card: closes this room and removes
  // the listing. Offered here too because once a deal is agreed, the chat is
  // where the seller already is — making them navigate back to the feed to end
  // it is the kind of step people skip, leaving dead listings in the feed.
  const handleMarkSold = async () => {
    if (!activeRoom || markingSold) return;
    const postId = activeRoom.postId?._id || activeRoom.postId;
    if (!postId) return;

    if (!window.confirm(
      'Mark this item as sold?\n\n' +
      '• This chat room will be closed\n' +
      '• The listing will be removed from the feed\n\n' +
      'This cannot be undone.'
    )) return;

    setMarkingSold(true);
    try {
      await api.patch(`/posts/${postId}/sold`);
      // The server broadcasts globalRoomClosed, which flips the UI to read-only
      // for everyone in the room including us — no local state change needed.
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to mark this item as sold.');
    } finally {
      setMarkingSold(false);
    }
  };

  // ── Room creation callback ────────────────────────────────────────────────────
  const handleRoomCreated = (newRoom) => {
    const tagged = {
      _roomType:    'global',
      // Fallbacks in case an older backend omits the access fields — without
      // these the creator's own new room renders as if they were locked out.
      myAccess:     newRoom.requiresApproval ? 'creator' : 'open',
      canEnter:     true,
      pendingCount: 0,
      ...newRoom,
    };
    setRooms(prev => [tagged, ...prev]);
    setShowCreate(false);
    setTimeout(() => handleSelectRoom(tagged), 100);
  };

  // ── Load older messages (pagination) ─────────────────────────────────────────
  const handleLoadOlder = useCallback(async () => {
    if (!activeRoom || loadingOlder || !hasMore || messages.length === 0) return;
    const oldestId = messages[0]?._id;
    if (!oldestId) return;
    setLoadingOlder(true);
    try {
      const { data } = await api.get(`/rooms/${activeRoom._id}/messages?before=${oldestId}&limit=40`);
      setMessages(prev => [
        ...data.data.map(m => ({ ...m, _type: 'msg' })),
        ...prev,
      ]);
      setHasMore(data.hasMore || false);
    } catch (err) {
      console.error('[ChatHub] load older error', err);
    } finally {
      setLoadingOlder(false);
    }
  }, [activeRoom, loadingOlder, hasMore, messages]);

  // ── Filtered rooms ────────────────────────────────────────────────────────────
  const filteredRooms = rooms.filter(r =>
    r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.hashtag?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.createdBy?.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const globalRooms = filteredRooms.filter(r => r._roomType !== 'post');
  const postRooms   = filteredRooms.filter(r => r._roomType === 'post');

  // ── Group messages by date and contiguous sender ──────────────────────────────
  const groupedItems = [];
  let lastDay = null;
  let lastSender = null;

  messages.forEach((msg, idx) => {
    const msgDate = new Date(msg.timestamp);
    let isNewDay = false;
    if (!lastDay || !isSameDay(msgDate, lastDay)) {
      groupedItems.push({ _type: 'divider', label: formatDay(msgDate), key: `div-${idx}` });
      lastDay = msgDate;
      lastSender = null;
      isNewDay = true;
    }

    const currentSender = senderIdOf(msg);
    const isConsecutive = !isNewDay && lastSender === currentSender;

    groupedItems.push({
      ...msg,
      _showMeta: !isConsecutive,
    });
    lastSender = currentSender;
  });

  const isCreator = activeRoom?.createdBy?._id === user?._id ||
    activeRoom?.createdBy === user?._id;
  const canClose = isCreator || user?.role === 'Admin';

  // Sold is offered only on a post-linked #resell room, and only to the seller
  // (or an Admin). createdBy on a post-linked room is the post's author, set
  // when createPost auto-creates the room.
  const canMarkSold =
    canClose &&
    activeRoom?.hashtag === '#resell' &&
    Boolean(activeRoom?.postId) &&
    !roomClosed;

  return (
    <div className="ch-shell">

      {/* ── Rooms panel ──────────────────────────────────────────────────────── */}
      <div className="ch-rooms-panel">

        <div className="ch-rooms-header">
          <div className="ch-rooms-title">Chat Rooms</div>
          <div className="ch-search-wrap">
            <Search size={14} color="#72767d" />
            <input
              className="ch-search-input"
              placeholder="Search rooms…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#72767d', display: 'flex' }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="ch-rooms-list">
          {loadingRooms ? (
            [1, 2, 3, 4].map(i => (
              <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 8px', marginBottom: 2 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#e5e7eb', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 12, background: '#e5e7eb', borderRadius: 4, marginBottom: 5, width: '70%' }} />
                  <div style={{ height: 10, background: '#f3f4f6', borderRadius: 4, width: '50%' }} />
                </div>
              </div>
            ))
          ) : filteredRooms.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '24px 8px' }}>
              {searchQuery ? 'No rooms match your search.' : 'No active rooms yet. Be the first to create one!'}
            </div>
          ) : (
            <>
              {/* ── Global hub rooms ── */}
              {globalRooms.length > 0 && (
                <>
                  <div className="ch-rooms-section-label">Hub Rooms</div>
                  {globalRooms.map(room => {
                    // Compare ids directly as well as trusting myAccess: a room
                    // object can reach the list from a socket event or a create
                    // response, and mislabelling your own room offers you a
                    // "Request" button for a room you already own.
                    const creatorId = room.createdBy?._id || room.createdBy;
                    const isAdmin   = room.myAccess === 'creator' ||
                                      (creatorId && user?._id && String(creatorId) === String(user._id));
                    const gated     = room.requiresApproval && room.canEnter === false && !isAdmin;
                    return (
                      <div
                        key={room._id}
                        className={`ch-room-item ${activeRoom?._id === room._id ? 'ch-room-item--active' : ''} ${gated ? 'ch-room-item--locked' : ''}`}
                        onClick={() => handleSelectRoom(room)}
                        title={gated ? 'Approval required to join this room' : undefined}
                      >
                        <div className="ch-room-hashtag-dot" style={{ background: hashtagColor(room.hashtag) }}>
                          {gated ? <Lock size={11} /> : '#'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="ch-room-name">{room.name}</div>
                          <div className="ch-room-meta">
                            {room.hashtag} · {isAdmin ? 'You' : (room.createdBy?.displayName || 'Unknown')}
                          </div>
                        </div>

                        {/* Creator: pending-request badge */}
                        {isAdmin && room.pendingCount > 0 && (
                          <button
                            className="ch-pending-badge"
                            title={`${room.pendingCount} pending join request${room.pendingCount === 1 ? '' : 's'}`}
                            onClick={(e) => { e.stopPropagation(); setActiveRoom(room); setShowRequests(true); }}
                          >
                            <UserPlus size={11} /> {room.pendingCount}
                          </button>
                        )}

                        {/* Non-member: request / pending / declined */}
                        {gated && room.myAccess === 'none' && (
                          <button
                            className="ch-join-btn"
                            disabled={requestingId === room._id}
                            onClick={(e) => { e.stopPropagation(); handleRequestJoin(room); }}
                          >
                            {requestingId === room._id ? 'Sending…' : 'Request'}
                          </button>
                        )}
                        {gated && room.myAccess === 'pending' && (
                          <span className="ch-request-tag ch-request-tag--pending">
                            <Clock size={11} /> Pending
                          </span>
                        )}
                        {gated && room.myAccess === 'declined' && (
                          <span className="ch-request-tag ch-request-tag--declined">Declined</span>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* ── Post-linked rooms ── */}
              {postRooms.length > 0 && (
                <>
                  <div className="ch-rooms-section-label" style={{ marginTop: globalRooms.length > 0 ? 12 : 0 }}>Post Chats</div>
                  {postRooms.map(room => (
                    <div
                      key={room._id}
                      className="ch-room-item ch-room-item--post"
                      onClick={() => handleSelectRoom(room)}
                      title="Click to view the post"
                    >
                      <div className="ch-room-hashtag-dot" style={{ background: hashtagColor(room.hashtag) }}>
                        <FileText size={12} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ch-room-name">{room.name}</div>
                        <div className="ch-room-meta">{room.hashtag} · View post</div>
                      </div>
                      <ExternalLink size={12} style={{ color: '#9ca3af', flexShrink: 0 }} />
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {gateNotice && (
          <div className="ch-gate-notice" onClick={() => setGateNotice('')} title="Dismiss">
            {gateNotice}
          </div>
        )}

        <button className="ch-create-btn" onClick={() => setShowCreate(true)}>
          <Plus size={15} />
          Create Room
        </button>
      </div>

      {/* ── Chat area ────────────────────────────────────────────────────────── */}
      <div className="ch-chat-area">
        {!activeRoom ? (
          <div className="ch-empty">
            <div className="ch-empty-icon"><MessageSquare size={48} color="#9ca3af" /></div>
            <div className="ch-empty-title">Welcome to Chat Rooms</div>
            <div className="ch-empty-desc">
              Select a room from the left panel to start chatting, or create your own room around any topic.
            </div>
            <button className="ch-create-btn" style={{ marginTop: 8 }} onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Create a Room
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            {!connected && (
              <div style={{ background: '#fef2f2', color: '#ef4444', fontSize: 13, padding: '8px 12px', textAlign: 'center', fontWeight: 500, borderBottom: '1px solid #fee2e2' }}>
                Reconnecting to chat...
              </div>
            )}
            <div className="ch-chat-header">
              <div className="ch-chat-title">
                <button 
                  className="md:hidden mr-2 p-1 -ml-2 rounded-full hover:bg-gray-100 text-gray-500" 
                  onClick={() => setActiveRoom(null)}
                  aria-label="Back to rooms"
                >
                  <ChevronLeft size={20} />
                </button>
                <span style={{ fontSize: 20 }}>{hashtagEmoji(activeRoom.hashtag)}</span>
                {activeRoom.name}
                <span style={{ fontSize: 12, color: '#72767d', fontWeight: 400 }}>{activeRoom.hashtag}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Online count badge */}
                {onlineUsers.length > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#57f287', fontWeight: 600 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#57f287', display: 'inline-block' }} />
                    {onlineUsers.length} online
                  </span>
                )}
                {activeRoom.createdBy && (
                  <span style={{ fontSize: 12, color: '#72767d' }}>
                    by{' '}
                    <span
                      style={{ color: '#b9bbbe', cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => navigate(`/profile/${activeRoom.createdBy._id || activeRoom.createdBy}`)}
                    >
                      {activeRoom.createdBy.displayName || 'Unknown'}
                    </span>
                  </span>
                )}
                {activeRoom.myAccess === 'creator' && !roomClosed && (
                  <button
                    className="ch-requests-btn"
                    onClick={() => setShowRequests(true)}
                    title="Review who wants to join this room"
                  >
                    <UserPlus size={13} />
                    Requests
                    {activeRoom.pendingCount > 0 && (
                      <span className="ch-requests-btn-count">{activeRoom.pendingCount}</span>
                    )}
                  </button>
                )}
                {canMarkSold && (
                  <button
                    className="ch-sold-room-btn"
                    onClick={handleMarkSold}
                    disabled={markingSold}
                    title="Close this room and remove the listing"
                  >
                    {markingSold ? 'Marking…' : '✅ Mark as Sold'}
                  </button>
                )}
                {canClose && !roomClosed && (
                  <button
                    className="ch-close-room-btn"
                    onClick={handleCloseRoom}
                    disabled={closingRoom}
                  >
                    {closingRoom ? 'Closing…' : 'Close Room'}
                  </button>
                )}
              </div>
            </div>

            {/* Closed banner */}
            {roomClosed && (
              <div className="ch-closed-banner">
                This room has been closed and is now read-only.
              </div>
            )}

            {/* Messages */}
            <div className="ch-messages">
              {loadingMsgs ? (
                <div style={{ color: '#72767d', fontSize: 14, textAlign: 'center', marginTop: 40 }}>
                  Loading messages…
                </div>
              ) : groupedItems.length === 0 && sysMessages.length === 0 ? (
                <div style={{ color: '#72767d', fontSize: 14, textAlign: 'center', marginTop: 60 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>{hashtagEmoji(activeRoom.hashtag)}</div>
                  <div style={{ fontWeight: 700, color: '#b9bbbe', marginBottom: 6 }}>Welcome to #{activeRoom.name}</div>
                  <div>Be the first to send a message!</div>
                </div>
              ) : (
                <>
                  {/* Load older messages button */}
                  {hasMore && (
                    <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
                      <button
                        onClick={handleLoadOlder}
                        disabled={loadingOlder}
                        style={{
                          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 20, color: '#b9bbbe', fontSize: 12, fontWeight: 600,
                          padding: '6px 16px', cursor: loadingOlder ? 'default' : 'pointer',
                          transition: 'background 0.15s',
                        }}
                      >
                        {loadingOlder ? 'Loading…' : '⬆ Load older messages'}
                      </button>
                    </div>
                  )}
                  {groupedItems.map((item, idx) => {
                    if (item._type === 'divider') {
                      return <div key={item.key} className="ch-date-divider">{item.label}</div>;
                    }

                    const roleBadge = roleBadgeStyle(item.senderRole || item.senderId?.role);
                    const msgTime = item.timestamp ? format(new Date(item.timestamp), 'h:mm a') : '';
                    const myId = user?._id?.toString();
                    const isOwn = item.isOptimistic || (!!myId && senderIdOf(item) === myId);
                    const showMeta = item._showMeta;

                    const handleProfileClick = () => {
                      const uid = item.senderId?._id || item.senderId;
                      if (uid) navigate(`/profile/${uid}`);
                    };

                    return (
                      <div key={item._id || idx} className={`ch-msg-row ${isOwn ? 'ch-msg-own' : 'ch-msg-other'} ${showMeta ? 'ch-msg-first' : 'ch-msg-consecutive'} ch-msg-animate`}>

                        {/* Avatar only on the left side (others), only on first message of group */}
                        {!isOwn && (
                          <div className="ch-msg-avatar-col" onClick={handleProfileClick} title="View Profile">
                            {showMeta ? <Avatar user={item} size={32} /> : <div style={{ width: 32, height: 32 }} />}
                          </div>
                        )}

                        <div className="ch-msg-bubble-wrap">
                          {showMeta && !isOwn && (
                            <div className="ch-msg-meta">
                              <span className="ch-msg-sender" onClick={handleProfileClick} title="View Profile">{item.senderName || item.senderId?.displayName || '?'}</span>
                              {roleBadge && <span className="ch-msg-role-badge" style={roleBadge}>{item.senderRole || item.senderId?.role}</span>}
                            </div>
                          )}

                          <div className="ch-msg-bubble">
                            <div className="ch-msg-text">{item.text}</div>
                          </div>
                          <div className="ch-msg-time-below">{msgTime}</div>
                        </div>
                      </div>
                    );
                  })}

                  {/* System messages */}
                  {sysMessages.map((msg, i) => (
                    <div key={`sys-${i}`} className="ch-sys-msg">{msg}</div>
                  ))}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Online Users Panel */}
            <OnlineUsersPanel users={onlineUsers} currentUserId={user?._id} />

            {/* Input */}
            {!roomClosed && (
              <div className="ch-input-wrap">
                <div className="ch-input-inner">
                  <Hash size={16} color="#72767d" style={{ flexShrink: 0 }} />
                  <input
                    ref={inputRef}
                    className="ch-input-field"
                    placeholder={`Message #${activeRoom.name}…`}
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={1000}
                    disabled={sending}
                  />
                  <button
                    className="ch-send-btn"
                    onClick={handleSend}
                    disabled={!msgText.trim() || sending}
                    aria-label="Send message"
                  >
                    <SendHorizonal size={18} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Create Room Modal ─────────────────────────────────────────────────── */}
      {showCreate && (
        <CreateRoomModal
          onClose={() => setShowCreate(false)}
          onCreate={handleRoomCreated}
        />
      )}

      {showRequests && activeRoom && (
        <JoinRequestsPanel
          room={activeRoom}
          onClose={() => setShowRequests(false)}
          onDecided={fetchRooms}
        />
      )}
    </div>
  );
};

export default ChatHubPage;
