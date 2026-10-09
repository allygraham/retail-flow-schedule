import { useSearchParams } from 'react-router-dom';
import { ScrollCue } from '@/components/common/ScrollCue';
import { useEffect, useRef, useState } from 'react';
import { Building2, Users, CalendarDays, Palette } from 'lucide-react';
import { useAuth } from '@/features/auth/authContext';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { BrandingSettings } from '@/features/branding/BrandingSettings';
import { LeaveYearSettings } from '@/features/leave/LeaveYearSettings';
import { HolidaySettings } from '@/features/holidays/HolidaySettings';
import { RolesSettings } from '@/features/roles/RolesSettings';
import s from './Settings.module.scss';

type SectionKey = 'business' | 'roles' | 'holidays' | 'theme';

const SECTIONS: { key: SectionKey; label: string; icon: typeof Building2 }[] = [
  { key: 'business', label: 'Business', icon: Building2 },
  { key: 'roles', label: 'Job roles', icon: Users },
  { key: 'holidays', label: 'Public holidays', icon: CalendarDays },
  { key: 'theme', label: 'Theme', icon: Palette },
];

const STORAGE_KEY = 'settings.activeSection';

export default function Settings() {
  const { business, role } = useAuth();
  const [params] = useSearchParams();
  const tabsRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SectionKey>(() => {
    if (typeof window === 'undefined') return 'business';
    const section = params.get('section');
    if (SECTIONS.some(s => s.key === section)) return section as SectionKey;
    const saved = window.sessionStorage.getItem(STORAGE_KEY) as SectionKey | null;
    return saved && SECTIONS.some(s => s.key === saved) ? saved : 'business';
  });

  useEffect(() => {
    const section = params.get('section');
    if (SECTIONS.some(s => s.key === section)) setActive(section as SectionKey);
  }, [params]);

  useEffect(() => {
    window.sessionStorage.setItem(STORAGE_KEY, active);
  }, [active]);

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <span className={s.eye}>Settings</span>
          <h1 className={s.h1}>Workspace</h1>
          <p className={s.sub}>Manage your business, team roles, holidays, and theme.</p>
        </div>
      </header>

      {/* Mobile tabs */}
      <div className={s.tabsWrap}><div ref={tabsRef} className={s.tabs} role="tablist" aria-label="Settings sections">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            className={`${s.tab} ${active === key ? s.tabActive : ''}`}
            onClick={() => setActive(key)}
          >
            <Icon size={14} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </div><ScrollCue target={tabsRef} label="settings" /></div>

      <div className={s.shell}>
        {/* Desktop / tablet side nav */}
        <nav className={s.nav} aria-label="Settings sections">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`${s.navItem} ${active === key ? s.navItemActive : ''}`}
              onClick={() => setActive(key)}
              aria-current={active === key ? 'page' : undefined}
            >
              <Icon size={16} aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className={s.panel}>
          {active === 'business' && (
            <>
            <Card title="Business" subtitle="Your workspace identity and your role.">
              <div className={s.bizGrid}>
                <div><strong>Name:</strong> {business?.name}</div>
                <div><strong>Slug:</strong> {business?.slug}</div>
                <div><strong>Your role:</strong> <Badge tone="brand" dot>{role}</Badge></div>
              </div>
            </Card>
            <LeaveYearSettings />
            </>
          )}
          {active === 'roles' && <RolesSettings />}
          {active === 'holidays' && <HolidaySettings />}
          {active === 'theme' && <BrandingSettings />}
        </div>
      </div>
    </div>
  );
}
