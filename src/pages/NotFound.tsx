import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Logo } from '@/components/common/Logo';
import s from './NotFound.module.scss';

export default function NotFound() {
  return <main className={s.page}>
    <section className={s.card}>
      <Logo />
      <span className={s.icon} aria-hidden="true"><MapPin size={28} /></span>
      <p className={s.eyebrow}>Error 404</p>
      <h1 className={s.title}>Page not found</h1>
      <p className={s.message}>This page may have moved, or the link may be incorrect.</p>
      <Link className={s.action} to="/">Return to app</Link>
    </section>
  </main>;
}
