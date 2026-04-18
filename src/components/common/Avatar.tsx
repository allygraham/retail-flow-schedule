import { initials } from '@/lib/datetime';
import s from './Avatar.module.scss';

export function Avatar({ name, size = 'md' }: { name?: string | null; size?: 'sm'|'md'|'lg' }) {
  const ini = initials(name);
  // deterministic colour from name
  const palette = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#a855f7','#14b8a6','#f43f5e'];
  const hue = (name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  return (
    <span className={`${s.avatar} ${s[size]}`} style={{ background: palette[hue] + '22', color: palette[hue] }}>
      {ini}
    </span>
  );
}
