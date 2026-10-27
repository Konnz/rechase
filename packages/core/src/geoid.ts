/**
 * Geoidhöhe nach EGM96: so weit liegt der Meeresspiegel über dem WGS84-Ellipsoid.
 * Android-Browser liefern die GPS-Höhe über dem Ellipsoid, in Deutschland rund 40 bis 50 m zu hoch.
 * Das 1°-Raster weicht in Europa im Mittel 0,3 m (höchstens gut 3 m) vom vollen Modell ab, weit unter dem GPS-Fehler.
 */
export class Geoid {
  static readonly ROWS = 181;
  static readonly COLS = 360;
  private readonly grid: Int16Array;

  /** Raster aus scripts/build-geoid.mjs: Int16 in Dezimetern, Zeilen von 90° N nach 90° S, Spalten ab 0° O. */
  constructor(data: ArrayBuffer | ArrayBufferView) {
    const bytes =
      data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (bytes.byteLength !== Geoid.ROWS * Geoid.COLS * 2) throw new Error('Geoid-Raster hat die falsche Größe');
    // Kopie, damit die Int16-Ansicht ausgerichtet ist
    this.grid = new Int16Array(bytes.slice().buffer);
  }

  /** Geoidhöhe in m, bilinear interpoliert */
  undulation(lat: number, lon: number): number {
    const { ROWS, COLS } = Geoid;
    const y = Math.min(ROWS - 1, Math.max(0, 90 - lat));
    const x = (((lon % 360) + 360) % 360);
    const i = Math.min(ROWS - 2, Math.floor(y));
    const j = Math.floor(x) % COLS;
    const j2 = (j + 1) % COLS;
    const fy = y - i;
    const fx = x - Math.floor(x);
    const g = this.grid;
    const top = g[i * COLS + j]! * (1 - fx) + g[i * COLS + j2]! * fx;
    const bottom = g[(i + 1) * COLS + j]! * (1 - fx) + g[(i + 1) * COLS + j2]! * fx;
    return (top * (1 - fy) + bottom * fy) / 10;
  }

  /** Höhe über dem Ellipsoid in Höhe über dem Meeresspiegel umrechnen */
  toMsl(lat: number, lon: number, ellipsoidAlt: number): number {
    return ellipsoidAlt - this.undulation(lat, lon);
  }
}
