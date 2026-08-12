import { frequency, type Pitch } from './theory';
import type { Timbre } from './training';

interface VoiceOptions { start: number; duration: number; level: number; timbre: Timbre }

/** A lightweight Web Audio keyboard engine. Each voice uses several quiet partials,
 * a percussive key envelope and room ambience instead of a raw buzzy oscillator. */
export class AudioEngine {
  private context?: AudioContext;
  private output?: GainNode;

  private async ready() {
    this.context ??= new AudioContext();
    await this.context.resume();
    if (!this.output) {
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -18; compressor.knee.value = 16; compressor.ratio.value = 3;
      compressor.attack.value = .005; compressor.release.value = .22;
      const master = this.context.createGain(); master.gain.value = .78;
      master.connect(compressor).connect(this.context.destination); this.output = master;
    }
    return this.context;
  }

  private voice(note: Pitch, { start, duration, level, timbre }: VoiceOptions) {
    const context = this.context!; const bus = context.createGain(); const base = frequency(note.midiNumber);
    const highNoteBalance = Math.max(.58, Math.min(1, 1 - (note.midiNumber - 60) * .008));
    bus.gain.setValueAtTime(0.0001, start);
    if (timbre === 'organ') {
      bus.gain.exponentialRampToValueAtTime(level * .72, start + .035);
      bus.gain.setValueAtTime(level * .65, start + Math.max(.08, duration - .18));
      bus.gain.exponentialRampToValueAtTime(.0001, start + duration + .28);
    } else {
      const attack = timbre === 'piano' ? .008 : .018;
      bus.gain.exponentialRampToValueAtTime(level, start + attack);
      bus.gain.exponentialRampToValueAtTime(level * (timbre === 'piano' ? .23 : .38), start + Math.min(.55, duration * .48));
      bus.gain.exponentialRampToValueAtTime(.0001, start + duration + (timbre === 'piano' ? .75 : .48));
    }
    bus.connect(this.output!);

    const partials = timbre === 'piano'
      ? [[1, 1], [2, .34], [3, .15], [4, .07], [6, .025]]
      : timbre === 'rhodes' ? [[1, 1], [2, .22], [3, .055], [4, .1], [7, .018]]
      : [[1, 1], [2, .32], [3, .12], [4, .08]];
    partials.forEach(([multiple, amplitude], index) => {
      const oscillator = context.createOscillator(); const partialGain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(base * multiple * (timbre === 'piano' ? 1 + index * index * .00016 : 1), start);
      partialGain.gain.value = amplitude * highNoteBalance;
      oscillator.connect(partialGain).connect(bus); oscillator.start(start); oscillator.stop(start + duration + .8);
    });

    if (timbre === 'piano') {
      const click = context.createOscillator(); const clickGain = context.createGain();
      click.type = 'triangle'; click.frequency.value = Math.min(4200, base * 8);
      clickGain.gain.setValueAtTime(.035, start); clickGain.gain.exponentialRampToValueAtTime(.0001, start + .028);
      click.connect(clickGain).connect(bus); click.start(start); click.stop(start + .03);
    }
  }

  async play(notes: Pitch[], duration = 1.35, melodic = false, timbre: Timbre = 'piano') {
    const context = await this.ready(); const start = context.currentTime + .035;
    const spacing = melodic ? .7 : .018; const level = Math.min(.32, .52 / Math.sqrt(notes.length));
    notes.forEach((note, index) => this.voice(note, { start: start + index * spacing, duration, level, timbre }));
  }

  async playProgression(chords: Pitch[][], timbre: Timbre = 'piano') {
    const context = await this.ready(); const start = context.currentTime + .035;
    chords.forEach((notes, chordIndex) => notes.forEach((note, noteIndex) => this.voice(note, {
      start: start + chordIndex * 1.12 + noteIndex * .016, duration: 1.02, level: Math.min(.27, .48 / Math.sqrt(notes.length)), timbre
    })));
  }
}
