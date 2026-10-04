// Run: npm run test:leave-history
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

await db.exec(readFileSync(new URL('20260422081703_8014993c-de37-45fc-92dc-d0beb86327ab.sql', root),'utf8').split('DROP POLICY IF EXISTS')[0]);
await load('20260422091912_659bb9f0-2c89-4363-af54-31b2b76e9c22.sql');
await load('20260423100633_299f01c4-479a-4226-96f7-bc0f607131e7.sql');
// Match production: sickness columns are absent before the repair.
await load('20260420140153_8c1679c1-075b-4ba9-9dc9-cd01dbd9654a.sql');
await load('20261003153000_prevent_self_assigned_ownership.sql');
await load('20261003154500_enforce_leave_approval_permissions.sql');
await load('20260419141750_b3c3f056-971f-4664-af88-dc7a9aba466e.sql');
await load('20261003160000_protect_hr_data_and_active_access.sql');
await db.query("INSERT INTO store_locations(id,business_id,name) VALUES ($1,$3,'Main store'),($2,$3,'Second store')",[uid(10),uid(11),business]);
const store=uid(10),otherStore=uid(11);
await db.query('INSERT INTO employee_profiles(user_id,business_id,primary_store_id) VALUES ($1,$3,$4),($2,$3,$4)',[employee,manager,business,store]);
await load('20261004103000_validate_shifts_and_atomic_moves.sql');
await load('20261004103000_validate_shifts_and_atomic_moves.sql');

