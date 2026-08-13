import type { Pitch } from './theory';
import { instrumentTrim, polyphonyGain, SampleCache, selectSample, type SampledInstrument } from './sampler';
import type { Timbre } from './training';

interface Mix { dry: GainNode; room: GainNode }

export class AudioEngine {
  private context?: AudioContext; private cache?: SampleCache; private mix?: Mix; private warmed = false;

  private async ready() {
    this.context ??= new AudioContext(); await this.context.resume();
    if (!this.cache) this.cache = new SampleCache(this.context);
    if (!this.mix) {
      // A safety limiter rather than a tone shaper: the old -14 dB threshold at 4:1
      // put roughly 10 dB of gain reduction on every chord with no makeup gain,
      // which is what made playback both quiet and pumped.
      const limiter = this.context.createDynamicsCompressor(); limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = .003; limiter.release.value = .12;
      const rumble = this.context.createBiquadFilter(); rumble.type = 'highpass'; rumble.frequency.value = 32; rumble.Q.value = .707;
      // Makeup is folded into the master trim so the limiter stays the last stage
      // and nothing downstream can push the output back past full scale.
      const master = this.context.createGain(); master.gain.value = .84;
      master.connect(rumble).connect(limiter).connect(this.context.destination);
      const dry = this.context.createGain(); dry.connect(master);
      // The delay tail is band-limited so it cannot smear the low end.
      const room = this.context.createGain(); room.gain.value = .105; const roomBand = this.context.createBiquadFilter(); roomBand.type = 'highpass'; roomBand.frequency.value = 400;
      const delay = this.context.createDelay(.15); delay.delayTime.value = .047;
      const feedback = this.context.createGain(); feedback.gain.value = .19; room.connect(roomBand).connect(delay); delay.connect(feedback).connect(delay); delay.connect(master); this.mix = { dry, room };
    }
    if (!this.warmed) { this.warmed = true; void Promise.all([4,9,14].map(layer => this.cache!.load(`/audio/piano/C4-v${layer}.ogg`))).catch(() => undefined); }
    return this.context;
  }

  private async sampledVoice(note: Pitch, timbre: 'piano' | 'rhodes', start: number, duration: number, velocity: number, level: number) {
    const choice = selectSample(timbre, note.midiNumber, velocity); let buffer: AudioBuffer; let sounding: SampledInstrument = timbre;
    try { buffer = await this.cache!.load(choice.url); }
    catch { const fallback = selectSample('piano', note.midiNumber, velocity); buffer = await this.cache!.load(fallback.url); choice.playbackRate = fallback.playbackRate; sounding = 'piano'; }
    const context = this.context!; const source = context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = choice.playbackRate;
    const envelope = context.createGain(); const attack = timbre === 'piano' ? .004 : .009; const release = timbre === 'piano' ? .58 : .34; const when = Math.max(start, context.currentTime + .008);
    const peak = level * instrumentTrim[sounding] * (.55 + velocity * .45);
    envelope.gain.setValueAtTime(.0001, when); envelope.gain.exponentialRampToValueAtTime(peak, when + attack);
    envelope.gain.setValueAtTime(peak, when + Math.max(attack, duration - .05)); envelope.gain.exponentialRampToValueAtTime(.0001, when + duration + release);
    if (timbre === 'rhodes') {
      const shaper = context.createWaveShaper(); const curve = new Float32Array(1024); for (let i=0;i<curve.length;i++) { const x=i/(curve.length-1)*2-1; curve[i]=Math.tanh(x*(1.2+velocity*.9)); } shaper.curve=curve;
      const tremolo = context.createGain(); tremolo.gain.value=.94; const lfo=context.createOscillator(); const depth=context.createGain(); lfo.frequency.value=4.6; depth.gain.value=.045; lfo.connect(depth).connect(tremolo.gain); source.connect(shaper).connect(tremolo).connect(envelope); lfo.start(when); lfo.stop(when+duration+release);
    } else source.connect(envelope);
    envelope.connect(this.mix!.dry); envelope.connect(this.mix!.room); source.start(when); source.stop(when + duration + release + .1);
  }

