// Named scenarios: several versions of a plan kept side by side so they can be switched and compared.
// Pure functions here; storage.ts persists the library.
import type { Assumptions } from '../engine/types';

export interface Scenario {
  id: string;
  name: string;
  plan: Assumptions;
  /** ISO timestamp of the last change. */
  updated: string;
}

export interface Library {
  scenarios: Scenario[];
  currentId: string | null;
  stage: 'wizard' | 'plan';
  step: number;
}

export const EMPTY_LIBRARY: Library = { scenarios: [], currentId: null, stage: 'wizard', step: 0 };

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function makeScenario(name: string, plan: Assumptions): Scenario {
  return { id: newId(), name, plan: structuredClone(plan), updated: new Date().toISOString() };
}

/** A name not already used: "Base case", "Base case 2", ... */
export function uniqueName(base: string, scenarios: Scenario[]): string {
  const taken = new Set(scenarios.map((s) => s.name));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

/** Replace the plan of one scenario; adds it if the id is unknown. */
export function upsertPlan(scenarios: Scenario[], id: string, name: string, plan: Assumptions): Scenario[] {
  const updated = new Date().toISOString();
  if (scenarios.some((s) => s.id === id)) return scenarios.map((s) => (s.id === id ? { ...s, plan, updated } : s));
  return [...scenarios, { id, name, plan, updated }];
}

export function renameScenario(scenarios: Scenario[], id: string, name: string): Scenario[] {
  return scenarios.map((s) => (s.id === id ? { ...s, name } : s));
}

export function removeScenario(scenarios: Scenario[], id: string): Scenario[] {
  return scenarios.filter((s) => s.id !== id);
}

/** Copy a scenario under a new name, placed right after the original. */
export function duplicateScenario(scenarios: Scenario[], id: string): { scenarios: Scenario[]; copy: Scenario } | null {
  const i = scenarios.findIndex((s) => s.id === id);
  if (i === -1) return null;
  const copy = makeScenario(uniqueName(`${scenarios[i].name} copy`, scenarios), scenarios[i].plan);
  return { scenarios: [...scenarios.slice(0, i + 1), copy, ...scenarios.slice(i + 1)], copy };
}

/** Accepts a saved library, or the single-plan format the app used before scenarios. */
export function parseLibrary(raw: unknown): Library | null {
  const p = raw as Partial<Library> & { plan?: Assumptions };
  if (p && Array.isArray(p.scenarios)) {
    const scenarios = p.scenarios.filter((s) => s?.plan?.version === 1 && typeof s.id === 'string');
    const currentId = scenarios.some((s) => s.id === p.currentId) ? p.currentId! : scenarios[0]?.id ?? null;
    return { scenarios, currentId, stage: p.stage === 'plan' ? 'plan' : 'wizard', step: Number(p.step) || 0 };
  }
  if (p?.plan?.version === 1) {
    const s = makeScenario('Base case', p.plan);
    return { scenarios: [s], currentId: s.id, stage: p.stage === 'plan' ? 'plan' : 'wizard', step: Number(p.step) || 0 };
  }
  return null;
}
