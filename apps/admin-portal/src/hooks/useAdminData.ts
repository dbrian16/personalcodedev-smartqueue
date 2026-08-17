import { useEffect, useRef } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { Lead, API_BASE, SOCKET_URL } from '@omni/shared';
import { create } from 'zustand';

export interface StaffAvailability {
  staffId: string;
  status: string;
  position: string;
}

export interface LongSessionAlert extends Lead {
  minutesElapsed: number;
}

// The dashboard is event-driven: the server pushes on every change. This poll is
// only a safety net for a dropped socket, so it runs rarely. It used to fire
// every five seconds against every endpoint, which is what made the documented
// "90% less bandwidth than broadcasting" untrue in practice.
const SAFETY_POLL_MS = 30000;
const DEGRADED_POLL_MS = 10000;

interface AdminState {
  leads: Lead[];
  staffAvailability: StaffAvailability[];
  alerts: LongSessionAlert[];
  isConnected: boolean;
  pollErrors: number;
  setLeads: (leads: Lead[]) => void;
  setStaffAvailability: (staff: StaffAvailability[]) => void;
  pushAlert: (alert: LongSessionAlert) => void;
  dismissAlert: (id: number) => void;
  setIsConnected: (connected: boolean) => void;
  incrementPollErrors: () => number;
  resetPollErrors: () => void;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  leads: [],
  staffAvailability: [],
  alerts: [],
  isConnected: true,
  pollErrors: 0,
  setLeads: (leads) => set({ leads }),
  setStaffAvailability: (staffAvailability) => set({ staffAvailability }),
  pushAlert: (alert) => set({
    alerts: [alert, ...get().alerts.filter((existing) => existing.id !== alert.id)].slice(0, 5)
  }),
  dismissAlert: (id) => set({ alerts: get().alerts.filter((alert) => alert.id !== id) }),
  setIsConnected: (isConnected) => set({ isConnected }),
  incrementPollErrors: () => {
    const next = get().pollErrors + 1;
    set({ pollErrors: next });
    if (next >= 3) set({ isConnected: false });
    return next;
  },
  resetPollErrors: () => set({ pollErrors: 0, isConnected: true })
}));

export const useAdminData = (token: string, onLogout: () => void) => {
  const {
    leads, staffAvailability, alerts, isConnected, pollErrors,
    setLeads, setStaffAvailability, pushAlert, dismissAlert,
    setIsConnected, incrementPollErrors, resetPollErrors
  } = useAdminStore();

  // Held in a ref so changing poll cadence never tears down the socket.
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;

    const fetchLeads = async () => {
      try {
        const response = await axios.get(`${API_BASE}/leads?includePending=true`, {
          timeout: 8000,
          headers: { Authorization: `Bearer ${token}` }
        });
        if (cancelled) return;
        setLeads(response.data);
        resetPollErrors();
      } catch (error: any) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          onLogout();
          return;
        }
        if (!cancelled) incrementPollErrors();
      }
    };

    const fetchStaffAvailability = async () => {
      try {
        const response = await axios.get(`${API_BASE}/admin/availability`, {
          timeout: 8000,
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!cancelled) setStaffAvailability(response.data);
      } catch (_error) {
        /* the leads poll already owns the connection banner */
      }
    };

    const refresh = () => { fetchLeads(); fetchStaffAvailability(); };
    refreshRef.current = refresh;
    refresh();

    const socket: Socket = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10
    });

    const onChange = () => refreshRef.current();
    socket.on('connect', () => { setIsConnected(true); refreshRef.current(); });
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('new_lead', onChange);
    socket.on('lead_status_updated', onChange);
    socket.on('feedback_received', onChange);
    socket.on('queue_updated', onChange);
    // Decision B3: the system prompts, a person decides. Nothing is auto-closed.
    socket.on('long_session_alert', (alert: LongSessionAlert) => {
      pushAlert(alert);
      refreshRef.current();
    });

    return () => {
      cancelled = true;
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, onLogout, setLeads, setStaffAvailability, pushAlert, setIsConnected, incrementPollErrors, resetPollErrors]);

  useEffect(() => {
    const interval = setInterval(() => refreshRef.current(), pollErrors > 0 ? DEGRADED_POLL_MS : SAFETY_POLL_MS);
    return () => clearInterval(interval);
  }, [pollErrors]);

  return { leads, staffAvailability, alerts, isConnected, dismissAlert, refresh: () => refreshRef.current() };
};
