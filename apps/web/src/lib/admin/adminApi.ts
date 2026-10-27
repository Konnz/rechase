import type { AdminRide, AdminTester, FieldTestStats, RideUpload } from '@rechase/core';
import { api } from '../api.ts';

/** Lesende Aufrufe des Adminbereichs (E22-3 bis E22-6) */
export const adminApi = {
  stats: async () => (await api<{ stats: FieldTestStats }>('GET', '/api/admin/stats')).stats,
  testers: async () => (await api<{ testers: AdminTester[] }>('GET', '/api/admin/testers')).testers,
  rides: async (userId?: string) =>
    (await api<{ rides: AdminRide[] }>('GET', `/api/admin/rides${userId ? `?user=${encodeURIComponent(userId)}` : ''}`)).rides,
  ride: (id: string) => api<{ ride: AdminRide; data: RideUpload }>('GET', `/api/admin/rides/${encodeURIComponent(id)}`),
};

export const REASON_LABELS = {
  plausibility: 'Plausibilität',
  gaps: 'viele Lücken',
  hidden: 'App oft verlassen',
  incomplete: 'nicht beendet',
} as const;
