import { useRef, useState } from 'react';
import { useAuth } from '@/features/auth/authContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/common/Card';
import { Field, Select } from '@/components/common/Field';
import { DatePicker, parseISODate, toISODate } from '@/components/common/DatePicker';
import { Button } from '@/components/common/Button';
import { errorMessage } from '@/lib/errors';
import { leavePeriodForDate, type LeaveYearMode } from './leavePeriod';
import { isoDate } from '@/lib/datetime';
import s from './LeaveYearSettings.module.scss';

export function LeaveYearSettings() {
  const { business, role, refresh } = useAuth();
  const [mode, setMode] = useState<LeaveYearMode>(business?.leave_year_mode ?? 'calendar');
  const [start, setStart] = useState(business?.leave_year_start_date ?? '');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (role !== 'owner' && role !== 'admin') return null;
  const preview = mode !== 'financial' || start ? leavePeriodForDate({ leave_year_mode: mode, leave_year_start_date: start }, isoDate(new Date())) : null;
  const save = async () => {
    if (!business || busy.current) return;
    if (mode === 'financial' && !start) { setError('Choose the financial year start date.'); return; }
    busy.current = true; setSaving(true); setError(null); setSaved(false);
    try {
      const { data, error } = await supabase.from('businesses').update({ leave_year_mode: mode, leave_year_start_date: mode === 'financial' ? start : null }).eq('id', business.id).select('id');
      if (error) throw error;
      if (data?.length !== 1) throw new Error('Leave year could not be saved. Check your owner access and try again.');
      await refresh();
      setSaved(true);
    } catch (error) { setError(errorMessage(error, 'Could not save the leave year. Please try again.')); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Card title="Leave year" subtitle="One entitlement period for everyone in this business.">
    <div className={s.form}>
      <Field label="Leave year type"><Select value={mode} disabled={saving} onChange={event => { setMode(event.target.value as LeaveYearMode); setSaved(false); }}>
        <option value="calendar">Calendar year (1 January – 31 December)</option>
        <option value="tax">UK tax year (6 April – 5 April)</option>
        <option value="financial">Financial year (choose a start date)</option>
      </Select></Field>
      {mode === 'financial' && <Field label="Financial year start date" hint="The day and month repeat every year. A 29 February start uses 28 February in non-leap years.">
        <DatePicker value={parseISODate(start)} onChange={date => { if (!saving) { setStart(toISODate(date)); setSaved(false); } }} disabled={saving} />
      </Field>}
      {preview && <p className={s.note}>Current leave year: {preview.label}. Applies to all employees’ balances and staff history.</p>}
      <p className={s.note}>Changing this setting recalculates balances from the existing records. Individual entitlements and approved working patterns stay unchanged.</p>
      {error && <p role="alert" className={s.error}>{error}</p>}
      {saved && <p role="status">Leave year saved.</p>}
      <Button onClick={save} loading={saving}>Save leave year</Button>
    </div>
  </Card>;
}
