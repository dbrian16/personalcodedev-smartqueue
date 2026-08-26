import React from 'react';
import { Clock, ArrowRightLeft } from 'lucide-react';
import { Lead } from '@omni/shared';

interface StaffActiveSessionProps {
  activeLead: Lead | null;
  leads: Lead[];
  assignedService: string;
  services: string[];
  callNextCustomer: () => void;
  handleStatusUpdate: (id: number, status: string) => void;
  recallCustomer: (id: number) => void;
  markNoShow: (id: number) => void;
  handleTransfer: (id: number, newService: string) => void;
  handleUpdateNotesTags: (id: number, notes: string, tags: string[]) => void;
}

const StaffActiveSession: React.FC<StaffActiveSessionProps> = ({
  activeLead, leads, assignedService, services,
  callNextCustomer, handleStatusUpdate, recallCustomer, markNoShow,
  handleTransfer, handleUpdateNotesTags
}) => {
  const waitingCount = leads.filter(l => l.status === 'Waiting').length;

  return (
    <div className="bg-white p-6 sm:p-10 rounded-[2.5rem] shadow-xl border border-gray-100 min-h-[500px] flex flex-col items-center justify-center text-center relative overflow-hidden">
      {/* Service indicator */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-500"></div>

      {activeLead ? (
        <div className="space-y-6 w-full fade-scale">
          {/* Status badge */}
          <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest inline-block ${
            activeLead.status === 'Called' 
              ? 'bg-blue-100 text-blue-600 border border-blue-200' 
              : 'bg-green-100 text-green-600 border border-green-200'
          }`}>
            {activeLead.status} Session
          </div>

          {/* Ticket number */}
          <h2 className="text-5xl sm:text-7xl font-black text-gray-800 tracking-tighter">{activeLead.ticketNumber}</h2>
          
          {/* Customer info */}
          <div className="space-y-1">
            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">{activeLead.service}</p>
            <p className="text-gray-300 font-medium text-[10px]">{activeLead.email} | {activeLead.phone}</p>
          </div>

          {/* Action area */}
          <div className="flex flex-col space-y-3 max-w-xs mx-auto pt-6">
            {activeLead.status === 'Called' ? (
              <>
                {/* Called state info */}
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Called</p>
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-1">
                    Recall Count: {activeLead.recallCount || 0}
                  </p>
                </div>
                <button 
                  onClick={() => handleStatusUpdate(activeLead.id, 'Serving')} 
                  className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-lg hover:bg-blue-700 shadow-xl shadow-blue-200 transform active:scale-95 transition-all"
                >
                  START SERVING
                </button>
                <button 
                  onClick={() => recallCustomer(activeLead.id)} 
                  className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-sm hover:bg-black shadow-xl transform active:scale-95 transition-all uppercase tracking-widest"
                >
                  RECALL
                </button>
                <button 
                  onClick={() => markNoShow(activeLead.id)} 
                  className="w-full py-3 text-red-600 font-bold hover:bg-red-50 rounded-xl transition-all uppercase tracking-widest text-[10px]"
                >
                  MARK AS NO-SHOW
                </button>
              </>
            ) : (
              <>
                {/* Serving state: notes, tags, transfer */}
                <div className="text-left space-y-4 mb-6 bg-gray-50 p-4 sm:p-6 rounded-3xl border border-gray-100">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">Internal Notes</label>
                    <textarea
                      defaultValue={activeLead.notes}
                      onBlur={(e) => handleUpdateNotesTags(activeLead.id, e.target.value, activeLead.tags || [])}
                      className="w-full p-4 bg-white border border-gray-200 rounded-xl text-sm focus:border-orange-500 outline-none h-24 transition-colors"
                      placeholder="Summarize the interaction..."
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">Service Tags</label>
                    <div className="flex flex-wrap gap-2">
                      {['#VIP', '#Urgent', '#Resolved', '#FollowUp'].map(tag => (
                        <button
                          key={tag}
                          onClick={() => {
                            const tags = activeLead.tags || [];
                            const newTags = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag];
                            handleUpdateNotesTags(activeLead.id, activeLead.notes || '', newTags);
                          }}
                          className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                            activeLead.tags?.includes(tag)
                              ? 'bg-orange-600 border-orange-600 text-white'
                              : 'bg-white border-gray-200 text-gray-400 hover:border-orange-500 hover:text-orange-600'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pt-4 border-t border-gray-200">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block flex items-center">
                      <ArrowRightLeft size={10} className="mr-1" /> Transfer Customer
                    </label>
                    <select
                      onChange={(e) => e.target.value && handleTransfer(activeLead.id, e.target.value)}
                      className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-bold focus:border-orange-500 outline-none"
                    >
                      <option value="">Select Service Line...</option>
                      {services.filter(s => s !== assignedService).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button 
                  onClick={() => handleStatusUpdate(activeLead.id, 'Completed')} 
                  className="w-full py-5 bg-green-600 text-white rounded-2xl font-black text-lg hover:bg-green-700 shadow-xl shadow-green-200 transform active:scale-95 transition-all"
                >
                  COMPLETE SESSION
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-8 fade-scale">
          <div className="bg-gray-50 w-32 h-32 rounded-full flex items-center justify-center mx-auto text-gray-200 shadow-inner">
            <Clock size={60} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-300 uppercase tracking-tighter">Position Standby</h2>
            <p className="text-gray-400 font-medium text-sm mt-1">Waiting for customers in {assignedService}</p>
          </div>
          <button
            disabled={waitingCount === 0}
            onClick={callNextCustomer}
            className="px-8 sm:px-12 py-5 bg-orange-600 text-white rounded-[2rem] font-black text-lg sm:text-xl hover:bg-orange-700 shadow-2xl shadow-orange-200 disabled:opacity-30 disabled:cursor-not-allowed transform active:scale-95 transition-all"
          >
            CALL NEXT CUSTOMER
          </button>
        </div>
      )}
    </div>
  );
};

export default StaffActiveSession;
