/**
 * src/components/Feed/HashtagBadge.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a styled pill badge for each hashtag type.
 */

import React from 'react';

const HASHTAG_STYLES = {
  '#foodsplit': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  '#cabsplit':  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  '#resell':    'bg-purple-500/20 text-purple-300 border-purple-500/30',
  '#lost':      'bg-red-500/20 text-red-300 border-red-500/30',
  '#found':     'bg-green-500/20 text-green-300 border-green-500/30',
  'None':       'bg-gray-700/30 text-gray-400 border-gray-600/30',
};

const HashtagBadge = ({ hashtag }) => {
  const style = HASHTAG_STYLES[hashtag] || HASHTAG_STYLES['None'];
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${style}`}>
      {hashtag === 'None' ? 'general' : hashtag}
    </span>
  );
};

export default HashtagBadge;
