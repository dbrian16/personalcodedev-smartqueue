import React from 'react';
import { Clock, CheckCircle, RefreshCcw, UserCheck, Star, XCircle } from 'lucide-react';
import { QRCode } from '../QRCode';
import { Lead, trackingUrlFor } from '@omni/shared';
import { useLanguage } from '../../contexts/LanguageContext';

interface CurrentQueueViewProps {
  currentLead: Lead;
  queuePosition: number;
  feedbackRating: number;
  setFeedbackRating: (rating: number) => void;
  feedbackComment: string;
  setFeedbackComment: (comment: string) => void;
  feedbackSubmitted: boolean;
  handleFeedback: () => void;
  resetAll: () => void;
}

const CurrentQueueView: React.FC<CurrentQueueViewProps> = ({
  currentLead, queuePosition, feedbackRating, setFeedbackRating,
  feedbackComment, setFeedbackComment, feedbackSubmitted,
  handleFeedback, resetAll
}) => {
  const { t } = useLanguage();
  const isPending = currentLead.status === 'Pending';
  const isCancelled = currentLead.status === 'Cancelled';
  const isWaiting = currentLead.status === 'Waiting';
  const isCalled = currentLead.status === 'Called';
  const isServing = currentLead.status === 'Serving';
  const isCompleted = currentLead.status === 'Completed';
  const isNoShow = currentLead.status === 'No-Show';

  const pendingExpiresAt = currentLead.pendingExpiresAt ? new Date(currentLead.pendingExpiresAt).getTime() : 0;
  const now = Date.now();
  const pendingState = isPending
    ? (pendingExpiresAt && now > pendingExpiresAt ? 'EXPIRED' : 'OPEN')
    : null;
  const minutesTo = (target: number) => Math.max(0, Math.ceil((target - Date.now()) / 60000));

  // The QR code is the point of the virtual waiting room: while a ticket is live,
  // the customer should be able to walk away and watch it from their own phone.
  const showQr = isWaiting || isPending || isCalled;
  const waitUnavailable = currentLead.queueStatus === 'Unavailable';

  let borderClass = 'border-green-500';
  if (isPending) borderClass = 'border-yellow-500';
  else if (isCancelled || isNoShow) borderClass = 'border-gray-400';

  let iconBgClass = 'bg-green-100';
  if (isPending) iconBgClass = 'bg-yellow-100';
  else if (isWaiting) iconBgClass = 'bg-blue-100';
  else if (isCancelled || isNoShow) iconBgClass = 'bg-gray-100';

  let iconNode = <CheckCircle className="text-green-600" size={60} />;
  if (isPending) iconNode = <Clock className="text-yellow-600" size={60} />;
  else if (isWaiting) iconNode = <Clock className="text-blue-600 animate-pulse" size={60} />;
  else if (isNoShow) iconNode = <XCircle className="text-gray-500" size={60} />;
  else if (isCancelled) iconNode = <Clock className="text-gray-500" size={60} />;

  let title = t.success;
  if (isPending) title = t.reservationPending;
  else if (isCancelled) title = t.reservationCancelled;
  else if (isNoShow) title = t.noShow;
  else if (isWaiting) title = t.inQueue;
  else if (isCalled) title = t.yourTurn;
  else if (isServing) title = t.beingServed;
  else if (isCompleted) title = t.serviceComplete;

  let subtitle = t.proceedCounter;
  if (isPending) {
    if (pendingState === 'EXPIRED') subtitle = t.expiredDesc;
    else if (pendingExpiresAt) subtitle = t.checkinExpiresIn(minutesTo(pendingExpiresAt));
    else subtitle = t.pleaseCheckin;
  } else if (isCancelled) subtitle = t.pleaseCreateNew;
  else if (isNoShow) subtitle = t.noShowDesc;
  else if (isWaiting) subtitle = t.position(queuePosition);
  else if (isCompleted) subtitle = t.thankYouVisiting;

  return (
    <div className={`bg-white p-8 sm:p-10 rounded-3xl shadow-2xl text-center max-w-md w-full border-t-8 ${borderClass}`}>
      <div className="flex justify-center mb-6">
        <div className={`p-4 rounded-full ${iconBgClass}`}>{iconNode}</div>
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">{title}</h2>
      <p className="text-gray-500 mb-8 text-sm sm:text-base">{subtitle}</p>

      <div className="grid grid-cols-1 gap-4 mb-8">
        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
          <p className="text-blue-600 font-semibold uppercase tracking-wider text-[10px] mb-1">{t.yourTicketNumber}</p>
          <p className="text-3xl sm:text-4xl font-black text-blue-700">{currentLead.ticketNumber}</p>
        </div>

        {isWaiting && (
          waitUnavailable ? (
            /* "0 minutes" and "nobody is on duty" are the same number, so the
               estimate is withheld rather than dressed up as a short wait. */
            <div className="bg-gray-100 p-6 rounded-2xl border border-gray-200">
              <p className="text-gray-500 font-semibold uppercase tracking-wider text-[10px] mb-1">{t.aiWaitTime}</p>
              <p className="text-xl sm:text-2xl font-black text-gray-600">{t.waitUnavailable}</p>
              <p className="text-[10px] text-gray-400 mt-2 font-bold">{t.waitUnavailableHint}</p>
            </div>
          ) : (
            <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
              <p className="text-orange-600 font-semibold uppercase tracking-wider text-[10px] mb-1">{t.aiWaitTime}</p>
              <div className="flex items-center justify-center">
                <span className="text-3xl sm:text-4xl font-black text-orange-700">{currentLead.predictedWaitTime}</span>
                <span className="ml-2 text-sm font-bold text-orange-600">{t.mins}</span>
              </div>
              <p className="text-[9px] text-orange-400 mt-2 font-bold uppercase tracking-widest flex items-center justify-center">
                <RefreshCcw size={10} className="mr-1 animate-spin" /> {t.realTimeTracking}
              </p>
            </div>
          )
        )}

        {(isCalled || isServing) && (
          <div className="bg-green-50 p-6 rounded-2xl border border-green-100 animate-bounce">
            <p className="text-green-600 font-semibold uppercase tracking-wider text-[10px] mb-1">{t.status}</p>
            <div className="flex items-center justify-center">
              <UserCheck className="text-green-600 mr-2" size={24} />
              <span className="text-2xl font-black text-green-700">{currentLead.status.toUpperCase()}</span>
            </div>
          </div>
        )}
      </div>

      {currentLead.walkInDowngraded && (
        <div className="bg-orange-50 p-4 rounded-2xl mb-6 border border-orange-100 text-left">
          <p className="text-[10px] font-bold text-orange-700">{t.downgradedNotice}</p>
        </div>
      )}

      {showQr && (
        <div className="bg-gray-50 p-5 rounded-2xl mb-8 border border-gray-100">
          <QRCode
            value={trackingUrlFor(currentLead.ticketNumber)}
            size={140}
            caption={t.scanMonitor}
          />
          <p className="mt-3 text-[10px] font-bold text-gray-500 leading-relaxed">{t.scanExplain}</p>
        </div>
      )}

      {isPending && (
        <div className="bg-yellow-50 p-6 rounded-2xl mb-8 border border-yellow-100 text-left">
          <p className="text-[10px] font-black uppercase tracking-widest text-yellow-700 mb-2">{t.checkinRequiredTitle}</p>
          <p className="text-[10px] font-bold text-yellow-700">{t.checkinRequiredDesc}</p>
        </div>
      )}

      {isCompleted && !feedbackSubmitted && (
        <div className="bg-gray-50 p-6 rounded-2xl mb-6 border border-gray-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-3">{t.experienceTitle}</p>
          <div className="flex justify-center space-x-2 mb-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setFeedbackRating(star)}
                className="hover:scale-125 transition-transform"
                aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
              >
                <Star
                  size={28}
                  className={feedbackRating >= star ? 'text-yellow-400' : 'text-gray-300'}
                  fill={feedbackRating >= star ? 'currentColor' : 'none'}
                />
              </button>
            ))}
          </div>
          <textarea
            value={feedbackComment}
            onChange={(e) => setFeedbackComment(e.target.value)}
            placeholder={t.commentsPlaceholder}
            className="w-full p-3 border border-gray-200 rounded-xl text-sm mb-3 resize-none h-20 focus:border-blue-500 outline-none"
          />
          <button
            onClick={handleFeedback}
            disabled={feedbackRating === 0}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all disabled:opacity-40"
          >
            {t.submitFeedback}
          </button>
        </div>
      )}

      {feedbackSubmitted && (
        <div className="bg-green-50 p-4 rounded-2xl mb-6 border border-green-100">
          <p className="text-green-700 font-bold text-sm">{t.feedbackSuccess}</p>
        </div>
      )}

      <button
        onClick={resetAll}
        className="bg-gray-800 text-white px-8 py-4 rounded-xl font-bold hover:bg-black transition-all w-full shadow-lg active:scale-95"
      >
        {t.finishNew}
      </button>
    </div>
  );
};

export default CurrentQueueView;
