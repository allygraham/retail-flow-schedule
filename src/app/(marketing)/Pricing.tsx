import { Link } from 'react-router-dom';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/common/Button';
import s from './Marketing.module.scss';

export default function Pricing() {
  return (
    <div className={s.page}>
      <header className={s.nav}><Logo /><Link to="/">← Home</Link></header>
      <main className={s.main}>
        <span className={s.eyebrow}>Pricing</span>
        <h1>Simple, per-employee pricing</h1>
        <div className={s.tiers}>
          {[
            { n: 'Starter', p: '£3', d: 'per employee / month', f: ['1 store', 'Weekly rota', 'Leave management', 'Email support'] },
            { n: 'Growth', p: '£5', d: 'per employee / month', f: ['Unlimited stores', 'Coverage warnings', 'Audit log', 'Priority support'], best: true },
            { n: 'Scale', p: 'Custom', d: 'talk to sales', f: ['SSO', 'Dedicated CSM', 'Reporting & exports', 'SLA'] },
          ].map(t => (
            <div key={t.n} className={`${s.tier} ${t.best ? s.best : ''}`}>
              {t.best && <span className={s.tag}>Most popular</span>}
              <h3>{t.n}</h3>
              <div className={s.price}>{t.p}<small>/{t.d}</small></div>
              <ul>{t.f.map(x => <li key={x}>{x}</li>)}</ul>
              <Link to="/signup"><Button full variant={t.best ? 'primary' : 'outline'}>Start trial</Button></Link>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
