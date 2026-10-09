import { reportError } from '@/features/monitoring/monitoring';
export function errorMessage(error: unknown, fallback: string): string {
  reportError(error, 'handled-operation');
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message || fallback;
  }
  return fallback;
}
