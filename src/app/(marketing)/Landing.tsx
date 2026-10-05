import { Link } from 'react-router-dom';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/common/Button';
import s from './Landing.module.scss';

export default function Landing() {
  return (
    <div className={s.page}>
      <header className={s.nav}>
        <Logo />
        <nav className={s.links}>
          <Link to="/features">Features</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/login">Sign in</Link>
          <Link to="/signup"><Button size="sm">Start free</Button></Link>
        </nav>
      </header>

      <section className={s.hero}>
        <span className={s.eyebrow}>Retail workforce scheduling</span>
        <h1 className={s.h1}>Rotas that <em>run themselves.</em></h1>
        <p className={`${s.lead} text-justify`}>
          Lavoro is the scheduling platform built for multi-store retail. Build the week in minutes,
          spot coverage gaps before they cost you, and give every employee a clear view of their shifts.
        </p>
        <div className={s.cta}>
          <Link to="/signup"><Button size="lg">Start free trial</Button></Link>
        </div>
      </section>

      <section className={s.features}>
        {[
          { t: 'Weekly rota builder', d: 'Drag, duplicate, and publish in minutes. See every store, role, and conflict at a glance.' },
          { t: 'Coverage warnings', d: 'Lavoro flags overlaps, leave clashes, sickness, and unassigned shifts before publish.' },
          { t: 'Employee self-service', d: 'Staff check shifts, request time off, and mark unavailability — no more group chats.' },
          { t: 'Multi-store ready', d: 'One workspace, every location. Filter by store, role, or person in a single click.' },
          { t: 'Leave & sickness', d: 'Centralised approvals with a clean audit trail and live impact on the rota.' },
          { t: 'Built for retail', d: 'Cashier, keyholder, supervisor, stockroom — role labels that match how you actually staff a shop.' },
        ].map(f => (
          <div key={f.t} className={s.feature}>
            <div className={s.fIcon} />
            <h3>{f.t}</h3>
            <p>{f.d}</p>
          </div>
        ))}
      </section>

      <footer className={s.foot}>
        <Logo size="sm" />
        <span>© {new Date().getFullYear()} Lavoro · Built for retail teams</span>
      </footer>
    </div>
  );
}
