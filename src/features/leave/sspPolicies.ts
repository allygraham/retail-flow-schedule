import policies from './sspPolicies.json';

export interface SspPolicy {
  id: string; label: string; start: string; end: string;
  weeklyCap: number; maximumWeeks: number; earningsFraction: number;
  ruleVersion: string; source: string; reviewedOn: string;
}
export const SSP_POLICIES: readonly SspPolicy[] = policies;
export function policyForDate(date: string, policies: readonly SspPolicy[] = SSP_POLICIES): SspPolicy {
  const matches = policies.filter(policy => date >= policy.start && date <= policy.end);
  if (matches.length !== 1) throw new Error(`No reviewed SSP policy for ${date}. This absence needs a different tax-year or transition calculation. Check payroll before estimating SSP.`);
  return matches[0];
}
export function policiesForPeriod(start: string, end: string, policies: readonly SspPolicy[] = SSP_POLICIES): SspPolicy[] {
  const result: SspPolicy[] = [];
  let date = start;
  while (date <= end) {
    const policy = policyForDate(date, policies);
    result.push(policy);
    if (policy.end >= end) break;
    date = new Date(Date.parse(`${policy.end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
  return result;
}
