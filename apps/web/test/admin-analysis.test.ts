import type { MotionSample, TrackPoint } from '@rechase/core';
import { describe, expect, it } from 'vitest';
import { analyzeRide, sampleAt } from '../src/lib/admin/analysis.ts';

const pt = (t: number, moving: boolean, accuracy = 5): MotionSample => ({
  t: t * 1000,
  lat: 51 + t * 0.0001,
  lon: 7,
  accuracy,
  speed: moving ? 7 : 0,
  moving,
  distance: 0,
  movingTime: 0,
  elapsed: t * 1000,
});

describe('Fahrt im Adminbereich', () => {
  // 0–9 fahren, 10–29 Ampel, 30–39 fahren, Lücke 39 → 60, 60–69 fahren
  const samples = [
    ...Array.from({ length: 10 }, (_, i) => pt(i, i > 0)),
    ...Array.from({ length: 20 }, (_, i) => pt(10 + i, false)),
    ...Array.from({ length: 10 }, (_, i) => pt(30 + i, true)),
    ...Array.from({ length: 10 }, (_, i) => pt(60 + i, true)),
  ];
  const raw: TrackPoint[] = [...samples, { t: 45_000, lat: 51, lon: 7, accuracy: 80 }, { t: 5_500, lat: 51, lon: 7, accuracy: 4 }];

  it('findet Pausen, Lücken und verworfene Punkte', () => {
    const a = analyzeRide({ samples, raw });
    expect(a.pauses).toEqual([{ lat: samples[10]!.lat, lon: 7, from: 10_000, to: 30_000 }]);
    expect(a.gaps.map((g) => [g.from.t, g.to.t])).toEqual([[39_000, 60_000]]);
    // Der zweite fehlende Rohpunkt war nur ein wiederholter Fix, kein verworfener
    expect(a.rejected.map((p) => p.t)).toEqual([45_000]);
    expect(a.moving).toHaveLength(3);
  });

  it('sucht den nächsten Punkt zu einer Zeit', () => {
    expect(sampleAt(samples, 12_400)!.t).toBe(12_000);
    expect(sampleAt(samples, 50_000)!.t).toBe(60_000);
    expect(sampleAt(samples, -5)!.t).toBe(0);
  });
});
