/** Ein Rohpunkt, wie ihn die Geolocation-API liefert. */
export interface TrackPoint {
  /** Zeitstempel in ms seit Epoch */
  t: number;
  lat: number;
  lon: number;
  /** GPS-Höhe in m, oft ungenau */
  alt?: number | null;
  /** Geschwindigkeit in m/s vom GNSS-Chip, kann fehlen */
  speed?: number | null;
  /** Horizontale Genauigkeit in m */
  accuracy: number;
}

/** Ein angenommener Punkt mit aufsummierten Werten der Fahrt. */
export interface MotionSample extends TrackPoint {
  /** Geglättete Geschwindigkeit in m/s */
  speed: number;
  moving: boolean;
  /** Zurückgelegte Distanz in m (nur in Bewegung gezählt) */
  distance: number;
  /** Bewegungszeit in ms */
  movingTime: number;
  /** Gesamtzeit seit Start in ms */
  elapsed: number;
}
