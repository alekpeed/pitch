import type { Backup, BackupInput } from './backup';
import { profileStore, type ProfileId } from './curriculum';
import { diagnosticStore } from './diagnostic';
import { noteStore } from './journal';
import { retentionStore } from './retention';
import { attemptStore, sessionStore } from './storage';
import { transcriptionStore } from './transcription';

/**
 * The bridge between the pure backup format and the seven stores that actually
 * hold the data. Kept apart from backup.ts so that stays testable without a DOM.
 */

export const currentData = (): BackupInput => ({
  attempts: attemptStore.all(), sessions: sessionStore.all(), notes: noteStore.all(),
  probes: retentionStore.all(), submissions: transcriptionStore.submissions(),
  diagnostic: diagnosticStore.latest(), profile: profileStore.get(),
});

/** Writes a validated backup into every store. Callers merge or replace first. */
export function applyBackup(backup: Backup) {
  attemptStore.replaceAll(backup.attempts);
  sessionStore.replaceAll(backup.sessions);
  noteStore.replaceAll(backup.notes);
  retentionStore.replaceAll(backup.probes);
  transcriptionStore.replaceSubmissions(backup.submissions);
  if (backup.diagnostic) diagnosticStore.restore(backup.diagnostic);
  if (backup.profile) profileStore.set(backup.profile as ProfileId);
}
