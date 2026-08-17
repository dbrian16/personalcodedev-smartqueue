import React, { useState } from 'react';
import { Smartphone, RefreshCw, XCircle, CalendarClock, Ticket } from 'lucide-react';
import { Toast } from '@omni/shared-ui';
import { Lead } from '@omni/shared';
import { formatScheduledLabel } from '../../helpers';

interface TrackingViewProps {
  toast: { message: string; type: 'error' | 'success' } | null;
  setToast: (toast: { message: string; type: 'error' | 'success' } | null) => void;
  myLead: Lead;
  queuePosition: number;
  loading: boolean;
  checkStatus: () => void;
  cancelTicket: () => void;
  onBook: () => void;
}

const CANCEL_REASONS: Record<string, string> = {
  reservation_abandoned: 'The check-in window passed without an arrival.',
  cancelled_by_customer: 'You cancelled this ticket.',
  cancelled_by_staff: 'A staff member cancelled this ticket.',
  auto_no_show_timeout: 'You were called but did not come to the counter in time.',
  recall_limit_reached: 'You were called several times without an answer.',
  marked_by_staff: 'A staff member marked this ticket as a no-show.'
};

const TrackingView: React.FC<TrackingViewProps> = ({
  toast, setToast, myLead, queuePosition, loading, checkStatus, cancelTicket, onBook
}) => {
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const isPending = myLead.status === 'Pending';
  const isCancelled = myLead.status === 'Cancelled';
  const isNoShow = myLead.status === 'No-Show';
  const isClosed = isCancelled || isNoShow;
  // A customer may release the slot right up until they are called.
  const canCancel = isPending || myLead.status === 'Waiting';

  const pendingExpiresAt = myLead.pendingExpiresAt ? new Date(myLead.pendingExpiresAt).getTime() : 0;
  const minutesTo = (target: number) => Math.max(0, Math.ceil((target - Date.now()) / 60000));

  return (
    <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in duration-500">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="bg-blue-600 p-6 sm:p-8 text-white text-center">
        <Smartphone size={40} className="mx-auto mb-2" />
        <h2 className="text-xl sm:text-2xl font-bold">Live Queue Tracker</h2>
        <p className="text-blue-100 text-xs opacity-80">{myLead.assignedPosition}</p>
      </div>

      <div className="p-6 sm:p-8 space-y-6 text-center">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Your Ticket</p>
          <h3 className="text-3xl sm:text-4xl font-black text-gray-800">{myLead.ticketNumber}</h3>
          {myLead.scheduledFor && (
            <p className="text-[11px] font-bold text-gray-400 mt-1 flex items-center justify-center gap-1">
              <CalendarClock size={12} /> {formatScheduledLabel(String(myLead.scheduledFor))}
            </p>
          )}
        </div>

        {myLead.walkInDowngraded && (
          <div className="bg-orange-50 p-3 rounded-2xl border border-orange-100 text-left">
            <p className="text-[11px] font-bold text-orange-700">
              You arrived after your appointment window. Your ticket is still valid and is now
              ordered by arrival time.
            </p>
          </div>
        )}

        {isPending ? (
          <div className="space-y-4">
            <div className="bg-yellow-50 p-4 rounded-2xl border border-yellow-100 text-left">
              <p className="text-[10px] font-bold text-yellow-700 uppercase tracking-widest">Check-in Required</p>
              <p className="text-sm font-bold text-yellow-800 mt-2">
                {pendingExpiresAt
                  ? `On-time check-in closes in ~${minutesTo(pendingExpiresAt)} mins`
                  : 'Please check in at the counter'}
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-left">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Instructions</p>
              <p className="text-sm font-bold text-gray-700 mt-2">At the kiosk, choose Check-in and provide:</p>
              <p className="text-sm font-black text-gray-900 mt-1">1) Ticket Number: {myLead.ticketNumber}</p>
              <p className="text-sm font-bold text-gray-700 mt-1">
                2) The email or phone number used during online booking
              </p>
            </div>
          </div>
        ) : isClosed ? (
          <div className="bg-gray-100 p-4 rounded-2xl border border-gray-200 text-left">
            <p className="text-sm font-black text-gray-800 flex items-center gap-2">
              <XCircle size={16} className="text-gray-500" />
              {isNoShow ? 'Marked as no-show' : 'Ticket cancelled'}
            </p>
            <p className="text-xs font-bold text-gray-500 mt-1">
              {(myLead.cancelReason && CANCEL_REASONS[myLead.cancelReason]) || 'This ticket is no longer in the queue.'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Position</p>
                <p className="text-2xl font-black text-blue-600">#{queuePosition || '?'}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase">ETA</p>
                {/* Withheld rather than shown as 0 when no counter is open. */}
                {myLead.queueStatus === 'Unavailable' ? (
                  <p className="text-xs font-black text-gray-500 pt-2">No counter open yet</p>
                ) : (
                  <p className="text-2xl font-black text-orange-500">{myLead.predictedWaitTime}m</p>
                )}
              </div>
            </div>
            <div
              className={`py-3 px-6 rounded-full font-bold text-sm ${
                myLead.status === 'Waiting'
                  ? 'bg-orange-100 text-orange-600'
                  : 'bg-green-100 text-green-600 animate-pulse'
              }`}
            >
              Status: {myLead.status}
            </div>
          </>
        )}

        <div className="space-y-3">
          {!isClosed && (
            <button
              onClick={() => checkStatus()}
              className="w-full flex items-center justify-center space-x-2 py-4 bg-gray-800 text-white rounded-2xl font-bold hover:bg-black transition-all"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          )}

          {canCancel && !confirmingCancel && (
            <button
              onClick={() => setConfirmingCancel(true)}
              className="w-full py-3 text-red-600 font-bold rounded-2xl border-2 border-red-100 hover:bg-red-50 transition-all text-sm"
            >
              Cancel my ticket
            </button>
          )}

          {canCancel && confirmingCancel && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-red-700">
                Cancel {myLead.ticketNumber}? Your place is released to other customers.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirmingCancel(false); cancelTicket(); }}
                  disabled={loading}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  Yes, cancel
                </button>
                <button
                  onClick={() => setConfirmingCancel(false)}
                  className="flex-1 py-3 bg-white text-gray-600 rounded-xl font-bold text-sm border border-gray-200"
                >
                  Keep it
                </button>
              </div>
            </div>
          )}

          {isClosed && (
            <button
              onClick={onBook}
              className="w-full flex items-center justify-center space-x-2 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all"
            >
              <Ticket size={18} />
              <span>Book a new ticket</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrackingView;
