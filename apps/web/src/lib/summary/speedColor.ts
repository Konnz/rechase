/** Tempo-Skala von langsam (kühl) nach schnell (heiß); das Orange am Ende ist die Fahrerfarbe. */
export const SPEED_STOPS = ['#3d7bff', '#2ec7a6', '#b6e04a', '#ffc21a', '#ff7a1a', '#ff453a'];

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/** Farbe für eine Tempostufe zwischen 0 und 1. */
export function speedColor(level: number): string {
  const x = Math.min(1, Math.max(0, level)) * (SPEED_STOPS.length - 1);
  const i = Math.min(SPEED_STOPS.length - 2, Math.floor(x));
  const a = hex(SPEED_STOPS[i]!);
  const b = hex(SPEED_STOPS[i + 1]!);
  const f = x - i;
  return '#' + a.map((v, k) => Math.round(v + (b[k]! - v) * f).toString(16).padStart(2, '0')).join('');
}

export const SPEED_GRADIENT = `linear-gradient(90deg, ${SPEED_STOPS.join(', ')})`;
