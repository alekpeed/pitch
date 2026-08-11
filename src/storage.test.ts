import { beforeEach, describe, expect, it } from 'vitest';
import { attemptStore, sessionStore, type Attempt } from './storage';
describe('local evidence stores', () => {
  beforeEach(() => localStorage.clear());
  it('persists immutable evidence fields', () => { const attempt: Attempt = { id:'1',sessionId:'s1',timestamp:'2026-01-01',exercise:'triad-quality',stimulus:{root:60},expected:'major',response:'minor',correct:false,latencyMs:1200,difficulty:{inversions:'all'},replayCount:1 }; attemptStore.add(attempt); expect(attemptStore.all()).toEqual([attempt]); });
  it('recovers from invalid local data', () => { localStorage.setItem('perfect-ear-attempts-v1','broken'); expect(attemptStore.all()).toEqual([]); });
  it('starts and finishes a session without duplicating it', () => { sessionStore.add({ id: 's1', startedAt: '2026-01-01', mode: 'mixed' }); sessionStore.add({ id: 's1', startedAt: '2026-01-01', mode: 'mixed' }); sessionStore.finish('s1', '2026-01-02'); expect(sessionStore.all()).toEqual([{ id: 's1', startedAt: '2026-01-01', endedAt: '2026-01-02', mode: 'mixed' }]); });
});
