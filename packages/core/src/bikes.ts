/**
 * Radtypen und Radklassen. Gewertet wird je Klasse, damit E-Bikes nicht gegen Muskelkraft antreten
 * (docs/05-community-und-gamification.md, Abschnitt 6).
 */

export const BIKE_TYPES = ['road', 'gravel', 'mtb', 'trekking', 'ebike', 'speed-pedelec'] as const;
export type BikeType = (typeof BIKE_TYPES)[number];

export type BikeClass = 'muscle' | 'ebike' | 'speed-pedelec';

export interface BikeInfo {
  type: BikeType;
  label: string;
  /** Kurzer Zusatz für die Auswahl */
  hint: string;
  bikeClass: BikeClass;
}

export const BIKES: readonly BikeInfo[] = [
  { type: 'road', label: 'Rennrad', hint: 'Muskelkraft', bikeClass: 'muscle' },
  { type: 'gravel', label: 'Gravel', hint: 'Muskelkraft', bikeClass: 'muscle' },
  { type: 'mtb', label: 'MTB', hint: 'Muskelkraft', bikeClass: 'muscle' },
  { type: 'trekking', label: 'Trekking / Stadtrad', hint: 'Muskelkraft', bikeClass: 'muscle' },
  { type: 'ebike', label: 'E-Bike', hint: 'Pedelec bis 25 km/h', bikeClass: 'ebike' },
  { type: 'speed-pedelec', label: 'S-Pedelec', hint: 'bis 45 km/h', bikeClass: 'speed-pedelec' },
];

export const BIKE_CLASS_LABELS: Record<BikeClass, string> = {
  muscle: 'Muskelkraft',
  ebike: 'E-Bike',
  'speed-pedelec': 'S-Pedelec',
};

export const isBikeType = (v: unknown): v is BikeType => BIKE_TYPES.includes(v as BikeType);

export const bikeInfo = (type: BikeType): BikeInfo => BIKES.find((b) => b.type === type)!;

/** Wertungsklasse eines Radtyps */
export const bikeClass = (type: BikeType): BikeClass => bikeInfo(type).bikeClass;

/** Zählt eine Fahrt mit Rad a in derselben Wertung wie eine mit Rad b? */
export const sameBikeClass = (a: BikeType, b: BikeType) => bikeClass(a) === bikeClass(b);

/** Chaser-Namen: 3–24 Zeichen, Buchstaben, Ziffern, Leerzeichen, Punkt, Binde- und Unterstrich. */
export const CHASER_NAME = { min: 3, max: 24, pattern: /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u };

/** Bereinigt einen Chaser-Namen und liefert ihn zurück, oder eine Fehlermeldung als { error }. */
export function normalizeChaserName(raw: string): { name: string } | { error: string } {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name.length < CHASER_NAME.min) return { error: `Der Name braucht mindestens ${CHASER_NAME.min} Zeichen.` };
  if (name.length > CHASER_NAME.max) return { error: `Der Name darf höchstens ${CHASER_NAME.max} Zeichen haben.` };
  if (!CHASER_NAME.pattern.test(name))
    return { error: 'Erlaubt sind Buchstaben, Ziffern, Leerzeichen, Punkt, Binde- und Unterstrich.' };
  return { name };
}
