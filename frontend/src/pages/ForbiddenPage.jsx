/**
 * src/pages/ForbiddenPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displayed when a user accesses a route they don't have permission for.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';

const ForbiddenPage = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-6xl mb-4">🚫</p>
        <h1 className="text-2xl font-bold text-white mb-2">Access Forbidden</h1>
        <p className="text-gray-400 mb-6">You don't have permission to view this page.</p>
        <button
          onClick={() => navigate('/feed')}
          className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white
                     font-semibold text-sm rounded-xl transition-colors"
        >
          Back to Feed
        </button>
      </div>
    </div>
  );
};

export default ForbiddenPage;
