import { frequency, type Pitch } from './theory';

export class AudioEngine {
  private context?: AudioContext;
  async play(notes: Pitch[], duration = 1.15, melodic = false) {
    this.context ??= new AudioContext();
    await this.context.resume();
    const start = this.context.currentTime;
    notes.forEach((note, index) => {
      const noteStart = start + index * (melodic ? .65 : .03);
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      oscillator.type = 'triangle'; oscillator.frequency.value = frequency(note.midiNumber);
      gain.gain.setValueAtTime(0, noteStart); gain.gain.linearRampToValueAtTime(0.16 / notes.length, noteStart + .025);
      gain.gain.exponentialRampToValueAtTime(.001, noteStart + duration);
      oscillator.connect(gain).connect(this.context!.destination); oscillator.start(noteStart); oscillator.stop(noteStart + duration);
    });
  }

  async playProgression(chords: Pitch[][]) {
    this.context ??= new AudioContext();
    await this.context.resume();
    const start = this.context.currentTime;
    chords.forEach((notes, chordIndex) => notes.forEach(note => {
      const noteStart = start + chordIndex * .9;
      const oscillator = this.context!.createOscillator(); const gain = this.context!.createGain();
      oscillator.type = 'triangle'; oscillator.frequency.value = frequency(note.midiNumber);
      gain.gain.setValueAtTime(0, noteStart); gain.gain.linearRampToValueAtTime(.15 / notes.length, noteStart + .02);
      gain.gain.exponentialRampToValueAtTime(.001, noteStart + .82);
      oscillator.connect(gain).connect(this.context!.destination); oscillator.start(noteStart); oscillator.stop(noteStart + .85);
    }));
  }
}
