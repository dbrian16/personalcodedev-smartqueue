import React from 'react';
import { Users, AlertCircle } from 'lucide-react';
import { Lead } from '@omni/shared';

interface StaffWaitQueueProps {
  leads: Lead[];
  assignedService: string;
}

const StaffWaitQueue: React.FC<StaffWaitQueueProps> = ({ leads, assignedService }) => {
  const isSLAExceeded = (timestamp: string | Date) => {
    const waitTime = (new Date().getTime() - new Date(timestamp).getTime()) / 60000;
    return waitTime > 15;
  };

  const waitingLeads = leads.filter(l => l.status === 'Waiting');

  return (
    <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-gray-100 flex flex-col h-full min-h-[400px] lg:min-h-[600px]">
      <div className="p-6 sm:p-8 bg-gray-900 text-white flex justify-between items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Current Queue</p>
          <h3 className="text-base sm:text-lg font-black tracking-tight">{assignedService}</h3>
        </div>
        <span className="bg-orange-500 px-4 py-2 rounded-2xl font-black text-lg shadow-lg">{waitingLeads.length}</span>
      </div>
      <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 bg-gray-50/50">
        {waitingLeads.length > 0 ? (
          waitingLeads.map((l, index) => (
            <div key={l.id} className={`p-4 sm:p-5 bg-white rounded-3xl border shadow-sm flex justify-between items-center hover:shadow-md transition-shadow group ${isSLAExceeded(l.timestamp) ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}>
              <div className="flex items-center space-x-3 sm:space-x-4">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-black text-xs ${l.priority ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'} group-hover:bg-orange-50 group-hover:text-orange-500 transition-colors`}>
                  {l.priority ? 'PRIO' : `#${index + 1}`}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className="font-black text-gray-800 text-base sm:text-lg tracking-tight">{l.ticketNumber}</p>
                    {isSLAExceeded(l.timestamp) && <AlertCircle size={14} className="text-red-500 animate-pulse" />}
                  </div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{l.source}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-black text-base sm:text-lg ${isSLAExceeded(l.timestamp) ? 'text-red-600' : 'text-orange-500'}`}>{l.predictedWaitTime}<span className="text-[10px] ml-1">m</span></p>
                <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Wait Time</p>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-30 py-20">
            <Users size={60} />
            <p className="font-black uppercase tracking-widest text-xs">No customers waiting</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffWaitQueue;
