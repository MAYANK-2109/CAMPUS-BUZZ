/**
 * src/pages/UserProfilePage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Public profile page for viewing other users.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import PostCard from '../components/PostCard';

const UserProfilePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  
  const [profileUser, setProfileUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  // If the user tries to view their own profile, redirect to /profile
  useEffect(() => {
    if (currentUser?._id === id) {
      navigate('/profile', { replace: true });
    }
  }, [id, currentUser, navigate]);

  // ── Fetch user profile ──────────────────────────────────────────────────────
  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get(`/users/${id}`);
        setProfileUser(data.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load user profile.');
      } finally {
        setLoading(false);
      }
    };
    if (id && currentUser?._id !== id) fetchUser();
  }, [id, currentUser]);

  // ── Fetch user's posts ──────────────────────────────────────────────────────
  useEffect(() => {
    const fetchUserPosts = async () => {
      try {
        const { data } = await api.get(`/posts?limit=50`);
        // Filter locally since API doesn't have an author filter yet
        const userPosts = data.data.filter(p => p.author?._id === id);
        setPosts(userPosts);
      } catch (err) {
        console.error('Failed to load user posts', err);
      } finally {
        setLoadingPosts(false);
      }
    };
    
    if (id && currentUser?._id !== id) {
      fetchUserPosts();
    }
  }, [id, currentUser]);

  // ── Handle Follow / Unfollow ────────────────────────────────────────────────
  const [togglingFollow, setTogglingFollow] = useState(false);

  const isFollowing = profileUser?.followers?.includes(currentUser?._id);

  const handleFollowToggle = async () => {
    if (togglingFollow) return;
    setTogglingFollow(true);
    try {
      const { data } = await api.post(`/users/${id}/follow`);
      
      // Update local state
      setProfileUser(prev => {
        if (!prev) return prev;
        const newFollowers = data.following
          ? [...(prev.followers || []), currentUser._id]
          : (prev.followers || []).filter(uid => uid !== currentUser._id);
          
        return {
          ...prev,
          followers: newFollowers
        };
      });
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update follow status.');
    } finally {
      setTogglingFollow(false);
    }
  };

  if (currentUser?._id === id) return null; // Wait for redirect

  if (loading) return <div className="text-center py-20 text-gray-500">Loading profile...</div>;
  if (error) return <div className="text-center py-20 text-red-500">{error}</div>;
  if (!profileUser) return <div className="text-center py-20 text-gray-500">User not found.</div>;

  const canFollow = ['Club', 'Admin'].includes(profileUser.role);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-12">
      <div className="max-w-2xl mx-auto px-4 py-8">
        
        {/* ── Profile Header ──────────────────────────────────────────────── */}
        <div className="flex items-start gap-6 md:gap-10 mb-10">
          {/* Avatar */}
          <div className="w-24 h-24 md:w-36 md:h-36 flex-shrink-0 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center overflow-hidden">
            {profileUser.avatarUrl ? (
              <img src={profileUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl text-gray-400 font-medium uppercase">
                {profileUser.displayName?.charAt(0) || profileUser.rollNo?.charAt(0)}
              </span>
            )}
          </div>
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5 mb-4">
              <h1 className="text-xl font-medium truncate">{profileUser.displayName}</h1>
              {canFollow && (
                <button 
                  onClick={handleFollowToggle}
                  disabled={togglingFollow}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors inline-block w-max ${
                    isFollowing
                      ? 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  } ${togglingFollow ? 'opacity-50' : ''}`}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-6 mb-4 text-sm flex-wrap">
              <div><span className="font-semibold">{posts.length}</span> posts</div>
              {canFollow && (
                <div><span className="font-semibold">{profileUser.followers?.length || 0}</span> followers</div>
              )}
              {profileUser.rollNo && (
                <div className="text-gray-500">{profileUser.rollNo}</div>
              )}
              <div className="text-gray-500 capitalize">{profileUser.role}</div>
            </div>
            
            <div className="text-sm">
              <p className="font-medium">{profileUser.displayName}</p>
              {profileUser.bio ? (
                <p className="whitespace-pre-wrap mt-1">{profileUser.bio}</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Posts Grid / Feed ───────────────────────────────────────────── */}
        <div className="border-t border-gray-200 pt-6">
          <div className="flex justify-center mb-6">
            <span className="text-xs font-semibold tracking-widest text-gray-900 border-t border-gray-900 -mt-[25px] pt-4 uppercase">
              Posts
            </span>
          </div>
          
          {loadingPosts ? (
            <div className="text-center py-10 text-gray-500 text-sm">Loading posts...</div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full border-2 border-gray-300 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl text-gray-400">📷</span>
              </div>
              <h3 className="text-xl font-medium mb-1">No Posts Yet</h3>
            </div>
          ) : (
            <div className="space-y-6">
              {posts.map(post => (
                <PostCard 
                  key={post._id} 
                  post={post}
                  hideDelete={true}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default UserProfilePage;
