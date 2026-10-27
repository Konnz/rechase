/**
 * Adresse des Servers. Im Browser ist es derselbe Origin; eine spätere native Hülle (Capacitor) läuft unter
 * einem eigenen Origin und setzt hier die volle Adresse, dann braucht die Anmeldung ein Token statt des Cookies.
 */
export const API_BASE = '';

/** Ruft die API auf und liefert die JSON-Antwort; Fehler kommen als Error mit der Meldung des Servers. */
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Keine Verbindung. Bitte später noch einmal versuchen.');
  }
  return answer<T>(res);
}

/** Fehler der API mit HTTP-Status, damit Aufrufer zwischen Netz- und Serverfehlern unterscheiden können */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function answer<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Fehler ${res.status}`);
  return data;
}
