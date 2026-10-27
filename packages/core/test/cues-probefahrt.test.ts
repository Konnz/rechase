import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DuelCues, type Cue } from '../src/cues.ts';
import { compareToGhost } from '../src/ghost.ts';
import { MotionTracker } from '../src/motion.ts';
import { FINISH_TOLERANCE_M, RouteProgress, buildRoute, ghostFromSamples } from '../src/route.ts';
import { SectionTimer, bestSectionTimes, sectionBounds } from '../src/sections.ts';
import type { MotionSample, TrackPoint } from '../src/types.ts';
import { parseGpx } from './helpers.ts';

const points = parseGpx(readFileSync(new URL('./fixtures/probefahrt-2026-10-27.gpx', import.meta.url), 'utf8'));
const track = (pts: TrackPoint[]) => {
  const m = new MotionTracker();
  return pts.map((p) => m.push(p)).filter((s): s is MotionSample => s != null);
};

/** Die Probefahrt noch einmal, im zweiten Teil etwas schneller als beim ersten Mal */
function duel(): Cue[] {
  const samples = track(points);
  const route = buildRoute(samples.filter((s) => s.moving));
  const ghost = ghostFromSamples(route, samples);
  const bounds = sectionBounds(route.length);
  const timer = new SectionTimer(bounds, bestSectionTimes([ghost], bounds));
  const cues = new DuelCues();
  const progress = new RouteProgress(route);
  const t0 = points[0].t;
  const half = t0 + (points.at(-1)!.t - t0) / 2;
  // Ab der Hälfte 5 % schneller: die Zeitstempel rücken zusammen
  const again = points.map((p) => (p.t <= half ? p : { ...p, t: half + (p.t - half) * 0.95 }));
  const out: Cue[] = [];
  for (const s of track(again)) {
    const r = progress.push(s);
    if (!r) continue;
    const finished = r.along >= route.length - FINISH_TOLERANCE_M;
    const gap = compareToGhost(ghost, { distance: r.along, movingTime: r.time });
    out.push(...timer.push(r.along, r.time, r.onRoute).map((x): Cue => ({ kind: 'section', ...x })));
    out.push(...cues.push({ t: s.t, along: r.along, routeLength: route.length, gapMeters: gap.meters, onRoute: r.onRoute, finished, won: true }));
    if (finished) break;
  }
  return out;
}

describe('Töne auf der Probefahrt', () => {
  const cues = duel();
  const count = (k: Cue['kind']) => cues.filter((c) => c.kind === k).length;

  it('überholt den Ghost in der zweiten Hälfte, ohne Dauergepiepe', () => {
    expect(count('overtake')).toBeGreaterThanOrEqual(1);
    expect(count('overtake') + count('overtaken')).toBeLessThanOrEqual(6);
  });

  it('zählt herunter und meldet das Ziel', () => {
    expect(cues.filter((c) => c.kind === 'countdown').map((c) => c.kind === 'countdown' && c.meters)).toEqual([500, 300, 100]);
    expect(cues.at(-1)).toEqual({ kind: 'finish', won: true });
  });

  it('meldet Abschnitts-PRs nur in der schnelleren Hälfte', () => {
    const sections = cues.filter((c) => c.kind === 'section');
    expect(sections.length).toBeGreaterThanOrEqual(8);
    const prs = sections.filter((c) => c.kind === 'section' && c.pr);
    expect(prs.length).toBeGreaterThanOrEqual(3);
    expect(prs.every((c) => c.kind === 'section' && c.index >= 4)).toBe(true);
  });
});
