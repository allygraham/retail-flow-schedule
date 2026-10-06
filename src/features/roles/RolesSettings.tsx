import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { FormEvent, useCallback, useRef, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/authContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { EmptyState } from '@/components/common/EmptyState';
import { useAsyncData } from '@/hooks/useAsyncData';
import { assertQueryResults } from '@/lib/queryResults';
import { DataLoadError } from '@/components/common/DataLoadError';
import { errorMessage } from '@/lib/errors';
import { toast } from 'sonner';

interface RoleRow {
  id: string;
  name: string;
  color: string | null;
  in_use: boolean;
}

const PRESET_COLORS = [
  '#6366f1', '#a855f7', '#ec4899', '#ef4444',
  '#f59e0b', '#10b981', '#0ea5e9', '#475569',
];

export function RolesSettings() {
  const { business, hasPermission } = useAuth();
  const canManage = hasPermission('manage_settings');

  const submitting = useRef(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const fetchRoles = useCallback(async (): Promise<RoleRow[]> => {
    if (!business || !canManage) return [];
    const results = await Promise.all([
      supabase.from('roles_catalog').select('id, name, color').eq('business_id', business.id).order('name'),
      supabase.from('employee_profiles').select('primary_role_id').eq('business_id', business.id),
    ]);
    assertQueryResults(...results);
    const [roles, profiles] = results;
    const usedIds = new Set((profiles.data ?? []).map(p => p.primary_role_id));
    return (roles.data ?? []).map(r => ({ ...r, in_use: usedIds.has(r.id) }));
  }, [business, canManage]);
  const { data, error: loadError, loading, reload: load } = useAsyncData(fetchRoles, 'Could not load job roles and assignments. Please try again.');
  const rows = data ?? [];

  const mutate = async (action: () => Promise<void>) => {
    if (!business || !canManage || submitting.current || loading || loadError) return;
    submitting.current = true; setBusy(true);
    try { await action(); await load(); }
    catch (err) { toast.error(errorMessage(err, 'Could not update job roles. Please try again.')); }
    finally { submitting.current = false; setBusy(false); }
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { toast.error('Please enter a role name'); return; }
    if (rows.some(r => r.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('A role with that name already exists'); return;
    }
    await mutate(async () => {
      const { data, error } = await supabase.from('roles_catalog').insert({ business_id: business!.id, name: trimmed, color }).select('id');
      if (error) throw error;
      if (data?.length !== 1) throw new Error('Role was not added. Please try again.');
      setName(''); setColor(PRESET_COLORS[0]); toast.success('Role added');
    });
  };

  const startEdit = (r: RoleRow) => {
    setEditingId(r.id); setEditName(r.name); setEditColor(r.color ?? PRESET_COLORS[0]);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) { toast.error('Name required'); return; }
    await mutate(async () => {
      const { data, error } = await supabase.from('roles_catalog').update({ name: trimmed, color: editColor })
        .eq('id', editingId).eq('business_id', business!.id).select('id');
      if (error) throw error;
      if (data?.length !== 1) throw new Error('Role was not updated. It may have been removed or your access changed.');
      setEditingId(null); toast.success('Role updated');
    });
  };

  const remove = async (r: RoleRow) => {
    if (submitting.current || loading || loadError) return;
    if (r.in_use) { toast.error('This role is assigned to employees and cannot be deleted.'); return; }
    if (!confirm(`Delete role "${r.name}"?`)) return;
    await mutate(async () => {
      const { data, error } = await supabase.from('roles_catalog').delete().eq('id', r.id).eq('business_id', business!.id).select('id');
      if (error?.code === '23503') throw new Error('This role is still used by an employee, invitation or shift. Remove those assignments before deleting it.');
      if (error) throw error;
      if (data?.length !== 1) throw new Error('Role was not deleted. It may have been removed or your access changed.');
      toast.success('Role deleted');
    });
  };

  if (!canManage) return null;

  return (
    <Card title="Job roles" subtitle="Define the job roles you can assign to employees (e.g. Cashier, Supervisor).">
      <form
        onSubmit={onCreate}
        className="mb-4 grid gap-3 items-end grid-cols-1 sm:[grid-template-columns:1fr_auto_auto]"
      >
        <Field label="New role name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Visual Merchandiser" maxLength={60} />
        </Field>
        <Field label="Colour">
          <ColorSwatches value={color} onChange={setColor} />
        </Field>
        <Button type="submit" variant="primary" disabled={busy || loading || !!loadError || !name.trim()} className="w-full sm:w-auto justify-center">
          <Plus size={16} /> Add role
        </Button>
      </form>

      {loadError ? <DataLoadError message={loadError} retry={load} /> : loading ? (
        <LoadingSkeleton label="Loading roles" />
      ) : rows.length === 0 ? (
        <EmptyState title="No job roles yet" description="Add your first role above." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: 12,
                alignItems: 'center',
                padding: '10px 12px',
                border: '1px solid hsl(var(--border))',
                borderRadius: 10,
                background: 'hsl(var(--card))',
              }}
            >
              {editingId === r.id ? (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Input aria-label="Role name" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60} />
                    <ColorSwatches value={editColor} onChange={setEditColor} />
                  </div>
                  <Button variant="primary" loading={busy} onClick={saveEdit}>Save</Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: 4,
                      background: r.color ?? '#999', flex: '0 0 auto',
                      border: '1px solid hsl(var(--border))',
                    }} />
                    <span style={{ fontWeight: 500 }}>{r.name}</span>
                    {r.in_use && (
                      <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>· in use</span>
                    )}
                  </div>
                  <Button variant="ghost" disabled={busy} onClick={() => startEdit(r)}>Edit</Button>
                  <Button
                    variant="ghost"
                    onClick={() => remove(r)}
                    aria-label={`Delete role ${r.name}`}
                    disabled={busy || r.in_use}
                    title={r.in_use ? 'Assigned to employees' : 'Delete role'}
                  >
                    <Trash2 size={16} />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ColorSwatches({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Pick colour ${c}`}
          onClick={() => onChange(c)}
          style={{
            width: 24, height: 24, borderRadius: 6, background: c,
            border: value === c ? '2px solid hsl(var(--foreground))' : '1px solid hsl(var(--border))',
            cursor: 'pointer', padding: 0,
          }}
        />
      ))}
    </div>
  );
}
