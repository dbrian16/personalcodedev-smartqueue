import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '@omni/shared';
import { apiErrorMessage } from '@omni/shared-ui';
import {
  Briefcase, Clock, Plus, Trash2, Loader2, Save, BrainCircuit,
  AlertCircle, CheckCircle2, Power
} from 'lucide-react';

interface ServiceRow {
  name: string;
  description: string;
  counters: number;
  slotCapacity: number | null;
  isActive: boolean;
  effectiveSlotCapacity: number;
}

interface BusinessSettings {
  openDays: number[];
  openTime: string;
  closeTime: string;
  holidays: string[];
  slotMinutes: number;
  bookingHorizonDays: number;
  lastTicketBeforeCloseMinutes: number;
  checkinEarliestMinutes: number;
  checkinGraceMinutes: number;
  lateDowngradeWindowMinutes: number;
  calledTimeoutMinutes: number;
  maxRecalls: number;
  longSessionAlertMinutes: number;
  maxActiveTicketsPerService: number;
  maxActiveServicesPerCustomer: number;
  maxCheckinFailures: number;
  checkinLockoutMinutes: number;
  slotCapacityPerCounter: number;
  allowCrossCounterCalls: boolean;
  requireKioskPhone: boolean;
  carryOverWaitingTickets: boolean;
}

