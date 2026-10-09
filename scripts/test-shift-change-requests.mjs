// Run: node scripts/test-payroll-export.mjs
// Isolated PostgreSQL fixture: never connects to production.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(process.env.SECURITY_TEST_PACKAGE_JSON || import.meta.url);
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const root = new URL('../supabase/migrations/', import.meta.url);
const load = (name) => db.exec(readFileSync(new URL(name, root), 'utf8'));
await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;`);
await load('20260418145239_9fbc6b74-99f1-441b-b3ea-9021aa1665ab.sql');
await load('20260418145257_7dd19197-291d-41f6-9d1a-4a3ff270e351.sql');
await load('20260419145756_0c1fc3d6-28a4-47d9-b54a-14fb9842fb54.sql');
await db.exec('GRANT USAGE ON SCHEMA public TO authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;');
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [owner, employee, manager, outsider, newcomer, inactiveOwner] = [1,2,3,4,5,6].map(uid);
await db.query("INSERT INTO auth.users (id,email) SELECT unnest($1::uuid[]), unnest($2::text[])", [[owner,employee,manager,outsider,newcomer,inactiveOwner], ['owner@test.invalid','employee@test.invalid','manager@test.invalid','outsider@test.invalid','new@test.invalid','inactive@test.invalid']]);
const act = async (user, sql, params=[]) => {
 await db.exec('SET ROLE authenticated');
 try { await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user]); return await db.query(sql, params); }
 finally { await db.exec('RESET ROLE'); }
};
const {rows:[{id:business}]} = await act(owner,"SELECT public.bootstrap_business('Test business','test-business') AS id");
await db.query('INSERT INTO memberships (user_id,business_id,is_active) VALUES ($1,$2,true),($3,$2,true),($4,$2,false)',[employee,business,manager,inactiveOwner]);
await db.query("INSERT INTO user_roles (user_id,business_id,role) VALUES ($1,$2,'employee'),($3,$2,'manager'),($4,$2,'owner')",[employee,business,manager,inactiveOwner]);

await db.exec(readFileSync(new URL('20260419205635_37868527-56f4-48f6-8195-63007ec902c7.sql', root),'utf8').split('-- 2. Storage')[0]);
await db.exec(readFileSync(new URL('20260422081703_8014993c-de37-45fc-92dc-d0beb86327ab.sql', root),'utf8').split('DROP POLICY IF EXISTS')[0]);
await load('20260422091912_659bb9f0-2c89-4363-af54-31b2b76e9c22.sql');
await load('20260423100633_299f01c4-479a-4226-96f7-bc0f607131e7.sql');
// Match production: sickness columns are absent before the repair.
await load('20260420140153_8c1679c1-075b-4ba9-9dc9-cd01dbd9654a.sql');
await load('20260420135211_fd441878-d834-46d4-87b9-f22f8a0c58cd.sql');
await load('20260422081703_8014993c-de37-45fc-92dc-d0beb86327ab.sql');
await load('20261003153000_prevent_self_assigned_ownership.sql');
await load('20261003154500_enforce_leave_approval_permissions.sql');
await load('20260419141750_b3c3f056-971f-4664-af88-dc7a9aba466e.sql');
await load('20261003160000_protect_hr_data_and_active_access.sql');
await db.query("INSERT INTO store_locations(id,business_id,name) VALUES ($1,$3,'Main store'),($2,$3,'Second store')",[uid(10),uid(11),business]);
const store=uid(10);
await db.query('INSERT INTO employee_profiles(user_id,business_id,primary_store_id) VALUES ($1,$3,$4),($2,$3,$4)',[employee,manager,business,store]);
await load('20261004103000_validate_shifts_and_atomic_moves.sql');
await load('20261004103000_validate_shifts_and_atomic_moves.sql');

await load('20261004100000_add_employee_working_days.sql');
await load('20261004120000_atomic_leave_and_private_notes.sql');
await db.query('UPDATE employee_profiles SET working_days=ARRAY[1,3,5]::smallint[]');
await db.exec(readFileSync(new URL('20260419182657_421d0a6f-8a54-4318-baeb-63ba9e8832b1.sql',root),'utf8').split('ALTER PUBLICATION')[0]);
await db.exec('GRANT ALL ON notifications TO authenticated');
await load('20261004130000_leave_cancellation_and_charge_history.sql');
await load('20261004140000_atomic_publish_and_team_edits.sql');
await load('20261004140000_atomic_publish_and_team_edits.sql');

await load('20261003160000_protect_hr_data_and_active_access.sql');
await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON business_branding,custom_holidays TO authenticated');
const { rows: [{ id: otherBusiness }] } = await act(outsider, "SELECT bootstrap_business('Other business','other-business') AS id");
const otherEmployee = uid(20), otherLocation = uid(21);
await db.query("INSERT INTO auth.users(id,email) VALUES($1,'otheremployee@test.invalid')", [otherEmployee]);
await db.query('INSERT INTO memberships(user_id,business_id) VALUES($1,$2)', [otherEmployee,otherBusiness]);
await db.query("INSERT INTO user_roles(user_id,business_id,role) VALUES($1,$2,'employee')", [otherEmployee,otherBusiness]);
await db.query("INSERT INTO store_locations(id,business_id,name) VALUES($1,$2,'Other store')", [otherLocation,otherBusiness]);
await db.query('INSERT INTO employee_profiles(user_id,business_id,primary_store_id,working_days) VALUES($1,$2,$3,ARRAY[1,3,5]::smallint[])', [otherEmployee,otherBusiness,otherLocation]);
for (const [tenant, person, location] of [[business, employee,store],[otherBusiness,otherEmployee,otherLocation]]) {
 await db.query("INSERT INTO business_branding(business_id,display_name) VALUES($1,'Private branding')", [tenant]);
 await db.query("INSERT INTO custom_holidays(business_id,date,name) VALUES($1,'2026-12-25','Closed')", [tenant]);
 await db.query("INSERT INTO invitations(business_id,email,role,token) VALUES($1,'invite@test.invalid','employee',$2)", [tenant,tenant]);
 await db.query("INSERT INTO shifts(business_id,store_id,assigned_user_id,shift_date,start_time,end_time,is_published) VALUES($1,$2,$3,'2026-11-02','09:00','17:00',true)", [tenant,location,person]);
 await db.query("INSERT INTO availability(business_id,user_id,is_recurring,day_of_week) VALUES($1,$2,true,2)", [tenant,person]);
 await db.query("INSERT INTO leave_requests(business_id,user_id,start_date,end_date,created_by_user_id,created_by_role) VALUES($1,$2,'2026-11-04','2026-11-04',$2,'employee')", [tenant,person]);
 await db.query("INSERT INTO notifications(business_id,user_id,type,title) VALUES($1,$2,'test','Private notification')", [tenant,person]);
}

await load('20261008090000_rota_week_publication.sql');
await load('20261009120000_add_admin_role.sql');
await load('20261009120100_admin_access_and_change_history.sql');
await load('20261009130000_payroll_export.sql');
await db.query('DELETE FROM availability WHERE business_id=$1',[business]);

await load('20261009140000_shift_change_requests.sql');
let passed=0;
const check=async(name,task)=>{await task();console.log('PASS:',name);passed++;};
const list=async(actor=owner,tenant=business)=>(await act(actor,'SELECT get_shift_change_requests($1) data',[tenant])).rows[0].data;
const change=async(action,actor=employee,request=null,patch={},tenant=business)=>{
 const args={_business_id:tenant,_action:action,_request_id:request?.id??null,_expected_updated_at:request?.updated_at??null,...patch};
 const keys=Object.keys(args);return (await act(actor,`SELECT change_shift_request(${keys.map((k,i)=>k+' => $'+(i+1)).join(',')}) id`,Object.values(args))).rows[0].id;
};
const current=async(id,actor=owner)=>(await list(actor)).find(r=>r.id===id);
const shift=async(person=employee,days=20,extra='')=>(await db.query(`INSERT INTO shifts(business_id,store_id,assigned_user_id,shift_date,start_time,end_time,is_published,notes) VALUES($1,$2,$3,current_date+$4::integer,'09:00','17:00',true,'private shift note') RETURNING *`,[business,store,person,days])).rows[0];
const reset=async()=>{await db.exec('DELETE FROM shift_change_requests;DELETE FROM shifts;DELETE FROM leave_requests;DELETE FROM notifications;DELETE FROM availability;');};
const proposal=async(swap=false)=>{
 const source=await shift(),target=swap?await shift(manager,21):null;
 const id=await change('create',employee,null,{_shift_id:source.id,_reason:'Personal appointment'});
 await change('propose',owner,await current(id),{_replacement_user_id:manager,_swap_shift_id:target?.id??null,_manager_note:'Private management note'});
 return {id,source,target};
};
const accept=async(id)=>{await change('accept',employee,await current(id));await change('accept',manager,await current(id));};
await reset();
await check('requests are own published upcoming shifts only, and duplicate requests fail',async()=>{
 const source=await shift();const other=await shift(manager,21);
 await assert.rejects(async()=>change('create',employee,null,{_shift_id:other.id,_reason:'test'}),e=>e.code==='42501');
 await db.query('UPDATE shifts SET is_published=false WHERE id=$1',[source.id]);
 await assert.rejects(async()=>change('create',employee,null,{_shift_id:source.id,_reason:'test'}),e=>e.code==='42501');
 await db.query('UPDATE shifts SET is_published=true WHERE id=$1',[source.id]);
 await assert.rejects(async()=>change('create',employee,null,{_shift_id:source.id,_reason:'  '}));
 await change('create',employee,null,{_shift_id:source.id,_reason:'Need a change'});
 await assert.rejects(async()=>change('create',employee,null,{_shift_id:source.id,_reason:'duplicate'}),e=>e.code==='23514');
 assert.equal((await list(manager)).length,1);
});
await reset();
await check('tenant isolation and direct table writes are denied',async()=>{
 const {id}=await proposal();assert.equal((await list(otherEmployee,otherBusiness)).length,0);
 await assert.rejects(()=>list(employee,otherBusiness),e=>e.code==='42501');
 await assert.rejects(async()=>change('confirm',outsider,await current(id),{},business),e=>e.code==='42501');
 await assert.rejects(()=>act(employee,'SELECT * FROM shift_change_requests'),e=>e.code==='42501');
 await assert.rejects(()=>act(employee,"UPDATE shift_change_requests SET status='completed'"),e=>e.code==='42501');
});
await reset();
await check('colleagues see the proposal but never private reasons, notes or unrelated requests',async()=>{
 const source=await shift();const id=await change('create',employee,null,{_shift_id:source.id,_reason:'Private reason'});
 // A normal employee who is not a manager cannot see another request.
 await db.query('INSERT INTO memberships(user_id,business_id,is_active) VALUES($1,$2,true)',[newcomer,business]);
 await db.query("INSERT INTO user_roles(user_id,business_id,role) VALUES($1,$2,'employee')",[newcomer,business]);
 await db.query('INSERT INTO employee_profiles(user_id,business_id,primary_store_id) VALUES($1,$2,$3)',[newcomer,business,store]);
 assert.equal((await list(newcomer)).length,0);
 await change('propose',owner,await current(id),{_replacement_user_id:newcomer,_manager_note:'Private note'});
 const visible=await current(id,newcomer);assert.equal(visible.reason,null);assert.equal(visible.manager_note,null);assert.equal(visible.source.notes,undefined);
 await assert.rejects(async()=>change('propose',newcomer,visible,{_replacement_user_id:manager}),e=>e.code==='42501');
});
await reset();
await check('cover requires both acceptances and final management confirmation',async()=>{
 const {id,source}=await proposal();
 await assert.rejects(async()=>change('confirm',owner,await current(id)),e=>e.code==='23514');
 await assert.rejects(async()=>change('accept',owner,await current(id)),e=>e.code==='42501');
 await accept(id);assert.equal((await current(id)).status,'ready');
 const notices=(await db.query('SELECT count(*)::int n FROM notifications')).rows[0].n;
 await change('accept',employee,await current(id));
 assert.equal((await db.query('SELECT count(*)::int n FROM notifications')).rows[0].n,notices);
 assert.equal((await db.query('SELECT assigned_user_id FROM shifts WHERE id=$1',[source.id])).rows[0].assigned_user_id,employee);
 await assert.rejects(async()=>change('confirm',employee,await current(id)),e=>e.code==='42501');
 await change('confirm',owner,await current(id));
 assert.equal((await db.query('SELECT assigned_user_id FROM shifts WHERE id=$1',[source.id])).rows[0].assigned_user_id,manager);
 assert.equal((await current(id)).status,'completed');
 await assert.rejects(async()=>change('confirm',owner,await current(id)),e=>e.code==='23514');
 assert.ok((await db.query("SELECT count(*)::int n FROM change_events WHERE entity_type='shift_change_requests'")).rows[0].n>0);
 assert.ok((await db.query("SELECT count(*)::int n FROM notifications WHERE title='Shift change confirmed'")).rows[0].n>=2);
});
await reset();
await check('swap updates assignments together and preserves shift dates and breaks',async()=>{
 const {id,source,target}=await proposal(true);await accept(id);await change('confirm',owner,await current(id));
 const rows=(await db.query('SELECT * FROM shifts WHERE id IN ($1,$2) ORDER BY shift_date',[source.id,target.id])).rows;
 assert.equal(rows[0].assigned_user_id,manager);assert.equal(rows[1].assigned_user_id,employee);
 assert.deepEqual(rows[0].shift_date,source.shift_date);assert.deepEqual(rows[1].shift_date,target.shift_date);
});
await reset();
await check('overlap failure rolls back both assignments, status and notifications',async()=>{
 const {id,source,target}=await proposal(true);await accept(id);await shift(employee,21);
 const before=(await db.query('SELECT count(*)::int n FROM notifications')).rows[0].n;
 await assert.rejects(async()=>change('confirm',owner,await current(id)),e=>e.code==='23514');
 assert.equal((await current(id)).status,'ready');
 assert.equal((await db.query('SELECT assigned_user_id FROM shifts WHERE id=$1',[source.id])).rows[0].assigned_user_id,employee);
 assert.equal((await db.query('SELECT assigned_user_id FROM shifts WHERE id=$1',[target.id])).rows[0].assigned_user_id,manager);
 assert.equal((await db.query('SELECT count(*)::int n FROM notifications')).rows[0].n,before);
});
await reset();
await check('new proposals reset acceptance and stale acceptance cannot approve a new proposal',async()=>{
 const {id}=await proposal();const stale=await current(id);await change('accept',employee,stale);
 await change('propose',owner,await current(id),{_replacement_user_id:newcomer});
 assert.equal((await current(id)).requester_accepted,false);
 await assert.rejects(async()=>change('accept',employee,stale),e=>e.code==='40001');
 assert.equal((await list(manager)).find(r=>r.id===id).replacement_accepted,false);
});
await reset();
await check('changed or deleted shifts cannot be confirmed',async()=>{
 const {id,source,target}=await proposal(true);await accept(id);
 await db.query("UPDATE shifts SET notes='Changed' WHERE id=$1",[source.id]);
 await assert.rejects(async()=>change('confirm',owner,await current(id)),e=>e.code==='40001');
 await change('cancel',employee,await current(id));
 await reset(); const next=await proposal(true);await accept(next.id);await db.query('DELETE FROM shifts WHERE id=$1',[next.target.id]);
 await assert.rejects(async()=>change('confirm',owner,await current(next.id)),e=>e.code==='40001');
});
await reset();
await check('store/role eligibility and deactivated access are rechecked',async()=>{
 const {id}=await proposal();await accept(id);
 await db.query('UPDATE employee_profiles SET primary_store_id=$1 WHERE user_id=$2 AND business_id=$3',[uid(11),manager,business]);
 await assert.rejects(async()=>change('confirm',owner,await current(id)),e=>e.code==='23514');
 await db.query('UPDATE employee_profiles SET primary_store_id=$1 WHERE user_id=$2 AND business_id=$3',[store,manager,business]);
 await db.query('UPDATE memberships SET is_active=false WHERE user_id=$1 AND business_id=$2',[manager,business]);
 await assert.rejects(async()=>change('confirm',owner,await current(id)),e=>e.code==='23514');
 await assert.rejects(()=>list(manager),e=>e.code==='42501');
 await db.query('UPDATE memberships SET is_active=true WHERE user_id=$1 AND business_id=$2',[manager,business]);
});
await reset();
await check('cancellation and decline leave the original rota intact',async()=>{
 const {id,source}=await proposal();await change('decline',manager,await current(id));assert.equal((await current(id)).status,'declined');
 assert.equal((await db.query('SELECT assigned_user_id FROM shifts WHERE id=$1',[source.id])).rows[0].assigned_user_id,employee);
 const another=await change('create',employee,null,{_shift_id:source.id,_reason:'new'});await change('cancel',employee,await current(another));assert.equal((await current(another)).status,'cancelled');
});
await reset();
await check('expired proposals are displayed as expired and cannot be accepted',async()=>{
 const {id}=await proposal();await db.query("UPDATE shift_change_requests SET source_details=jsonb_set(source_details,'{starts_at}',to_jsonb(now()-interval '1 minute')) WHERE id=$1",[id]);
 assert.equal((await current(id)).status,'expired');await assert.rejects(async()=>change('accept',employee,await current(id)),e=>e.code==='23514');
});
await reset();
await check('approval checks new approved leave and role eligibility',async()=>{
 const {id}=await proposal();await accept(id);
 await act(owner,"SELECT record_employee_leave($1,$2,'sick',current_date+20,current_date+20)",[business,manager]);
 await assert.rejects(async()=>change('confirm',owner,await current(id)),e=>e.code==='23514');
 await db.exec('DELETE FROM leave_requests');
 const role=uid(90);await db.query("INSERT INTO roles_catalog(id,business_id,name) VALUES($1,$2,'Specialist')",[role,business]);
 await db.query('UPDATE employee_profiles SET primary_role_id=$1 WHERE user_id=$2 AND business_id=$3',[role,employee,business]);
 const extra=await shift(employee,25);await db.query('UPDATE shifts SET role_id=$1 WHERE id=$2',[role,extra.id]);
 const next=await change('create',employee,null,{_shift_id:extra.id,_reason:'Need cover'});
 await assert.rejects(async()=>change('propose',owner,await current(next),{_replacement_user_id:manager}),e=>e.code==='23514');
});
await reset();
await check('contract and rest warnings are scoped to management',async()=>{
 await db.query('UPDATE employee_profiles SET contracted_hours=1 WHERE user_id=$1 AND business_id=$2',[manager,business]);
 const {id}=await proposal();
 const days=(await db.query("SELECT (current_date+20)::text date")).rows[0].date;
 await db.query("INSERT INTO shifts(business_id,store_id,assigned_user_id,shift_date,start_time,end_time,is_published) VALUES($1,$2,$3,$4::date+1,'00:00','02:00',true)",[business,store,manager,days]);
 const warnings=(await current(id)).warnings;assert.ok(warnings.some(w=>w.includes('contracted hours')));assert.ok(warnings.some(w=>w.includes('rest gap')));
 assert.deepEqual((await current(id,employee)).warnings,[]);
 await db.query('UPDATE employee_profiles SET contracted_hours=NULL WHERE user_id=$1 AND business_id=$2',[manager,business]);
});
await check('anonymous RPC execution is denied' ,async()=>{
 await db.exec('SET ROLE anon');try {await assert.rejects(()=>db.query('SELECT get_shift_change_requests($1)',[business]),e=>e.code==='42501');}finally{await db.exec('RESET ROLE');}
});
console.log(`All ${passed} shift change database checks passed.`);await db.close();
