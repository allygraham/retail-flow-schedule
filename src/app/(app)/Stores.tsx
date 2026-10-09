import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { DataLoadError } from '@/components/common/DataLoadError';
import { useAsyncData } from '@/hooks/useAsyncData';
import { assertQueryResults } from '@/lib/queryResults';
import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/authContext';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Field, Input } from '@/components/common/Field';
import { EmptyState } from '@/components/common/EmptyState';
import { errorMessage } from '@/lib/errors';
import { storeSchema } from '@/lib/validation';
import { MapPin, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import s from './Stores.module.scss';

export default function Stores() {
  const { business, hasPermission } = useAuth();
  const canManageStores = hasPermission('manage_stores');
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', city: '', postcode: '' });
  const [err, setErr] = useState<string | null>(null);

  const fetchStores = useCallback(async () => {
    if (!business) return [];
    const result = await supabase.from('store_locations').select('*').eq('business_id', business.id).order('name');
    assertQueryResults(result);
    return result.data ?? [];
  }, [business]);
  const { data, loading, error, reload: load } = useAsyncData(fetchStores, 'Could not load stores. Please try again.');
  const stores = data ?? [];

  const save = async () => {
    if (!business || !canManageStores || submitting.current) return;
    setErr(null);
    const parsed = storeSchema.safeParse(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])));
    if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
    submitting.current = true; setSaving(true);
    try {
      const values = parsed.data;
      const query = editingId
        ? supabase.from('store_locations').update(values).eq('id', editingId).eq('business_id', business.id)
        : supabase.from('store_locations').insert({ ...values, name: parsed.data.name.trim(), business_id: business.id });
      const { data, error } = await query.select('id');
      if (error) throw error;
      if (data?.length !== 1) throw new Error('Store was not saved. Please try again.');
      toast.success(editingId ? 'Store details updated' : 'Store added');
      setOpen(false); setEditingId(null); setForm({ name:'',address:'',city:'',postcode:'' }); void load();
    } catch (error) { setErr(errorMessage(error, 'Could not save store. Please try again.')); }
    finally { submitting.current = false; setSaving(false); }
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div><span className={s.eye}>Stores</span><h1 className={s.h1}>Your locations</h1><p className={s.intro}>Keep your store names and addresses up to date.</p></div>
        {canManageStores && <Button onClick={() => { setEditingId(null); setForm({ name: '', address: '', city: '', postcode: '' }); setErr(null); setOpen(true); }}>Add store</Button>}
      </header>
      {error ? <DataLoadError message={error} retry={load} /> : loading ? <LoadingSkeleton label="Loading stores" /> : stores.length === 0 ? (
        <Card><EmptyState title="No stores yet" description="Add your first location." /></Card>
      ) : (
        <div className={s.grid}>
          {stores.map(st => (
            <button key={st.id} type="button" className={s.storeCard} disabled={!canManageStores} aria-label={`Edit ${st.name}`} onClick={() => {
              if (!canManageStores) return;
              setEditingId(st.id); setErr(null);
              setForm({ name: st.name, address: st.address ?? '', city: st.city ?? '', postcode: st.postcode ?? '' }); setOpen(true);
            }}>
              <span className={s.cardHead}><span className={s.locationIcon}><MapPin size={22} aria-hidden="true" /></span><span className={s.status}>{st.is_active ? 'Active' : 'Inactive'}</span></span>
              <span className={s.storeName}>{st.name}</span>
              <span className={s.meta}>{[st.address, st.city, st.postcode].filter(Boolean).join(', ') || 'No address added yet'}</span>
              <span className={s.editCue}>Edit details <ArrowUpRight size={16} aria-hidden="true" /></span>
            </button>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => { if (!submitting.current) setOpen(false); }} title={editingId ? 'Edit store' : 'Add store'}
        footer={<><Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} loading={saving}>{editingId ? 'Save changes' : 'Add store'}</Button></>}>
        <div className={s.form}>
          <Field label="Name"><Input disabled={saving} value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></Field>
          <Field label="Address"><Input disabled={saving} value={form.address} onChange={e => setForm({...form, address: e.target.value})}/></Field>
          <div className={s.row2}>
            <Field label="City"><Input disabled={saving} value={form.city} onChange={e => setForm({...form, city: e.target.value})}/></Field>
            <Field label="Postcode"><Input disabled={saving} value={form.postcode} onChange={e => setForm({...form, postcode: e.target.value})}/></Field>
          </div>
          {err && <div role="alert" className={s.err}>{err}</div>}
        </div>
      </Modal>
    </div>
  );
}