interface ModelStatus {
  available: boolean;
  trained?: boolean;
  model?: string;
  availableSamples?: number;
  samples?: number;
  model_mae_mins?: number;
  baseline_mae_mins?: number;
  improvement_pct?: number;
  trained_at?: string;
  reason?: string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Each operating control, with a short hint explaining what it does. */
const NUMERIC_FIELDS: Array<{ key: keyof BusinessSettings; label: string; hint: string; suffix: string }> = [
  { key: 'slotMinutes', label: 'Appointment slot', hint: 'scheduling granularity', suffix: 'min' },
  { key: 'bookingHorizonDays', label: 'Book ahead limit', hint: 'how far ahead customers may book', suffix: 'days' },
  { key: 'slotCapacityPerCounter', label: 'Places per counter, per slot', hint: 'capacity derives from staffing', suffix: '' },
  { key: 'lastTicketBeforeCloseMinutes', label: 'Stop new tickets before close', hint: 'serve everyone already waiting', suffix: 'min' },
  { key: 'checkinEarliestMinutes', label: 'Check-in opens before appointment', hint: 'blocks all-day early arrivals', suffix: 'min' },
  { key: 'checkinGraceMinutes', label: 'On-time grace after appointment', hint: 'past this the appointment is lost', suffix: 'min' },
  { key: 'lateDowngradeWindowMinutes', label: 'Late arrival still accepted for', hint: 'downgraded to a walk-in, not cancelled', suffix: 'min' },
  { key: 'calledTimeoutMinutes', label: 'Automatic no-show after calling', hint: 'frees a ticket staff forgot', suffix: 'min' },
  { key: 'maxRecalls', label: 'Recalls before no-show', hint: 'stops one ticket blocking a counter', suffix: '' },
  { key: 'longSessionAlertMinutes', label: 'Alert on long session', hint: 'prompts a person, never auto-closes', suffix: 'min' },
  { key: 'maxActiveTicketsPerService', label: 'Live tickets per service', hint: 'per customer', suffix: '' },
  { key: 'maxActiveServicesPerCustomer', label: 'Services per customer', hint: 'concurrent service lines', suffix: '' },
  { key: 'maxCheckinFailures', label: 'Failed check-ins before lockout', hint: 'brute-force guard', suffix: '' },
  { key: 'checkinLockoutMinutes', label: 'Lockout duration', hint: 'brute-force guard', suffix: 'min' }
];

/** Policy switches, as opposed to thresholds. */
const TOGGLE_FIELDS: Array<{ key: keyof BusinessSettings; label: string; hint: string }> = [
  {
    key: 'allowCrossCounterCalls',
    label: 'Allow counters to cover each other',
    hint: 'staff must switch counters on purpose, and the action is logged'
  },
  {
    key: 'requireKioskPhone',
    label: 'Require a phone number at the kiosk',
    hint: 'off means customers may skip it, losing ticket lookup and the duplicate check'
  },
  {
    key: 'carryOverWaitingTickets',
    label: 'Carry waiting tickets into the next day',
    hint: 'leave off unless the centre runs overnight'
  }
];

const card = 'bg-white rounded-3xl border border-gray-100 shadow-sm p-6';
const input = 'w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl font-bold text-sm focus:border-blue-500 focus:bg-white outline-none transition-all';

const OperationsView: React.FC<{ token: string }> = ({ token }) => {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [training, setTraining] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
  const [newService, setNewService] = useState({ name: '', description: '', counters: 1 });

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const load = useCallback(async () => {
    try {
      const [servicesRes, settingsRes, modelRes] = await Promise.all([
        axios.get(`${API_BASE}/admin/services`, auth),
        axios.get(`${API_BASE}/admin/settings`, auth),
        axios.get(`${API_BASE}/admin/model`, auth)
      ]);
      setServices(servicesRes.data);
      setSettings(settingsRes.data);
      setModel(modelRes.data);
    } catch (error) {
      setMessage({ text: apiErrorMessage(error, 'Could not load operations settings.'), type: 'error' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { data } = await axios.put(`${API_BASE}/admin/settings`, settings, auth);
      setSettings(data);
      setMessage({ text: 'Operating rules saved. They take effect immediately.', type: 'success' });
    } catch (error) {
      setMessage({ text: apiErrorMessage(error, 'Could not save settings.'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const addService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/admin/services`, newService, auth);
      setNewService({ name: '', description: '', counters: 1 });
      setMessage({ text: 'Service added. It is now bookable from every portal.', type: 'success' });
      load();
    } catch (error) {
      setMessage({ text: apiErrorMessage(error, 'Could not add the service.'), type: 'error' });
    }
  };

  const toggleService = async (service: ServiceRow) => {
    try {
      await axios.put(`${API_BASE}/admin/services/${encodeURIComponent(service.name)}`, {
        isActive: !service.isActive
      }, auth);
      load();
    } catch (error) {
      setMessage({ text: apiErrorMessage(error, 'Could not update the service.'), type: 'error' });
    }
  };

  const removeService = async (service: ServiceRow) => {
    if (!window.confirm(`Remove "${service.name}"?`)) return;
    try {
      const { data } = await axios.delete(`${API_BASE}/admin/services/${encodeURIComponent(service.name)}`, auth);
      setMessage({ text: data.message || 'Service removed.', type: data.deactivated ? 'error' : 'success' });
      load();
    } catch (error) {
      setMessage({ text: apiErrorMessage(error, 'Could not remove the service.'), type: 'error' });
    }
  };

  const trainModel = async () => {
    setTraining(true);
    try {
      const { data } = await axios.post(`${API_BASE}/admin/model/train`, {}, auth);
      setMessage({
        text: data.trained
          ? `Model retrained on ${data.samples} tickets — average error ${data.model_mae_mins} min vs ${data.baseline_mae_mins} min for the formula.`
          : data.message || data.reason || 'Not enough history to train yet.',
        type: data.trained ? 'success' : 'error'
      });
      load();
    } catch (error) {
      setMessage({ text: apiErrorMessage(error, 'Training request failed.'), type: 'error' });
    } finally {
      setTraining(false);
    }
  };

  const toggleDay = (day: number) => {
    if (!settings) return;
    const openDays = settings.openDays.includes(day)
      ? settings.openDays.filter((d) => d !== day)
      : [...settings.openDays, day].sort();
    setSettings({ ...settings, openDays });
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500" size={48} /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h2 className="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">Operations</h2>
        <p className="text-gray-500 font-medium text-sm">
          The service catalogue and the rules the queue enforces. Every portal reads from here.
        </p>
      </header>

      {message && (
        <div className={`rounded-2xl p-4 flex items-start gap-2 border ${
          message.type === 'success'
            ? 'bg-green-50 border-green-100 text-green-700'
            : 'bg-red-50 border-red-100 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
          <p className="text-sm font-bold">{message.text}</p>
        </div>
      )}

      {/* ── Service catalogue ─────────────────────────────────────────────── */}
      <section className={card}>
        <h3 className="text-lg font-black text-gray-800 flex items-center mb-1">
          <Briefcase className="mr-2 text-blue-600" size={20} /> Service catalogue
        </h3>
        <p className="text-xs font-bold text-gray-400 mb-5">
          Adding a service here makes it bookable everywhere — no code change, no redeploy.
        </p>

        <div className="space-y-3 mb-6">
          {services.map((service) => (
            <div key={service.name} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
              <div className="flex-1 min-w-0">
                <p className={`font-black truncate ${service.isActive ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                  {service.name}
                </p>
                <p className="text-[11px] font-bold text-gray-400">
                  {service.counters} counter(s) · {service.effectiveSlotCapacity} place(s) per slot
                  {service.description ? ` · ${service.description}` : ''}
                </p>
              </div>
              <button
                onClick={() => toggleService(service)}
                title={service.isActive ? 'Deactivate' : 'Activate'}
                className={`p-2.5 rounded-xl transition-colors ${
                  service.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                }`}
              >
                <Power size={16} />
              </button>
              <button
                onClick={() => removeService(service)}
                title="Remove"
                className="p-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {services.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No services configured yet.</p>
          )}
        </div>

        <form onSubmit={addService} className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_1fr_auto] gap-3">
          <input
            required
            value={newService.name}
            onChange={(e) => setNewService({ ...newService, name: e.target.value })}
            placeholder="Service name"
            className={input}
          />
          <input
            value={newService.description}
            onChange={(e) => setNewService({ ...newService, description: e.target.value })}
            placeholder="Short description"
            className={input}
          />
          <input
            type="number"
            min={1}
            value={newService.counters}
            onChange={(e) => setNewService({ ...newService, counters: Number(e.target.value) })}
            placeholder="Counters"
            className={input}
          />
          <button
            type="submit"
            className="px-5 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center justify-center gap-1"
          >
            <Plus size={16} /> Add
          </button>
        </form>
      </section>

      {/* ── Operating rules ───────────────────────────────────────────────── */}
      {settings && (
        <section className={card}>
          <h3 className="text-lg font-black text-gray-800 flex items-center mb-1">
            <Clock className="mr-2 text-orange-500" size={20} /> Operating rules
          </h3>
          <p className="text-xs font-bold text-gray-400 mb-5">
            Opening hours, appointment capacity and the timeouts that stop tickets getting stuck.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Opens</label>
              <input
                type="time"
                value={settings.openTime}
                onChange={(e) => setSettings({ ...settings, openTime: e.target.value })}
                className={input}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Closes</label>
              <input
                type="time"
                value={settings.closeTime}
                onChange={(e) => setSettings({ ...settings, closeTime: e.target.value })}
                className={input}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Open days</label>
              <div className="flex gap-1 mt-1">
                {DAY_LABELS.map((label, day) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`flex-1 py-2.5 rounded-lg text-[10px] font-black transition-all ${
                      settings.openDays.includes(day)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    {label[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {NUMERIC_FIELDS.map((field) => (
              <div key={String(field.key)}>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">
                  {field.label} {field.suffix && <span className="text-gray-300">({field.suffix})</span>}
                </label>
                <input
                  type="number"
                  min={0}
                  value={settings[field.key] as number}
                  onChange={(e) => setSettings({ ...settings, [field.key]: Number(e.target.value) })}
                  className={input}
                />
                <p className="text-[10px] font-bold text-gray-300 mt-1 ml-1">{field.hint}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {TOGGLE_FIELDS.map((field) => (
              <label
                key={String(field.key)}
                className="flex items-start gap-3 p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={!!settings[field.key]}
                  onChange={(e) => setSettings({ ...settings, [field.key]: e.target.checked })}
                  className="w-5 h-5 mt-0.5 rounded text-blue-600 focus:ring-blue-500 shrink-0"
                />
                <span>
                  <span className="block font-bold text-sm text-gray-700">{field.label}</span>
                  <span className="block text-[10px] font-bold text-gray-400 mt-0.5">{field.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <button
            onClick={saveSettings}
            disabled={saving}
            className="mt-6 px-6 py-3 bg-gray-900 text-white rounded-xl font-black text-sm hover:bg-black flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} SAVE RULES
          </button>
        </section>
      )}

      {/* ── Wait-time model ───────────────────────────────────────────────── */}
      <section className={card}>
        <h3 className="text-lg font-black text-gray-800 flex items-center mb-1">
          <BrainCircuit className="mr-2 text-purple-600" size={20} /> Wait-time model
        </h3>
        <p className="text-xs font-bold text-gray-400 mb-5">
          The estimate starts as a queueing formula and is replaced by a fitted model once
          served tickets show it does better.
        </p>

        {model && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Engine</p>
              <p className="font-black text-gray-800 text-sm mt-1">{model.available ? 'Online' : 'Unreachable'}</p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estimator</p>
              <p className="font-black text-gray-800 text-sm mt-1">{model.trained ? 'Learned model' : 'Formula'}</p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Training data</p>
              <p className="font-black text-gray-800 text-sm mt-1">{model.availableSamples ?? 0} tickets</p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Average error</p>
              <p className="font-black text-gray-800 text-sm mt-1">
                {model.model_mae_mins !== undefined ? `${model.model_mae_mins} min` : '—'}
              </p>
            </div>
          </div>
        )}

        {model && !model.available && (
          <p className="text-xs font-bold text-orange-600 mb-4">
            {model.reason} — the backend is using its built-in estimate, so ticketing is unaffected.
          </p>
        )}

        <button
          onClick={trainModel}
          disabled={training}
          className="px-6 py-3 bg-purple-600 text-white rounded-xl font-black text-sm hover:bg-purple-700 flex items-center gap-2 disabled:opacity-50"
        >
          {training ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />} RETRAIN NOW
        </button>
      </section>
    </div>
  );
};

export default OperationsView;
