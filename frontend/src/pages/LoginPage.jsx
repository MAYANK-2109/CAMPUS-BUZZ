/**
 * src/pages/LoginPage.jsx
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api          from '../utils/api';
import { useAuth }  from '../context/AuthContext';

const LoginPage = () => {
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const from       = location.state?.from?.pathname || '/feed';

  const [mode, setMode] = useState('login');
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [form, setForm] = useState({
    rollNo: '', instituteEmail: '', password: '', role: 'Student', displayName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [message, setMessage] = useState('');

  const handleChange = e => { setForm(p => ({ ...p, [e.target.name]: e.target.value })); setError(''); setMessage(''); };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true); setError(''); setMessage('');
    try {
      if (forgotPasswordMode) {
        const { data } = await api.post('/auth/forgot-password', { instituteEmail: form.instituteEmail });
        setMessage('Password reset email sent! Check your inbox (or console if mocked).');
      } else {
        const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
        const payload  = mode === 'login'
          ? { instituteEmail: form.instituteEmail, password: form.password }
          : form;
        const { data } = await api.post(endpoint, payload);
        login(data.user, data.token);
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-8 py-10 mb-4">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <img
              src="/logo.png"
              alt="CampusBuzz"
              className="h-16 w-16 object-contain mb-3"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">CampusBuzz</h1>
            <p className="text-sm text-gray-500 mt-1 font-medium">NITRR · Campus Coordination Hub</p>
          </div>

          {/* Tab toggle */}
          {!forgotPasswordMode && (
            <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-6 bg-gray-50">
              {['login', 'register'].map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(''); setMessage(''); }}
                  className={`flex-1 py-2 text-sm font-semibold transition-all ${
                    mode === m
                      ? 'bg-white text-gray-900 shadow-sm rounded-xl'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m === 'login' ? 'Log in' : 'Sign up'}
                </button>
              ))}
            </div>
          )}

          {forgotPasswordMode && (
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Forgot Password</h2>
              <p className="text-sm text-gray-500 text-center">Enter your email to receive a reset link.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-center animate-fade-in-up">
                {error}
              </p>
            )}
            
            {message && (
              <p className="text-sm text-green-600 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 text-center animate-fade-in-up">
                {message}
              </p>
            )}

            {!forgotPasswordMode && mode === 'register' && (
              <>
                {form.role === 'Student' && (
                  <input className="input-base" name="rollNo" value={form.rollNo} onChange={handleChange} placeholder="Roll Number (e.g. 22BCE001)" required />
                )}
                <input className="input-base" name="displayName" value={form.displayName} onChange={handleChange} placeholder="Display Name" required />
                <select className="input-base" name="role" value={form.role} onChange={handleChange}>
                  <option value="Student">Student</option>
                  <option value="Club">Club / Society</option>
                  <option value="Admin">Admin</option>
                </select>
              </>
            )}

            <input className="input-base" name="instituteEmail" type="email" value={form.instituteEmail} onChange={handleChange} placeholder="Institute email" required />
            
            {!forgotPasswordMode && (
              <>
                <input className="input-base" name="password" type="password" value={form.password} onChange={handleChange} placeholder="Password" required />
                
                {mode === 'login' && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => { setForgotPasswordMode(true); setError(''); setMessage(''); }} className="text-xs text-blue-500 hover:text-blue-600 font-medium">
                      Forgot Password?
                    </button>
                  </div>
                )}
              </>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2 justify-center text-center">
              {loading
                ? (forgotPasswordMode ? 'Sending...' : (mode === 'login' ? 'Logging in…' : 'Creating account…'))
                : (forgotPasswordMode ? 'Send Reset Link' : (mode === 'login' ? 'Log in' : 'Create Account'))}
            </button>
            
            {forgotPasswordMode && (
              <button type="button" onClick={() => { setForgotPasswordMode(false); setError(''); setMessage(''); }} className="w-full mt-2 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
                Back to Login
              </button>
            )}
          </form>
        </div>

        {/* Toggle card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm py-5 text-center text-sm">
          {mode === 'login' ? (
            <p className="text-gray-700">Don't have an account?{' '}
              <button onClick={() => { setMode('register'); setError(''); }} className="text-blue-500 font-semibold hover:text-blue-600 transition-colors">Sign up</button>
            </p>
          ) : (
            <p className="text-gray-700">Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError(''); }} className="text-blue-500 font-semibold hover:text-blue-600 transition-colors">Log in</button>
            </p>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">National Institute of Technology Raipur</p>
      </div>
    </div>
  );
};

export default LoginPage;
