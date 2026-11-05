import { newPlan } from '../engine/templates';
import { duplicateScenario, makeScenario, parseLibrary, removeScenario, renameScenario, uniqueName, upsertPlan } from './scenarios';

const plan = newPlan('food-truck');

describe('scenarios', () => {
  it('duplicates into an independent copy placed after the original', () => {
    const a = makeScenario('Base case', plan);
    const b = makeScenario('Other', plan);
    const res = duplicateScenario([a, b], a.id)!;
    expect(res.scenarios.map((s) => s.name)).toEqual(['Base case', 'Base case copy', 'Other']);
    res.copy.plan.businessName = 'Changed';
    expect(a.plan.businessName).toBe(plan.businessName);
  });

  it('makes unique names', () => {
    const list = [makeScenario('Base case', plan), makeScenario('Base case 2', plan)];
    expect(uniqueName('Base case', list)).toBe('Base case 3');
    expect(uniqueName('Fresh', list)).toBe('Fresh');
  });

  it('upserts, renames and removes', () => {
    const a = makeScenario('A', plan);
    const changed = { ...plan, businessName: 'New name' };
    let list = upsertPlan([a], a.id, 'A', changed);
    expect(list).toHaveLength(1);
    expect(list[0].plan.businessName).toBe('New name');
    list = upsertPlan(list, 'other', 'B', plan);
    expect(list.map((s) => s.name)).toEqual(['A', 'B']);
    list = renameScenario(list, 'other', 'Bee');
    expect(list[1].name).toBe('Bee');
    expect(removeScenario(list, a.id).map((s) => s.name)).toEqual(['Bee']);
  });

  it('migrates the old single-plan save into one scenario', () => {
    const lib = parseLibrary({ plan, stage: 'plan', step: 3 })!;
    expect(lib.scenarios).toHaveLength(1);
    expect(lib.currentId).toBe(lib.scenarios[0].id);
    expect(lib.stage).toBe('plan');
  });

  it('rejects junk and repairs a missing current id', () => {
    expect(parseLibrary({ foo: 1 })).toBeNull();
    const s = makeScenario('A', plan);
    expect(parseLibrary({ scenarios: [s, { id: 'x', plan: { version: 9 } }], currentId: 'gone' })!.currentId).toBe(s.id);
  });
});
