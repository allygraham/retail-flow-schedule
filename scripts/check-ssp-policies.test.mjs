import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkPolicies } from './check-ssp-policies.mjs';
const policies = JSON.parse(readFileSync(new URL('../src/features/leave/sspPolicies.json', import.meta.url), 'utf8'));
test('warns exactly 90 days before expiry, at expiry, and after expiry', () => {
  assert.ok(checkPolicies(policies, '2027-01-04').message);
  for (const today of ['2027-01-05', '2027-04-05', '2027-04-06']) assert.ok(checkPolicies(policies, today).warning);
});
test('rejects malformed, overlapping and unsupported policies', () => {
  for (const patch of [{ weeklyCap: -1 }, { earningsFraction: 0.9 }, { reviewedOn: '2026-02-30' }, { source: 'https://example.com' }, { ruleVersion: 'unknown' }]) assert.throws(() => checkPolicies([{ ...policies[0], ...patch }], '2026-10-05'));
  assert.throws(() => checkPolicies([...policies, { ...policies[0], id: 'duplicate-range' }], '2026-10-05'));
});
