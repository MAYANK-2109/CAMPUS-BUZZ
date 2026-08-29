/**
 * src/components/FindBot.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Find BOT" — a floating assistant that answers in buttons.
 *
 * Ask it "i want a ride split" and it replies with a Ride Split button that
 * navigates to /rides. It routes intent; it does not converse. Every answer is
 * something the user can tap, because the point is to get them somewhere, not
 * to talk to them.
 *
 * Rendered once in App.jsx inside the authenticated shell, so it is reachable
 * from every page. Intent matching lives on the server (utils/findBot.js) so
 * the destination list has one home.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Send, X, Sparkles } from 'lucide-react';
import api from '../utils/api';

/** Shown on first open, so an empty box is not the first thing people meet. */
const SUGGESTIONS = [
  'I want a ride split',
  'Book a library seat',
  'I lost my wallet',
  'Sell my cycle',
];

const GREETING = {
  from: 'bot',
  text: "Hi! I'm Find BOT. Tell me what you need and I'll take you straight there.",
  actions: [],
};

const FindBot = () => {
  const navigate = useNavigate();

  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput]       = useState('');
  const [busy, setBusy]         = useState(false);

  const endRef   = useRef(null);
  const inputRef = useRef(null);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  // Escape closes, matching the other overlays in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const send = async (text) => {
    const query = (text ?? input).trim();
    if (!query || busy) return;

    setMessages((prev) => [...prev, { from: 'user', text: query, actions: [] }]);
    setInput('');
    setBusy(true);

    try {
      const { data } = await api.post('/findbot/ask', { query });
      setMessages((prev) => [...prev, { from: 'bot', text: data.data.reply, actions: data.data.actions }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        from: 'bot',
        text: err.response?.data?.message || "I couldn't reach the server. Try again in a moment.",
        actions: [],
      }]);
    } finally {
      setBusy(false);
    }
  };

  /** Tapping an answer navigates and closes — the user asked to go somewhere. */
  const go = (route) => { setOpen(false); navigate(route); };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Find BOT"
<<<<<<< Updated upstream
          className="fb-launcher flex items-center gap-2 pl-4 pr-5 py-3 rounded-full
                     bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-lg
                     hover:shadow-xl hover:from-teal-700 hover:to-cyan-700
=======
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 pl-4 pr-5 py-3 rounded-full
                     bg-slate-800 text-white shadow-lg hover:bg-slate-700
>>>>>>> Stashed changes
                     active:scale-95 transition-all"
        >
          <Bot className="w-5 h-5" />
          {/* The label is hidden on the narrowest phones, where a pill this wide
              crowds the tab bar underneath it. The icon still reads as a bot. */}
          <span className="fb-launcher-label text-sm font-bold">Find BOT</span>
        </button>
      )}

      {open && (
        <div className="fb-panel rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">

<<<<<<< Updated upstream
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3
                          bg-gradient-to-r from-teal-600 to-cyan-600 text-white">
=======
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white">
>>>>>>> Stashed changes
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <div>
                <div className="text-sm font-bold leading-tight">Find BOT</div>
                <div className="text-[11px] text-slate-300 leading-tight">Ask for anything on campus</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close Find BOT"
                    className="p-1 rounded-full hover:bg-white/20 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-3 bg-gray-50">
            {messages.map((m, i) => (
              <div key={i} className={m.from === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={m.from === 'user' ? 'max-w-[85%]' : 'max-w-[85%] w-full'}>
                  <div className={`px-3 py-2 rounded-2xl text-sm leading-snug ${
                    m.from === 'user'
                      ? 'bg-teal-600 text-white rounded-br-sm'
                      : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
                  }`}>
                    {m.text}
                  </div>

                  {m.actions?.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {m.actions.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => go(a.route)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white
                                     border border-teal-200 hover:border-teal-400 hover:bg-teal-50
                                     active:scale-[0.98] transition-all text-left group"
                        >
                          <span className="text-lg leading-none">{a.emoji}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-gray-900">{a.label}</span>
                            <span className="block text-[11px] text-gray-500 truncate">{a.blurb}</span>
                          </span>
                          <Sparkles className="w-3.5 h-3.5 text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {messages.length === 1 && (
              <div className="pt-1 space-y-1.5">
                <div className="text-[11px] font-semibold text-gray-400 px-1">TRY ASKING</div>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}
                          className="w-full text-left px-3 py-2 rounded-lg bg-white border border-gray-200
                                     text-xs text-gray-600 hover:border-teal-300 hover:text-teal-700 transition-colors">
                    &ldquo;{s}&rdquo;
                  </button>
                ))}
              </div>
            )}

            {busy && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-white border border-gray-200">
                  <span className="flex gap-1">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                            style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(); }}
                className="flex-shrink-0 flex items-center gap-2 p-3 border-t border-gray-200 bg-white"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              placeholder="What are you looking for?"
              /* 16px: iOS Safari zooms the whole page when a focused input is
                 smaller, and the zoom is not undone on blur. */
              style={{ fontSize: '16px' }}
              className="flex-1 min-w-0 px-3 py-2 rounded-full bg-gray-100 border border-transparent
                         focus:bg-white focus:border-teal-400 focus:outline-none transition-colors"
            />
            <button type="submit" disabled={!input.trim() || busy} aria-label="Send"
                    className="p-2.5 rounded-full bg-teal-600 text-white disabled:opacity-40
                               enabled:hover:bg-teal-700 enabled:active:scale-95 transition-all">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};

export default FindBot;
