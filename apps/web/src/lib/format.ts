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

export const fmtDay = (t: number) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

const MINUS = '−';
const sign = (n: number) => (n < 0 ? MINUS : '+');

/** Abstand in Metern aus deiner Sicht: −38 m heißt, der Ghost liegt 38 m vorn. */
export function fmtGapMeters(ghostAheadM: number): string {
  const m = Math.round(ghostAheadM);
  return m === 0 ? '0 m' : `${sign(-m)}${nf0.format(Math.abs(m))} m`;
}

/** Zeitabstand ohne Vorzeichen: 5,2 s bzw. ab einer Minute 1:05 min */
export function fmtGapSeconds(s: number): string {
  const a = Math.abs(s);
  return a < 60 ? `${nf1.format(a)} s` : `${fmtDuration(a * 1000)} min`;
}
