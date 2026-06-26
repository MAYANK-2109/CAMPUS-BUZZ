/**
 * src/pages/ProfilePage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Own-user profile page: edit bio, view own posts, and access private saved posts.
 */

import React, { useState, useEffect } from 'react';
import { Bookmark, Grid3x3 } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import PostCard from '../components/PostCard';

const ProfilePage = () => {
  const { user, login } = useAuth();
  
  const [activeTab,    setActiveTab]   = useState('posts');
  const [editing,      setEditing]     = useState(false);
  const [form, setForm] = useState({
    displayName: user?.displayName || '',
    bio: user?.bio || '',
    avatarUrl: user?.avatarUrl || '',
  });
  const [saving, setSaving] = useState(false);
  
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  
  const [posts,        setPosts]        = useState([]);
  const [savedPosts,   setSavedPosts]   = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savedLoaded,  setSavedLoaded]  = useState(false);

  useEffect(() => {
    const fetchUserPosts = async () => {
      try {
        const { data } = await api.get('/posts?limit=50');
        const userPosts = data.data.filter(p => p.author?._id === user?._id);
        setPosts(userPosts);
      } catch (err) {
        console.error('Failed to load user posts', err);
      } finally {
        setLoadingPosts(false);
      }
    };
    if (user) fetchUserPosts();
  }, [user]);

  useEffect(() => {
    if (activeTab !== 'saved' || savedLoaded) return;
    const fetchSaved = async () => {
      setLoadingSaved(true);
      try {
        const { data } = await api.get('/users/me/saved');
        setSavedPosts(data.data || []);
        setSavedLoaded(true);
      } catch (err) {
        console.error('Failed to load saved posts', err);
      } finally {
        setLoadingSaved(false);
      }
    };
    fetchSaved();
  }, [activeTab, savedLoaded]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch('/users/profile', form);
      const currentToken = localStorage.getItem('cb_token');
      login(data.data, currentToken);
      setEditing(false);
      setShowPasswordForm(false);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return setPasswordError('New passwords do not match.');
    }

    setChangingPassword(true);
    try {
      await api.patch('/users/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setPasswordSuccess('Password changed successfully.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setShowPasswordForm(false), 2000);
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-12">
      <div className="max-w-2xl mx-auto px-4 py-8">
        
        <div className="flex items-start gap-6 md:gap-10 mb-10">
          <div className="w-24 h-24 md:w-36 md:h-36 flex-shrink-0 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center overflow-hidden">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl text-gray-400 font-medium uppercase">
                {user.displayName?.charAt(0) || user.rollNo?.charAt(0)}
              </span>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5 mb-4">
              <h1 className="text-xl font-medium truncate">{user.displayName}</h1>
              {!editing && (
                <button 
                  onClick={() => setEditing(true)}
                  className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-sm font-semibold rounded-lg transition-colors inline-block w-max"
                >
                  Edit Profile
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-6 mb-4 text-sm">
              <div><span className="font-semibold">{posts.length}</span> posts</div>
              {user.rollNo && user.role === 'Student' && (
                <div className="text-gray-500">{user.rollNo}</div>
              )}
              <div className="text-gray-500 capitalize">{user.role}</div>
            </div>
            
            <div className="text-sm">
              <p className="font-medium">{user.displayName}</p>
              {user.bio ? (
                <p className="whitespace-pre-wrap mt-1">{user.bio}</p>
              ) : (
                <p className="text-gray-400 italic mt-1">No bio yet.</p>
              )}
            </div>
          </div>
        </div>

        {editing && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-10 shadow-sm">
            <h2 className="font-semibold mb-4 text-lg">Edit Profile</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input className="input-base" value={form.displayName} onChange={(e) => setForm(p => ({ ...p, displayName: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                <textarea className="input-base resize-none" rows={3} maxLength={150} value={form.bio} onChange={(e) => setForm(p => ({ ...p, bio: e.target.value }))} placeholder="Tell us about yourself..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Avatar URL (Optional)</label>
                <input className="input-base" value={form.avatarUrl} onChange={(e) => setForm(p => ({ ...p, avatarUrl: e.target.value }))} placeholder="https://..." />
              </div>
              <div className="flex gap-3 mt-5">
                <button type="button" onClick={() => { setEditing(false); setShowPasswordForm(false); }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-200">
              {!showPasswordForm ? (
                <button type="button" onClick={() => setShowPasswordForm(true)} className="text-sm font-semibold text-gray-700 hover:text-gray-900 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  Change Password
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <h3 className="font-semibold text-md mb-2">Change Password</h3>
                  {passwordError && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{passwordError}</p>}
                  {passwordSuccess && <p className="text-sm text-green-600 bg-green-50 p-2 rounded">{passwordSuccess}</p>}
                  <div>
                    <input className="input-base" type="password" placeholder="Current Password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm(p => ({ ...p, currentPassword: e.target.value }))} required />
                  </div>
                  <div>
                    <input className="input-base" type="password" placeholder="New Password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))} required />
                  </div>
                  <div>
                    <input className="input-base" type="password" placeholder="Confirm New Password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))} required />
                  </div>
                  <div className="flex gap-3 mt-3">
                    <button type="button" onClick={() => setShowPasswordForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 flex-1">Cancel</button>
                    <button type="submit" disabled={changingPassword} className="btn-primary flex-1">{changingPassword ? 'Updating...' : 'Update Password'}</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('posts')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold tracking-widest uppercase transition-colors ${activeTab === 'posts' ? 'border-t-2 border-gray-900 text-gray-900 -mt-px' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Grid3x3 className="w-4 h-4" />
              Posts
            </button>
            <button
              onClick={() => setActiveTab('saved')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold tracking-widest uppercase transition-colors ${activeTab === 'saved' ? 'border-t-2 border-amber-500 text-amber-600 -mt-px' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Bookmark className={`w-4 h-4 ${activeTab === 'saved' ? 'fill-amber-500' : ''}`} />
              Saved
            </button>
          </div>
        </div>

        {activeTab === 'posts' && (
          <div className="pt-6">
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
                  <PostCard key={post._id} post={post} onPostDeleted={(id) => setPosts(p => p.filter(x => x._id !== id))} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="pt-6">
            {loadingSaved ? (
              <div className="text-center py-10 text-gray-500 text-sm">
                <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Loading saved posts...
              </div>
            ) : savedPosts.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-full border-2 border-gray-300 flex items-center justify-center mx-auto mb-4">
                  <Bookmark className="w-7 h-7 text-gray-300" />
                </div>
                <h3 className="text-lg font-medium mb-1 text-gray-700">No Saved Posts</h3>
                <p className="text-sm text-gray-400">Tap the bookmark on any post to save it here. Only you can see this.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {savedPosts.map(post => (
                  <PostCard key={post._id} post={post} hideDelete onPostDeleted={(id) => setSavedPosts(p => p.filter(x => x._id !== id))} />
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default ProfilePage;
