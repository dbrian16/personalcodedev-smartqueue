import React from 'react';
import { Users } from 'lucide-react';
import { Lead } from '@omni/shared';
import { StaffAvailability } from '../../hooks/useAdminData';
import { getStaffStatusColor } from '../../adminHelpers';

interface StaffViewProps {
  staffAvailability: StaffAvailability[];
  leads: Lead[];
}

const StaffView: React.FC<StaffViewProps> = ({ staffAvailability, leads }) => {
  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      <header className="mb-4 sm:mb-6">
        <h2 className="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">Staff & Availability</h2>
        <p className="text-gray-500 font-medium text-sm">Live staff status from all connected portals.</p>
      </header>

      {staffAvailability.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {staffAvailability.map(staff => (
            <div key={staff.staffId} className="bg-white p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-xl border border-gray-100 group">
              <div className="flex justify-between items-start mb-6">
                <div className="bg-blue-50 p-3 sm:p-4 rounded-3xl text-blue-600"><Users size={32} /></div>
                <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${getStaffStatusColor(staff.status)}`}>{staff.status}</span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-gray-800 mb-1">{staff.staffId}</h3>
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">{staff.position}</p>
              <div className="text-[10px] text-gray-400 font-bold">
                Tickets serving: {leads.filter(l => l.staff === staff.staffId && (l.status === 'Called' || l.status === 'Serving')).length}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white p-10 sm:p-16 rounded-[3rem] shadow-xl border border-gray-100 text-center">
          <Users size={60} className="mx-auto text-gray-200 mb-4" />
          <p className="font-black text-gray-400 uppercase tracking-widest text-xs">No staff currently connected</p>
          <p className="text-gray-300 text-sm mt-2">Staff members will appear here when they log into the Staff Portal</p>
        </div>
      )}
    </div>
  );
};

export default StaffView;
