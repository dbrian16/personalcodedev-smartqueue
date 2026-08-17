import React, { useState, useEffect, useCallback } from 'react';
import { Users, LogOut, ShieldCheck, Briefcase, ArrowLeftRight } from 'lucide-react';
import axios from 'axios';
import { Lead, API_BASE, SOCKET_URL } from '@omni/shared';
import { Toast, useCatalog, useSocketRoom, apiErrorMessage } from '@omni/shared-ui';
import { UserMeta } from './types';
import StaffActiveSession from './components/views/StaffActiveSession';
import StaffWaitQueue from './components/views/StaffWaitQueue';

interface StaffWorkspaceProps {
  token: string;
  userMeta: UserMeta;
  onLogout: () => void;
}

const StaffWorkspace = ({ token, userMeta, onLogout }: StaffWorkspaceProps) => {
  // The transfer list comes from the backend catalogue, so a service added by an
  // administrator is immediately available here without a redeploy.
  const { services } = useCatalog(API_BASE);
  const serviceNames = services.map((service) => service.name);
  const assignedService = userMeta.service || serviceNames[0] || '';
  const displayName = userMeta.displayName || 'Staff';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  // A counter may cover another service line, but only by switching to it on
  // purpose. Nothing happens by accident, and the server logs every action
  // taken while covering.
  const [coveringService, setCoveringService] = useState<string>('');
  const activeCounter = coveringService || assignedService;
  const isCovering = !!coveringService;

  const showToast = useCallback((message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
  }, []);

  const getAuthConfig = useCallback(() => ({
    headers: { Authorization: `Bearer ${token}` }
  }), [token]);

  // Fetch leads for the counter being worked
  const fetchLeads = useCallback(async () => {
    if (!token) return;
    try {
      const { data } = await axios.get<Lead[]>(
        `${API_BASE}/leads?position=${encodeURIComponent(activeCounter)}`,
        getAuthConfig()
      );
      setLeads(data);
      setActiveLead(data.find((l) => l.status === 'Serving' || l.status === 'Called') || null);
    } catch {
      showToast('Failed to fetch queue');
    }
  }, [token, activeCounter, getAuthConfig, showToast]);

  // Report availability when activeLead changes. The position reported is the
  // counter actually being worked, so wait-time estimates count a covering staff
  // member against the queue they are serving.
  useEffect(() => {
    if (!token || !displayName || !activeCounter) return;
    const active = activeLead?.status === 'Serving' || activeLead?.status === 'Called';
    axios.post(`${API_BASE}/admin/availability`, {
      staffId: displayName,
      status: active ? 'busy' : 'online',
      position: activeCounter
    }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }, [token, displayName, activeCounter, activeLead?.status]);

  // Any queue change on this counter means the same thing here: re-read the line.
  useSocketRoom<Lead>({
    url: SOCKET_URL,
    enabled: !!token,
    token,
    position: activeCounter,
    handlers: {
      new_lead: fetchLeads,
      lead_status_updated: fetchLeads,
      queue_updated: fetchLeads
    }
  });

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  /**
   * Every counter action is the same shape: call the server, refresh the line,
   * then say what happened — or show why it did not. Writing that once means a
   * new action cannot forget the refresh or swallow the server's explanation.
   */
  const runAction = async <T,>(
    failureMessage: string,
    request: () => Promise<{ data: T }>,
    onSuccess?: (data: T) => void
  ) => {
    try {
      const { data } = await request();
      await fetchLeads();
      onSuccess?.(data);
    } catch (error) {
      showToast(apiErrorMessage(error, failureMessage));
    }
  };

  // Staff actions. `coveringFor` is what turns an accidental cross-counter action
  // into a deliberate one on the server side.
  const callNextCustomer = () => runAction<Lead>(
    'Failed to call next customer',
    () => axios.post(
      `${API_BASE}/staff/call-next`,
      { position: activeCounter, coveringFor: isCovering },
      getAuthConfig()
    ),
    (data) => {
      setActiveLead(data);
      showToast(`Called ${data.ticketNumber}`, 'success');
    }
  );

  const recallCustomer = (leadId: number) => runAction<{ message?: string; autoNoShow?: boolean }>(
    'Failed to recall',
    () => axios.post(`${API_BASE}/staff/recall/${leadId}`, { coveringFor: isCovering }, getAuthConfig()),
    // Decision B2: the last permitted recall converts the ticket to a no-show,
    // so the counter is told what actually happened rather than "recalled".
    (data) => showToast(data.message || 'Customer recalled', data.autoNoShow ? 'error' : 'success')
  );

  const markNoShow = (leadId: number) => runAction(
    'Failed to mark No-Show',
    () => axios.post(`${API_BASE}/staff/no-show/${leadId}`, { coveringFor: isCovering }, getAuthConfig()),
    () => showToast('Marked as No-Show', 'success')
  );

  const handleStatusUpdate = (id: number, status: string) => runAction(
    'Failed to update status',
    () => axios.patch(`${API_BASE}/leads/${id}`, { status, coveringFor: isCovering }, getAuthConfig()),
    () => showToast(`Status updated to ${status}`, 'success')
  );

  const handleTransfer = (id: number, newService: string) => runAction(
    'Failed to transfer',
    () => axios.post(`${API_BASE}/leads/${id}/transfer`, { newService }, getAuthConfig()),
    () => showToast(`Transferred to ${newService}`, 'success')
  );

  // Notes save silently: the counter is typing, not waiting for confirmation.
  const handleUpdateNotesTags = (id: number, notes: string, tags: string[]) => runAction(
    'Failed to update notes',
    () => axios.patch(`${API_BASE}/leads/${id}`, { notes, tags, coveringFor: isCovering }, getAuthConfig())
  );

  const startCovering = (service: string) => {
    setCoveringService(service === assignedService ? '' : service);
    setActiveLead(null);
    setLeads([]);
  };

  const isPentest = activeCounter.toLowerCase().includes('pentest');

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Navigation bar */}
      <nav className="bg-white p-4 sm:p-5 shadow-md flex justify-between items-center px-4 sm:px-10 sticky top-0 z-50 border-b border-gray-100">
        <div className="flex items-center space-x-4 sm:space-x-6">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-2xl text-white shadow-lg ${isPentest ? 'bg-red-500' : 'bg-blue-600'}`}>
              <Users size={22} />
            </div>
            <div>
              <h1 className="font-black text-lg tracking-tighter uppercase">Staff Portal</h1>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{displayName}</p>
            </div>
          </div>
          {/* Counter selector. Covering another line is a
              deliberate switch, and the banner below never lets it be forgotten. */}
          <div className="hidden md:flex items-center bg-gray-50 pl-4 pr-2 py-1.5 rounded-xl border border-gray-200">
            <Briefcase size={14} className={`mr-2 ${isPentest ? 'text-red-500' : 'text-blue-600'}`} />
            <select
              value={activeCounter}
              onChange={(e) => startCovering(e.target.value)}
              className="bg-transparent text-[10px] font-black uppercase tracking-widest text-gray-600 outline-none cursor-pointer pr-1"
              title="Switch to another counter to cover for it"
            >
              <option value={assignedService}>{assignedService}</option>
              {serviceNames.filter((name) => name !== assignedService).map((name) => (
                <option key={name} value={name}>Cover: {name}</option>
              ))}
            </select>
          </div>
        </div>
        <button onClick={onLogout} className="text-gray-300 hover:text-red-500 transition-colors p-2">
          <LogOut size={22} />
        </button>
      </nav>

      {isCovering && (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold">
            <ArrowLeftRight size={16} />
            <span>
              You are covering <b>{coveringService}</b>. Your own counter is {assignedService}.
              Every action here is recorded against the cover.
            </span>
          </div>
          <button
            onClick={() => startCovering(assignedService)}
            className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700"
          >
            Back to my counter
          </button>
        </div>
      )}

      {/* Mobile counter selector */}
      <div className="md:hidden px-4 pt-3">
        <select
          value={activeCounter}
          onChange={(e) => startCovering(e.target.value)}
          className={`w-full text-center py-2 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none ${
            isCovering
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : isPentest
                ? 'bg-red-50 text-red-600 border border-red-100'
                : 'bg-blue-50 text-blue-600 border border-blue-100'
          }`}
        >
          <option value={assignedService}>{assignedService}</option>
          {serviceNames.filter((name) => name !== assignedService).map((name) => (
            <option key={name} value={name}>Cover: {name}</option>
          ))}
        </select>
      </div>

      {/* Main content */}
      <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 flex-1">
        <div className="lg:col-span-2 space-y-6">
          <StaffActiveSession
            activeLead={activeLead}
            leads={leads}
            assignedService={activeCounter}
            services={serviceNames}
            callNextCustomer={callNextCustomer}
            handleStatusUpdate={handleStatusUpdate}
            recallCustomer={recallCustomer}
            markNoShow={markNoShow}
            handleTransfer={handleTransfer}
            handleUpdateNotesTags={handleUpdateNotesTags}
          />
        </div>
        <StaffWaitQueue leads={leads} assignedService={activeCounter} />
      </main>

      {/* Footer */}
      <footer className="p-6 sm:p-8 text-center text-gray-400 text-[10px] font-bold tracking-widest uppercase flex items-center justify-center space-x-4">
        <div className="flex items-center"><ShieldCheck size={14} className="mr-1 text-green-500" /> Secure Encryption Active</div>
        <div className="w-1 h-1 bg-gray-200 rounded-full"></div>
        <div>Omni-Queue 360 v2.1.0</div>
      </footer>
    </div>
  );
};

export default StaffWorkspace;
