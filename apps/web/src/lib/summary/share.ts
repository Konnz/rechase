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

/**
 * Teilt einen Link mit Text und, wo möglich, dem Teilbild. Ohne Teilen-Menü wird der Link kopiert.
 * Auch hier gilt: direkt im Klick aufrufen.
 */
export async function shareLink(opts: {
  title: string;
  text: string;
  url: string;
  file?: File | null;
}): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  // Mit Bild landet die Adresse nicht überall im Beitrag, deshalb steht sie zusätzlich im Text
  const withFile = opts.file && { title: opts.title, text: `${opts.text}\n${opts.url}`, files: [opts.file] };
  const plain = { title: opts.title, text: opts.text, url: opts.url };
  for (const data of [withFile, plain]) {
    if (!data || !navigator.canShare?.(data)) continue;
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
      console.warn('Teilen fehlgeschlagen', e);
    }
  }
  try {
    await navigator.clipboard.writeText(`${opts.text}\n${opts.url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
