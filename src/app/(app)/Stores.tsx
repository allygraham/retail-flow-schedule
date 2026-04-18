import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Field, Input } from '@/components/common/Field';
import { EmptyState } from '@/components/common/EmptyState';
import { storeSchema } from '@/lib/validation';
import s from './Stores.module.scss';

export default function Stores() {
  const { business, role } = useAuth();
  const isMgr = role === 'owner' || role === 'manager';
  const [stores, setStores] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: '', address: '', city: '', postcode: '' });
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    if (!business) return;
    const { data } = await supabase.from('store_locations').select('*').eq('business_id', business.id).order('name');
    setStores(data ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [business]);

  const save = async () => {
    setErr(null);
    const parsed = storeSchema.safeParse(form);
    if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
    const { error } = await supabase.from('store_locations').insert({ ...parsed.data, business_id: business!.id } as any);
    if (error) { setErr(error.message); return; }
    setOpen(false); setForm({ name:'',address:'',city:'',postcode:'' }); load();
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div><span className={s.eye}>Stores</span><h1 className={s.h1}>Your locations</h1></div>
        {isMgr && <Button onClick={() => setOpen(true)}>Add store</Button>}
      </header>
      {stores.length === 0 ? (
        <Card><EmptyState title="No stores yet" description="Add your first location." /></Card>
      ) : (
        <div className={s.grid}>
          {stores.map(st => (
            <Card key={st.id} title={st.name} subtitle={st.city}>
              <div className={s.meta}>{st.address ?? '—'}<br/>{st.postcode}</div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add store"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        <div className={s.form}>
          <Field label="Name"><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></Field>
          <Field label="Address"><Input value={form.address} onChange={e => setForm({...form, address: e.target.value})}/></Field>
          <div className={s.row2}>
            <Field label="City"><Input value={form.city} onChange={e => setForm({...form, city: e.target.value})}/></Field>
            <Field label="Postcode"><Input value={form.postcode} onChange={e => setForm({...form, postcode: e.target.value})}/></Field>
          </div>
          {err && <div className={s.err}>{err}</div>}
        </div>
      </Modal>
    </div>
  );
}
