import { Link } from 'react-router-dom';
import { Logo } from '@/components/common/Logo';
import s from './Marketing.module.scss';

export default function Features() {
  return (
    <div className={s.page}>
      <header className={s.nav}><Logo /><Link to="/">← Home</Link></header>
      <main className={s.main}>
        <span className={s.eyebrow}>Features</span>
        <h1>Everything you need to run a retail rota</h1>
        <div className={s.grid}>
          {[
            ['Rota builder', 'Build weeks fast, copy from last week, publish in one click.'],
            ['Conflict detection', 'Overlaps, leave clashes, sickness, and unavailability flagged inline.'],
            ['Multi-store', 'One workspace for every location, with per-store filters.'],
            ['Leave management', 'Annual, unpaid, sick — all with a clean approval flow.'],
            ['Roles & permissions', 'Owner / manager / employee with row-level data isolation.'],
            ['Audit log', 'Every schedule action recorded for accountability.'],
          ].map(([t,d]) => (
            <div key={t} className={s.item}>
              <h3>{t}</h3><p>{d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
