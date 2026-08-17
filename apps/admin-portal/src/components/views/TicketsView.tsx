import React from 'react';
import { Download, Star } from 'lucide-react';
import { Lead } from '@omni/shared';
import { getStatusColor, exportCSV } from '../../adminHelpers';

interface TicketsViewProps {
  leads: Lead[];
}

const TicketsView: React.FC<TicketsViewProps> = ({ leads }) => {
  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-4 sm:mb-6 gap-2">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">Full Transaction History</h2>
          <p className="text-gray-500 font-medium italic text-sm">Audit-ready records of all issued tickets.</p>
        </div>
        <button
          onClick={() => exportCSV(leads)}
          className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-green-700 transition-all shadow-lg self-start"
        >
          <Download size={14} />
          <span>Export CSV</span>
        </button>
      </header>

      <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden border border-gray-100 overflow-x-auto">
        <table className="w-full text-left min-w-[600px]">
          <thead className="bg-gray-800 text-white">
            <tr>
              <th className="px-4 sm:px-8 py-5 text-[10px] font-bold uppercase tracking-widest">Ticket</th>
              <th className="px-4 sm:px-8 py-5 text-[10px] font-bold uppercase tracking-widest">Service</th>
              <th className="px-4 sm:px-8 py-5 text-[10px] font-bold uppercase tracking-widest">Source</th>
              <th className="px-4 sm:px-8 py-5 text-[10px] font-bold uppercase tracking-widest">Status</th>
              <th className="px-4 sm:px-8 py-5 text-[10px] font-bold uppercase tracking-widest">Feedback</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 sm:px-8 py-4 sm:py-6">
                  <div className="flex items-center space-x-2">
                    <span className="font-black text-blue-600 text-base sm:text-lg">{lead.ticketNumber}</span>
                    {lead.priority && <span className="bg-orange-100 text-orange-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Priority</span>}
                  </div>
                  <p className="text-[10px] text-gray-400 font-bold mt-1">{new Date(lead.timestamp).toLocaleTimeString()}</p>
                </td>
                <td className="px-4 sm:px-8 py-4 sm:py-6">
                  <p className="text-xs sm:text-sm font-bold text-gray-700">{lead.service}</p>
                </td>
                <td className="px-4 sm:px-8 py-4 sm:py-6">
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest ${lead.source === 'On-site' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>{lead.source}</span>
                </td>
                <td className="px-4 sm:px-8 py-4 sm:py-6">
                  <span className={`text-xs font-black px-3 sm:px-4 py-1 sm:py-2 rounded-xl border-2 uppercase tracking-tighter ${getStatusColor(lead.status)}`}>{lead.status}</span>
                </td>
                <td className="px-4 sm:px-8 py-4 sm:py-6">
                  {lead.feedback ? (
                    <div className="flex text-yellow-500">
                      {[...Array(lead.feedback.rating)].map((_, i) => <Star key={i} size={12} fill="currentColor" />)}
                    </div>
                  ) : <span className="text-gray-300 text-xs">-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TicketsView;
