import { beforeEach, describe, expect, it } from 'vitest';
import { attemptStore, type Attempt } from './storage';

describe('attempt store', () => {
  beforeEach(() => localStorage.clear());
  it('persists immutable evidence fields', () => { const attempt: Attempt = { id:'1',timestamp:'2026-01-01',exercise:'triad-quality',stimulus:{root:60},expected:'major',response:'minor',correct:false,latencyMs:1200,difficulty:{inversions:'all'},replayCount:1 }; attemptStore.add(attempt); expect(attemptStore.all()).toEqual([attempt]); });
  it('recovers from invalid local data', () => { localStorage.setItem('perfect-ear-attempts-v1','broken'); expect(attemptStore.all()).toEqual([]); });
});
