import React, { useState } from 'react';
import { LangToggle } from '../contexts/LanguageContext';
import { API_BASE, AUTH_BASE, Lead } from '@omni/shared';
import { Toast, useCatalog, apiErrorMessage, apiGet, apiPost } from '@omni/shared-ui';
import { useKioskSocket } from '../hooks/useKioskSocket';
import CurrentQueueView from './views/CurrentQueueView';
import RegistrationView from './views/RegistrationView';
import { useLanguage } from '../contexts/LanguageContext';

const TICKET_PATTERN = /^TKT-\d+$/i;

const KioskForm = () => {
  const { t } = useLanguage();
  const { catalog, loading: catalogLoading, error: catalogError } = useCatalog(API_BASE);

  const [mode, setMode] = useState<'register' | 'track' | 'checkin'>('register');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [trackInput, setTrackInput] = useState('');
  const [checkinTicketNumber, setCheckinTicketNumber] = useState('');
  const [checkinIdentifier, setCheckinIdentifier] = useState('');
  const [checkinStep, setCheckinStep] = useState<'verify' | 'identify'>('verify');
  const [checkinInfo, setCheckinInfo] = useState<{ ticketNumber: string; pendingExpiresAt?: string | Date } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [formData, setFormData] = useState({ service: '', phone: '', email: '' });

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
  };

  useKioskSocket(submitted, currentLead, setCurrentLead, setQueuePosition);

  /** Ticket number when it looks like one, otherwise a contact-detail lookup. */
  const findExistingTicket = async (input: string) => {
    const value = input.trim();
    if (TICKET_PATTERN.test(value)) {
      const response = await apiGet(`${API_BASE}/leads/track/${encodeURIComponent(value.toUpperCase())}`);
      return response.data as Lead;
    }

    const { data } = await apiPost(`${API_BASE}/leads/lookup`, { identifier: value });
    if (!data.tickets || data.tickets.length === 0) return null;
    return data.tickets[0] as Lead;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'track') {
        const found = await findExistingTicket(trackInput);
        if (!found) {
          showToast(t.noTicketsFound);
          return;
        }
        setCurrentLead(found);
        setSubmitted(true);
      } else if (mode === 'checkin') {
        const ticketNumber = checkinTicketNumber.trim().toUpperCase();
        if (!ticketNumber) {
          showToast(t.enterTicketError);
          return;
        }

        if (checkinStep === 'verify') {
          const verifyRes = await apiPost(`${API_BASE}/online/checkin/verify`, { ticketNumber });
          if (verifyRes.data.alreadyCheckedIn) {
            const found = await findExistingTicket(ticketNumber);
            if (found) {
              setCurrentLead(found);
              setSubmitted(true);
            }
            showToast(t.alreadyCheckedIn, 'success');
            return;
          }
          setCheckinInfo({ ticketNumber, pendingExpiresAt: verifyRes.data.pendingExpiresAt });
          setCheckinStep('identify');
          return;
        }

        const identifier = checkinIdentifier.trim();
        if (!identifier) {
          showToast(t.enterIdentifierError);
          return;
        }

        // No location capture. Standing at the kiosk and stating the booked contact detail
        // is the check.
        const response = await apiPost(`${API_BASE}/online/checkin`, { ticketNumber, identifier });
        setCurrentLead(response.data.lead);
        setSubmitted(true);
        showToast(
          response.data.downgradedToWalkIn ? t.downgradedNotice : t.checkinSuccess,
          response.data.downgradedToWalkIn ? 'error' : 'success'
        );
      } else {
        // The phone number is offered, not demanded.
        const response = await apiPost(`${API_BASE}/leads`, {
          service: formData.service,
          phone: formData.phone.trim() || undefined,
          email: formData.email.trim() || undefined,
          source: 'On-site'
        });
        setCurrentLead(response.data);
        setSubmitted(true);
      }
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not connect to the server. Please ensure the backend is running.'));
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async () => {
    if (!currentLead || feedbackRating === 0) return;
    try {
      const tokenRes = await apiPost(`${AUTH_BASE}/api/auth/ticket-token`, {
        ticketNumber: currentLead.ticketNumber
      });
      await apiPost(`${API_BASE}/feedback`, {
        leadId: currentLead.id,
        rating: feedbackRating,
        comment: feedbackComment
      }, { headers: { Authorization: `Bearer ${tokenRes.data.token}` } });
      setFeedbackSubmitted(true);
      showToast(t.feedbackSuccess, 'success');
    } catch (error) {
      showToast(apiErrorMessage(error, t.feedbackError));
    }
  };

  const resetAll = () => {
    setSubmitted(false);
    setCurrentLead(null);
    setQueuePosition(0);
    setTrackInput('');
    setCheckinTicketNumber('');
    setCheckinIdentifier('');
    setCheckinStep('verify');
    setCheckinInfo(null);
    setFeedbackRating(0);
    setFeedbackComment('');
    setFeedbackSubmitted(false);
    setFormData({ service: '', phone: '', email: '' });
  };

  if (submitted && currentLead) {
    return (
      <div className="relative">
        <LangToggle />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <CurrentQueueView
          currentLead={currentLead}
          queuePosition={queuePosition}
          feedbackRating={feedbackRating}
          setFeedbackRating={setFeedbackRating}
          feedbackComment={feedbackComment}
          setFeedbackComment={setFeedbackComment}
          feedbackSubmitted={feedbackSubmitted}
          handleFeedback={handleFeedback}
          resetAll={resetAll}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <LangToggle />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <RegistrationView
        mode={mode} setMode={setMode}
        checkinStep={checkinStep} setCheckinStep={setCheckinStep}
        setCheckinInfo={setCheckinInfo}
        formData={formData} setFormData={setFormData}
        catalog={catalog}
        catalogLoading={catalogLoading}
        catalogError={catalogError}
        trackInput={trackInput} setTrackInput={setTrackInput}
        checkinTicketNumber={checkinTicketNumber} setCheckinTicketNumber={setCheckinTicketNumber}
        checkinIdentifier={checkinIdentifier} setCheckinIdentifier={setCheckinIdentifier}
        checkinInfo={checkinInfo} loading={loading}
        handleSubmit={handleSubmit}
      />
    </div>
  );
};

export default KioskForm;
