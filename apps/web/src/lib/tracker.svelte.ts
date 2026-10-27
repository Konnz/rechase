import { MotionTracker, type BikeType, type Cue, type Geoid, type MotionSample, type TrackPoint } from '@rechase/core';
import { altitudeIsEllipsoidal, loadGeoid } from './altitude.ts';
import { battery, deviceInfo } from './device.ts';
import { saveRide, type StoredRide } from './db.ts';
import type { Duel } from './duel.svelte.ts';
import type { LatLon } from './map/LiveMap.svelte';

type Status = 'idle' | 'starting' | 'recording' | 'stopped' | 'error';

const SAVE_EVERY_MS = 5000;

type PositionLike = Pick<GeolocationPosition, 'timestamp'> & {
  coords: Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'altitude' | 'speed' | 'accuracy'>;
};

/** Liefert Positionen, bis die zurückgegebene Funktion aufgerufen wird. */
export type PositionSource = (
  onPosition: (pos: PositionLike) => void,
  onError: (err: GeolocationPositionError) => void,
) => () => void;

const gpsSource: PositionSource = (onPosition, onError) => {
  const id = navigator.geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 20_000,
  });
  return () => navigator.geolocation.clearWatch(id);
};

export interface StartOptions {
  /** Duell gegen den Ghost einer Strecke */
  duel?: Duel;
  /** Statt GPS, z. B. der Simulator */
  source?: PositionSource;
  /** Simulierte Fahrten werden nicht gespeichert */
  persist?: boolean;
  /** Gefahrenes Rad, wird mit der Fahrt gespeichert */
  bike?: BikeType | null;
}

/**
 * Zeichnet eine Fahrt auf: GPS mit hoher Genauigkeit, Bildschirm wach halten, laufend in IndexedDB sichern.
 * Eine PWA bekommt keine Positionen, solange der Bildschirm gesperrt ist; solche Lücken werden gezählt.
 */
export class RideRecorder {
  status = $state<Status>('idle');
  error = $state<string | null>(null);
  current = $state.raw<MotionSample | null>(null);
  lastRaw = $state.raw<TrackPoint | null>(null);
  wakeLock = $state<'aktiv' | 'aus' | 'nicht verfügbar'>('aus');
  hiddenCount = $state(0);
  gaps = $state(0);
  rejected = $state(0);
  points = $state(0);
  /** Gefahrene Spur für die Karte, nur Punkte in Bewegung (keine Drift an der Ampel) */
  track = $state.raw<LatLon[]>([]);
  duel = $state.raw<Duel | null>(null);
  simulated = $state(false);
  /** Bekommt jedes Ereignis der Fahrt, auf das ein Ton folgt */
  oncue: ((c: Cue) => void) | null = null;

  private motion = new MotionTracker();
  private ride: StoredRide | null = null;
  private unwatch: (() => void) | null = null;
  private persistRide = true;
  private lock: WakeLockSentinel | null = null;
  private lastSave = 0;
  private wasMoving: boolean | null = null;
  /** Rechnet die Höhe vom Ellipsoid auf den Meeresspiegel um, null wenn nicht nötig oder nicht möglich */
  private geoid: Geoid | null = null;

  async start({ duel, source, persist = true, bike }: StartOptions = {}) {
    if (!source && !('geolocation' in navigator)) {
      this.fail('Dieses Gerät bietet keine Standortbestimmung.');
      return;
    }
    this.status = 'starting';
    this.error = null;
    this.motion = new MotionTracker();
    this.current = null;
    this.lastRaw = null;
    this.track = [];
    this.duel = duel ?? null;
    this.simulated = !!source;
    this.persistRide = persist;
    this.hiddenCount = this.gaps = this.rejected = this.points = 0;
    this.wasMoving = null;
    // Simulierte Fahrten spielen schon umgerechnete Höhen ab
    this.geoid = !source && altitudeIsEllipsoidal() ? await loadGeoid() : null;
    this.ride = {
      id: crypto.randomUUID(),
      startedAt: Date.now(),
      endedAt: null,
      raw: [],
      samples: [],
      gaps: 0,
      rejected: 0,
      userAgent: navigator.userAgent,
      ...(source ? {} : { altitudeRef: this.geoid || !altitudeIsEllipsoidal() ? 'msl' : 'ellipsoid' }),
      ...(duel ? { routeId: duel.stored.id } : {}),
      ...(bike ? { bike } : {}),
    };

    // Für den Feldtest: Gerät und Akku, ohne den Start aufzuhalten
    if (!source) void this.recordDevice(this.ride);

    await this.acquireWakeLock();
    document.addEventListener('visibilitychange', this.onVisibility);

    this.unwatch = (source ?? gpsSource)(this.onPosition, this.onError);
  }

