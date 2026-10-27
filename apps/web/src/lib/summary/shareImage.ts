import type { RideStats, SpeedSegment } from '@rechase/core';
import { fmtDate, fmtDuration, fmtInt, fmtKm, fmtKmh } from '../format.ts';
import { speedColor } from './speedColor.ts';

const W = 1080;
const H = 1350;

/**
 * Teilbild der Fahrt im App-Design: Spur im Tempo-Farbverlauf und die wichtigsten Zahlen.
 * Ohne Kartenkacheln, damit es offline geht und keine fremden Bilder im Canvas landen.
 */
export async function renderShareImage(opts: {
  startedAt: number;
  title?: string;
  stats: RideStats;
  segments: SpeedSegment[];
}): Promise<Blob | null> {
  await document.fonts?.ready;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const num = css('--font-num') || 'sans-serif';
  const text = css('--font-text') || 'sans-serif';

  g.fillStyle = css('--bg') || '#0d0f12';
  g.fillRect(0, 0, W, H);

  // Kopf
  g.fillStyle = css('--you') || '#ff7a1a';
  g.font = `700 56px ${num}`;
  g.fillText('re:chase', 72, 120);
  g.fillStyle = css('--muted') || '#9aa3af';
  g.font = `500 34px ${text}`;
  g.fillText(opts.title ? `${opts.title} · ${fmtDate(opts.startedAt)}` : fmtDate(opts.startedAt), 72, 172);

  // Spur, flächentreu genug für eine Hausrunde
  const box = { x: 72, y: 230, w: W - 144, h: 640 };
  g.fillStyle = css('--surface-2') || '#111418';
  roundRect(g, box.x, box.y, box.w, box.h, 36);
  g.fill();
  const pts = opts.segments.flatMap((s) => s.coords);
  if (pts.length > 1) {
    const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const kx = Math.cos((lat0 * Math.PI) / 180);
    const xs = pts.map((p) => p[0] * kx);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 60;
    const scale = Math.min((box.w - 2 * pad) / (x1 - x0 || 1e-9), (box.h - 2 * pad) / (y1 - y0 || 1e-9));
    const ox = box.x + (box.w - (x1 - x0) * scale) / 2;
    const oy = box.y + (box.h - (y1 - y0) * scale) / 2;
    const px = (p: [number, number]): [number, number] => [ox + (p[0] * kx - x0) * scale, oy + (y1 - p[1]) * scale];

    g.lineCap = g.lineJoin = 'round';
    g.lineWidth = 22;
    g.strokeStyle = '#000';
    g.globalAlpha = 0.5;
    stroke(g, pts.map(px));
    g.globalAlpha = 1;
    g.lineWidth = 12;
    for (const s of opts.segments) {
      g.strokeStyle = speedColor(s.level);
      stroke(g, s.coords.map(px));
    }
    dot(g, px(pts[0]!), '#f2f4f7');
    dot(g, px(pts.at(-1)!), css('--you') || '#ff7a1a');
  }

  // Kennzahlen 2 × 3
  const s = opts.stats;
  const tiles: [string, string, string][] = [
    ['Distanz', fmtKm(s.distance), 'km'],
    ['Fahrzeit', fmtDuration(s.movingTime), ''],
    ['Ø Tempo', fmtKmh(s.avgSpeed), 'km/h'],
    ['Top Speed', fmtKmh(s.topSpeed), 'km/h'],
    ['Höhenmeter', fmtInt(s.ascent), 'm'],
    ['Gesamtzeit', fmtDuration(s.elapsed), ''],
  ];
  const tw = (W - 144 - 24) / 2;
  tiles.forEach(([label, value, unit], i) => {
    const x = 72 + (i % 2) * (tw + 24);
    const y = 910 + Math.floor(i / 2) * 136;
    g.fillStyle = css('--surface') || '#171a1f';
    roundRect(g, x, y, tw, 120, 28);
    g.fill();
    g.fillStyle = css('--muted') || '#9aa3af';
    g.font = `600 24px ${text}`;
    g.fillText(label.toUpperCase(), x + 28, y + 40);
    g.fillStyle = css('--text') || '#f2f4f7';
    g.font = `600 60px ${num}`;
    g.fillText(value, x + 28, y + 100);
    if (unit) {
      const w = g.measureText(value).width;
      g.fillStyle = css('--muted') || '#9aa3af';
      g.font = `500 28px ${text}`;
      g.fillText(unit, x + 28 + w + 10, y + 100);
    }
  });

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

function stroke(g: CanvasRenderingContext2D, pts: [number, number][]) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}

function dot(g: CanvasRenderingContext2D, [x, y]: [number, number], color: string) {
  g.beginPath();
  g.arc(x, y, 16, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#0d0f12';
  g.stroke();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
