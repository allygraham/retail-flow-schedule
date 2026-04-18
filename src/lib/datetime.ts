import { format, parseISO, startOfWeek, addDays, isSameDay } from 'date-fns';

export const fmtDate = (d: string | Date, pattern = 'EEE d MMM') =>
  format(typeof d === 'string' ? parseISO(d) : d, pattern);

export const fmtTime = (t: string) => t.slice(0, 5);

export const weekStartFor = (d: Date) =>
  startOfWeek(d, { weekStartsOn: 1 });

export const weekDays = (start: Date) =>
  Array.from({ length: 7 }, (_, i) => addDays(start, i));

export const isoDate = (d: Date) => format(d, 'yyyy-MM-dd');

export const minutesBetween = (start: string, end: string, breakM = 0) => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm) - (breakM ?? 0));
};

export const hoursBetween = (start: string, end: string, breakM = 0) =>
  +(minutesBetween(start, end, breakM) / 60).toFixed(2);

export const sameDay = (a: string | Date, b: string | Date) =>
  isSameDay(typeof a === 'string' ? parseISO(a) : a, typeof b === 'string' ? parseISO(b) : b);

export const initials = (name?: string | null) => {
  if (!name) return '·';
  return name.split(' ').map(s => s[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
};

export const overlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  aStart < bEnd && bStart < aEnd;

export const inRange = (date: string, start: string, end: string) =>
  date >= start && date <= end;
