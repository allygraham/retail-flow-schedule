import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CustomHolidayRow, PublicHoliday } from './types';

/** Fetches custom (per-business) holidays and exposes CRUD helpers. */
export function useCustomHolidays(businessId: string | null) {
  const [rows, setRows] = useState<CustomHolidayRow[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!businessId) {
      setRows([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('custom_holidays')
      .select('id, business_id, date, name, blocks_scheduling')
      .eq('business_id', businessId)
      .order('date');
    setLoading(false);
    if (error) {
      setRows([]);
      return;
    }
    setRows(data ?? []);
  }, [businessId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useCallback(
    async (input: { date: string; name: string; blocks_scheduling?: boolean }) => {
      if (!businessId) return { error: new Error('No business') };
      const { error } = await supabase.from('custom_holidays').insert({
        business_id: businessId,
        date: input.date,
        name: input.name.trim(),
        blocks_scheduling: input.blocks_scheduling ?? true,
      });
      if (!error) await reload();
      return { error };
    },
    [businessId, reload],
  );

  const update = useCallback(
    async (id: string, patch: { name?: string; blocks_scheduling?: boolean }) => {
      const cleaned: Record<string, unknown> = {};
      if (patch.name !== undefined) cleaned.name = patch.name.trim();
      if (patch.blocks_scheduling !== undefined) cleaned.blocks_scheduling = patch.blocks_scheduling;
      const { error } = await supabase.from('custom_holidays').update(cleaned).eq('id', id);
      if (!error) await reload();
      return { error };
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('custom_holidays').delete().eq('id', id);
      if (!error) await reload();
      return { error };
    },
    [reload],
  );

  return { rows, loading, reload, add, update, remove };
}

/** Convert a DB row to the unified PublicHoliday shape. */
export function customRowToHoliday(row: CustomHolidayRow): PublicHoliday {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    year: Number(row.date.slice(0, 4)),
    kind: 'custom',
    blocksScheduling: row.blocks_scheduling,
  };
}
