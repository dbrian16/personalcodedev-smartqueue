import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '@omni/shared';
import { useCatalog, apiErrorMessage } from '@omni/shared-ui';
import { UserPlus, UserCog, UserX, UserCheck, Shield, Clock, Loader2, Trash2 } from 'lucide-react';

interface StaffAccount {
  username: string;
  displayName: string;
  service: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  processedCount?: number;
  avgResponseTime?: number;
}

interface StaffManagementViewProps {
  token: string;
}

const StaffManagementView: React.FC<StaffManagementViewProps> = ({ token }) => {
  // The assignment list is the live catalogue, not a copy. It was hard-coded to
  // three names here, so a service an administrator added on the Operations
  // screen could never be assigned to anyone — and a renamed one silently
  // assigned staff to a queue the backend would reject.
  const { services } = useCatalog(API_BASE);

  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUsername, setEditingUsername] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    displayName: '',
    service: '',
    isActive: true
  });

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/admin/staff-accounts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAccounts(response.data);
      setError('');
    } catch (err) {
      setError('Failed to fetch staff accounts');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingUsername) {
        const payload: any = { ...formData };
        if (!payload.password) delete payload.password; // Don't update password if empty
        await axios.put(`${API_BASE}/admin/staff-accounts/${editingUsername}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post(`${API_BASE}/admin/staff-accounts`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setIsModalOpen(false);
      fetchAccounts();
    } catch (err) {
      setError(apiErrorMessage(err, 'Operation failed'));
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingUsername(null);
    setFormData({ username: '', password: '', displayName: '', service: services[0]?.name || '', isActive: true });
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = (acc: StaffAccount) => {
    setEditingUsername(acc.username);
    setFormData({ username: acc.username, password: '', displayName: acc.displayName, service: acc.service, isActive: acc.isActive });
    setError('');
    setIsModalOpen(true);
  };

  const formatWaitTime = (seconds?: number) => {
    if (!seconds) return '0m';
    const m = Math.floor(seconds / 60);
    return `${m}m`;
  };

  const handleDelete = async (username: string) => {
    if (!window.confirm(`Are you sure you want to delete account @${username}?`)) return;
    try {
      await axios.delete(`${API_BASE}/admin/staff-accounts/${username}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchAccounts();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to delete account'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (loading && accounts.length === 0) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500" size={48} /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-black tracking-tighter uppercase text-gray-900 flex items-center">
            <UserCog className="mr-3 text-blue-600" size={28} /> Staff Directory
          </h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Manage system access & view KPIs</p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all transform active:scale-95"
        >
          <UserPlus size={18} className="mr-2" /> NEW STAFF
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts.map(acc => (
          <div key={acc.username} className={`bg-white rounded-3xl p-6 border-2 transition-all shadow-sm hover:shadow-xl ${acc.isActive ? 'border-gray-100 hover:border-blue-200' : 'border-gray-200 opacity-75'}`}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-3">
                <div className={`p-3 rounded-2xl ${acc.isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                  {acc.role === 'admin' ? <Shield size={24} /> : <UserCheck size={24} />}
                </div>
                <div>
                  <h3 className="font-black text-lg text-gray-800">{acc.displayName}</h3>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">@{acc.username}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${acc.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {acc.isActive ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-gray-50 p-3 rounded-xl">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Assigned Service</p>
                <p className="font-bold text-sm text-gray-700 truncate">{acc.service}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 p-3 rounded-xl">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Processed</p>
                  <p className="font-black text-xl text-blue-600">{acc.processedCount || 0}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Avg Time</p>
                  <p className="font-black text-xl text-blue-600 flex items-center">
                    <Clock size={16} className="mr-1 opacity-50" />
                    {formatWaitTime(acc.avgResponseTime)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              <button 
                onClick={() => openEditModal(acc)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors"
              >
                EDIT CONFIGURATION
              </button>
              <button 
                onClick={() => handleDelete(acc.username)}
                className="px-4 py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors flex items-center justify-center"
                title="Delete Account"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="bg-gray-900 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">
                  {editingUsername ? 'Edit Staff Account' : 'New Staff Account'}
                </h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Access Provisioning</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white p-2">
                <UserX size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-bold border border-red-100">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Username</label>
                <input
                  required
                  disabled={!!editingUsername}
                  type="text"
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value.toLowerCase()})}
                  className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl font-bold focus:border-blue-500 focus:bg-white outline-none transition-all disabled:opacity-50"
                  placeholder="e.g. jdoe"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1 flex justify-between">
                  <span>Password</span>
                  {editingUsername && <span className="text-blue-500">Leave blank to keep current</span>}
                </label>
                <input
                  required={!editingUsername}
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl font-bold focus:border-blue-500 focus:bg-white outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Display Name</label>
                <input
                  required
                  type="text"
                  value={formData.displayName}
                  onChange={e => setFormData({...formData, displayName: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl font-bold focus:border-blue-500 focus:bg-white outline-none transition-all"
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Assigned Service</label>
                <select
                  required
                  value={formData.service}
                  onChange={e => setFormData({...formData, service: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl font-bold focus:border-blue-500 focus:bg-white outline-none transition-all appearance-none"
                >
                  <option value="">Select a service...</option>
                  {services.map((service) => (
                    <option key={service.name} value={service.name}>{service.name}</option>
                  ))}
                </select>
              </div>

              {editingUsername && (
                <div className="flex items-center space-x-3 py-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={e => setFormData({...formData, isActive: e.target.checked})}
                    className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="isActive" className="font-bold text-gray-700">Account is Active</label>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 mt-4 bg-blue-600 text-white rounded-xl font-black tracking-widest flex justify-center items-center hover:bg-blue-700 transition-colors disabled:opacity-70"
              >
                {loading ? <Loader2 className="animate-spin" /> : editingUsername ? 'SAVE CHANGES' : 'CREATE ACCOUNT'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffManagementView;
