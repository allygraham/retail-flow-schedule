import { FormEvent, useEffect, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { EmptyState } from '@/components/common/EmptyState';
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

  const [rows, setRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const load = async () => {
    if (!business) return;
    setLoading(true);
    const [{ data: roles, error }, { data: profiles }] = await Promise.all([
      supabase
        .from('roles_catalog')
        .select('id, name, color')
        .eq('business_id', business.id)
        .order('name', { ascending: true }),
      supabase
        .from('employee_profiles')
        .select('primary_role_id')
        .eq('business_id', business.id),
    ]);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const usedIds = new Set((profiles ?? []).map((p) => p.primary_role_id).filter(Boolean) as string[]);
    setRows((roles ?? []).map((r) => ({ ...r, in_use: usedIds.has(r.id) })));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [business?.id]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!business || !canManage) return;
    const trimmed = name.trim();
    if (!trimmed) { toast.error('Please enter a role name'); return; }
    if (rows.some((r) => r.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('A role with that name already exists'); return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('roles_catalog')
      .insert({ business_id: business.id, name: trimmed, color });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setName(''); setColor(PRESET_COLORS[0]);
    toast.success('Role added');
    load();
  };

  const startEdit = (r: RoleRow) => {
    setEditingId(r.id); setEditName(r.name); setEditColor(r.color ?? PRESET_COLORS[0]);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) { toast.error('Name required'); return; }
    const { error } = await supabase
      .from('roles_catalog')
      .update({ name: trimmed, color: editColor })
      .eq('id', editingId);
    if (error) { toast.error(error.message); return; }
    setEditingId(null);
    toast.success('Role updated');
    load();
  };

  const remove = async (r: RoleRow) => {
    if (r.in_use) { toast.error('This role is assigned to employees and cannot be deleted.'); return; }
    if (!confirm(`Delete role "${r.name}"?`)) return;
    const { error } = await supabase.from('roles_catalog').delete().eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Role deleted');
    load();
  };

  if (!canManage) return null;

  return (
    <Card title="Job roles" subtitle="Define the job roles you can assign to employees (e.g. Cashier, Supervisor).">
      <form onSubmit={onCreate} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'end', marginBottom: 16 }}>
        <Field label="New role name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Visual Merchandiser" maxLength={60} />
        </Field>
        <Field label="Colour">
          <ColorSwatches value={color} onChange={setColor} />
        </Field>
        <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
          <Plus size={16} /> Add role
        </Button>
      </form>

      {loading ? (
        <div style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))' }}>Loading…</div>
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
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60} />
                    <ColorSwatches value={editColor} onChange={setEditColor} />
                  </div>
                  <Button variant="primary" onClick={saveEdit}>Save</Button>
                  <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
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
                  <Button variant="ghost" onClick={() => startEdit(r)}>Edit</Button>
                  <Button
                    variant="ghost"
                    onClick={() => remove(r)}
                    disabled={r.in_use}
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
    <div style={{ display: 'flex', gap: 6 }}>
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
