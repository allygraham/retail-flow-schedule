// Run: npm run test:leave-transactions
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

await db.query("INSERT INTO leave_requests(business_id,user_id,start_date,end_date,status,source,created_by_user_id,created_by_role,approved_by,approved_at,manager_note,review_notes) VALUES($1,$2,'2026-10-01','2026-10-01','approved','owner_created',$3,'owner',$3,now(),'Private medical detail','Private medical detail')",[business,employee,owner]);
await load('20261004120000_atomic_leave_and_private_notes.sql');
await load('20261004120000_atomic_leave_and_private_notes.sql');
await load('20261004100000_add_employee_working_days.sql');
await db.exec('UPDATE employee_profiles SET working_days=ARRAY[1,2,3,4,5]::smallint[]');
await db.query('INSERT INTO employee_profiles(user_id,business_id,working_days) VALUES($1,$2,ARRAY[1,2,3,4,5]::smallint[])',[owner,business]);
await load('20261004130000_leave_cancellation_and_charge_history.sql');
let passed=0;
const check=async(name,task)=>{await task();console.log('PASS:',name);passed++;};
const denied=(task,code='42501')=>assert.rejects(task,e=>e.code===code);
const record=(actor=owner,type='annual',date='2026-11-02',subject=employee)=>act(actor,"SELECT * FROM record_employee_leave($1,$2,$3,$4,$4,'Reason','Internal detail',$5,NULL)",[business,subject,type,date,type==='sick'?{self_certified:true}:null]);
const pending=async()=> (await act(employee,"INSERT INTO leave_requests(business_id,user_id,start_date,end_date,source,created_by_user_id,created_by_role) VALUES($1,$2,'2026-11-02','2026-11-02','employee_request',$2,'employee') RETURNING id",[business,employee])).rows[0].id;
const review=(id,status='approved',actor=owner)=>act(actor,'SELECT * FROM review_employee_leave($1,$2,$3,$4)',[business,id,status,'Approved feedback']);
const shift=async(date='2026-11-02',status='scheduled',subject=employee)=> (await act(owner,"INSERT INTO shifts(business_id,store_id,assigned_user_id,shift_date,start_time,end_time,status) VALUES($1,$2,$3,$4,'09:00','17:00',$5) RETURNING id",[business,store,subject,date,status])).rows[0].id;
const clear=()=>db.exec('DELETE FROM shifts;DELETE FROM leave_requests;');
const rows=async(table)=>(await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
await check('historical copied feedback is removed without deleting the internal note',async()=>{
 const [l]=await rows('leave_requests');assert.equal(l.review_notes,null);assert.equal(l.manager_note,'Private medical detail');
 await act(owner,"UPDATE leave_requests SET manager_note='Edited private detail' WHERE id=$1",[l.id]);
 const [own]=(await act(employee,'SELECT * FROM get_leave_requests($1)',[business])).rows;
 assert.equal(own.review_notes,null);assert.equal(own.manager_note,null);
});await clear();
await check('production schema repair supports annual, unpaid and sickness recording',async()=>{
 for(const [i,type] of ['annual','unpaid','sick'].entries())await record(owner,type,`2026-11-0${i+2}`);
 const list=await rows('leave_requests');assert.equal(list.length,3);
 const sick=list.find(x=>x.leave_type==='sick');assert.deepEqual(sick.sickness_meta,{self_certified:true});assert.equal(sick.lifecycle_status,'recorded_absence');
 for(const l of list){assert.equal(l.review_notes,null);assert.equal(l.approved_by,owner);assert.equal(l.created_by_role,'owner');}
});await clear();
await check('internal and health notes cannot be read by employees through RPC or table API',async()=>{
 await record(owner,'sick');const [l]=(await act(employee,'SELECT * FROM get_leave_requests($1)',[business])).rows;
 assert.equal(l.manager_note,null);assert.equal(l.sickness_meta,null);assert.equal(l.lifecycle_status,null);assert.equal(l.review_notes,null);
 for(const col of ['manager_note','review_notes','sickness_meta','lifecycle_status'])await denied(()=>act(employee,`SELECT ${col} FROM leave_requests`));
 const [full]=(await act(owner,'SELECT * FROM get_leave_requests($1)',[business])).rows;assert.equal(full.manager_note,'Internal detail');assert.ok(full.sickness_meta);
});await clear();
await check('direct API cannot reintroduce the exact internal-note copy',async()=>{
 await record();await act(owner,"UPDATE leave_requests SET review_notes='Internal detail'");assert.equal((await rows('leave_requests'))[0].review_notes,null);
});await clear();
await check('explicit employee-facing feedback remains visible',async()=>{
 const id=await pending();await review(id);const [l]=(await act(employee,'SELECT * FROM get_leave_requests($1)',[business])).rows;assert.equal(l.review_notes,'Approved feedback');
});await clear();
await check('employees, inactive owners and outsiders cannot record or review',async()=>{
 const id=await pending();for(const actor of [employee,inactiveOwner,outsider]){await denied(()=>record(actor,'annual','2026-11-03'));await denied(()=>review(id,'approved',actor));}
});await clear();
await check('manager self-recording is denied; owner self-recording is allowed',async()=>{
 await denied(()=>record(manager,'annual','2026-11-02',manager));await record(owner,'annual','2026-11-02',owner);
});await clear();
await check('management recording releases only matching active shifts',async()=>{
 const a=await shift();const cancelled=await shift('2026-11-02','cancelled');const outside=await shift('2026-11-03');const other=await shift('2026-11-02','scheduled',manager);
 const [result]=(await record(manager)).rows;assert.equal(result.released_shift_count,1);
 const list=await rows('shifts');assert.equal(list.find(x=>x.id===a).assigned_user_id,null);
 for(const id of [cancelled,outside])assert.equal(list.find(x=>x.id===id).assigned_user_id,employee);
 assert.equal(list.find(x=>x.id===cancelled).status,'cancelled');assert.equal(list.find(x=>x.id===other).assigned_user_id,manager);
});await clear();
await check('pending and rejected requests preserve shift assignments',async()=>{
 await shift();const id=await pending();assert.equal((await rows('shifts'))[0].assigned_user_id,employee);await review(id,'rejected');assert.equal((await rows('shifts'))[0].assigned_user_id,employee);
});await clear();
await check('approval preserves both dates of a one-day 28 November request',async()=>{
 const id=await pending();
 await act(employee,"UPDATE leave_requests SET start_date='2026-11-28',end_date='2026-11-28' WHERE id=$1",[id]);
 await review(id);
 const {rows:[leave]}=await db.query('SELECT start_date::text,end_date::text,status FROM leave_requests WHERE id=$1',[id]);
 assert.equal(leave.start_date,'2026-11-28');assert.equal(leave.end_date,'2026-11-28');assert.equal(leave.status,'approved');
});await clear();
await check('approval releases shifts and repeated reviews are rejected',async()=>{
 await shift();const id=await pending();assert.equal((await review(id)).rows[0].released_shift_count,1);assert.equal((await rows('shifts'))[0].assigned_user_id,null);await denied(()=>review(id),'40001');
});await clear();
await check('direct table approval is also atomic and prevents subsequent bookings',async()=>{
 await shift();const id=await pending();await act(owner,"UPDATE leave_requests SET status='approved' WHERE id=$1",[id]);assert.equal((await rows('shifts'))[0].assigned_user_id,null);await denied(()=>shift(),'23514');
});await clear();
await check('overlapping approved or pending leave cannot be recorded twice',async()=>{
 await pending();await denied(()=>record(),'23514');assert.equal((await rows('leave_requests')).length,1);
});await clear();
await db.exec(`CREATE FUNCTION fail_shift_release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.assigned_user_id IS NULL THEN RAISE EXCEPTION 'Injected shift release failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER injected_failure BEFORE UPDATE ON shifts FOR EACH ROW EXECUTE FUNCTION fail_shift_release();`);
await check('recording failure rolls back the leave and every shift change',async()=>{
 await shift();await shift('2026-11-02','scheduled',manager);await denied(()=>record(),'23514');assert.equal((await rows('leave_requests')).length,0);assert.equal((await rows('shifts')).find(x=>x.assigned_user_id===employee).status,'scheduled');
});await clear();
await check('RPC approval failure leaves request pending and shifts assigned',async()=>{
 await shift();const id=await pending();await denied(()=>review(id),'23514');const [l]=await rows('leave_requests');assert.equal(l.status,'pending');assert.equal(l.approved_by,null);assert.equal(l.review_notes,null);assert.equal((await rows('shifts'))[0].assigned_user_id,employee);
});await clear();
await check('direct approval failure also rolls back the request',async()=>{
 await shift();const id=await pending();await denied(()=>act(owner,"UPDATE leave_requests SET status='approved' WHERE id=$1",[id]),'23514');assert.equal((await rows('leave_requests'))[0].status,'pending');assert.equal((await rows('shifts'))[0].assigned_user_id,employee);
});await clear();
await db.exec(`CREATE SEQUENCE release_attempts; CREATE OR REPLACE FUNCTION fail_shift_release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.assigned_user_id IS NULL AND nextval('release_attempts')=2 THEN RAISE EXCEPTION 'Second shift release failed' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
 GRANT USAGE ON SEQUENCE release_attempts TO authenticated;`);
await check('failure on the second shift rolls back the first release too',async()=>{
 await shift();await shift('2026-11-03');const id=await pending();await act(employee,"UPDATE leave_requests SET end_date='2026-11-03' WHERE id=$1",[id]);
 await denied(()=>review(id),'23514');assert.equal((await rows('leave_requests'))[0].status,'pending');
 for(const s of await rows('shifts'))assert.equal(s.assigned_user_id,employee);
 assert.equal((await db.query('SELECT last_value::int AS count FROM release_attempts')).rows[0].count,2);
});await clear();
await db.exec(`CREATE OR REPLACE FUNCTION fail_shift_release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.assigned_user_id IS NULL THEN RAISE EXCEPTION 'Injected shift release failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;`);
await db.exec('DROP TRIGGER injected_failure ON shifts; CREATE CONSTRAINT TRIGGER injected_deferred_failure AFTER UPDATE ON shifts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_shift_release();');
await check('commit-time constraint failure rolls back approval and released shifts',async()=>{
 await shift();const id=await pending();await denied(()=>review(id),'23514');assert.equal((await rows('leave_requests'))[0].status,'pending');assert.equal((await rows('shifts'))[0].assigned_user_id,employee);
});await clear();
await db.exec('DROP TRIGGER injected_deferred_failure ON shifts');
await check('extending approved dates releases newly conflicting shifts',async()=>{
 await record();await shift('2026-11-03');await act(owner,"UPDATE leave_requests SET end_date='2026-11-03'");assert.equal((await rows('shifts'))[0].assigned_user_id,null);
});
console.log(`${passed} leave transaction and privacy checks passed.`);await db.close();
