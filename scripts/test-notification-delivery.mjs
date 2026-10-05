// Run: npm run test:reliability
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
await db.exec(readFileSync(new URL('20260419182657_421d0a6f-8a54-4318-baeb-63ba9e8832b1.sql',root),'utf8').split('ALTER PUBLICATION')[0]);
await db.exec('GRANT ALL ON notifications TO authenticated');
await load('20261004130000_leave_cancellation_and_charge_history.sql');
await load('20261004140000_atomic_publish_and_team_edits.sql');
await load('20261004140000_atomic_publish_and_team_edits.sql');

await load('20261005190000_retryable_coverage_notifications.sql');
await load('20261005190000_retryable_coverage_notifications.sql');
const shift = async (date) => (await act(owner,"INSERT INTO shifts(business_id,store_id,shift_date,start_time,end_time,status) VALUES($1,$2,$3,'09:00','17:00','unassigned') RETURNING id",[business,store,date])).rows[0].id;
const first=await shift('2026-11-02'), second=await shift('2026-11-03');
const send=(recipients,actor=owner,biz=business)=>act(actor,'SELECT * FROM notify_coverage_staff($1,$2::jsonb)',[biz,JSON.stringify(recipients)]);
const rows = [{user_id:employee,shift_ids:[first,second]},{user_id:manager,shift_ids:[second]}];
let passed=0;
const check=async(name,fn)=>{await fn();console.log('PASS:',name);passed++;};
const count=async(table)=>(await db.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n;
await check('delivery uses correct shift details for each recipient',async()=>{
 assert.deepEqual((await send(rows)).rows[0],{sent_count:2,already_sent_count:0});
 const notes=(await db.query('SELECT * FROM notifications')).rows;
 assert.equal(notes.length,2);
 assert.match(notes.find(n=>n.user_id===employee).body,/2026-11-02/);
 assert.doesNotMatch(notes.find(n=>n.user_id===manager).body,/2026-11-02/);
});
await check('lost response retry and reordered shifts cannot duplicate notices',async()=>{
 const retry=[{user_id:manager,shift_ids:[second]},{user_id:employee,shift_ids:[second,first,first]}];
 assert.deepEqual((await send(retry)).rows[0],{sent_count:0,already_sent_count:2});
 assert.equal(await count('notifications'),2);
});
await check('read and deleted notifications cannot be resent by retry',async()=>{
 await act(employee,"UPDATE notifications SET read_at=now()");
 await act(manager,'DELETE FROM notifications');
 assert.deepEqual((await send(rows)).rows[0],{sent_count:0,already_sent_count:2});
 assert.equal(await count('notifications'),1);
});
await check('changed shift times produce a fresh notice',async()=>{
 await act(owner,"UPDATE shifts SET end_time='18:00' WHERE id=$1",[second]);
 assert.deepEqual((await send(rows)).rows[0],{sent_count:2,already_sent_count:0});
});
await check('unauthorized employees and inactive managers cannot send',async()=>{
 await assert.rejects(()=>send(rows,employee),e=>e.code==='42501');
 await db.query('UPDATE memberships SET is_active=false WHERE user_id=$1',[manager]);
 await assert.rejects(()=>send(rows,manager),e=>e.code==='42501');
 await db.query('UPDATE memberships SET is_active=true WHERE user_id=$1',[manager]);
});
await check('foreign and inactive recipients abort the entire batch',async()=>{
 const before=await count('notifications');
 await assert.rejects(()=>send([{user_id:employee,shift_ids:[first]}, {user_id:outsider,shift_ids:[first]}]),e=>e.code==='42501');
 await assert.rejects(()=>send([{user_id:inactiveOwner,shift_ids:[first]}]),e=>e.code==='42501');
 assert.equal(await count('notifications'),before);
});
await check('foreign or cancelled shifts are rejected without receipts',async()=>{
 const before=await count('notification_deliveries');
 await assert.rejects(()=>send([{user_id:employee,shift_ids:[uid(999)]}]),e=>e.code==='40001');
 await act(owner,"UPDATE shifts SET status='cancelled' WHERE id=$1",[first]);
 await assert.rejects(()=>send([{user_id:employee,shift_ids:[first]}]),e=>e.code==='40001');
 assert.equal(await count('notification_deliveries'),before);
});
await check('notification insert failure rolls back all deliveries and permits retry',async()=>{
 await act(owner,"UPDATE shifts SET end_time='19:00' WHERE id=$1",[second]);
 const beforeNotes=await count('notifications'), beforeReceipts=await count('notification_deliveries');
 await db.exec(`CREATE FUNCTION fail_coverage_notice() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN IF NEW.user_id='${manager}' THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER fail_coverage_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fail_coverage_notice();`);
 const retry=[{user_id:employee,shift_ids:[second]},{user_id:manager,shift_ids:[second]}];
 await assert.rejects(()=>send(retry),e=>e.code==='23514');
 assert.equal(await count('notifications'),beforeNotes);
 assert.equal(await count('notification_deliveries'),beforeReceipts);
 await db.exec('DROP TRIGGER fail_coverage_notice ON notifications');
 assert.deepEqual((await send(retry)).rows[0],{sent_count:2,already_sent_count:0});
});
await check('recipients cannot inspect or modify private delivery receipts',async()=>{
 await assert.rejects(()=>act(employee,'SELECT * FROM notification_deliveries'),e=>e.code==='42501');
 await assert.rejects(()=>act(employee,'DELETE FROM notification_deliveries'),e=>e.code==='42501');
});
console.log(passed+' notification delivery checks passed.');
await db.close();
