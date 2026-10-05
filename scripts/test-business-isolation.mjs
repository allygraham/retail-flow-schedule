// Run: node scripts/test-business-isolation.mjs
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
const labels = new Map([[owner,'Business A owner'],[manager,'Business A manager'],[employee,'Business A employee'],[outsider,'Business B owner'],[otherEmployee,'Business B employee']]);
let passed=0;
const check=async(name,task)=>{await task(); console.log('PASS:',name); passed++;};
const denied=(person,sql,args=[])=>assert.rejects(()=>act(person,sql,args),error=>error.code==='42501');
const snapshot=async()=> (await db.query("SELECT 'shifts' AS kind,id::text AS id,to_jsonb(s)::text AS data FROM shifts s UNION ALL SELECT 'profiles',id::text,to_jsonb(p)::text FROM employee_profiles p UNION ALL SELECT 'leave',id::text,to_jsonb(l)::text FROM leave_requests l ORDER BY kind,id")).rows;
for (const [person, foreign] of [[owner,otherBusiness],[manager,otherBusiness],[employee,otherBusiness],[outsider,business],[otherEmployee,business]]) {
 for(const table of ['employee_profiles','shifts','leave_requests','invitations','business_branding','custom_holidays','availability','store_locations','memberships','user_roles']) {
  await check(`${labels.get(person)} cannot read another business's ${table}`,async()=>assert.equal((await act(person,`SELECT business_id FROM ${table} WHERE business_id=$1`,[foreign])).rows.length,0));
 }
 for(const [table,patch] of [['employee_profiles','contracted_hours=99'],['shifts',"notes='tampered'"],['leave_requests',"reason='tampered'"],['business_branding',"display_name='tampered'"],['invitations',"status='revoked'"],['custom_holidays',"name='tampered'"]]) {
  await check(`${labels.get(person)} cannot update or delete another business's ${table}`,async()=>{
   assert.equal((await act(person,`UPDATE ${table} SET ${patch} WHERE business_id=$1 RETURNING business_id`,[foreign])).rows.length,0);
   assert.equal((await act(person,`DELETE FROM ${table} WHERE business_id=$1 RETURNING business_id`,[foreign])).rows.length,0);
  });
 }
 for(const rpc of ['get_rota_people','get_leave_requests']) await check(`${labels.get(person)} cannot call ${rpc} for another business`,()=>denied(person,`SELECT * FROM ${rpc}($1)`,[foreign]));
}
await check('legitimate owners and employees can still read their own business data',async()=>{
 for(const [person,tenant] of [[owner,business],[employee,business],[outsider,otherBusiness],[otherEmployee,otherBusiness]]) {
  assert.equal((await act(person,'SELECT business_id FROM business_branding WHERE business_id=$1',[tenant])).rows.length,1);
  assert.equal((await act(person,'SELECT business_id FROM shifts WHERE business_id=$1',[tenant])).rows.length,1);
  assert.equal((await act(person,'SELECT * FROM get_leave_requests($1)',[tenant])).rows.length,1);
 }
});
await check('notifications remain visible only to their recipient',async()=>{
 for(const person of [owner,manager,outsider]) assert.equal((await act(person,'SELECT id FROM notifications')).rows.length,0);
 for(const person of [employee,otherEmployee]) assert.equal((await act(person,'SELECT id FROM notifications')).rows.length,1);
});
await check('cross-business management RPCs fail without modifying data',async()=>{
 const before=await snapshot();
 const {rows:[shift]}=await db.query('SELECT id,updated_at FROM shifts WHERE business_id=$1',[otherBusiness]);
 const {rows:[leave]}=await db.query('SELECT id FROM leave_requests WHERE business_id=$1',[otherBusiness]);
 for(const person of [owner,manager,employee]) {
  await denied(person,"SELECT publish_rota_shifts($1,ARRAY[$2]::uuid[],'2026-11-02')",[otherBusiness,shift.id]);
  await denied(person,"SELECT move_rota_shift($1,$2,$3,'2026-11-03',$4)",[otherBusiness,shift.id,otherEmployee,shift.updated_at]);
  await denied(person,"SELECT review_employee_leave($1,$2,'approved')",[otherBusiness,leave.id]);
  await denied(person,"SELECT update_team_member($1,$2,$3,NULL,99,ARRAY[1]::smallint[])",[otherBusiness,otherEmployee,otherLocation]);
 }
 assert.deepEqual(await snapshot(),before);
});
await check('foreign record IDs cannot be smuggled into authorized-business RPCs',async()=>{
 const before=await snapshot();
 const {rows:[shift]}=await db.query('SELECT id,updated_at FROM shifts WHERE business_id=$1',[otherBusiness]);
 const {rows:[leave]}=await db.query('SELECT id FROM leave_requests WHERE business_id=$1',[otherBusiness]);
 for(const person of [owner,manager]) {
  await assert.rejects(()=>act(person,"SELECT publish_rota_shifts($1,ARRAY[$2]::uuid[],'2026-11-02')",[business,shift.id]),error=>error.code==='40001');
  await assert.rejects(()=>act(person,"SELECT move_rota_shift($1,$2,$3,'2026-11-03',$4)",[business,shift.id,employee,shift.updated_at]),error=>error.code==='40001');
  await denied(person,"SELECT review_employee_leave($1,$2,'approved')",[business,leave.id]);
  await denied(person,"SELECT update_team_member($1,$2,$3,NULL,99,ARRAY[1]::smallint[])",[business,otherEmployee,store]);
 }
 assert.deepEqual(await snapshot(),before);
});
await check('management cannot send notifications to foreign employees or change their notifications',async()=>{
 await denied(owner,"INSERT INTO notifications(business_id,user_id,type,title) VALUES($1,$2,'forged','Forged')",[business,otherEmployee]);
 for(const person of [owner,manager,employee]) {
  assert.equal((await act(person,'UPDATE notifications SET read_at=now() WHERE user_id=$1 RETURNING id',[otherEmployee])).rows.length,0);
  assert.equal((await act(person,'DELETE FROM notifications WHERE user_id=$1 RETURNING id',[otherEmployee])).rows.length,0);
 }
});
await check('owners cannot move branding into a business they do not manage',()=>denied(owner,'UPDATE business_branding SET business_id=$1 WHERE business_id=$2',[otherBusiness,business]));
await check('employees cannot create availability in another business using their own user ID',()=>denied(employee,"INSERT INTO availability(business_id,user_id,is_recurring,day_of_week) VALUES($1,$2,true,3)",[otherBusiness,employee]));

