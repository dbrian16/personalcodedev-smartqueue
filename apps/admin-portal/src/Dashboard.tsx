import React, { useState } from 'react';
import { BarChart3, Ticket, UserCog, LogOut, ShieldCheck, SlidersHorizontal, AlertTriangle, X } from 'lucide-react';
import { useAdminData } from './hooks/useAdminData';
import AnalyticsView from './components/views/AnalyticsView';
import TicketsView from './components/views/TicketsView';
import StaffView from './components/views/StaffView';
import StaffManagementView from './components/views/StaffManagementView';
import OperationsView from './components/views/OperationsView';

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

type View = 'analytics' | 'customers' | 'staff' | 'management' | 'operations';

const TABS: Array<{ key: View; label: string; icon: React.ReactNode }> = [
  { key: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} className="mr-1 sm:mr-2" /> },
  { key: 'customers', label: 'Tickets', icon: <Ticket size={18} className="mr-1 sm:mr-2" /> },
  { key: 'staff', label: 'Staff', icon: <UserCog size={18} className="mr-1 sm:mr-2" /> },
  { key: 'management', label: 'Manage', icon: <ShieldCheck size={18} className="mr-1 sm:mr-2" /> },
  { key: 'operations', label: 'Operations', icon: <SlidersHorizontal size={18} className="mr-1 sm:mr-2" /> }
];

const Dashboard = ({ token, onLogout }: DashboardProps) => {
  const [view, setView] = useState<View>('analytics');

  const { leads, staffAvailability, alerts, isConnected, dismissAlert } = useAdminData(token, onLogout);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Connection status banner */}
      {!isConnected && (
        <div className="bg-red-600 text-white text-center py-2 text-xs font-bold uppercase tracking-widest">
          ⚠ Connection lost – Retrying...
        </div>
      )}

      {/* Long-session alerts: prompt a person, never auto-close */}
      {alerts.map((alert) => (
        <div key={alert.id} className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold">
            <AlertTriangle size={16} />
            <span>
              {alert.ticketNumber} has been in session for {alert.minutesElapsed} minutes
              {alert.staff ? ` at ${alert.staff}` : ''} ({alert.assignedPosition}).
            </span>
          </div>
          <button onClick={() => dismissAlert(alert.id)} className="p-1 hover:bg-amber-600 rounded" aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ))}

      {/* Top Navigation */}
      <nav className="bg-gray-900 text-white p-4 sm:p-6 shadow-2xl flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-600 p-2 sm:p-3 rounded-2xl shadow-lg">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black tracking-tighter uppercase">Management Dashboard</h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Admin Control Panel</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className="hidden lg:flex bg-gray-800 rounded-2xl p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={`px-3 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center ${view === tab.key ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={onLogout}
            className="bg-red-500/10 text-red-500 p-2 sm:p-3 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-lg"
          >
            <LogOut size={24} />
          </button>
        </div>
      </nav>

      {/* Mobile / tablet tab bar */}
      <div className="lg:hidden flex flex-wrap bg-white border-b border-gray-100 sticky top-[72px] z-40">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${view === tab.key ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <main className="p-4 sm:p-8 flex-1 max-w-7xl w-full mx-auto">
        {view === 'analytics' && <AnalyticsView leads={leads} staffAvailability={staffAvailability} isConnected={isConnected} />}
        {view === 'customers' && <TicketsView leads={leads} />}
        {view === 'staff' && <StaffView staffAvailability={staffAvailability} leads={leads} />}
        {view === 'management' && <StaffManagementView token={token} />}
        {view === 'operations' && <OperationsView token={token} />}
      </main>

      <footer className="p-6 sm:p-8 text-center text-gray-400 text-[10px] font-black tracking-widest uppercase border-t border-gray-100">
        <ShieldCheck size={14} className="inline mr-2 text-blue-600" /> Omni-Queue 360 Managerial Control Infrastructure
      </footer>
    </div>
  );
};

export default Dashboard;
