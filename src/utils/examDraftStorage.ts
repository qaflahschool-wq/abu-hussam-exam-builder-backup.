import { Exam, ExamHeaderConfig, ExamLayoutConfig } from '../types/index.ts';

export interface LocalExamDraftRecord {
  userId: string;
  examId: string;
  exam: Exam;
  headerConfig: ExamHeaderConfig;
  layoutConfig: ExamLayoutConfig;
  savedAt: string; // ISO timestamp
  serverUpdatedAt?: string;
  pendingSync: boolean;
}

const DRAFT_PREFIX = 'qaflah_exam_draft_v1:';

export function getDraftStorageKey(userId: string, examId: string): string {
  return `${DRAFT_PREFIX}${userId}:${examId}`;
}

export function saveLocalExamDraft(record: LocalExamDraftRecord): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getDraftStorageKey(record.userId, record.examId), JSON.stringify(record));
  } catch {
    // Ignore quota errors gracefully
  }
}

export function loadLocalExamDraft(userId: string, examId: string): LocalExamDraftRecord | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getDraftStorageKey(userId, examId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalExamDraftRecord;
    if (!parsed || parsed.userId !== userId || parsed.examId !== examId || !parsed.exam) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLocalExamDraft(userId: string, examId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(getDraftStorageKey(userId, examId));
  } catch {
    // ignore
  }
}

export function listPendingLocalDraftsForUser(userId: string): LocalExamDraftRecord[] {
  if (typeof localStorage === 'undefined') return [];
  const results: LocalExamDraftRecord[] = [];
  const prefix = `${DRAFT_PREFIX}${userId}:`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as LocalExamDraftRecord;
      if (parsed && parsed.userId === userId && parsed.pendingSync) {
        results.push(parsed);
      }
    }
  } catch {
    // ignore
  }
  return results;
}

export function hasRecoverableNewerDraft(
  localDraft: LocalExamDraftRecord | null,
  serverUpdatedAt?: string
): boolean {
  if (!localDraft) return false;
  if (!localDraft.pendingSync) return false;
  const localTs = new Date(localDraft.savedAt).getTime();
  if (!Number.isFinite(localTs)) return false;
  if (!serverUpdatedAt) return true;
  const serverTs = new Date(serverUpdatedAt).getTime();
  if (!Number.isFinite(serverTs)) return true;
  return localTs > serverTs + 500;
}
