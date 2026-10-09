import { reportError } from '@/features/monitoring/monitoring';
/** Supabase resolves database failures instead of rejecting its promise. */
export function assertQueryResults(...results: { error?: unknown; data?: unknown }[]) {
  for (const result of results) if (result.error) { reportError(result.error, 'database-operation'); throw result.error; }
}