  private organVoice(note: Pitch, start: number, duration: number, level: number) {
    const context=this.context!; const bus=context.createGain(); const when=Math.max(start,context.currentTime+.008); bus.gain.setValueAtTime(.0001,when); bus.gain.exponentialRampToValueAtTime(level,when+.018); bus.gain.setValueAtTime(level,when+duration); bus.gain.exponentialRampToValueAtTime(.0001,when+duration+.12);
    // Drawbar gains are normalised to sum to one. Unnormalised they summed to 3.3
    // per voice and, because every partial starts at phase zero, drove the tanh
    // stage below into permanent saturation.
    const drawbars=[[.5,.45],[1,1],[1.5,.48],[2,.62],[3,.32],[4,.2],[5,.1],[6,.08]]; const drawbarSum=drawbars.reduce((total,[,gain])=>total+gain,0);
    drawbars.forEach(([ratio,gain])=>{ const oscillator=context.createOscillator(); const partial=context.createGain(); oscillator.type='sine'; oscillator.frequency.value=440*2**((note.midiNumber-69)/12)*ratio; partial.gain.value=gain/drawbarSum; oscillator.connect(partial).connect(bus); oscillator.start(when); oscillator.stop(when+duration+.15); });
    const click=context.createBufferSource(); const noise=context.createBuffer(1,Math.floor(context.sampleRate*.025),context.sampleRate); const data=noise.getChannelData(0); for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*Math.exp(-i/180); click.buffer=noise; const clickGain=context.createGain(); clickGain.gain.value=.055; click.connect(clickGain).connect(bus); click.start(when);
    const percussion=context.createOscillator(); const percussionGain=context.createGain(); percussion.type='sine'; percussion.frequency.value=440*2**((note.midiNumber-69)/12)*3; percussionGain.gain.setValueAtTime(.16,when); percussionGain.gain.exponentialRampToValueAtTime(.0001,when+.42); percussion.connect(percussionGain).connect(bus); percussion.start(when); percussion.stop(when+.44);
    const leakage=context.createBufferSource(); const leakageNoise=context.createBuffer(1,Math.floor(context.sampleRate*(duration+.15)),context.sampleRate); const leakageData=leakageNoise.getChannelData(0); for(let i=0;i<leakageData.length;i++) leakageData[i]=(Math.random()*2-1)*.006; leakage.buffer=leakageNoise; leakage.connect(bus); leakage.start(when);
    const saturation=context.createWaveShaper(); const curve=new Float32Array(512); for(let i=0;i<512;i++){const x=i/511*2-1;curve[i]=Math.tanh(x*1.65)} saturation.curve=curve;
    const leslie=context.createStereoPanner(); const rotor=context.createOscillator(); const rotorDepth=context.createGain(); rotor.frequency.value=1.15; rotorDepth.gain.value=.55; rotor.connect(rotorDepth).connect(leslie.pan); rotor.start(when); rotor.stop(when+duration+.15);
    const chorus=context.createDelay(.03); chorus.delayTime.value=.012; bus.connect(saturation).connect(leslie); leslie.connect(this.mix!.dry); leslie.connect(chorus).connect(this.mix!.dry); bus.connect(this.mix!.room);
  }

  /**
   * Karplus-Strong plucked string. The loop gain applies once per period, so
   * higher notes decay faster, as they do on a real instrument.
   */
  private pluckedVoice(note: Pitch, start: number, duration: number, level: number) {
    const context = this.context!; const when = Math.max(start, context.currentTime + .008);
    const frequency = 440 * 2 ** ((note.midiNumber - 69) / 12);
    const period = Math.max(2, Math.round(context.sampleRate / frequency));
    const total = Math.floor(context.sampleRate * (duration + .7));
    const buffer = context.createBuffer(1, total, context.sampleRate); const data = buffer.getChannelData(0);
    for (let index = 0; index < period; index += 1) data[index] = Math.random() * 2 - 1;
    for (let index = period; index < total; index += 1) data[index] = .997 * .5 * (data[index - period] + data[index - period + 1]);
    const source = context.createBufferSource(); source.buffer = buffer;
    const body = context.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 3400; body.Q.value = .5;
    const envelope = context.createGain(); const peak = level * .85;
    envelope.gain.setValueAtTime(.0001, when); envelope.gain.exponentialRampToValueAtTime(peak, when + .006);
    envelope.gain.setValueAtTime(peak, when + Math.max(.02, duration)); envelope.gain.exponentialRampToValueAtTime(.0001, when + duration + .5);
    source.connect(body).connect(envelope); envelope.connect(this.mix!.dry); envelope.connect(this.mix!.room);
    source.start(when); source.stop(when + duration + .55);
  }

