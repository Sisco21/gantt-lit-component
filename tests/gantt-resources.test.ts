import { describe, expect, it } from 'vitest';
import { distributeResourceQuantity, getResourceCost, getResourceTotalQuantity } from '../src/gantt-resources';

describe('Gantt resource calculations', () => {
  it('calculates totals and costs without floating-point artefacts', () => {
    const resource = { id: 'crew', name: 'Crew', unitCost: 12.5, quantityByDate: { '2026-01-01': 0.1, '2026-01-02': 0.2 } };
    expect(getResourceTotalQuantity(resource)).toBe(0.3);
    expect(getResourceCost(resource)).toBe(3.75);
  });

  it('distributes the total only on working dates', () => {
    const resource = { id: 'crew', name: 'Crew' };
    expect(distributeResourceQuantity('2026-01-01', '2026-01-03', 10, resource, (_item, date) => date.getUTCDate() !== 2)).toEqual({
      '2026-01-01': 5,
      '2026-01-03': 5,
    });
  });
});