await check('forged cross-business inserts cannot create staff, invitations, branding or closures',async()=>{
 for(const person of [owner,manager,employee]) {
  await denied(person,"INSERT INTO invitations(business_id,email,role,token) VALUES($1,'forged@test.invalid','employee',$2)",[otherBusiness,uid(100)]);
  await denied(person,"INSERT INTO memberships(business_id,user_id) VALUES($1,$2)",[otherBusiness,newcomer]);
  await denied(person,"INSERT INTO business_branding(business_id,display_name) VALUES($1,'Forged') ON CONFLICT(business_id) DO UPDATE SET display_name=excluded.display_name",[otherBusiness]);
  await denied(person,"INSERT INTO custom_holidays(business_id,date,name) VALUES($1,'2026-12-24','Forged')",[otherBusiness]);
 }
});
await check('anonymous requests cannot read private tenant data or execute management RPCs',async()=>{
 await db.exec('SET ROLE anon');
 try {
  await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
  for(const table of ['employee_profiles','shifts','leave_requests','invitations','business_branding','memberships','notifications']) {
   await assert.rejects(()=>db.query(`SELECT business_id FROM ${table}`),error=>error.code==='42501');
  }
  await assert.rejects(()=>db.query("SELECT publish_rota_shifts($1,ARRAY[]::uuid[],'2026-11-02')",[business]),error=>error.code==='42501');
  await assert.rejects(()=>db.query('SELECT * FROM get_leave_requests($1)',[business]),error=>error.code==='42501');
 } finally {await db.exec('RESET ROLE');}
});
await check('manager role in one business does not grant management rights in another membership',async()=>{
 await db.query('INSERT INTO memberships(user_id,business_id) VALUES($1,$2)',[manager,otherBusiness]);
 await db.query("INSERT INTO user_roles(user_id,business_id,role) VALUES($1,$2,'employee')",[manager,otherBusiness]);
 assert.equal((await act(manager,'SELECT business_id FROM business_branding WHERE business_id=$1',[otherBusiness])).rows.length,1);
 assert.equal((await act(manager,'SELECT user_id FROM employee_profiles WHERE business_id=$1',[otherBusiness])).rows.length,0);
 await denied(manager,"SELECT update_team_member($1,$2,$3,NULL,99,ARRAY[1]::smallint[])",[otherBusiness,otherEmployee,otherLocation]);
 await denied(manager,"INSERT INTO invitations(business_id,email,role,token) VALUES($1,'role-leak@test.invalid','employee','role-leak')",[otherBusiness]);
});
await check('deactivation removes business access even while another membership remains active',async()=>{
 await db.query('UPDATE memberships SET is_active=false WHERE user_id=$1 AND business_id=$2',[manager,business]);
 for(const table of ['employee_profiles','shifts','leave_requests','invitations','business_branding','custom_holidays','availability','memberships','user_roles']) assert.equal((await act(manager,`SELECT business_id FROM ${table} WHERE business_id=$1`,[business])).rows.length,0);
 for(const rpc of ['get_rota_people','get_leave_requests']) await denied(manager,`SELECT * FROM ${rpc}($1)`,[business]);
 assert.equal((await act(manager,'SELECT business_id FROM business_branding WHERE business_id=$1',[otherBusiness])).rows.length,1);
});
console.log(`${passed} business isolation checks passed.`);
await db.close();
