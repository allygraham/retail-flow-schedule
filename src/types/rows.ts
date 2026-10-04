import type { Tables } from '@/integrations/supabase/types';

export type ShiftRow = Tables<'shifts'>;
export type ShiftWithNames = ShiftRow & {
  store_locations: { name: string } | null;
  roles_catalog: { name: string } | null;
};
export interface RotaPerson {
  user_id: string;
  name: string;
  primary_role_id: string | null;
  primary_store_id: string | null;
  store_ids: string[];
}
