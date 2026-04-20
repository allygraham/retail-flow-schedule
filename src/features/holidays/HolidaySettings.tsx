import { useState } from 'react';
import { Card } from '@/components/common/Card';
import { Field, Select } from '@/components/common/Field';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { fmtDate } from '@/lib/datetime';
import { HOLIDAY_REGIONS, type HolidayRegion } from './types';
import { getHolidaysInRange } from './holidayService';
import { isoDate } from '@/lib/datetime';
import s from './HolidaySettings.module.scss';

export function HolidaySettings() {
  const { business, role, refresh } = useAuth();
  const canEdit = role === 'owner' || role === 'manager';
  const [enabled, setEnabled] = useState<boolean>(!!business?.public_holidays_enabled);
  const [region, setRegion] = useState<HolidayRegion>(
    (business?.public_holidays_region as HolidayRegion) ?? 'england',
  );
  const [saving, setSaving] = useState(false);

  if (!business) return null;

  const persist = async (next: { enabled?: boolean; region?: HolidayRegion }) => {
    if (!canEdit) return;
    setSaving(true);
    const payload: Record<string, unknown> = {};
    if (next.enabled !== undefined) payload.public_holidays_enabled = next.enabled;
    if (next.region !== undefined) payload.public_holidays_region = next.region;
    const { error } = await supabase.from('businesses').update(payload).eq('id', business.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      // revert
      setEnabled(!!business.public_holidays_enabled);
      setRegion((business.public_holidays_region as HolidayRegion) ?? 'england');
      return;
    }
    toast.success('Public holiday settings saved');
    await refresh();
  };

  const onToggle = (val: boolean) => {
    setEnabled(val);
    persist({ enabled: val });
  };
  const onRegion = (val: HolidayRegion) => {
    setRegion(val);
    persist({ region: val });
  };

  // Preview: next 5 upcoming holidays for the selected region
  const today = isoDate(new Date());
  const yearAhead = isoDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
  const upcoming = getHolidaysInRange(region, today, yearAhead).slice(0, 5);

  return (
    <Card title="Public Holidays" description="Show public holidays in the rota and calendar views.">
      <div className={s.row}>
        <div>
          <div className={s.label}>Enable public holidays</div>
          <div className={s.help}>Display holidays as informational context. Does not block scheduling.</div>
        </div>
        <input
          type="checkbox"
          className={s.toggle}
          checked={enabled}
          disabled={!canEdit || saving}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label="Enable public holidays"
        />
      </div>

      {enabled && (
        <>
          <div className={s.row}>
            <div>
              <div className={s.label}>Region</div>
              <div className={s.help}>Choose the holiday calendar that applies to your business.</div>
            </div>
            <div className={s.regionSelect}>
              <Field>
                <Select
                  value={region}
                  disabled={!canEdit || saving}
                  onChange={(e) => onRegion(e.target.value as HolidayRegion)}
                >
                  {HOLIDAY_REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <div className={s.preview}>
            <div className={s.previewTitle}>Upcoming holidays</div>
            {upcoming.length === 0 ? (
              <div className={s.disabledMsg}>No upcoming holidays in the next 12 months.</div>
            ) : (
              <div className={s.previewList}>
                {upcoming.map((h) => (
                  <div key={h.id} className={s.previewItem}>
                    <span>{h.name}</span>
                    <span className={s.previewDate}>{fmtDate(new Date(h.date), 'EEE d MMM yyyy')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!canEdit && (
        <div className={s.disabledMsg}>Only owners and managers can change these settings.</div>
      )}
    </Card>
  );
}
