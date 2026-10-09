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
let passed=0;
const check=async(name,task)=>{await task();console.log('PASS:',name);passed++;};
const payroll=async(person=owner,start='2026-11-01',end='2026-11-30',tenant=business)=>({rows:(await act(person,'SELECT get_payroll_export($1,$2,$3) data',[tenant,start,end])).rows[0].data});
const denied=(person,tenant=business)=>assert.rejects(()=>payroll(person,'2026-11-01','2026-11-30',tenant),e=>e.code==='42501');
await check('only active Owners/Admins export, with tenant isolation',async()=>{
 await denied(employee);await denied(manager);await denied(inactiveOwner);await denied(outsider);
 await denied(owner,otherBusiness);
 await db.query("INSERT INTO shifts(business_id,store_id,assigned_user_id,shift_date,start_time,end_time,is_published) VALUES($1,$2,$3,current_date-40,'09:00','17:00',true)",[business,store,manager]);
 await act(owner,"SELECT set_business_role($1,$2,'admin')",[business,manager]);
 assert.equal((await payroll(manager)).rows.length,1);
});
await check('becoming an Admin preserves payroll inputs from earlier employment',async()=>{
 const {rows:[r]}=await payroll(owner,(await db.query("SELECT (current_date-40)::text AS report_date")).rows[0].report_date,(await db.query("SELECT (current_date-40)::text AS report_date")).rows[0].report_date);
 assert.equal(r.user_id,manager);assert.equal(r.scheduled_minutes,480);
});
await check('exports published assigned shifts only and subtracts breaks exactly',async()=>{
 await db.query('UPDATE shifts SET break_minutes=30 WHERE business_id=$1',[business]);
 await db.query("INSERT INTO shifts(business_id,store_id,assigned_user_id,shift_date,start_time,end_time,is_published) VALUES($1,$2,$3,'2026-11-03','09:00','16:35',true),($1,$2,$3,'2026-11-05','09:00','17:00',false),($1,$2,null,'2026-11-06','09:00','17:00',true)",[business,store,employee]);
 const {rows:[r]}=await payroll(); assert.equal(r.shift_count,2); assert.equal(r.scheduled_minutes,905);
 assert.equal(r.email,'employee@test.invalid'); assert.equal(r.sickness_days,0); assert.equal(r.annual_leave_days,0);
 assert.deepEqual(Object.keys(r).sort(),['annual_leave_days','email','full_name','scheduled_minutes','shift_count','sickness_days','user_id'].sort());
});
await check('period boundaries are inclusive and cancellations are excluded',async()=>{
 const {rows:[r]}=await payroll(owner,'2026-11-02','2026-11-02');assert.equal(r.scheduled_minutes,450);
 await db.query("UPDATE shifts SET status='cancelled' WHERE business_id=$1 AND shift_date='2026-11-03'",[business]);
 assert.equal((await payroll()).rows[0].shift_count,1);
 assert.equal((await payroll(owner,'2026-12-01','2026-12-31')).rows.length,0);
});
await check('former employees remain in historical payroll',async()=>{
 await act(owner,'UPDATE memberships SET is_active=false WHERE user_id=$1 AND business_id=$2',[employee,business]);
 assert.equal((await payroll()).rows[0].user_id,employee);
 await act(owner,'UPDATE memberships SET is_active=true WHERE user_id=$1 AND business_id=$2',[employee,business]);
});
await check('leave uses saved working days and clamps to the requested period',async()=>{
 // Two overlapping historical requests exercise deduplication without operational shift side effects.
 await db.exec('ALTER TABLE leave_requests DISABLE TRIGGER authorize_leave_request_write; ALTER TABLE leave_requests DISABLE TRIGGER validate_leave_request_write; ALTER TABLE leave_requests DISABLE TRIGGER capture_leave_working_days');
 await db.query("INSERT INTO leave_requests(business_id,user_id,leave_type,status,start_date,end_date,charged_working_days,reason,manager_note) VALUES($1,$2,'annual','approved','2026-10-30','2026-11-06',ARRAY[1,3,5]::smallint[],'Private reason','Medical note'),($1,$2,'annual','approved','2026-11-04','2026-11-06',ARRAY[1,3,5]::smallint[],null,null),($1,$2,'sick','approved','2026-11-20','2026-12-02',null,null,null),($1,$2,'sick','approved','2026-11-23','2026-11-24',null,null,null)",[business,employee]);
 await db.exec('ALTER TABLE leave_requests ENABLE TRIGGER authorize_leave_request_write; ALTER TABLE leave_requests ENABLE TRIGGER validate_leave_request_write; ALTER TABLE leave_requests ENABLE TRIGGER capture_leave_working_days');
 // Changing the live working pattern must not change approved annual leave deductions.
 await db.query('UPDATE employee_profiles SET working_days=ARRAY[0,6]::smallint[] WHERE user_id=$1 AND business_id=$2',[employee,business]);
 const {rows:[r]}=await payroll();assert.equal(r.annual_leave_days,3);assert.equal(r.sickness_days,11);
 assert(!JSON.stringify(r).includes('Medical note'));assert(!JSON.stringify(r).includes('Private reason'));
});
await check('missing saved patterns prevent a misleading export',async()=>{
 await db.exec('ALTER TABLE leave_requests DISABLE TRIGGER capture_leave_working_days; ALTER TABLE leave_requests DISABLE TRIGGER validate_leave_request_write');
 await db.query("UPDATE leave_requests SET charged_working_days=NULL WHERE business_id=$1 AND leave_type='annual' AND status='approved'",[business]);
 await db.exec('ALTER TABLE leave_requests ENABLE TRIGGER capture_leave_working_days; ALTER TABLE leave_requests ENABLE TRIGGER validate_leave_request_write');
 await assert.rejects(()=>payroll(),e=>e.code==='23514'&&e.message.includes('saved working pattern'));
});
await check('invalid ranges are rejected, with a bounded reporting period',async()=>{
 for(const [start,end] of [[null,'2026-11-01'],['2026-11-01',null],['2026-11-02','2026-11-01'],['2025-01-01','2026-11-01']]) await assert.rejects(()=>payroll(owner,start,end),e=>e.code==='23514');
});
await check('Admin deactivation removes export access immediately',async()=>{
 await act(owner,'UPDATE memberships SET is_active=false WHERE user_id=$1 AND business_id=$2',[manager,business]);await denied(manager);
});
await check('anonymous execution is not granted',async()=>{
 assert.equal((await db.query("SELECT has_function_privilege('anon','public.get_payroll_export(uuid,date,date)','EXECUTE') allowed")).rows[0].allowed,false);
});
console.log(`${passed} payroll export checks passed`);await db.close();
