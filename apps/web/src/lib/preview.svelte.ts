import type { LatLon } from './map/LiveMap.svelte';

/**
 * Standort vor dem Start, damit die Karte schon zeigt, wo man steht und wie gut der GPS-Fix ist.
 * Fragt nie von selbst nach der Freigabe: Ist sie noch nicht erteilt, startet erst ein Tipp (ask) die Abfrage.
 * Läuft nur, solange die Seite sichtbar ist, und wird während der Aufnahme vom RideRecorder abgelöst.
 */
export class PositionPreview {
  position = $state.raw<LatLon | null>(null);
  accuracy = $state<number | null>(null);
  /** 'prompt': Freigabe noch offen, 'denied': abgelehnt */
  permission = $state<PermissionState | 'unsupported'>('prompt');

  private watchId: number | null = null;
  private wanted = false;

  constructor() {
    if (!('geolocation' in navigator)) {
      this.permission = 'unsupported';
      return;
    }
    document.addEventListener('visibilitychange', this.sync);
    void navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => {
        this.permission = status.state;
        status.addEventListener('change', () => {
          this.permission = status.state;
          this.sync();
        });
        this.sync();
      })
      .catch(() => {});
  }

  /** Vorschau an (vor der Fahrt) oder aus (während der Aufnahme) */
  set active(on: boolean) {
    this.wanted = on;
    this.sync();
  }

  /** Nach einem Tipp des Nutzers: Freigabe anfragen und Vorschau starten */
  ask() {
    if (this.permission === 'unsupported') return;
    this.permission = 'granted';
    this.sync();
  }

  private sync = () => {
    const run = this.wanted && this.permission === 'granted' && document.visibilityState === 'visible';
    if (run && this.watchId == null) {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          this.position = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          this.accuracy = pos.coords.accuracy;
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            this.permission = 'denied';
            this.sync();
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
      );
    } else if (!run && this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  };
}
