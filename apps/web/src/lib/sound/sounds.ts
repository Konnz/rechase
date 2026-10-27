import type { Cue } from '@rechase/core';
import { groupOf, soundPrefs } from './prefs.svelte.ts';

/** Ein Ton: Frequenz (Hz), Beginn und Dauer (s), relative Lautstärke */
interface Note {
  f: number;
  at: number;
  dur: number;
  gain?: number;
  wave?: OscillatorType;
  /** Langes Ausklingen wie eine Glocke */
  ring?: boolean;
}

const seq = (fs: number[], step: number, dur: number, rest: Omit<Note, 'f' | 'at' | 'dur'> = {}): Note[] =>
  fs.map((f, i) => ({ f, at: i * step, dur, ...rest }));

/** Klangsprache nach docs/05-community-und-gamification.md, Abschnitt 8; alles unter 400 ms */
export function notesFor(c: Cue | { kind: 'tick' }): Note[] {
  switch (c.kind) {
    case 'overtake':
      return seq([880, 1319], 0.11, 0.12, { wave: 'triangle' });
    case 'overtaken':
      return seq([392, 262], 0.13, 0.14, { wave: 'sine' });
    case 'tick':
      return [{ f: 2000, at: 0, dur: 0.012, gain: 0.25, wave: 'square' }];
    case 'km-lead':
      return [
        { f: 1568, at: 0, dur: 0.35, ring: true },
        { f: 1568 * 2.76, at: 0, dur: 0.2, gain: 0.15, ring: true },
      ];
    case 'countdown':
      return [{ f: c.meters <= 100 ? 1480 : 988, at: 0, dur: c.meters <= 100 ? 0.16 : 0.08, wave: 'square', gain: 0.35 }];
    case 'section':
      return c.pr
        ? seq([1047, 1319, 1568], 0.08, 0.1, { wave: 'triangle' })
        : seq([1200, 1200], 0.07, 0.02, { wave: 'square', gain: 0.3 });
    case 'finish':
      return c.won ? seq([523, 659, 784, 1047], 0.09, 0.1, { wave: 'triangle' }) : seq([659, 523], 0.15, 0.16);
    case 'pause':
      return [{ f: c.moving ? 420 : 300, at: 0, dur: 0.025, gain: 0.15, wave: 'square' }];
    case 'challenge':
      // Angebot: fragend nach oben, Start: kurzer Doppelton wie ein Startsignal
      return c.accepted
        ? seq([1319, 1760], 0.1, 0.12, { wave: 'square', gain: 0.35 })
        : seq([660, 880, 1175], 0.1, 0.11, { wave: 'triangle' });
  }
}

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

/**
 * Spielt die Töne der Fahrt über Web Audio. Der Ton muss einmal im Klick freigeschaltet werden (iOS),
 * deshalb ruft der Start-Knopf unlock() auf.
 */
class SoundPlayer {
  private ctx: AudioContext | null = null;
  /** Bis wann der letzte Ton läuft, damit sich gleichzeitige Ereignisse nicht überlagern */
  private busyUntil = 0;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private tickMs: number | null = null;

  /** Im Klick aufrufen: erzeugt bzw. weckt den Audio-Kontext. */
  unlock() {
    try {
      // Mischt sich mit laufender Musik, statt sie anzuhalten (Safari ab 16.4)
      const s = (navigator as AudioSessionNavigator).audioSession;
      if (s) s.type = 'ambient';
      this.ctx ??= new AudioContext();
      if (this.ctx.state !== 'running') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  play(c: Cue | { kind: 'tick' }, { force = false } = {}) {
    if (!force && (!soundPrefs.enabled || !soundPrefs.isOn(groupOf(c.kind)))) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const notes = notesFor(c);
    const tick = c.kind === 'tick';
    // Ticks fallen weg, solange ein anderer Ton läuft
    if (tick && ctx.currentTime < this.busyUntil) return;
    const t0 = tick ? ctx.currentTime : Math.max(ctx.currentTime, this.busyUntil) + 0.01;
    const vol = soundPrefs.volume * 0.5;
    let end = t0;
    for (const n of notes) {
      const at = t0 + n.at;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = n.wave ?? 'sine';
      osc.frequency.value = n.f;
      const peak = vol * (n.gain ?? 1);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + 0.005);
      if (n.ring) g.gain.exponentialRampToValueAtTime(0.0001, at + n.dur);
      else {
        g.gain.setValueAtTime(peak, at + Math.max(0.005, n.dur - 0.015));
        g.gain.linearRampToValueAtTime(0, at + n.dur);
      }
      osc.connect(g).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + n.dur + 0.02);
      end = Math.max(end, at + n.dur);
    }
    if (!tick) this.busyUntil = end + 0.05;
  }

  /** Ticken im angegebenen Abstand (ms), null hält es an. */
  setTicking(ms: number | null) {
    this.tickMs = ms;
    if (ms == null) {
      if (this.tickTimer) clearTimeout(this.tickTimer);
      this.tickTimer = null;
    } else if (!this.tickTimer) this.scheduleTick();
  }

  private scheduleTick() {
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      if (this.tickMs == null) return;
      this.play({ kind: 'tick' });
      this.scheduleTick();
    }, this.tickMs ?? 1000);
  }
}

export const sounds = new SoundPlayer();
