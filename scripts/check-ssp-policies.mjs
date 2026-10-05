import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DAY = 86_400_000;
export function checkPolicies(policies, today = new Date().toISOString().slice(0, 10)) {
  const date = value => {
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error(`Invalid policy date: ${value}`);
    return time;
  };
  const now = date(today);
  if (!policies.length) throw new Error('No reviewed SSP policies configured.');
  const sorted = [...policies].sort((a, b) => a.start.localeCompare(b.start));
  const ids = new Set();
  sorted.forEach((policy, index) => {
    if (!policy.id || ids.has(policy.id) || !policy.label) throw new Error('SSP policies need unique IDs and labels.');
    ids.add(policy.id);
    if (date(policy.start) > date(policy.end) || date(policy.reviewedOn) > now) throw new Error('Invalid policy validity or review dates.');
    if (!policy.source?.startsWith('https://www.gov.uk/')) throw new Error('SSP policies need an official government source.');
    if (policy.ruleVersion !== 'first-day-percentage-v1' || policy.maximumWeeks !== 28 || policy.earningsFraction !== 0.8 || !Number.isFinite(policy.weeklyCap) || policy.weeklyCap <= 0) throw new Error('Unsupported SSP rules: implement and test a new calculation version first.');
    if (index && date(policy.start) !== date(sorted[index - 1].end) + DAY) throw new Error('SSP policies must be contiguous without gaps or overlaps.');
  });
  const last = sorted.at(-1);
  const remaining = Math.floor((date(last.end) - now) / DAY);
  const active = sorted.some(policy => policy.start <= today && policy.end >= today);
  if (!active) return { warning: `No reviewed SSP rules cover today (${today}); estimates for unsupported dates are blocked.` };
  if (remaining <= 90) return { warning: `Reviewed SSP rules expire on ${last.end} (${remaining} days remaining). Review HMRC guidance and add the next policy before expiry.` };
  return { message: `SSP policies checked: reviewed rules through ${last.end}.` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const policies = JSON.parse(readFileSync(new URL('../src/features/leave/sspPolicies.json', import.meta.url), 'utf8'));
  try {
    const result = checkPolicies(policies);
    if (result.warning) console.warn(`${process.env.GITHUB_ACTIONS ? '::warning::' : 'WARNING: '}${result.warning}`);
    else console.log(result.message);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
