import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { runForecast } from './forecast';
import { workbookBytes } from './excel';
import { TEMPLATES, newPlan } from './templates';

describe('Excel export', () => {
  it('writes a readable workbook with the expected sheets and numbers', () => {
    for (const t of TEMPLATES) {
      const a = newPlan(t.id);
      const wb = XLSX.read(workbookBytes(a), { type: 'array' });
      expect(wb.SheetNames).toEqual(['Summary', 'Monthly P&L and cash', 'Downside', 'Labor and expense detail', 'Startup budget', 'Assumptions']);
      const pl = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets['Monthly P&L and cash'], { header: 1 });
      const header = pl[0];
      expect(header).toHaveLength(1 + 36 + 3);
      const total = pl.find((r) => r[0] === 'Total revenue')!;
      const f = runForecast(a);
      expect(total[1] as number).toBeCloseTo(f.months[0].revenue, 4);
      expect(total[37] as number).toBeCloseTo(f.years[0].revenue, 4);
    }
  });
});
