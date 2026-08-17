import React from 'react';
import { RefreshCw, Send, AlertCircle, Clock } from 'lucide-react';
import { Toast } from '@omni/shared-ui';
import type { Catalog } from '@omni/shared-ui';
import SlotPicker from '../ui/SlotPicker';

interface BookingViewProps {
  toast: { message: string; type: 'error' | 'success' } | null;
  setToast: (toast: { message: string; type: 'error' | 'success' } | null) => void;
  formData: { email: string; phone: string; service: string };
  setFormData: (data: { email: string; phone: string; service: string }) => void;
  formErrors: { email: string; phone: string };
  setFormErrors: (errors: { email: string; phone: string }) => void;
  loading: boolean;
  catalog: Catalog;
  catalogLoading: boolean;
  catalogError: string;
  scheduledFor: string;
  setScheduledFor: (val: string) => void;
  trackInput: string;
  setTrackInput: (val: string) => void;
  handleBooking: (e: React.FormEvent) => void;
  checkStatus: (ticketOverride?: string) => void;
}

const BookingView: React.FC<BookingViewProps> = ({
  toast, setToast, formData, setFormData, formErrors, setFormErrors,
  loading, catalog, catalogLoading, catalogError,
  scheduledFor, setScheduledFor,
  trackInput, setTrackInput, handleBooking, checkStatus
}) => {
  const services = catalog.services;

  return (
    <div className="max-w-md w-full bg-white p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 animate-in fade-in duration-500">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="text-center">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Remote Ticket Portal</h2>
        <p className="text-gray-500 text-sm mt-1">Book your turn from anywhere</p>
      </div>

      {catalogError ? (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs font-bold text-red-600">Cannot reach the booking server right now.</p>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 flex items-center gap-2">
          <Clock size={14} className="text-blue-500 shrink-0" />
          <p className="text-[11px] font-bold text-blue-700">
            Open {catalog.hours.openTime}–{catalog.hours.closeTime}, Mon–Fri · book up to{' '}
            {catalog.hours.bookingHorizonDays} days ahead · check in from{' '}
            {catalog.hours.checkinEarliestMinutes} min before
          </p>
        </div>
      )}

      <form onSubmit={handleBooking} className="space-y-4" noValidate>
        <div className="space-y-1">
          <input
            required
            type="tel"
            placeholder="Phone Number"
            value={formData.phone}
            className={`w-full px-6 py-4 rounded-2xl border-2 outline-none transition-all ${
              formErrors.phone ? 'border-red-400 bg-red-50' : 'border-gray-100 focus:border-blue-500'
            }`}
            onChange={(e) => {
              setFormData({ ...formData, phone: e.target.value });
              if (formErrors.phone) setFormErrors({ ...formErrors, phone: '' });
            }}
          />
          {formErrors.phone && (
            <p className="text-xs text-red-500 px-2 flex items-center gap-1">
              <AlertCircle size={12} /> {formErrors.phone}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <input
            required
            type="email"
            placeholder="Email Address"
            value={formData.email}
            className={`w-full px-6 py-4 rounded-2xl border-2 outline-none transition-all ${
              formErrors.email ? 'border-red-400 bg-red-50' : 'border-gray-100 focus:border-blue-500'
            }`}
            onChange={(e) => {
              setFormData({ ...formData, email: e.target.value });
              if (formErrors.email) setFormErrors({ ...formErrors, email: '' });
            }}
          />
          {formErrors.email && (
            <p className="text-xs text-red-500 px-2 flex items-center gap-1">
              <AlertCircle size={12} /> {formErrors.email}
            </p>
          )}
        </div>

        <select
          required
          value={formData.service}
          disabled={catalogLoading || services.length === 0}
          className="w-full px-6 py-4 rounded-2xl border-2 border-gray-100 focus:border-blue-500 outline-none appearance-none transition-all bg-white disabled:opacity-50"
          onChange={(e) => setFormData({ ...formData, service: e.target.value })}
        >
          <option value="">{catalogLoading ? 'Loading services…' : 'Select Service'}</option>
          {services.map((service) => (
            <option key={service.name} value={service.name}>{service.name}</option>
          ))}
        </select>

        <SlotPicker service={formData.service} value={scheduledFor} onChange={setScheduledFor} />

        <button
          disabled={loading || !scheduledFor}
          type="submit"
          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-base sm:text-lg hover:bg-blue-700 shadow-lg flex items-center justify-center transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? <RefreshCw className="animate-spin mr-2" size={20} /> : <Send size={20} className="mr-2" />}
          GET REMOTE TICKET
        </button>
      </form>

      {/* Recovery path for a lost ticket number. */}
      <div className="pt-4 border-t border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 text-center">
          Already have a ticket?
        </p>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={trackInput}
            onChange={(e) => setTrackInput(e.target.value)}
            placeholder="Ticket number, email or phone"
            className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-blue-500 outline-none text-sm font-bold transition-all"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && trackInput.trim()) checkStatus(trackInput.trim());
            }}
          />
          <button
            type="button"
            onClick={() => trackInput.trim() && checkStatus(trackInput.trim())}
            disabled={loading || !trackInput.trim()}
            className="px-4 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Find
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingView;
