import { useEffect, useReducer, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Lead, API_BASE, SOCKET_URL } from '@omni/shared';
import { apiGet } from '@omni/shared-ui';

export interface StaffAvailability {
  staffId: string;
  status: string;
  position: string;
}

export interface LongSessionAlert extends Lead {
  minutesElapsed: number;
}

// The dashboard is event-driven: the server pushes on every change. This poll is
// only a safety net for a dropped socket, so it runs rarely.
const SAFETY_POLL_MS = 30000;
const DEGRADED_POLL_MS = 10000;

interface AdminState {
  leads: Lead[];
  staffAvailability: StaffAvailability[];
  alerts: LongSessionAlert[];
  isConnected: boolean;
  pollErrors: number;
}

const initialState: AdminState = {
  leads: [],
  staffAvailability: [],
  alerts: [],
  isConnected: true,
  pollErrors: 0
};

type Action =
  | { type: 'setLeads'; leads: Lead[] }
  | { type: 'setStaffAvailability'; staffAvailability: StaffAvailability[] }
  | { type: 'pushAlert'; alert: LongSessionAlert }
  | { type: 'dismissAlert'; id: number }
  | { type: 'setConnected'; isConnected: boolean }
  | { type: 'incrementPollErrors' }
  | { type: 'resetPollErrors' };

// The one piece of derived state, "3 straight poll failures means disconnected",
// is folded into the reducer so it cannot drift out of sync with pollErrors.
const reducer = (state: AdminState, action: Action): AdminState => {
  switch (action.type) {
    case 'setLeads':
      return { ...state, leads: action.leads };
    case 'setStaffAvailability':
      return { ...state, staffAvailability: action.staffAvailability };
    case 'pushAlert':
      return {
        ...state,
        alerts: [action.alert, ...state.alerts.filter((existing) => existing.id !== action.alert.id)].slice(0, 5)
      };
    case 'dismissAlert':
      return { ...state, alerts: state.alerts.filter((alert) => alert.id !== action.id) };
    case 'setConnected':
      return { ...state, isConnected: action.isConnected };
    case 'incrementPollErrors': {
      const pollErrors = state.pollErrors + 1;
      return { ...state, pollErrors, isConnected: pollErrors >= 3 ? false : state.isConnected };
    }
    case 'resetPollErrors':
      return { ...state, pollErrors: 0, isConnected: true };
    default:
      return state;
  }
};

export const useAdminData = (token: string, onLogout: () => void) => {
  const [{ leads, staffAvailability, alerts, isConnected, pollErrors }, dispatch] = useReducer(reducer, initialState);

  // Held in a ref so changing poll cadence never tears down the socket.
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;

    const fetchLeads = async () => {
      try {
        const response = await apiGet(`${API_BASE}/leads?includePending=true`, {
          timeout: 8000,
          headers: { Authorization: `Bearer ${token}` }
        });
        if (cancelled) return;
        dispatch({ type: 'setLeads', leads: response.data });
        dispatch({ type: 'resetPollErrors' });
      } catch (error: any) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          onLogout();
          return;
        }
        if (!cancelled) dispatch({ type: 'incrementPollErrors' });
      }
    };

    const fetchStaffAvailability = async () => {
      try {
        const response = await apiGet(`${API_BASE}/admin/availability`, {
          timeout: 8000,
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!cancelled) dispatch({ type: 'setStaffAvailability', staffAvailability: response.data });
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
    socket.on('connect', () => { dispatch({ type: 'setConnected', isConnected: true }); refreshRef.current(); });
    socket.on('disconnect', () => dispatch({ type: 'setConnected', isConnected: false }));
    socket.on('new_lead', onChange);
    socket.on('lead_status_updated', onChange);
    socket.on('feedback_received', onChange);
    socket.on('queue_updated', onChange);
    // The system prompts, a person decides. Nothing is auto-closed.
    socket.on('long_session_alert', (alert: LongSessionAlert) => {
      dispatch({ type: 'pushAlert', alert });
      refreshRef.current();
    });

    return () => {
      cancelled = true;
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, onLogout]);

  useEffect(() => {
    const interval = setInterval(() => refreshRef.current(), pollErrors > 0 ? DEGRADED_POLL_MS : SAFETY_POLL_MS);
    return () => clearInterval(interval);
  }, [pollErrors]);

  const dismissAlert = (id: number) => dispatch({ type: 'dismissAlert', id });

  return { leads, staffAvailability, alerts, isConnected, dismissAlert, refresh: () => refreshRef.current() };
};