await load('20261004100000_add_employee_working_days.sql');
await load('20261004120000_atomic_leave_and_private_notes.sql');
await db.query('UPDATE employee_profiles SET working_days=ARRAY[1,3,5]::smallint[]');
// Create historical approved leave before the snapshot migration.
const record=(actor=owner,type='annual',subject=employee,date='2026-11-02')=>act(actor,'SELECT * FROM record_employee_leave($1,$2,$3,$4,$5)',[business,subject,type,date,date==='2026-11-02'?'2026-11-08':date]);
const historical=(await record()).rows[0].leave_id;
await load('20261004130000_leave_cancellation_and_charge_history.sql');
await load('20261004130000_leave_cancellation_and_charge_history.sql');
const fetch=async(id)=>(await db.query('SELECT * FROM leave_requests WHERE id=$1',[id])).rows[0];
const cancel=(id,actor=owner,biz=business)=>act(actor,'SELECT cancel_leave_request($1,$2)',[biz,id]);
const pending=async(actor=employee)=> (await act(actor,"INSERT INTO leave_requests(business_id,user_id,start_date,end_date,created_by_user_id,created_by_role) VALUES($1,$2,'2026-11-09','2026-11-15',$2,'employee') RETURNING id",[business,actor])).rows[0].id;
const review=(id,actor=owner,status='approved')=>act(actor,'SELECT * FROM review_employee_leave($1,$2,$3)',[business,id,status]);
const clear=()=>db.exec('DELETE FROM leave_requests');
let passed=0;const check=async(name,task)=>{await task();console.log('PASS:',name);passed++;};
const denied=(task,code='42501')=>assert.rejects(task,e=>e.code===code);
await check('historical approved leave receives a stable baseline',async()=>{
 assert.deepEqual((await fetch(historical)).charged_working_days,[1,3,5]);
 await db.query('UPDATE employee_profiles SET working_days=ARRAY[2,4]::smallint[] WHERE user_id=$1',[employee]);
 assert.deepEqual((await fetch(historical)).charged_working_days,[1,3,5]);
});await clear();
await check('owner can cancel management-created leave and retain approval audit',async()=>{
 const id=(await record()).rows[0].leave_id;const before=await fetch(id);await cancel(id);const after=await fetch(id);
 assert.equal(after.status,'cancelled');assert.equal(after.approved_by,before.approved_by);assert.equal(after.source,'owner_created');
});await clear();
await check('active manager can cancel leave for another employee',async()=>{
 const id=(await record(manager)).rows[0].leave_id;await cancel(id,manager);assert.equal((await fetch(id)).status,'cancelled');
});await clear();
await check('employee cannot cancel management-created leave by RPC or direct API',async()=>{
 const id=(await record()).rows[0].leave_id;await denied(()=>cancel(id,employee));await act(employee,"UPDATE leave_requests SET status='cancelled' WHERE id=$1",[id]);assert.equal((await fetch(id)).status,'approved');
});await clear();
await check('inactive management and outsiders cannot cancel leave',async()=>{
 const id=(await record()).rows[0].leave_id;for(const actor of [inactiveOwner,outsider])await denied(()=>cancel(id,actor));await denied(()=>cancel(id,owner,uid(999)));
});await clear();
await check('manager cannot cancel their own management-created leave',async()=>{
 const id=(await record(owner,'unpaid',manager)).rows[0].leave_id;await denied(()=>cancel(id,manager));
});await clear();
await check('employee can withdraw own pending and approved requests',async()=>{
 let id=await pending();await cancel(id,employee);assert.equal((await fetch(id)).status,'cancelled');
 await clear();id=await pending();await review(id);await cancel(id,employee);assert.equal((await fetch(id)).status,'cancelled');
});await clear();
await check('rejected and cancelled requests cannot be cancelled again',async()=>{
 let id=await pending();await review(id,owner,'rejected');await denied(()=>cancel(id),'40001');await denied(()=>act(owner,"UPDATE leave_requests SET status='cancelled' WHERE id=$1",[id]),'23514');
 await clear();id=await pending();await cancel(id);await denied(()=>cancel(id),'40001');await denied(()=>act(owner,"UPDATE leave_requests SET status='pending' WHERE id=$1",[id]),'23514');
});await clear();
await check('pending request captures the pattern in force at approval',async()=>{
 const id=await pending();assert.equal((await fetch(id)).charged_working_days,null);
 await db.query('UPDATE employee_profiles SET working_days=ARRAY[0,6]::smallint[] WHERE user_id=$1',[employee]);
 await review(id);assert.deepEqual((await fetch(id)).charged_working_days,[0,6]);
 await db.query('UPDATE employee_profiles SET working_days=ARRAY[1,2,3,4,5]::smallint[] WHERE user_id=$1',[employee]);
 assert.deepEqual((await fetch(id)).charged_working_days,[0,6]);
});await clear();
await check('management recording captures new pattern while old approved leave remains unchanged',async()=>{
 const first=(await record()).rows[0].leave_id;
 await db.query('UPDATE employee_profiles SET working_days=ARRAY[2,4]::smallint[] WHERE user_id=$1',[employee]);
 const second=(await record(owner,'annual',employee,'2026-11-09')).rows[0].leave_id;
 assert.deepEqual((await fetch(first)).charged_working_days,[1,2,3,4,5]);assert.deepEqual((await fetch(second)).charged_working_days,[2,4]);
});await clear();
await check('clients cannot override saved deductions',async()=>{
 const id=await pending();await denied(()=>act(employee,'UPDATE leave_requests SET charged_working_days=ARRAY[0]::smallint[] WHERE id=$1',[id]));await review(id);
 const before=(await fetch(id)).charged_working_days;await act(owner,'UPDATE leave_requests SET charged_working_days=ARRAY[0]::smallint[] WHERE id=$1',[id]);assert.deepEqual((await fetch(id)).charged_working_days,before);
});await clear();
await check('new annual approvals require working days; unpaid leave remains available',async()=>{
 await db.query('UPDATE employee_profiles SET working_days=NULL WHERE user_id=$1',[employee]);await denied(()=>record(),'23514');await record(owner,'unpaid');
});await clear();
await check('historical records missing a pattern are initialised once when configured',async()=>{
 // Simulate an already-approved pre-migration record with an unknown pattern.
 await db.exec('ALTER TABLE leave_requests DISABLE TRIGGER capture_leave_working_days');
 const id=(await record()).rows[0].leave_id;await db.exec('ALTER TABLE leave_requests ENABLE TRIGGER capture_leave_working_days');
 assert.equal((await fetch(id)).charged_working_days,null);
 await db.query('UPDATE employee_profiles SET working_days=ARRAY[1,3]::smallint[] WHERE user_id=$1',[employee]);assert.deepEqual((await fetch(id)).charged_working_days,[1,3]);
 await db.query('UPDATE employee_profiles SET working_days=ARRAY[2,4]::smallint[] WHERE user_id=$1',[employee]);assert.deepEqual((await fetch(id)).charged_working_days,[1,3]);
});
await check('own leave RPC exposes saved pattern but keeps internal fields private',async()=>{
 const [l]=(await act(employee,'SELECT * FROM get_leave_requests($1)',[business])).rows;assert.deepEqual(l.charged_working_days,[1,3]);assert.equal(l.manager_note,null);
});
console.log(`${passed} medium-priority database checks passed.`);await db.close();
