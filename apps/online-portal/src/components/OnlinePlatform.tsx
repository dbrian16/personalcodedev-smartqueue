import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lead, API_BASE, AUTH_BASE, SOCKET_URL } from '@omni/shared';
import { useCatalog, useSocketRoom, apiErrorMessage, queuePositionOf, apiGet, apiPost } from '@omni/shared-ui';
import { EMAIL_REGEX, PHONE_REGEX, readTicketFromUrl, clearTicketFromUrl } from '../helpers';
import BookingView from './views/BookingView';
import VerifyView from './views/VerifyView';
import TrackingView from './views/TrackingView';
import FeedbackView from './views/FeedbackView';

type View = 'booking' | 'verify' | 'tracking' | 'feedback';

/** Statuses where the customer still has a place in the queue worth showing. */
const LIVE_STATUSES = ['Waiting', 'Called', 'Serving'];

interface PendingVerification {
  challengeId: string;
  sentTo: string;
  expiresAt: string;
  devCode?: string;
}

const OnlinePlatform = () => {
  const { catalog, loading: catalogLoading, error: catalogError } = useCatalog(API_BASE);

  const [view, setView] = useState<View>('booking');
  const [ticketNumber, setTicketNumber] = useState('');
  const [myLead, setMyLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(false);
  const [queuePosition, setQueuePosition] = useState(0);
  const [customerToken, setCustomerToken] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [trackInput, setTrackInput] = useState('');
  const [formData, setFormData] = useState({ email: '', phone: '', service: '' });
  const [formErrors, setFormErrors] = useState({ email: '', phone: '' });
  const [verification, setVerification] = useState<PendingVerification | null>(null);

  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myLeadRef = useRef<Lead | null>(null);
  myLeadRef.current = myLead;

  const showToast = useCallback((message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
  }, []);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  useSocketRoom<Lead>({
    url: SOCKET_URL,
    enabled: !!myLead?.ticketNumber && !!customerToken,
    token: customerToken,
    position: myLead?.assignedPosition,
    handlers: {
      lead_status_updated: (updatedLead) => {
        const current = myLeadRef.current;
        if (!current || updatedLead.id !== current.id) return;
        setMyLead(updatedLead);
        // Only invite a rating once, and only for a session that actually happened.
        if (updatedLead.status === 'Completed' && !updatedLead.hasFeedback) setView('feedback');
      },
      queue_updated: (allLeads) => {
        const current = myLeadRef.current;
        if (!current) return;

        const updatedSelf = allLeads.find((lead) => lead.id === current.id);
        if (!updatedSelf) return;

        setMyLead(updatedSelf);
        if (LIVE_STATUSES.includes(updatedSelf.status)) {
          setQueuePosition(queuePositionOf(allLeads, updatedSelf));
        }
      }
    }
  });

  /** Loads a ticket by number, or by the contact detail it was booked with. */
  const checkStatus = useCallback(async (ticketOverride?: string | any) => {
    const overrideStr = typeof ticketOverride === 'string' ? ticketOverride : '';
    const currentTicketStr = ticketNumber || (myLeadRef.current ? myLeadRef.current.ticketNumber : '');
    const target = (overrideStr || currentTicketStr).trim();
    if (!target) return;

    setLoading(true);
    try {
      let found: Lead;
      let token: string;

      if (/^TKT-\d+$/i.test(target)) {
        const { data } = await apiPost(`${AUTH_BASE}/api/auth/ticket-token`, {
          ticketNumber: target.toUpperCase()
        });
        found = data.lead;
        token = data.token;
      } else {
        const { data } = await apiPost(`${API_BASE}/leads/lookup`, { identifier: target });
        if (!data.tickets || data.tickets.length === 0) {
          showToast('No live ticket found for those details.');
          return;
        }
        found = data.tickets[0];
        token = data.tickets[0].token;
      }

      setCustomerToken(token);
      setMyLead(found);
      setTicketNumber(found.ticketNumber);

      if (found.status === 'Pending' || found.status === 'Cancelled' || found.status === 'No-Show') {
        setQueuePosition(0);
        setView('tracking');
      } else {
        const { data: posLeads } = await apiGet<Lead[]>(
          `${API_BASE}/leads?position=${encodeURIComponent(found.assignedPosition)}&_t=${Date.now()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setQueuePosition(queuePositionOf(posLeads, found));
        setView(found.status === 'Completed' && !found.hasFeedback ? 'feedback' : 'tracking');
      }
    } catch (error) {
      showToast('Ticket not found, or the server is unreachable.');
    } finally {
      setLoading(false);
    }
  }, [ticketNumber, showToast]);

  // The kiosk QR code lands here with ?ticket=TKT-123. Opening straight onto that
  // ticket is the whole point of the virtual waiting room: no retyping a number
  // while standing in a corridor.
  useEffect(() => {
    const fromUrl = readTicketFromUrl();
    if (!fromUrl) return;
    clearTicketFromUrl();
    checkStatus(fromUrl);
    // Intentionally once, on mount: a deep link is an entry point, not a subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateForm = (): boolean => {
    const errors = { email: '', phone: '' };
    let valid = true;

    if (!EMAIL_REGEX.test(formData.email)) {
      errors.email = 'Invalid email address';
      valid = false;
    }
    if (!PHONE_REGEX.test(formData.phone)) {
      errors.phone = 'Invalid phone number (min 7 digits)';
      valid = false;
    }
    setFormErrors(errors);
    return valid;
  };

  /** Return to a clean booking screen from anywhere (the tracker's Back button). */
  const resetToBooking = useCallback(() => {
    setView('booking');
    setMyLead(null);
    setTicketNumber('');
    setCustomerToken('');
    setScheduledFor('');
    setQueuePosition(0);
    setVerification(null);
    setFormData({ email: '', phone: '', service: '' });
    setFormErrors({ email: '', phone: '' });
  }, []);

  const applyCreatedBooking = (data: any) => {
    setCustomerToken(data.customerToken);
    setMyLead(data.lead as Lead);
    setTicketNumber(data.ticketNumber || data.lead.ticketNumber);
    setQueuePosition(0);
    setVerification(null);
    setView('tracking');
    showToast('Ticket booked. Please check in when you arrive.', 'success');
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (!formData.service) {
      showToast('Please choose a service.');
      return;
    }
    if (!scheduledFor) {
      showToast('Please choose an appointment slot.');
      return;
    }

    setLoading(true);
    try {
      const response = await apiPost(`${API_BASE}/online/book`, {
        ...formData,
        scheduledFor: new Date(scheduledFor).toISOString()
      });

      // 202 means the booking passed every rule and now needs a code.
      if (response.status === 202 && response.data.verificationRequired) {
        setVerification({
          challengeId: response.data.challengeId,
          sentTo: response.data.sentTo,
          expiresAt: response.data.expiresAt,
          devCode: response.data.devCode
        });
        setView('verify');
        return;
      }

      applyCreatedBooking(response.data);
    } catch (error: any) {
      showToast(apiErrorMessage(error, 'Remote booking failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const submitVerificationCode = async (code: string) => {
    if (!verification) return;
    setLoading(true);
    try {
      const { data } = await apiPost(`${API_BASE}/online/book`, {
        challengeId: verification.challengeId,
        code
      });
      applyCreatedBooking(data);
    } catch (error: any) {
      showToast(apiErrorMessage(error, 'That code could not be verified.'));
    } finally {
      setLoading(false);
    }
  };

  /** Release the slot instead of holding it until it expires. */
  const cancelMyTicket = async () => {
    const current = myLeadRef.current;
    if (!current) return;

    setLoading(true);
    try {
      const { data } = await apiPost(
        `${API_BASE}/leads/${current.id}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${customerToken}` } }
      );
      setMyLead(data as Lead);
      showToast('Your ticket has been cancelled. The slot is free for someone else.', 'success');
    } catch (error: any) {
      showToast(apiErrorMessage(error, 'Could not cancel this ticket.'));
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async (rating: number, comment: string) => {
    const current = myLeadRef.current;
    if (!current) return;
    try {
      let token = customerToken;
      if (!token) {
        const { data } = await apiPost(`${AUTH_BASE}/api/auth/ticket-token`, {
          ticketNumber: current.ticketNumber
        });
        token = data.token;
        setCustomerToken(token);
      }

      await apiPost(
        `${API_BASE}/feedback`,
        { leadId: current.id, rating, comment },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast('Thank you for your feedback!', 'success');

      resetTimerRef.current = setTimeout(() => {
        setView('booking');
        setMyLead(null);
        setTicketNumber('');
        setCustomerToken('');
        setScheduledFor('');
        setFormData({ email: '', phone: '', service: '' });
        setFormErrors({ email: '', phone: '' });
      }, 2000);
    } catch (error: any) {
      showToast(apiErrorMessage(error, 'Failed to submit feedback. Please try again.'));
    }
  };

  if (view === 'feedback') {
    return <FeedbackView toast={toast} setToast={setToast} submitFeedback={submitFeedback} />;
  }

  if (view === 'verify' && verification) {
    return (
      <VerifyView
        toast={toast}
        setToast={setToast}
        sentTo={verification.sentTo}
        devCode={verification.devCode}
        loading={loading}
        onSubmit={submitVerificationCode}
        onBack={() => { setVerification(null); setView('booking'); }}
      />
    );
  }

  if (view === 'tracking' && myLead) {
    return (
      <TrackingView
        toast={toast} setToast={setToast}
        myLead={myLead}
        queuePosition={queuePosition}
        loading={loading}
        checkStatus={checkStatus}
        cancelTicket={cancelMyTicket}
        onBook={resetToBooking}
      />
    );
  }

  return (
    <BookingView
      toast={toast} setToast={setToast}
      formData={formData} setFormData={setFormData}
      formErrors={formErrors} setFormErrors={setFormErrors}
      loading={loading}
      catalog={catalog}
      catalogLoading={catalogLoading}
      catalogError={catalogError}
      scheduledFor={scheduledFor} setScheduledFor={setScheduledFor}
      trackInput={trackInput} setTrackInput={setTrackInput}
      handleBooking={handleBooking} checkStatus={checkStatus}
    />
  );
};

export default OnlinePlatform;
