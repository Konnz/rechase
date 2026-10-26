const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

export const fmtKmh = (ms: number | null | undefined) => (ms == null ? '–' : nf1.format(ms * 3.6));
export const fmtKm = (m: number) => nf1.format(m / 1000);
export const fmtInt = (n: number | null | undefined) => (n == null ? '–' : nf0.format(n));

/** ms → h:mm:ss bzw. m:ss */
export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export const fmtDate = (t: number) =>
  new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
