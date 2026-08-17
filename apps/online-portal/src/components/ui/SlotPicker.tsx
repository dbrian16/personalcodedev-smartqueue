import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { CalendarDays, Loader2, AlertCircle } from 'lucide-react';
import { API_BASE, AppointmentSlot, AvailabilityDay } from '@omni/shared';
import { apiErrorMessage } from '@omni/shared-ui';
import { formatDayLabel } from '../../helpers';

interface SlotPickerProps {
  service: string;
  value: string;
  onChange: (isoStart: string) => void;
}

/**
 * Appointment slots, offered rather than typed.
 *
 * WHY this replaced the free date-time field: with no slot model, no capacity and
 * no opening hours, the form happily accepted 3:00 am on a Sunday, or a hundredth
 * booking for the same 2:00 pm. Every option shown here has already been checked
 * against the catalogue on the server, so what a customer can pick is what the
 * centre can actually serve.
 */
const SlotPicker: React.FC<SlotPickerProps> = ({ service, value, onChange }) => {
  const [days, setDays] = useState<AvailabilityDay[]>([]);
  const [activeDay, setActiveDay] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!service) {
      setDays([]);
      setError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    axios
      .get(`${API_BASE}/online/availability`, { params: { service } })
      .then(({ data }) => {
        if (cancelled) return;
        setDays(data.days || []);
        setActiveDay(data.days?.[0]?.date || '');
      })
      .catch((e) => {
        if (cancelled) return;
        setDays([]);
        setError(apiErrorMessage(e, 'Could not load appointment times.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [service]);

  // A slot chosen for one service is meaningless for another. Held in a ref so a
  // parent that re-creates its handler each render cannot clear the selection.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => { onChangeRef.current(''); }, [service]);

  if (!service) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-200 p-5 text-center">
        <CalendarDays size={20} className="mx-auto text-gray-300 mb-2" />
        <p className="text-xs font-bold text-gray-400">Choose a service to see available times</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border-2 border-gray-100 p-6 flex justify-center">
        <Loader2 className="animate-spin text-blue-500" size={22} />
      </div>
    );
  }

  if (error || days.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-red-100 bg-red-50 p-4 flex items-start gap-2">
        <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
        <p className="text-xs font-bold text-red-600">
          {error || 'No appointment times are open in the booking window.'}
        </p>
      </div>
    );
  }

  const current = days.find((day) => day.date === activeDay) || days[0];

  const slotClass = (slot: AppointmentSlot) => {
    if (slot.remaining === 0) return 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed';
    if (value === slot.start) return 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30';
    return 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-600';
  };

  return (
    <div className="space-y-3">
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center">
        <CalendarDays size={12} className="mr-2 text-blue-500" /> Appointment time
      </label>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            onClick={() => setActiveDay(day.date)}
            className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap border-2 transition-all ${
              current.date === day.date
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            {formatDayLabel(day.date)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1">
        {current.slots.map((slot) => (
          <button
            key={slot.start}
            type="button"
            disabled={slot.remaining === 0}
            onClick={() => onChange(slot.start)}
            title={slot.remaining === 0 ? 'Fully booked' : `${slot.remaining} of ${slot.capacity} places left`}
            className={`py-2 rounded-xl text-xs font-black border-2 transition-all ${slotClass(slot)}`}
          >
            {slot.label}
          </button>
        ))}
      </div>

      {value && (
        <p className="text-[10px] font-bold text-blue-600 ml-1">
          Selected: {new Date(value).toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
};

export default SlotPicker;
