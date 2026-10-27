/**
 * Teilt eine Datei über das Teilen-Menü des Systems (Web Share API), sonst wird sie heruntergeladen.
 * Muss direkt im Klick aufgerufen werden: iOS lehnt navigator.share nach vorheriger asynchroner Arbeit ab.
 */
export async function shareFile(file: File, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
      console.warn('Teilen fehlgeschlagen, lade herunter', e);
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
