import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, Building2, CalendarDays, Users, User, Calendar } from 'lucide-react';
import { useAuth } from '@/features/auth/authContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { supabase } from '@/integrations/supabase/client';
import { assertQueryResults } from '@/lib/queryResults';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { readOnboardingState, onboardingSteps, type OnboardingState } from './steps';
import s from './DashboardOnboarding.module.scss';

export function DashboardOnboarding() {
 const { business, user, role } = useAuth();
 if (!business || !user || !role) return null;
 return <Checklist key={`${business.id}:${user.id}:${role}`} />;
}
function Checklist() {
 const { business, role } = useAuth();
 const navigate = useNavigate();
 const steps = onboardingSteps(role!);
 const employee = role === 'employee';
 const [expanded, setExpanded] = useState(false);
 const [override, setOverride] = useState<OnboardingState | null>(null);
 const [busy, setBusy] = useState(false);
 const [problem, setProblem] = useState<string | null>(null);
 const pending = useRef(false);
 const mounted = useRef(true);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
 const load = useCallback(async () => {
  const result = await supabase.rpc('get_onboarding_status', { _business_id: business!.id });
  assertQueryResults(result); return readOnboardingState(result.data);
 }, [business]);
 const { data, loading, error, reload } = useAsyncData(load, 'Could not load your setup progress.');
 const state = override ?? data;
 const complete = steps.filter(step => state?.completed.includes(step.id)).length;
 const next = steps.find(step => !state?.completed.includes(step.id));
 const allDone = complete === steps.length;
 const welcomeOpen = !!state && !state.welcomed && !allDone;
 const update = async (action: 'welcome' | 'hide' | 'show', destination?: string) => {
  if (pending.current) return;
  pending.current = true; setBusy(true); setProblem(null);
  try {
   const result = await supabase.rpc('update_onboarding', { _business_id: business!.id, _action: action });
   assertQueryResults(result);
   if (!mounted.current) return;
   setOverride(readOnboardingState(result.data)); if (destination) navigate(destination);
  } catch (error) { if (mounted.current) setProblem(errorMessage(error, 'Could not save your preference. Please try again.')); }
  finally { pending.current = false; if (mounted.current) setBusy(false); }
 };
 if (error) return <section className={s.recovery} aria-label="Get started"><span>Setup guidance is unavailable. Your dashboard is still ready to use.</span><Button variant="ghost" size="sm" onClick={() => void reload()}>Retry setup guidance</Button></section>;
 if (loading && !state) return <section className={s.card} aria-label="Get started"><h2>Get started</h2><LoadingSkeleton label="Loading setup progress" rows={2} /></section>;
 if (!state) return null;
 const icons = employee ? [User, Calendar, CalendarDays] : [Building2, CalendarDays, Users];
 return <>
  {state.hidden || allDone ? <div className={s.restore}><span>{allDone ? employee ? 'You’re ready to find your way around.' : 'Your workspace is ready.' : 'Setup guidance is hidden.'}</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => { setExpanded(true); void update('show'); }}>{allDone && expanded && !state.hidden ? 'Checklist shown' : 'View setup checklist'}</Button></div> : null}
  {(!state.hidden && (!allDone || expanded)) && <section className={`${s.card} ${employee ? s.employee : ''} ${expanded ? s.expanded : ''}`} aria-labelledby="onboarding-title">
   <div className={s.head}><div><h2 id="onboarding-title">{employee ? 'Find your way around' : 'Get your workspace ready'}</h2>{!employee && <p>A few small steps before your first rota.</p>}</div><div className={s.tools}><span className={s.count}>{complete} of {steps.length} {employee ? 'explored' : 'complete'}</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => void update('hide')}>Hide for now</Button></div></div>
   <div className={s.progress} role="progressbar" aria-label={employee ? 'Pages explored' : 'Workspace setup'} aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={complete}><span style={{ width: `${complete / steps.length * 100}%` }} /></div>
   <ol className={s.steps}>{steps.map((step, index) => {
    const done = state.completed.includes(step.id); const active = step.id === next?.id; const Icon = icons[index] ?? Calendar;
    return <li key={step.id} className={`${done ? s.done : ''} ${active ? s.active : ''}`}>
     <span className={s.marker} aria-hidden>{done ? <Check size={16} /> : employee ? <Icon size={19} /> : index + 1}</span>
     <div className={s.text}><strong>{step.title}</strong>{(employee || active || expanded) && <p>{step.description}</p>}{done && <span className={s.srOnly}>Completed</span>}</div>
     {employee || expanded ? <Button variant="ghost" aria-label={`Open ${step.title}`} trailing={<ChevronRight size={16} />} onClick={() => navigate(step.to)}>Open</Button> : active ? <Button onClick={() => navigate(step.to)}>{step.action}</Button> : null}
    </li>;
   })}</ol>
   {!employee && <button className={s.expand} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show next step only' : 'View all steps'}<ChevronDown size={16} aria-hidden /></button>}
   {employee && <p className={s.note}>Requests needing your attention appear in notifications.</p>}
  </section>}
  {problem && !welcomeOpen && <p role="alert">{problem}</p>}
  <Modal open={welcomeOpen} onClose={() => { if (!busy) void update('welcome'); }} title={<span className={s.welcomeTitle}>Welcome to {business?.name ?? 'your workspace'}</span>} size="md" footer={<><Button variant="ghost" disabled={busy} onClick={() => void update('welcome')}>Explore dashboard</Button><Button loading={busy} onClick={() => void update('welcome', next?.to)}>{employee ? 'Get started' : 'Start setup'}</Button></>}>
   <div className={s.welcome}><span className={s.eyebrow}>Your workspace</span><p>{employee ? 'Everything you need for your working week.' : role === 'manager' ? 'Find your team, publish a rota and keep requests moving.' : 'Let’s get your team ready for its first rota.'}</p>
    <ul>{(employee ? steps : role === 'manager' ? steps : [steps[0],steps[1], { ...steps[2], title: 'Invite your team and publish a rota' }]).map((step,index) => { const Icon=icons[index] ?? Calendar; return <li key={step.id}><Icon size={20} aria-hidden /><span>{step.title}</span></li>; })}</ul>
    <p className={s.note}>You can complete these steps at your own pace.</p>{problem && <p role="alert">{problem}</p>}
   </div>
  </Modal>
 </>;
}
