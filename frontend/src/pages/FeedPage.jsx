/**
 * src/pages/FeedPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Main student feed page. Renders Announcement stories row and PostFeed.
 */

import React from 'react';
import PostFeed from '../components/PostFeed';
import AnnouncementStories from '../components/AnnouncementStories';

const FeedPage = () => {
  return (
    <div className="flex flex-col w-full">
      <AnnouncementStories />
      <PostFeed />
    </div>
  );
};

export default FeedPage;
