import React, { useState } from 'react';
import { ShieldCheck, RefreshCw, ArrowLeft, KeyRound } from 'lucide-react';
import { Toast } from '@omni/shared-ui';

interface VerifyViewProps {
  toast: { message: string; type: 'error' | 'success' } | null;
  setToast: (toast: { message: string; type: 'error' | 'success' } | null) => void;
  sentTo: string;
  /** Present only outside production, where no SMS gateway is configured. */
  devCode?: string;
  loading: boolean;
  onSubmit: (code: string) => void;
  onBack: () => void;
}

/**
 * The verification step for online bookings.
 *
 * Without it, every duplicate-booking and self-cancellation rule rests on
 * honesty: nothing stops one script from holding every slot under invented
 * contact details.
 */
const VerifyView: React.FC<VerifyViewProps> = ({
  toast, setToast, sentTo, devCode, loading, onSubmit, onBack
}) => {
  const [code, setCode] = useState('');

  return (
    <div className="max-w-md w-full bg-white p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 text-center animate-in fade-in duration-500">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-blue-600">
        <ShieldCheck size={40} />
      </div>

      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Confirm your number</h2>
        <p className="text-gray-500 text-sm mt-1">
          We sent a 6-digit code to <span className="font-bold text-gray-700">{sentTo}</span>
        </p>
      </div>

      {devCode && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 flex items-center gap-1">
            <KeyRound size={12} /> Development mode
          </p>
          <p className="text-xs font-bold text-amber-700 mt-1">
            No SMS provider is configured locally, so the code is shown here:{' '}
            <span className="font-black tracking-[0.3em] text-amber-900">{devCode}</span>
          </p>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(code.trim()); }}
        className="space-y-4"
      >
        <input
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="••••••"
          className="w-full px-6 py-4 rounded-2xl border-2 border-gray-100 focus:border-blue-500 outline-none text-center text-2xl font-black tracking-[0.5em] transition-all"
        />

        <button
          type="submit"
          disabled={loading || code.length < 6}
          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 shadow-lg flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading && <RefreshCw className="animate-spin mr-2" size={18} />}
          CONFIRM BOOKING
        </button>
      </form>

      <button
        type="button"
        onClick={onBack}
        className="text-xs font-bold text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 mx-auto"
      >
        <ArrowLeft size={12} /> Change my details
      </button>
    </div>
  );
};

export default VerifyView;
