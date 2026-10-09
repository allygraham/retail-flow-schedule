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

await load('20261007200000_business_leave_year.sql');
await load('20261009150000_workspace_onboarding.sql');
let passed=0;
const check=async(name,task)=>{await task();console.log('PASS:',name);passed++;};
const status=async(actor=owner,tenant=business)=>(await act(actor,'SELECT get_onboarding_status($1) data',[tenant])).rows[0].data;
const update=async(action,actor=owner,step=null,tenant=business)=>(await act(actor,'SELECT update_onboarding($1,$2,$3) data',[tenant,action,step])).rows[0].data;
await check('owner setup derives actual stores, team and publication, not arbitrary exploration',async()=>{
 const current=await status();assert.ok(current.completed.includes('stores'));assert.ok(current.completed.includes('team'));assert.ok(current.completed.includes('publish'));assert.ok(!current.completed.includes('policy'));
 await assert.rejects(()=>update('explore',owner,'policy'),e=>e.code==='23514');
 await assert.rejects(()=>update('explore',employee,'publish'),e=>e.code==='23514');
});
await check('welcome is saved once and preferences are private to each user',async()=>{
 assert.equal((await status()).welcomed,false);await update('welcome');assert.equal((await status()).welcomed,true);
 assert.equal((await status(employee)).welcomed,false);await update('hide');assert.equal((await status()).hidden,true);
 assert.equal((await status(employee)).hidden,false);await update('show');assert.equal((await status()).hidden,false);
});
await check('exploration is idempotent and does not create leave or change a profile',async()=>{
 const leaves=(await db.query('SELECT count(*)::int n FROM leave_requests')).rows[0].n;
 await update('explore',employee,'profile');await update('explore',employee,'profile');await update('explore',employee,'rota');
 assert.deepEqual((await status(employee)).completed,['profile','rota']);
 assert.equal((await db.query('SELECT count(*)::int n FROM leave_requests')).rows[0].n,leaves);
 assert.equal((await status()).completed.includes('profile'),false);
});
await check('tenant isolation and inactive membership are enforced by both RPCs',async()=>{
 for (const operation of [()=>status(employee,otherBusiness),()=>update('welcome',employee,null,otherBusiness),()=>status(inactiveOwner),()=>update('welcome',inactiveOwner)]) await assert.rejects(operation,e=>e.code==='42501');
 assert.equal((await status(outsider,otherBusiness)).welcomed,false);
});
await check('role changes create an independent checklist',async()=>{
 await update('welcome',manager);await update('explore',manager,'team');await update('hide',manager);
 assert.ok((await status(manager)).completed.includes('team'));
 await db.query("UPDATE user_roles SET role='employee' WHERE user_id=$1 AND business_id=$2",[manager,business]);
 const changed=await status(manager);assert.equal(changed.hidden,false);assert.equal(changed.welcomed,false);assert.deepEqual(changed.completed,[]);
 await db.query("UPDATE user_roles SET role='manager' WHERE user_id=$1 AND business_id=$2",[manager,business]);assert.equal((await status(manager)).hidden,true);
});
await check('successful policy save completes setup even when retaining the default',async()=>{
 await act(owner,"UPDATE businesses SET leave_year_mode='calendar',leave_year_start_date=NULL WHERE id=$1",[business]);
 assert.ok((await status()).completed.includes('policy'));
});
await check('failed policy writes do not mark setup complete',async()=>{
 await db.query('DELETE FROM business_onboarding WHERE business_id=$1',[otherBusiness]);
 await assert.rejects(()=>act(outsider,"UPDATE businesses SET leave_year_mode='financial',leave_year_start_date=NULL WHERE id=$1",[otherBusiness]));
 assert.equal((await status(outsider,otherBusiness)).completed.includes('policy'),false);
});
await check('employees cannot forge setup flags through direct table writes',async()=>{
 for (const table of ['membership_onboarding','business_onboarding']) {
 await assert.rejects(()=>act(employee,`SELECT * FROM ${table}`),e=>e.code==='42501');
 await assert.rejects(()=>act(employee,`DELETE FROM ${table}`),e=>e.code==='42501');
 }
 await assert.rejects(()=>update('invalid',employee),e=>e.code==='23514');
 await assert.rejects(()=>update('explore',employee,null),e=>e.code==='23514');
});
await check('admins have setup guidance without staff exploration milestones',async()=>{
 await db.query("INSERT INTO user_roles(user_id,business_id,role) VALUES($1,$2,'admin')",[owner,business]);
 // Owner precedence is stable even if a legacy duplicate role exists.
 assert.ok((await status()).completed.includes('policy'));
 await db.query("INSERT INTO memberships(user_id,business_id,is_active) VALUES($1,$2,true)",[newcomer,business]);
 await db.query("INSERT INTO user_roles(user_id,business_id,role) VALUES($1,$2,'admin')",[newcomer,business]);
 assert.ok((await status(newcomer)).completed.includes('stores'));await assert.rejects(()=>update('explore',newcomer,'profile'),e=>e.code==='23514');
});
await check('anonymous users cannot access onboarding RPCs',async()=>{
 await db.exec('SET ROLE anon');try {await assert.rejects(()=>db.query('SELECT get_onboarding_status($1)',[business]),e=>e.code==='42501');}finally{await db.exec('RESET ROLE');}
});
console.log(`All ${passed} onboarding database checks passed.`);await db.close();
