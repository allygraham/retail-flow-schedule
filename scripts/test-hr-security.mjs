// Run: node scripts/test-leave-security.mjs
// Requires @electric-sql/pglite available to Node (install in a temporary test workspace).
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
await load('20260419141750_b3c3f056-971f-4664-af88-dc7a9aba466e.sql');
await load('20260519144634_1d8eab15-bcdb-4dbe-a4c7-aaf5f4351e3f.sql');
await load('20261003153000_prevent_self_assigned_ownership.sql');
await load('20261003154500_enforce_leave_approval_permissions.sql');
await db.query("INSERT INTO employee_profiles(user_id,business_id,hourly_rate,notes) VALUES ($1,$3,14,'Employee private'),($2,$3,25,'Manager private')",[employee,manager,business]);
await db.query("INSERT INTO leave_requests(user_id,business_id,start_date,end_date,reason,manager_note,sickness_meta,created_by_user_id,created_by_role) VALUES ($1,$3,'2026-11-02','2026-11-03','My request','Private management note','{\"medical\":\"private\"}',$1,'employee'),($2,$3,'2026-11-04','2026-11-05','Peer absence','Other private note',NULL,$2,'employee')",[employee,manager,business]);
await load('20261003160000_protect_hr_data_and_active_access.sql');
await load('20261003160000_protect_hr_data_and_active_access.sql');
let passed=0;
async function check(name,task){await task(); console.log('PASS:',name); passed++;}
const denied = (sql,args=[])=>assert.rejects(()=>act(employee,sql,args),e=>e.code==='42501');
await check('employee can read only own employment',async()=>{
 const {rows}=await act(employee,'SELECT user_id,hourly_rate FROM employee_profiles WHERE business_id=$1',[business]);
 assert.deepEqual(rows.map(r=>r.user_id),[employee]); assert.equal(Number(rows[0].hourly_rate),14);
});
await check('employee cannot read internal employment notes',()=>denied('SELECT notes FROM employee_profiles'));
await check('employee cannot update pay, contract, entitlement, role, store or notes',async()=>{
 for(const patch of ["hourly_rate=100","contracted_hours=100","annual_leave_entitlement=100","employment_type='part_time'","primary_role_id=NULL","primary_store_id=NULL","notes='forged'"]){
 const {rows}=await act(employee,`UPDATE employee_profiles SET ${patch} WHERE user_id=$1 RETURNING id`,[employee]); assert.equal(rows.length,0);
 }
 const {rows:[row]}=await db.query('SELECT hourly_rate,notes FROM employee_profiles WHERE user_id=$1',[employee]);
 assert.equal(Number(row.hourly_rate),14); assert.equal(row.notes,'Employee private');
});
await check('manager can read and update team employment',async()=>{
 assert.equal((await act(manager,'SELECT user_id,hourly_rate FROM employee_profiles WHERE business_id=$1',[business])).rows.length,2);
 assert.equal((await act(manager,'UPDATE employee_profiles SET hourly_rate=15 WHERE user_id=$1 RETURNING id',[employee])).rows.length,1);
});
await check('employee cannot read colleague absence records',async()=>{
 const {rows}=await act(employee,'SELECT user_id,reason FROM leave_requests WHERE business_id=$1',[business]);assert.deepEqual(rows.map(r=>r.user_id),[employee]);
});
await check('private health and manager fields cannot be queried directly',async()=>{
 for(const column of ['sickness_meta','manager_note','lifecycle_status']) await denied(`SELECT ${column} FROM leave_requests`);
});
await check('employee leave endpoint masks private fields',async()=>{
 const {rows}=await act(employee,'SELECT * FROM get_leave_requests($1)',[business]);assert.equal(rows.length,1);
 assert.equal(rows[0].reason,'My request');assert.equal(rows[0].manager_note,null);assert.equal(rows[0].sickness_meta,null);
});
await check('active managers retain private leave access',async()=>{
 const {rows}=await act(manager,'SELECT * FROM get_leave_requests($1)',[business]);assert.equal(rows.length,2);
 assert.equal(rows.find(r=>r.user_id===employee).manager_note,'Private management note');
});
await check('rota directory exposes only public staff details',async()=>{
 const {rows}=await act(employee,'SELECT * FROM get_rota_people($1)',[business]); assert.equal(rows.length,2);
 assert.deepEqual(Object.keys(rows[0]).sort(),['id','user_id','primary_role_id','primary_store_id','full_name','store_ids'].sort());
});
await check('outsiders cannot use staff or absence endpoints',async()=>{
 for(const rpc of ['get_rota_people','get_leave_requests']) await assert.rejects(()=>act(outsider,`SELECT * FROM ${rpc}($1)`,[business]),e=>e.code==='42501');
});
await check('invitation acceptance still creates active membership',async()=>{
 await act(manager,"INSERT INTO invitations(business_id,email,role,token) VALUES($1,'new@test.invalid','employee','hr-invite')",[business]);
 await act(newcomer,"SELECT accept_invitation('hr-invite')");
 assert.equal((await act(newcomer,'SELECT is_member($1,$2) AS allowed',[newcomer,business])).rows[0].allowed,true);
});
await check('workspace bootstrap still creates owner membership',async()=>{
 const {rows:[row]}=await act(outsider,"SELECT bootstrap_business('Other business','other-business') AS id");
 assert.equal((await act(outsider,"SELECT has_role($1,$2,'owner') AS allowed",[outsider,row.id])).rows[0].allowed,true);
});
await db.query('UPDATE memberships SET is_active=false WHERE user_id=$1 AND business_id=$2',[manager,business]);
await check('deactivated management role grants no permissions',async()=>{
 const {rows:[row]}=await act(manager,"SELECT has_role($1,$2,'manager') AS role,is_manager_or_owner($1,$2) AS management,has_permission($1,$2,'manage_staff') AS staff",[manager,business]);
 assert.deepEqual(row,{role:false,management:false,staff:false});
});
await check('deactivated manager cannot read or update tenant records',async()=>{
 for(const sql of ['SELECT id FROM employee_profiles','SELECT id FROM leave_requests','SELECT id FROM memberships','SELECT id FROM invitations','SELECT id FROM store_locations','SELECT id FROM businesses']) assert.equal((await act(manager,sql)).rows.length,0);
 assert.equal((await act(manager,'UPDATE employee_profiles SET hourly_rate=99 RETURNING id')).rows.length,0);
 await assert.rejects(()=>act(manager,"INSERT INTO invitations(business_id,email,role,token) VALUES($1,'no@test.invalid','employee','inactive-invite')",[business]),e=>e.code==='42501');
});
await check('deactivated manager cannot use directory or private leave endpoint',async()=>{
 for(const rpc of ['get_rota_people','get_leave_requests']) await assert.rejects(()=>act(manager,`SELECT * FROM ${rpc}($1)`,[business]),e=>e.code==='42501');
});
await check('deactivated owner loses settings permission',async()=>{
 assert.equal((await act(inactiveOwner,"SELECT is_owner($1,$2) AS owner,has_permission($1,$2,'manage_settings') AS settings",[inactiveOwner,business])).rows[0].settings,false);
});
await check('migration supports production schema without optional sickness fields',async()=>{
 await db.exec('ALTER TABLE leave_requests DROP COLUMN sickness_meta, DROP COLUMN lifecycle_status');
 await load('20261003160000_protect_hr_data_and_active_access.sql');
 assert.equal((await act(employee,'SELECT * FROM get_leave_requests($1)',[business])).rows.length,1);
});
console.log(`${passed} HR privacy and active membership checks passed.`);
await db.close();
