export type LeadStatus =
  | 'Pending'
  | 'Waiting'
  | 'Called'
  | 'Serving'
  | 'Completed'
  | 'No-Show'
  | 'Cancelled';

export interface Lead {
  id: number;
  ticketNumber: string;
  email: string;
  phone: string;
  service: string;
  staff?: string;
  status: LeadStatus;
  source: 'On-site' | 'Remote';
  priority?: boolean;
  tags?: string[];
  notes?: string;
  predictedWaitTime: number;
  /** 'Unavailable' means no counter is open, not a zero-minute wait. */
  queueStatus?: 'Low' | 'Medium' | 'Busy' | 'Unavailable';
  assignedPosition: string;
  timestamp: string | Date;
  calledAt?: string | Date;
  servingAt?: string | Date;
  completedAt?: string | Date;
  scheduledFor?: string | Date;
  pendingExpiresAt?: string | Date;
  checkedInAt?: string | Date;
  recallCount?: number;
  /** Single ordering key: appointment time or arrival, whichever is later. */
  effectiveQueueTime?: string | Date;
  /** True when a late arrival lost the appointment and is queued as a walk-in. */
  walkInDowngraded?: boolean;
  /** Why a ticket reached Cancelled or No-Show, for the UI to explain itself. */
  cancelReason?: string;
  longSessionAlertedAt?: string | Date;
  hasFeedback?: boolean;
  feedback?: {
    rating: number;
    comment: string;
    date: string | Date;
  };
}

/** One service line the centre runs, as published by /api/catalog. */
export interface CatalogService {
  name: string;
  description: string;
  counters: number;
  /** Staff signed in right now. 0 means nobody can call this queue. */
  staffOnline: number;
}

export interface CatalogHours {
  openDays: number[];
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  bookingHorizonDays: number;
  checkinEarliestMinutes: number;
  checkinGraceMinutes: number;
}

export interface CatalogStatus {
  open: boolean;
  acceptingWalkIns: boolean;
  lastWalkInTicketAt: string;
  opensAt: string;
  closesAt: string;
}

export interface Catalog {
  services: CatalogService[];
  hours: CatalogHours;
  status: CatalogStatus;
}

export interface AppointmentSlot {
  start: string;
  label: string;
  remaining: number;
  capacity: number;
}

export interface AvailabilityDay {
  date: string;
  slots: AppointmentSlot[];
}

export const API_BASE: string;
export const AUTH_BASE: string;
export const SOCKET_URL: string;
export const ONLINE_PORTAL_URL: string;
export function trackingUrlFor(ticketNumber: string): string;
