import { describe, expect, it, vi } from 'vitest';
import { instrumentTrim, polyphonyGain, SampleCache, selectSample, velocityLayer } from './sampler';

describe('multisample mapping', () => {
  it('uses three velocity layers', () => { expect([velocityLayer(.2), velocityLayer(.5), velocityLayer(.95)]).toEqual([0,1,2]); });
  it('keeps piano zones within three semitones and transposes accurately', () => {
    for (let midi = 33; midi <= 96; midi++) { const sample = selectSample('piano', midi); expect(Math.abs(midi - sample.rootMidi)).toBeLessThanOrEqual(2); expect(sample.playbackRate).toBeCloseTo(2 ** ((midi - sample.rootMidi) / 12), 8); }
  });
  it('keeps Rhodes transposition within three semitones', () => { for (let midi=33;midi<=96;midi++) expect(Math.abs(midi-selectSample('rhodes',midi).rootMidi)).toBeLessThanOrEqual(3); });
  it('selects distinct recorded Rhodes layers', () => { expect(selectSample('rhodes', 60, .2).url).not.toBe(selectSample('rhodes', 60, .95).url); });
  it('caches decoded samples and retries a failed load', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok:false }).mockResolvedValue({ ok:true, arrayBuffer: async () => new ArrayBuffer(1) });
    const context = { decodeAudioData: vi.fn().mockResolvedValue({}) } as unknown as BaseAudioContext; const cache = new SampleCache(context, fetcher as typeof fetch);
    await expect(cache.load('/sample.ogg')).rejects.toThrow(); await cache.load('/sample.ogg'); await cache.load('/sample.ogg'); expect(fetcher).toHaveBeenCalledTimes(2); expect(cache.size).toBe(1);
  });
  it('reduces gain as polyphony grows', () => { expect(polyphonyGain(12)).toBeLessThan(polyphonyGain(3)); });
  it('maps louder velocities onto louder recordings for both instruments', () => {
    const layerOf = (url: string) => Number(url.match(/-v(\d+)\.ogg$/)![1]);
    expect(layerOf(selectSample('piano', 60, .2).url)).toBeLessThan(layerOf(selectSample('piano', 60, .95).url));
    expect(layerOf(selectSample('rhodes', 60, .2).url)).toBeLessThan(layerOf(selectSample('rhodes', 60, .95).url));
  });
  it('trims the hotter Rhodes set toward the piano', () => expect(instrumentTrim.rhodes).toBeLessThan(instrumentTrim.piano));
  it('keeps a four-voice chord below full scale', () => {
    const perVoice = polyphonyGain(4) * instrumentTrim.piano * (.55 + .82 * .45);
    expect(perVoice * 4 * .55).toBeLessThan(1);
  });
});
