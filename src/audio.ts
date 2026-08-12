import type { Pitch } from './theory';
import { polyphonyGain, SampleCache, selectSample } from './sampler';
import type { Timbre } from './training';

interface Mix { dry: GainNode; room: GainNode }

export class AudioEngine {
  private context?: AudioContext; private cache?: SampleCache; private mix?: Mix; private warmed = false;

  private async ready() {
    this.context ??= new AudioContext(); await this.context.resume();
    if (!this.cache) this.cache = new SampleCache(this.context);
    if (!this.mix) {
      const compressor = this.context.createDynamicsCompressor(); compressor.threshold.value = -14; compressor.knee.value = 20; compressor.ratio.value = 4; compressor.attack.value = .004; compressor.release.value = .24;
      const master = this.context.createGain(); master.gain.value = .68; master.connect(compressor).connect(this.context.destination);
      const dry = this.context.createGain(); dry.connect(master);
      const room = this.context.createGain(); room.gain.value = .105; const delay = this.context.createDelay(.15); delay.delayTime.value = .047;
      const feedback = this.context.createGain(); feedback.gain.value = .19; room.connect(delay); delay.connect(feedback).connect(delay); delay.connect(master); this.mix = { dry, room };
    }
    if (!this.warmed) { this.warmed = true; void Promise.all([4,9,14].map(layer => this.cache!.load(`/audio/piano/C4-v${layer}.ogg`))).catch(() => undefined); }
    return this.context;
  }

  private async sampledVoice(note: Pitch, timbre: 'piano' | 'rhodes', start: number, duration: number, velocity: number, level: number) {
    const choice = selectSample(timbre, note.midiNumber, velocity); let buffer: AudioBuffer;
    try { buffer = await this.cache!.load(choice.url); }
    catch { const fallback = selectSample('piano', note.midiNumber, velocity); buffer = await this.cache!.load(fallback.url); choice.playbackRate = fallback.playbackRate; }
    const context = this.context!; const source = context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = choice.playbackRate;
    const envelope = context.createGain(); const attack = timbre === 'piano' ? .004 : .009; const release = timbre === 'piano' ? .58 : .34; const when = Math.max(start, context.currentTime + .008);
    envelope.gain.setValueAtTime(.0001, when); envelope.gain.exponentialRampToValueAtTime(level * (.55 + velocity * .45), when + attack);
    envelope.gain.setValueAtTime(level * (.55 + velocity * .45), when + Math.max(attack, duration - .05)); envelope.gain.exponentialRampToValueAtTime(.0001, when + duration + release);
    if (timbre === 'rhodes') {
      const shaper = context.createWaveShaper(); const curve = new Float32Array(1024); for (let i=0;i<curve.length;i++) { const x=i/(curve.length-1)*2-1; curve[i]=Math.tanh(x*(1.2+velocity*.9)); } shaper.curve=curve;
      const tremolo = context.createGain(); tremolo.gain.value=.94; const lfo=context.createOscillator(); const depth=context.createGain(); lfo.frequency.value=4.6; depth.gain.value=.045; lfo.connect(depth).connect(tremolo.gain); source.connect(shaper).connect(tremolo).connect(envelope); lfo.start(when); lfo.stop(when+duration+release);
    } else source.connect(envelope);
    envelope.connect(this.mix!.dry); envelope.connect(this.mix!.room); source.start(when); source.stop(when + duration + release + .1);
  }

  private organVoice(note: Pitch, start: number, duration: number, level: number) {
    const context=this.context!; const bus=context.createGain(); const when=Math.max(start,context.currentTime+.008); bus.gain.setValueAtTime(.0001,when); bus.gain.exponentialRampToValueAtTime(level,when+.018); bus.gain.setValueAtTime(level,when+duration); bus.gain.exponentialRampToValueAtTime(.0001,when+duration+.12);
    const drawbars=[[.5,.45],[1,1],[1.5,.48],[2,.62],[3,.32],[4,.2],[5,.1],[6,.08]]; drawbars.forEach(([ratio,gain])=>{ const oscillator=context.createOscillator(); const partial=context.createGain(); oscillator.type='sine'; oscillator.frequency.value=440*2**((note.midiNumber-69)/12)*ratio; partial.gain.value=gain; oscillator.connect(partial).connect(bus); oscillator.start(when); oscillator.stop(when+duration+.15); });
    const click=context.createBufferSource(); const noise=context.createBuffer(1,Math.floor(context.sampleRate*.025),context.sampleRate); const data=noise.getChannelData(0); for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*Math.exp(-i/180); click.buffer=noise; const clickGain=context.createGain(); clickGain.gain.value=.055; click.connect(clickGain).connect(bus); click.start(when);
    const percussion=context.createOscillator(); const percussionGain=context.createGain(); percussion.type='sine'; percussion.frequency.value=440*2**((note.midiNumber-69)/12)*3; percussionGain.gain.setValueAtTime(.16,when); percussionGain.gain.exponentialRampToValueAtTime(.0001,when+.42); percussion.connect(percussionGain).connect(bus); percussion.start(when); percussion.stop(when+.44);
    const leakage=context.createBufferSource(); const leakageNoise=context.createBuffer(1,Math.floor(context.sampleRate*(duration+.15)),context.sampleRate); const leakageData=leakageNoise.getChannelData(0); for(let i=0;i<leakageData.length;i++) leakageData[i]=(Math.random()*2-1)*.006; leakage.buffer=leakageNoise; leakage.connect(bus); leakage.start(when);
    const saturation=context.createWaveShaper(); const curve=new Float32Array(512); for(let i=0;i<512;i++){const x=i/511*2-1;curve[i]=Math.tanh(x*1.65)} saturation.curve=curve;
    const leslie=context.createStereoPanner(); const rotor=context.createOscillator(); const rotorDepth=context.createGain(); rotor.frequency.value=1.15; rotorDepth.gain.value=.55; rotor.connect(rotorDepth).connect(leslie.pan); rotor.start(when); rotor.stop(when+duration+.15);
    const chorus=context.createDelay(.03); chorus.delayTime.value=.012; bus.connect(saturation).connect(leslie); leslie.connect(this.mix!.dry); leslie.connect(chorus).connect(this.mix!.dry); bus.connect(this.mix!.room);
  }

  private async schedule(notes: Pitch[], start: number, duration: number, melodic: boolean, timbre: Timbre) {
    const level=polyphonyGain(notes.length); const tasks=notes.map((note,index)=>{ const when=start+index*(melodic?.7:.018); const velocity=.62+(index%3)*.1; if(timbre==='organ'){this.organVoice(note,when,duration,level);return Promise.resolve()} return this.sampledVoice(note,timbre,when,duration,velocity,level); }); await Promise.all(tasks);
  }

  async play(notes: Pitch[], duration=1.35, melodic=false, timbre: Timbre='piano') { const context=await this.ready(); await this.schedule(notes,context.currentTime+.035,duration,melodic,timbre); }
  async playProgression(chords: Pitch[][], timbre: Timbre='piano') { const context=await this.ready(); const start=context.currentTime+.035; await Promise.all(chords.map((notes,index)=>this.schedule(notes,start+index*1.12,1.02,false,timbre))); }
}
