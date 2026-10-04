import { parseISO, isValid, format } from 'date-fns';

/** Coerce ISO date string `yyyy-MM-dd` ↔ Date safely. */
export const parseISODate = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = parseISO(v);
  return isValid(d) ? d : null;
};
export const toISODate = (d: Date | null | undefined): string =>
  d && isValid(d) ? format(d, 'yyyy-MM-dd') : '';

