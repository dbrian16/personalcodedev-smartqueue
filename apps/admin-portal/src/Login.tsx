import React, { useState } from 'react';
import { Lock, User, ShieldCheck, Fingerprint, Loader2 } from 'lucide-react';
import { API_BASE } from '@omni/shared';
import { apiErrorMessage, apiPost } from '@omni/shared-ui';
import { UserMeta, UserRole } from './types';

interface LoginProps {
  onLogin: (token: string, role: UserRole, meta: UserMeta) => void;
}

const Login = ({ onLogin }: LoginProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Auto-detect user type based on username
    const isAdmin = username.trim().toLowerCase() === 'admin';
    const userType = isAdmin ? 'admin' : 'staff';

    try {
      const { data } = await apiPost(`${API_BASE}/auth/login`, {
        userType,
        username: username.trim(),
        password
      });

      const role = data.userType as UserRole;
      const meta: UserMeta = {
        displayName: data.displayName,
        service: data.service
      };

      onLogin(data.token, role, meta);
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid credentials. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-md w-full relative z-10 fade-scale">
        {/* Card */}
        <div className="bg-gray-900/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-800/50">
          {/* Header */}
          <div className="p-10 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-transparent to-orange-500/20"></div>
            <div className="relative z-10">
              <div className="bg-gradient-to-br from-blue-500 to-blue-700 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-500/30">
                <ShieldCheck size={44} className="text-white" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white uppercase">Management Dashboard</h1>
              <p className="text-gray-500 text-[10px] mt-2 uppercase tracking-[0.25em] font-bold">
                Omni-Queue 360 · Secure Access Portal
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="p-8 pt-2 space-y-5">
            {error && (
              <div className="bg-red-500/10 text-red-400 p-4 rounded-2xl text-sm font-bold border border-red-500/20 flex items-center slide-up">
                <Fingerprint size={16} className="mr-2 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">Username</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
                <input
                  required
                  type="text"
                  id="login-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin / staff1-4"
                  className="w-full pl-12 pr-4 py-4 bg-gray-800/50 border border-gray-700/50 rounded-2xl text-white placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none transition-all font-bold text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
                <input
                  required
                  type="password"
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-4 bg-gray-800/50 border border-gray-700/50 rounded-2xl text-white placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none transition-all font-bold text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              id="login-submit"
              disabled={loading}
              className="w-full py-5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl font-black text-base hover:from-blue-500 hover:to-blue-600 shadow-xl shadow-blue-600/20 transform active:scale-[0.98] transition-all mt-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 uppercase tracking-wider"
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <span>Authorize Access</span>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="p-5 border-t border-gray-800/50 text-center">
            <p className="text-[9px] text-gray-600 font-bold uppercase tracking-[0.15em]">
              System ID: OMNI-MGT-360 · AES-256 Encrypted
            </p>
          </div>
        </div>

        {/* Role hint */}
        <div className="mt-6 flex justify-center space-x-6">
          <div className="flex items-center space-x-2 text-gray-600">
            <div className="w-2 h-2 rounded-full bg-blue-500/50"></div>
            <span className="text-[9px] font-bold uppercase tracking-widest">Admin</span>
          </div>
          <div className="flex items-center space-x-2 text-gray-600">
            <div className="w-2 h-2 rounded-full bg-orange-500/50"></div>
            <span className="text-[9px] font-bold uppercase tracking-widest">Staff</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
