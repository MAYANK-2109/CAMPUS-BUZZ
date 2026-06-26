/**
 * src/components/Feed/ContactModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal for #lost and #found posts.
 * Shows the original poster's contact information (institute email + roll no).
 * No chat room is created for these post types.
 */

import React, { useEffect } from 'react';

const ContactModal = ({ post, onClose }) => {
  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!post) return null;

  const { author, title, description, hashtag } = post;
  const isLost  = hashtag === '#lost';

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center
                 bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
    >
      {/* Panel – stop propagation so clicking inside doesn't close */}
      <div
        className="relative w-full max-w-md bg-gray-900 border border-gray-700
                   rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                              ${isLost
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
              {hashtag}
            </span>
            <h2 id="contact-modal-title"
                className="mt-2 text-lg font-semibold text-white leading-snug">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors ml-4 flex-shrink-0"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Description */}
        <p className="text-gray-300 text-sm mb-5 leading-relaxed">{description}</p>

        {/* Contact card */}
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Contact the {isLost ? 'person who lost this' : 'person who found this'}
          </p>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-600/30 border border-violet-500/40
                            flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-violet-300">
                {author?.displayName?.charAt(0)?.toUpperCase() || '?'}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                {author?.displayName || 'Anonymous'}
              </p>
              <p className="text-xs text-gray-400">{author?.role}</p>
            </div>
          </div>

          <a
            href={`mailto:${author?.instituteEmail}`}
            className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300
                       transition-colors break-all"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {author?.instituteEmail}
          </a>

          <p className="text-xs text-gray-500">
            Roll No: <span className="text-gray-300">{author?.rollNo}</span>
          </p>
        </div>

        <p className="mt-4 text-xs text-gray-500 text-center">
          Reach out directly — no chat room is created for {hashtag} posts.
        </p>
      </div>
    </div>
  );
};

export default ContactModal;
