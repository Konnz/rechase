import { ChallengeDetector, type Cue, type MotionSample } from '@rechase/core';
import type { StoredRoute } from '../db.ts';
import type { Duel } from '../duel.svelte.ts';
import { toRoute } from '../routes.ts';
import type { RideRecorder } from '../tracker.svelte.ts';
import { challengePrefs } from './prefs.svelte.ts';

/** So lange (ms) läuft der Countdown, bis ein Angebot von selbst angenommen wird */
export const AUTO_ACCEPT_MS = 5000;
/** Im Modus „nur anbieten“ verschwindet das Angebot nach so vielen ms */
const OFFER_TIMEOUT_MS = 30_000;

export interface ChallengeOffer {
  duel: Duel;
  /** Zeitpunkt des automatischen Starts, null im Modus „nur anbieten“ */
  startsAt: number | null;
}

/**
 * Duell-Angebote unterwegs (E27): Während einer freien Fahrt wird geprüft, ob man auf den Start einer
 * gemerkten Strecke zufährt. Dann kommt ein Ton und eine große Einblendung; ohne Reaktion startet das Duell
 * nach 5 s mit fliegendem Start an der Linie. Während eines Duells kommt kein Angebot.
 */
export class ChallengeWatch {
  offer = $state.raw<ChallengeOffer | null>(null);

  private detector: ChallengeDetector | null = null;
  private routes = new Map<string, StoredRoute>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private rec: RideRecorder;
  private makeDuel: (route: StoredRoute) => Promise<Duel | null>;
  private cue: (c: Cue) => void;

  /** makeDuel baut das Duell mit dem vorgewählten Ghost; cue spielt die Töne */
  constructor(rec: RideRecorder, makeDuel: (route: StoredRoute) => Promise<Duel | null>, cue: (c: Cue) => void) {
    this.rec = rec;
    this.makeDuel = makeDuel;
    this.cue = cue;
  }

  /** Beim Start einer Fahrt: Kandidaten sind alle gemerkten Strecken außer stummgeschalteten. */
  begin(routes: readonly StoredRoute[]) {
    this.end();
    const open = routes.filter((r) => !challengePrefs.isMuted(r.id));
    this.routes = new Map(open.map((r) => [r.id, r]));
    this.detector = new ChallengeDetector(open.map((r) => ({ id: r.id, route: toRoute(r) })));
    if (this.rec.duel) this.detector.skip(this.rec.duel.stored.id);
  }

  end() {
    this.clearTimer();
    this.offer = null;
    this.detector = null;
  }

  /** Bekommt jeden Punkt der Fahrt, nachdem das laufende Duell ihn hatte. */
  push(s: MotionSample) {
    const duel = this.rec.duel;
    if (duel) {
      if (duel.challenge && duel.phase === 'abandoned') this.rec.detachDuel();
      return;
    }
    const det = this.detector;
    if (!det || challengePrefs.mode === 'off') return;
    const e = det.push(s);
    if (e?.kind === 'withdraw') this.close();
    else if (e?.kind === 'offer') void this.prepare(e.id);
  }

  /** Jetzt starten, ohne den Countdown abzuwarten */
  accept() {
    const o = this.offer;
    if (!o) return;
    this.close();
    if (this.rec.duel) return;
    this.rec.attachDuel(o.duel);
    this.cue({ kind: 'challenge', accepted: true });
  }

  decline() {
    this.close();
  }

  /** Diese Strecke künftig nicht mehr anbieten */
  mute() {
    const o = this.offer;
    if (o) challengePrefs.setMuted(o.duel.stored.id, true);
    this.close();
  }

  private async prepare(id: string) {
    const route = this.routes.get(id);
    const duel = route && (await this.makeDuel(route));
    const det = this.detector;
    // Inzwischen weggefallen, Fahrt beendet oder ein Duell läuft
    if (!duel || !det || det.offered !== id || this.rec.duel) {
      if (det?.offered === id) det.resolve();
      return;
    }
    const auto = challengePrefs.mode === 'auto';
    this.offer = { duel, startsAt: auto ? Date.now() + AUTO_ACCEPT_MS : null };
    this.cue({ kind: 'challenge', accepted: false });
    this.timer = setTimeout(() => (auto ? this.accept() : this.close()), auto ? AUTO_ACCEPT_MS : OFFER_TIMEOUT_MS);
  }

  private close() {
    this.clearTimer();
    this.offer = null;
    this.detector?.resolve();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
