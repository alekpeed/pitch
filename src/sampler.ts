export type SampledInstrument = 'piano' | 'rhodes';
export interface SampleChoice { instrument: SampledInstrument; url: string; rootMidi: number; layer: 0 | 1 | 2; playbackRate: number }

const pianoRoots = Array.from({ length: 22 }, (_, index) => 33 + index * 3);
const pianoNames = ['A1','C2','Ds2','Fs2','A2','C3','Ds3','Fs3','A3','C4','Ds4','Fs4','A4','C5','Ds5','Fs5','A5','C6','Ds6','Fs6','A6','C7'];
const pianoFiles = [4, 9, 14] as const;
const rhodesRoots = [29,35,40,45,50,55,59,62,65,71,76,81,86,91,96];
const rhodesNames = ['F1','B1','E2','A2','D3','G3','B3','D4','F4','B4','E5','A5','D6','G6','C7'];
const rhodesAvailable = new Map([
  [29,[1,3,5]],[35,[1,3,5]],[40,[1,3,5]],[45,[1,3,5]],[50,[1,3,5]],[55,[1,3,5]],[59,[1,3,5]],[62,[1,3,5]],[65,[1,3,5]],
  [71,[1,5]],[76,[1,5]],[81,[5]],[86,[5]],[91,[5]],[96,[5]],
]);

export function velocityLayer(velocity: number): 0 | 1 | 2 {
  const value = Math.max(0, Math.min(1, velocity));
  return value < .38 ? 0 : value < .73 ? 1 : 2;
}

function nearest(value: number, roots: number[]) {
  return roots.reduce((best, root) => Math.abs(root - value) < Math.abs(best - value) ? root : best);
}

export function selectSample(instrument: SampledInstrument, midi: number, velocity = .72): SampleChoice {
  const layer = velocityLayer(velocity);
  if (instrument === 'piano') {
    const rootMidi = nearest(midi, pianoRoots); const index = pianoRoots.indexOf(rootMidi);
    return { instrument, rootMidi, layer, url: `/audio/piano/${pianoNames[index]}-v${pianoFiles[layer]}.ogg`, playbackRate: 2 ** ((midi - rootMidi) / 12) };
  }
  const rootMidi = nearest(midi, rhodesRoots); const index = rhodesRoots.indexOf(rootMidi);
  const desired = [5,3,1][layer]; const layers = rhodesAvailable.get(rootMidi)!;
  const fileLayer = layers.reduce((best, item) => Math.abs(item - desired) < Math.abs(best - desired) ? item : best);
  return { instrument, rootMidi, layer, url: `/audio/rhodes/${String(rootMidi).padStart(3,'0')}-${rhodesNames[index]}-v${fileLayer}.ogg`, playbackRate: 2 ** ((midi - rootMidi) / 12) };
}

export class SampleCache {
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private context: BaseAudioContext; private fetcher: typeof fetch;
  constructor(context: BaseAudioContext, fetcher: typeof fetch = fetch) { this.context = context; this.fetcher = fetcher; }
  load(url: string) {
    let pending = this.buffers.get(url);
    if (!pending) {
      pending = this.fetcher(url).then(response => { if (!response.ok) throw new Error(`Sample unavailable: ${url}`); return response.arrayBuffer(); }).then(data => this.context.decodeAudioData(data));
      this.buffers.set(url, pending); pending.catch(() => this.buffers.delete(url));
    }
    return pending;
  }
  get size() { return this.buffers.size; }
}

export function polyphonyGain(voices: number) { return Math.min(.72, .9 / Math.sqrt(Math.max(1, voices))); }
