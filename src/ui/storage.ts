import type { Assumptions } from '../engine/types';
import { parseLibrary, type Library } from './scenarios';

const KEY = 'groundwork-forecaster-scenarios-v1';
/** Single-plan save from before scenarios; read once and migrated. */
const OLD_KEY = 'groundwork-forecaster-plan-v1';

export function loadLibrary(): Library | null {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    if (!raw) return null;
    const lib = parseLibrary(JSON.parse(raw));
    return lib && lib.scenarios.length ? lib : null;
  } catch {
    return null;
  }
}

export function saveLibrary(lib: Library): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(lib));
    localStorage.removeItem(OLD_KEY);
  } catch { /* storage unavailable */ }
}

export function parsePlanFile(text: string): Assumptions {
  const p = JSON.parse(text);
  const plan = p?.plan ?? p;
  if (plan?.version !== 1 || !Array.isArray(plan.streams)) throw new Error('This file is not a Groundwork plan.');
  return plan as Assumptions;
}

/** A file holding one plan or a whole scenario library. */
export function parseAnyFile(text: string): { library: Library } | { plan: Assumptions } {
  const p = JSON.parse(text);
  if (Array.isArray(p?.scenarios)) {
    const library = parseLibrary(p);
    if (!library || !library.scenarios.length) throw new Error('This scenarios file has no usable plans.');
    return { library };
  }
  return { plan: parsePlanFile(text) };
}

interface DownloadsApi { save(req: { filename: string; data: Blob | ArrayBuffer | string }): Promise<unknown> }
interface ClaudeHost { use(name: string): Promise<unknown> }

/**
 * Saves a file. Inside a claude.ai artifact the page must ask the viewer through the downloads
 * capability; everywhere else a normal browser download works.
 */
export async function downloadFile(filename: string, data: Blob): Promise<'saved' | 'declined'> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host?.use) {
    const api = (await Promise.race([
      host.use('downloads'),
      new Promise((r) => setTimeout(() => r(null), 3000)),
    ])) as DownloadsApi | null;
    if (api) {
      try {
        await api.save({ filename, data });
        return 'saved';
      } catch {
        return 'declined';
      }
    }
  }
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'saved';
}

export function safeFileName(s: string): string {
  return s.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, ' ') || 'Plan';
}
