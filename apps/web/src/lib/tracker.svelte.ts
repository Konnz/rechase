import { MotionTracker, type MotionSample, type TrackPoint } from '@rechase/core';
import { saveRide, type StoredRide } from './db.ts';

type Status = 'idle' | 'starting' | 'recording' | 'stopped' | 'error';

const SAVE_EVERY_MS = 5000;

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

  private motion = new MotionTracker();
  private ride: StoredRide | null = null;
  private watchId: number | null = null;
  private lock: WakeLockSentinel | null = null;
  private lastSave = 0;

  async start() {
    if (!('geolocation' in navigator)) {
      this.fail('Dieses Gerät bietet keine Standortbestimmung.');
      return;
    }
    this.status = 'starting';
    this.error = null;
    this.motion = new MotionTracker();
    this.current = null;
    this.lastRaw = null;
    this.hiddenCount = this.gaps = this.rejected = this.points = 0;
    this.ride = {
      id: crypto.randomUUID(),
      startedAt: Date.now(),
      endedAt: null,
      raw: [],
      samples: [],
      gaps: 0,
      rejected: 0,
      userAgent: navigator.userAgent,
    };

    await this.acquireWakeLock();
    document.addEventListener('visibilitychange', this.onVisibility);

    this.watchId = navigator.geolocation.watchPosition(this.onPosition, this.onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20_000,
    });
  }

  async stop(): Promise<StoredRide | null> {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    await this.lock?.release().catch(() => {});
    this.lock = null;
    this.wakeLock = 'aus';
    const ride = this.ride;
    this.ride = null;
    if (ride) {
      ride.endedAt = Date.now();
      await this.persist(ride);
    }
    this.status = 'stopped';
    return ride;
  }

  private onPosition = (pos: GeolocationPosition) => {
    const ride = this.ride;
    if (!ride) return;
    const c = pos.coords;
    const p: TrackPoint = {
      t: pos.timestamp,
      lat: c.latitude,
      lon: c.longitude,
      alt: c.altitude,
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
