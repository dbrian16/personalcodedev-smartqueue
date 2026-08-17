import React from 'react';
import { UserCheck, Clock, Star, UserCog, Users, Activity, BarChart2 } from 'lucide-react';
import { Lead } from '@omni/shared';
import { StaffAvailability } from '../../hooks/useAdminData';
import {
  computeHeatmap,
  computeStatusDistribution,
  computeSourceDistribution,
  computeCSATDistribution,
  computeServiceTimeByPosition,
  computeStaffPerformance,
  computeNoShowRate
} from '../../adminHelpers';

interface AnalyticsViewProps {
  leads: Lead[];
  staffAvailability: StaffAvailability[];
  isConnected: boolean;
}

const DonutChart = ({ data }: { data: { label: string; pct: number; color: string }[] }) => {
  let cumulativePct = 0;
  return (
    <div className="relative w-40 h-40">
      <svg viewBox="0 0 32 32" className="w-full h-full -rotate-90">
        {data.map((item, i) => {
          const dasharray = `${item.pct} 100`;
          const offset = -cumulativePct;
          cumulativePct += item.pct;
          return (
            <circle
              key={i} r="16" cx="16" cy="16" fill="transparent"
              stroke={item.color} strokeWidth="6"
              strokeDasharray={dasharray} strokeDashoffset={offset}
              className="transition-all duration-1000 ease-in-out"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center rounded-full">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center flex-col shadow-inner">
          <span className="text-xl font-black text-gray-800">{data[0]?.pct || 0}%</span>
          <span className="text-[9px] font-bold text-gray-400 uppercase">{data[0]?.label || ''}</span>
        </div>
      </div>
    </div>
  );
};

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ leads, staffAvailability, isConnected }) => {
  const avgWaitTime = leads.length > 0 
    ? Math.round(leads.reduce((acc, l) => acc + l.predictedWaitTime, 0) / leads.length) 
    : 0;
  
  const leadsWithFeedback = leads.filter(l => l.feedback);
  const csatScore = leadsWithFeedback.length > 0
    ? (leadsWithFeedback.reduce((acc, l) => acc + (l.feedback?.rating || 0), 0) / leadsWithFeedback.length).toFixed(1)
    : "N/A";

  const heatmapData = computeHeatmap(leads);
  const statusDist = computeStatusDistribution(leads);
  const sourceDist = computeSourceDistribution(leads);
  const csatDist = computeCSATDistribution(leads);
  const serviceTimes = computeServiceTimeByPosition(leads);
  const staffPerf = computeStaffPerformance(leads);
  const noShow = computeNoShowRate(leads);

  const activeStaff = staffAvailability.filter(s => s.status !== 'offline').length;

  const getBarColor = (height: number) => {
    if (height > 80) return 'bg-red-500';
    if (height > 50) return 'bg-orange-500';
    if (height > 0) return 'bg-blue-500';
    return 'bg-gray-700';
  };

  const statusColors: Record<string, string> = {
    'Completed': '#22c55e', 'Pending': '#eab308', 'Waiting': '#f97316',
    'Called': '#3b82f6', 'Serving': '#a855f7', 'No-Show': '#ef4444', 'Cancelled': '#9ca3af'
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-6 sm:space-y-8">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">Executive Dashboard</h2>
          <p className="text-gray-500 font-medium text-sm">Advanced Business Intelligence & Real-time Analytics.</p>
        </div>
        <div className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${isConnected ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
          {isConnected ? '● Live' : '● Disconnected'}
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-[1.5rem] shadow-lg border border-gray-100">
          <div className="text-blue-500 mb-2"><UserCheck size={24} /></div>
          <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Total Served</p>
          <h3 className="text-3xl font-black text-gray-800">{leads.filter(l => l.status === 'Completed').length}</h3>
        </div>
        <div className="bg-white p-5 rounded-[1.5rem] shadow-lg border border-gray-100">
          <div className="text-orange-500 mb-2"><Clock size={24} /></div>
          <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Avg Wait</p>
          <h3 className="text-3xl font-black text-gray-800">{avgWaitTime}<span className="text-lg ml-1 text-gray-400">m</span></h3>
        </div>
        <div className="bg-white p-5 rounded-[1.5rem] shadow-lg border border-gray-100">
          <div className="text-purple-500 mb-2"><Star size={24} /></div>
          <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">CSAT Score</p>
          <h3 className="text-3xl font-black text-gray-800">{csatScore}</h3>
        </div>
        <div className="bg-white p-5 rounded-[1.5rem] shadow-lg border border-gray-100">
          <div className="text-red-500 mb-2"><Activity size={24} /></div>
          <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">No-Show Rate</p>
          <h3 className="text-3xl font-black text-gray-800">{noShow.rate}<span className="text-lg ml-1 text-gray-400">%</span></h3>
        </div>
        <div className="bg-white p-5 rounded-[1.5rem] shadow-lg border border-gray-100">
          <div className="text-green-500 mb-2"><Users size={24} /></div>
          <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Active Staff</p>
          <h3 className="text-3xl font-black text-gray-800">{activeStaff}<span className="text-lg ml-1 text-gray-400">/{staffAvailability.length}</span></h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col items-center justify-center">
          <h3 className="text-sm font-black text-gray-800 mb-6 uppercase tracking-widest self-start w-full border-b pb-4">Status Distribution</h3>
          <div className="flex gap-8 items-center w-full justify-center">
            <DonutChart data={statusDist.slice(0, 4).map(d => ({ label: d.status, pct: d.pct, color: statusColors[d.status] || '#ccc' }))} />
            <div className="space-y-2">
              {statusDist.slice(0, 4).map(d => (
                <div key={d.status} className="flex items-center gap-2 text-xs font-bold text-gray-600">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: statusColors[d.status] || '#ccc' }}></div>
                  <span>{d.status} ({d.pct}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CSAT */}
        <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col">
          <h3 className="text-sm font-black text-gray-800 mb-6 uppercase tracking-widest border-b pb-4">Customer Experience</h3>
          <div className="space-y-6 flex-1 flex flex-col justify-center">
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2 flex justify-between"><span>Ratings (1-5 Stars)</span> <span>{csatDist.reduce((a,b)=>a+b.count,0)} reviews</span></p>
              <div className="flex gap-1 h-16 items-end">
                {csatDist.map(d => (
                  <div key={d.star} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="w-full bg-purple-100 rounded-t-sm relative group-hover:bg-purple-200 transition-colors" style={{ height: `${Math.max(d.pct, 5)}%` }}>
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-purple-700 opacity-0 group-hover:opacity-100">{d.count}</span>
                    </div>
                    <span className="text-[10px] font-black text-gray-400">{d.star}★</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Source & Service Times */}
        <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col">
          <h3 className="text-sm font-black text-gray-800 mb-6 uppercase tracking-widest border-b pb-4">Operations Metrics</h3>
          
          <div className="mb-6">
            <p className="text-xs font-bold text-gray-500 mb-2">Origin: On-site vs Online Booking</p>
            <div className="flex h-4 rounded-full overflow-hidden bg-blue-100">
              <div style={{ width: `${sourceDist.onSite.pct}%` }} className="bg-blue-600 flex items-center justify-center text-[10px] font-black text-white">{sourceDist.onSite.pct > 10 ? 'On-site' : ''}</div>
              <div style={{ width: `${sourceDist.remote.pct}%` }} className="bg-cyan-400 flex items-center justify-center text-[10px] font-black text-blue-900">{sourceDist.remote.pct > 10 ? 'Online' : ''}</div>
            </div>
          </div>

          <div className="flex-1">
            <p className="text-xs font-bold text-gray-500 mb-2">Avg Wait by Service (mins)</p>
            <div className="space-y-3">
              {serviceTimes.slice(0, 3).map((st, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[10px] font-bold text-gray-700 mb-1">
                    <span className="truncate">{st.position}</span>
                    <span>{st.avgWait}m</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div style={{ width: `${Math.min((st.avgWait / 60) * 100, 100)}%` }} className="h-full bg-orange-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gray-900 p-6 sm:p-10 rounded-[2rem] sm:rounded-[2.5rem] text-white shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-2">
            <div>
              <h3 className="text-xl font-black tracking-tight flex items-center"><BarChart2 className="mr-2 text-blue-400" /> Ticket Volume Heatmap</h3>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">24-Hour Distribution</p>
            </div>
          </div>
          <div className="grid grid-cols-12 sm:grid-cols-24 gap-1 sm:gap-2 h-24 sm:h-32 mt-4">
            {heatmapData.map((height, i) => (
              <div key={i} className="flex flex-col justify-end items-center group relative">
                <div 
                  style={{ height: `${Math.max(height, 3)}%` }} 
                  className={`w-full rounded-t-lg transition-all duration-500 ${getBarColor(height)} group-hover:opacity-80`}
                ></div>
                <span className="text-[7px] sm:text-[8px] font-bold text-gray-600 mt-2">{i}h</span>
                <div className="absolute -top-10 bg-white text-gray-900 px-2 py-1 rounded text-[8px] font-black opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">{height}% Load</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-xl border border-gray-100">
          <h3 className="text-lg font-black text-gray-800 mb-6 flex items-center border-b pb-4">
            <UserCog className="mr-2 text-orange-600" /> Staff Leaderboard
          </h3>
          <div className="space-y-4 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            {staffPerf.length > 0 ? staffPerf.map((s, i) => (
              <div key={s.staff} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${i < 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-gray-800">{s.staff}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">{s.served} served</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-gray-800">{s.avgRating ? `${s.avgRating}★` : '-'}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">{s.avgWait}m avg wait</p>
                </div>
              </div>
            )) : (
              <p className="text-gray-400 text-sm text-center py-8">No performance data yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
