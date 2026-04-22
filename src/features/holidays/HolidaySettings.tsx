import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Field, Input, Select } from '@/components/common/Field';
import { DatePicker, parseISODate, toISODate } from '@/components/common/DatePicker';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { fmtDate, isoDate } from '@/lib/datetime';
import { HOLIDAY_REGIONS, type HolidayRegion } from './types';
import { getHolidaysInRange } from './holidayService';
import { useCustomHolidays } from './useCustomHolidays';
import s from './HolidaySettings.module.scss';

export function HolidaySettings() {
  const { business, refresh, hasPermission } = useAuth();
  const canEdit = hasPermission('manage_settings');
  const [enabled, setEnabled] = useState<boolean>(!!business?.public_holidays_enabled);
  const [region, setRegion] = useState<HolidayRegion>(
    (business?.public_holidays_region as HolidayRegion) ?? 'england',
  );
  const [saving, setSaving] = useState(false);

  // Custom holiday form state
  const { rows: customs, add, remove } = useCustomHolidays(business?.id ?? null);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [newBlocks, setNewBlocks] = useState(true);
  const [adding, setAdding] = useState(false);

  if (!business) return null;

  const persist = async (next: { enabled?: boolean; region?: HolidayRegion }) => {
    if (!canEdit) return;
    setSaving(true);
    const payload: { public_holidays_enabled?: boolean; public_holidays_region?: string } = {};
    if (next.enabled !== undefined) payload.public_holidays_enabled = next.enabled;
    if (next.region !== undefined) payload.public_holidays_region = next.region;
    const { data, error } = await supabase
      .from('businesses')
      .update(payload)
      .eq('id', business.id)
      .select('id');
    setSaving(false);
    if (error || !data || data.length === 0) {
      toast.error(error?.message ?? 'You do not have permission to change these settings.');
      setEnabled(!!business.public_holidays_enabled);
      setRegion((business.public_holidays_region as HolidayRegion) ?? 'england');
      return;
    }
    toast.success('Public holiday settings saved');
    await refresh();
  };

  const onToggle = (val: boolean) => { setEnabled(val); persist({ enabled: val }); };
  const onRegion = (val: HolidayRegion) => { setRegion(val); persist({ region: val }); };

  const onAddCustom = async () => {
    if (!canEdit) return;
    const name = newName.trim();
    if (!newDate || !name) {
      toast.error('Date and name are required.');
      return;
    }
    if (name.length > 100) {
      toast.error('Name must be 100 characters or less.');
      return;
    }
    if (customs.some((c) => c.date === newDate)) {
      toast.error('A custom holiday already exists for that date.');
      return;
    }
    setAdding(true);
    const { error } = await add({ date: newDate, name, blocks_scheduling: newBlocks });
    setAdding(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Custom holiday added');
    setNewDate(''); setNewName(''); setNewBlocks(true);
  };

  const onRemoveCustom = async (id: string) => {
    if (!canEdit) return;
    const { error } = await remove(id);
    if (error) toast.error(error.message);
    else toast.success('Custom holiday removed');
  };

  const today = isoDate(new Date());
  const yearAhead = isoDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
  const upcoming = enabled ? getHolidaysInRange(region, today, yearAhead).slice(0, 5) : [];
  const upcomingCustom = customs.filter((c) => c.date >= today).slice(0, 12);

  return (
    <Card title="Public Holidays" subtitle="Show public holidays in the rota and calendar views.">
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
            <div className={s.previewTitle}>Upcoming public holidays</div>
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

      {/* ---------- Custom (company) holidays ---------- */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <div>
            <div className={s.label}>Company holidays</div>
            <div className={s.help}>
              Add business-specific closure days (e.g. shutdowns). Marked dates can block scheduling.
            </div>
          </div>
        </div>

        {canEdit && (
          <div className={s.addRow}>
            <Field label="Date">
              <DatePicker
                value={parseISODate(newDate)}
                onChange={(d) => setNewDate(toISODate(d))}
                minDate={new Date(today)}
                disabled={adding}
                placeholder="Pick a date"
              />
            </Field>
            <Field label="Name">
              <Input
                type="text"
                value={newName}
                placeholder="e.g. Christmas shutdown"
                maxLength={100}
                onChange={(e) => setNewName(e.target.value)}
                disabled={adding}
              />
            </Field>
            <label className={s.blocksLabel}>
              <input
                type="checkbox"
                checked={newBlocks}
                onChange={(e) => setNewBlocks(e.target.checked)}
                disabled={adding}
              />
              <span>Block scheduling</span>
            </label>
            <Button variant="primary" onClick={onAddCustom} disabled={adding} leading={<Plus size={14} />}>
              Add
            </Button>
          </div>
        )}

        {upcomingCustom.length === 0 ? (
          <div className={s.disabledMsg}>No upcoming company holidays.</div>
        ) : (
          <div className={s.customList}>
            {upcomingCustom.map((c) => (
              <div key={c.id} className={s.customItem}>
                <div className={s.customMain}>
                  <span className={s.customName}>{c.name}</span>
                  {c.blocks_scheduling && <Badge tone="danger" dot>Blocks scheduling</Badge>}
                </div>
                <span className={s.previewDate}>{fmtDate(new Date(c.date), 'EEE d MMM yyyy')}</span>
                {canEdit && (
                  <button
                    type="button"
                    className={s.removeBtn}
                    onClick={() => onRemoveCustom(c.id)}
                    aria-label={`Remove ${c.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!canEdit && (
        <div className={s.disabledMsg}>Only the owner can change these settings.</div>
      )}
    </Card>
  );
}