  async stop(): Promise<StoredRide | null> {
    this.unwatch?.();
    this.unwatch = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    await this.lock?.release().catch(() => {});
    this.lock = null;
    this.wakeLock = 'aus';
    const ride = this.ride;
    this.ride = null;
    if (ride) {
      ride.endedAt = Date.now();
      ride.hidden = this.hiddenCount;
      const d = this.duel;
      if (d) {
        ride.duel = { opponent: d.opponent.short, opponentTime: d.opponent.time, time: d.phase === 'finished' ? d.time : null };
      }
      if (ride.battery) {
        const b = await battery();
        ride.battery = { ...ride.battery, end: b?.level ?? null, charging: ride.battery.charging || !!b?.charging };
      }
      await this.persist(ride);
    }
    this.status = 'stopped';
    return ride;
  }

  private onPosition = (pos: PositionLike) => {
    const ride = this.ride;
    if (!ride) return;
    const c = pos.coords;
    const p: TrackPoint = {
      t: pos.timestamp,
      lat: c.latitude,
      lon: c.longitude,
      alt: c.altitude != null && this.geoid ? this.geoid.toMsl(c.latitude, c.longitude, c.altitude) : c.altitude,
      speed: c.speed,
      accuracy: c.accuracy,
    };
    ride.raw.push(p);
    this.lastRaw = p;
    this.error = null;
    this.points = ride.raw.length;

    const sample = this.motion.push(p);
    if (sample) {
      ride.samples.push(sample);
      this.current = sample;
      if (sample.moving) this.track = [...this.track, { lat: sample.lat, lon: sample.lon }];
      const cues = this.duel?.push(sample) ?? [];
      if (this.wasMoving != null && sample.moving !== this.wasMoving) cues.unshift({ kind: 'pause', moving: sample.moving });
      this.wasMoving = sample.moving;
      for (const c of cues) this.oncue?.(c);
    }
    this.gaps = ride.gaps = this.motion.gaps;
    this.rejected = ride.rejected = this.motion.rejected;
    if (this.status === 'starting') this.status = 'recording';

    if (p.t - this.lastSave > SAVE_EVERY_MS) {
      this.lastSave = p.t;
      void this.persist(ride);
    }
  };

  private onError = (err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      void this.stop().then(() =>
        this.fail('Standortfreigabe verweigert. Bitte in den Einstellungen für diese Seite erlauben.'),
      );
      return;
    }
    // Kein Signal (Tunnel, Wald) oder Timeout: Hinweis zeigen, die Aufzeichnung läuft weiter.
    this.error = 'GPS-Signal schwach, warte auf Empfang …';
  };

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') this.hiddenCount++;
    // Der Wake Lock fällt beim Verlassen der Seite weg und muss neu angefordert werden.
    else void this.acquireWakeLock();
  };

  private async recordDevice(ride: StoredRide) {
    const [device, b] = await Promise.all([deviceInfo(), battery()]);
    if (device) ride.device = device;
    if (b) ride.battery = { start: b.level, end: null, charging: b.charging };
  }

  private async acquireWakeLock() {
    if (!('wakeLock' in navigator)) {
      this.wakeLock = 'nicht verfügbar';
      return;
    }
    try {
      this.lock = await navigator.wakeLock.request('screen');
      this.wakeLock = 'aktiv';
      this.lock.addEventListener('release', () => (this.wakeLock = 'aus'));
    } catch {
      this.wakeLock = 'aus';
    }
  }

  private async persist(ride: StoredRide) {
    if (!this.persistRide) return;
    try {
      await saveRide(ride);
    } catch (e) {
      console.error('Fahrt konnte nicht gespeichert werden', e);
    }
  }

  private fail(msg: string) {
    this.error = msg;
    this.status = 'error';
  }
}
