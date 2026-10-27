// Wird erst geladen, wenn eine Karte erscheint: MapLibre ist größer als der ganze Rest der App.
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre sucht seinen Worker neben der eigenen Datei; nach dem Bündeln liegt er woanders.
setWorkerUrl(workerUrl);

export * from 'maplibre-gl';
