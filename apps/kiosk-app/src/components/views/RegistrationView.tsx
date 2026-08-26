import React from 'react';
import { Briefcase, Clock, Loader2, Send, Phone, Mail, AlertTriangle } from 'lucide-react';
import type { Catalog } from '@omni/shared-ui';
import { useLanguage } from '../../contexts/LanguageContext';

interface RegistrationViewProps {
  mode: 'register' | 'track' | 'checkin';
  setMode: (mode: 'register' | 'track' | 'checkin') => void;
  checkinStep: 'verify' | 'identify';
  setCheckinStep: (step: 'verify' | 'identify') => void;
  setCheckinInfo: (info: any) => void;
  formData: { service: string; phone: string; email: string };
  setFormData: (data: { service: string; phone: string; email: string }) => void;
  catalog: Catalog;
  catalogLoading: boolean;
  catalogError: string;
  trackInput: string;
  setTrackInput: (num: string) => void;
  checkinTicketNumber: string;
  setCheckinTicketNumber: (num: string) => void;
  checkinIdentifier: string;
  setCheckinIdentifier: (id: string) => void;
  checkinInfo: any;
  loading: boolean;
  handleSubmit: (e: React.FormEvent) => void;
}

const inputClass = 'w-full px-6 py-4 bg-gray-800 border-2 border-gray-700 rounded-[1.5rem] text-white font-bold text-base sm:text-lg focus:border-blue-500 outline-none transition-all placeholder:text-gray-600';

