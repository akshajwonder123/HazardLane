import assert from 'node:assert/strict';
import test from 'node:test';
import { riskLevel } from '../lib/domain';
test('risk labels reflect the documented thresholds without absolute safety claims', () => {
  for (const s of [0, 1, 29, 29.9]) assert.equal(riskLevel(s), 'Low Risk');
  for (const s of [30, 40, 59]) assert.equal(riskLevel(s), 'Medium Risk');
  for (const s of [60, 85, 100]) assert.equal(riskLevel(s), 'High Risk');
});