  /** Bowed strings and soft pad share a detuned-stack shape; only the envelope and filter differ. */
  private sustainedVoice(note: Pitch, start: number, duration: number, level: number, timbre: 'strings' | 'pad') {
    const context = this.context!; const when = Math.max(start, context.currentTime + .008);
    const frequency = 440 * 2 ** ((note.midiNumber - 69) / 12);
    const strings = timbre === 'strings';
    const attack = strings ? .14 : .5; const release = strings ? .4 : 1;
    const envelope = context.createGain(); const peak = level * (strings ? .8 : .68);
    envelope.gain.setValueAtTime(.0001, when); envelope.gain.exponentialRampToValueAtTime(peak, when + attack);
    envelope.gain.setValueAtTime(peak, when + Math.max(attack, duration)); envelope.gain.exponentialRampToValueAtTime(.0001, when + duration + release);
    const tone = context.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = strings ? 2700 : 1500; tone.Q.value = .6;
    const voices = (strings ? [-7, 0, 8] : [-11, 0, 11]).map(cents => {
      const oscillator = context.createOscillator(); oscillator.type = strings ? 'sawtooth' : 'triangle';
      oscillator.frequency.value = frequency; oscillator.detune.value = cents;
      const partial = context.createGain(); partial.gain.value = 1 / 3;
      oscillator.connect(partial).connect(tone); oscillator.start(when); oscillator.stop(when + duration + release + .1);
      return oscillator;
    });
    if (strings) {
      const vibrato = context.createOscillator(); vibrato.frequency.value = 5.1;
      const depth = context.createGain(); depth.gain.value = 7;
      vibrato.connect(depth); voices.forEach(voice => depth.connect(voice.detune));
      vibrato.start(when + attack); vibrato.stop(when + duration + release);
    }
    tone.connect(envelope); envelope.connect(this.mix!.dry); envelope.connect(this.mix!.room);
  }

  private async schedule(notes: Pitch[], start: number, duration: number, melodic: boolean, timbre: Timbre) {
    const level=polyphonyGain(notes.length); const tasks=notes.map((note,index)=>{ const when=start+index*(melodic?.7:.018); const velocity=.62+(index%3)*.1; if(timbre==='organ'){this.organVoice(note,when,duration,level);return Promise.resolve()} if(timbre==='guitar'){this.pluckedVoice(note,when,duration,level);return Promise.resolve()} if(timbre==='strings'||timbre==='pad'){this.sustainedVoice(note,when,duration,level,timbre);return Promise.resolve()} return this.sampledVoice(note,timbre,when,duration,velocity,level); }); await Promise.all(tasks);
  }

  async play(notes: Pitch[], duration=1.35, melodic=false, timbre: Timbre='piano') { const context=await this.ready(); await this.schedule(notes,context.currentTime+.035,duration,melodic,timbre); }
  /** Repeats one harmony on a rhythmic pattern, for rhythm-generalized recognition. */
  async playRhythm(notes: Pitch[], onsets: number[], hit = .42, timbre: Timbre='piano') {
    const context = await this.ready(); const start = context.currentTime + .035;
    await Promise.all(onsets.map(offset => this.schedule(notes, start + offset, hit, false, timbre)));
  }
  /** `gap` is the onset-to-onset spacing, which doubles as the memory delay. */
  async playProgression(chords: Pitch[][], timbre: Timbre='piano', gap=1.12) { const context=await this.ready(); const start=context.currentTime+.035; await Promise.all(chords.map((notes,index)=>this.schedule(notes,start+index*gap,Math.min(1.02,gap-.1),false,timbre))); }
}