const RegistrationView: React.FC<RegistrationViewProps> = ({
  mode, setMode, checkinStep, setCheckinStep, setCheckinInfo,
  formData, setFormData, catalog, catalogLoading, catalogError,
  trackInput, setTrackInput,
  checkinTicketNumber, setCheckinTicketNumber,
  checkinIdentifier, setCheckinIdentifier,
  checkinInfo, loading, handleSubmit
}) => {
  const { t } = useLanguage();

  const services = catalog.services;
  const selectedService = services.find((service) => service.name === formData.service);
  const noStaffOnSelected = !!selectedService && selectedService.staffOnline === 0;
  const closed = !catalogLoading && !catalogError && !catalog.status.open;
  const afterCutoff = !catalogLoading && catalog.status.open && !catalog.status.acceptingWalkIns;
  const registrationBlocked = mode === 'register' && (closed || afterCutoff || !!catalogError);

  let title = t.registerTitle;
  if (mode === 'track') title = t.trackTitle;
  else if (mode === 'checkin') title = t.checkinTitle;

  let description = t.registerSubtitle;
  if (mode === 'track') description = t.trackSubtitle;
  else if (mode === 'checkin') description = t.checkinSubtitle;

  let isSubmitDisabled = loading || registrationBlocked;
  if (mode === 'register') isSubmitDisabled = isSubmitDisabled || !formData.service;
  else if (mode === 'track') isSubmitDisabled = isSubmitDisabled || !trackInput.trim();
  else if (checkinStep === 'verify') isSubmitDisabled = isSubmitDisabled || !checkinTicketNumber;
  else isSubmitDisabled = isSubmitDisabled || !checkinIdentifier;

  let submitLabel: React.ReactNode = <>{t.printTicket} <Send className="ml-3" size={24} /></>;
  if (mode === 'track') submitLabel = <>{t.trackMyTicket} <Send className="ml-3" size={24} /></>;
  else if (mode === 'checkin' && checkinStep === 'verify') submitLabel = <>{t.verifyTicket} <Send className="ml-3" size={24} /></>;
  else if (mode === 'checkin') submitLabel = <>{t.completeCheckin} <Send className="ml-3" size={24} /></>;

  const switchMode = (next: 'register' | 'track' | 'checkin') => {
    setMode(next);
    setCheckinStep('verify');
    setCheckinInfo(null);
  };

  let formContent: React.ReactNode = (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center">
          <Briefcase size={14} className="mr-2 text-blue-500" /> {t.serviceLabel}
        </label>
        <select
          required
          value={formData.service}
          disabled={catalogLoading || services.length === 0}
          className={`${inputClass} appearance-none disabled:opacity-50`}
          onChange={(e) => setFormData({ ...formData, service: e.target.value })}
        >
          <option value="">{catalogLoading ? t.servicesLoading : t.selectService}</option>
          {services.map((service) => (
            <option key={service.name} value={service.name}>{service.name}</option>
          ))}
        </select>

        {/* A ticket for a counter nobody is sitting at will never be called, so
            warn before issuing one rather than quoting a wait time. */}
        {noStaffOnSelected && (
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-orange-500 shrink-0 mt-0.5" />
            <p className="text-[11px] font-bold text-orange-700">{t.noStaffOnDuty}</p>
          </div>
        )}
      </div>

      {/* Offered, not demanded. A customer in a hurry may leave it blank, but
          the consequence is spelled out rather than hidden, because ticket
          lookup and the duplicate check both need it. */}
      <div className="space-y-2">
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center">
          <Phone size={14} className="mr-2 text-blue-500" /> {t.phoneLabel}
          <span className="ml-2 text-gray-600 normal-case tracking-normal font-bold">{t.phoneOptional}</span>
        </label>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder={t.phonePlaceholder}
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className={inputClass}
        />
        {formData.phone.trim() ? (
          <p className="text-[10px] text-gray-500 font-bold ml-1">{t.phoneHelp}</p>
        ) : (
          <p className="text-[10px] text-orange-600 font-bold ml-1">{t.phoneSkipWarning}</p>
        )}
      </div>

      <details className="group">
        <summary className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 cursor-pointer flex items-center">
          <Mail size={12} className="mr-2" /> Email (optional)
        </summary>
        <input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className={`${inputClass} mt-2`}
        />
      </details>
    </div>
  );

  if (mode === 'track') {
    formContent = (
      <div className="space-y-2">
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center">
          <Clock size={14} className="mr-2 text-blue-500" /> {t.ticketLabel}
        </label>
        <input
          required
          type="text"
          placeholder={t.trackPlaceholder}
          value={trackInput}
          onChange={(e) => setTrackInput(e.target.value)}
          className={`${inputClass} text-xl sm:text-2xl`}
        />
      </div>
    );
  } else if (mode === 'checkin') {
    formContent = (
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">{t.checkinLabel}</label>
          <input
            required
            type="text"
            value={checkinTicketNumber}
            onChange={(e) => setCheckinTicketNumber(e.target.value.toUpperCase())}
            placeholder={t.ticketPlaceholder}
            className={`${inputClass} text-xl sm:text-2xl`}
            disabled={loading || checkinStep === 'identify'}
          />
        </div>

        {checkinStep === 'identify' && (
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">{t.checkinIdentifierLabel}</label>
            <input
              required
              type="text"
              value={checkinIdentifier}
              onChange={(e) => setCheckinIdentifier(e.target.value)}
              placeholder={t.checkinIdentifierPlaceholder}
              className={inputClass}
            />
          </div>
        )}

        {checkinInfo && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-left">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">{t.verified}</p>
            <p className="text-sm font-bold text-blue-800 mt-1">{t.ticket}: {checkinInfo.ticketNumber}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-2xl max-w-2xl w-full border-t-8 border-blue-600">
      <div className="mb-6 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">{title}</h2>
        <p className="text-gray-500 mt-2 text-sm sm:text-base">{description}</p>
      </div>

      {/* Opening hours and the walk-in cut-off, straight from the backend, so the
          screen never invites a ticket the server is about to refuse. */}
      {catalogError && (
        <div className="mb-6 bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm font-bold text-red-700">{t.servicesError}</p>
        </div>
      )}
      {closed && (
        <div className="mb-6 bg-gray-100 border border-gray-200 rounded-2xl p-4">
          <p className="text-sm font-black uppercase tracking-widest text-gray-700">{t.closedTitle}</p>
          <p className="text-sm font-bold text-gray-500 mt-1">
            {t.closedDesc(catalog.status.opensAt, catalog.status.closesAt)}
          </p>
        </div>
      )}
      {afterCutoff && (
        <div className="mb-6 bg-orange-50 border border-orange-100 rounded-2xl p-4">
          <p className="text-sm font-black uppercase tracking-widest text-orange-700">{t.cutoffTitle}</p>
          <p className="text-sm font-bold text-orange-600 mt-1">
            {t.cutoffDesc(catalog.status.lastWalkInTicketAt)}
          </p>
        </div>
      )}

      <div className="flex mb-8 bg-gray-100 p-1 rounded-xl">
        {([
          ['register', t.newTicket],
          ['track', t.trackTicket],
          ['checkin', t.checkinTab]
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => switchMode(value)}
            className={`flex-1 py-3 rounded-lg font-bold transition-all text-sm sm:text-base ${mode === value ? 'bg-white shadow-md text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {formContent}

        <button
          disabled={isSubmitDisabled}
          type="submit"
          className="w-full py-5 sm:py-6 bg-blue-600 text-white rounded-[1.5rem] font-black text-lg sm:text-xl hover:bg-blue-700 shadow-2xl shadow-blue-500/20 transform active:scale-95 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="animate-spin" size={32} /> : submitLabel}
        </button>
      </form>
    </div>
  );
};

export default RegistrationView;
