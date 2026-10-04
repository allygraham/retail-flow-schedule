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
await load('20261004100000_add_employee_working_days.sql');
await load('20261004100000_add_employee_working_days.sql');
let passed=0;
async function check(name,task){await task();console.log('PASS:',name);passed++;}
await check('existing employees have no guessed pattern',async()=>{
 assert.equal((await act(employee,'SELECT working_days FROM employee_profiles WHERE user_id=$1',[employee])).rows[0].working_days,null);
});
await check('active manager can set part-time working weekdays',async()=>{
 await act(manager,'UPDATE employee_profiles SET working_days=$1 WHERE user_id=$2',[[1,3,5],employee]);
 assert.deepEqual((await act(employee,'SELECT working_days FROM employee_profiles WHERE user_id=$1',[employee])).rows[0].working_days,[1,3,5]);
});
await check('employee cannot change own working pattern through API',async()=>{
 const {rows}=await act(employee,'UPDATE employee_profiles SET working_days=$1 WHERE user_id=$2 RETURNING id',[[0,6],employee]);assert.equal(rows.length,0);
 assert.deepEqual((await db.query('SELECT working_days FROM employee_profiles WHERE user_id=$1',[employee])).rows[0].working_days,[1,3,5]);
});
await check('employee cannot read a colleague’s pattern',async()=>{
 assert.equal((await act(employee,'SELECT working_days FROM employee_profiles WHERE user_id=$1',[manager])).rows.length,0);
});
await check('invalid, duplicate, empty, multidimensional or null-containing patterns are rejected',async()=>{
 for(const pattern of ['{}','{7}','{-1}','{1,1}','{NULL}','{{1,2},{3,4}}']) await assert.rejects(()=>act(manager,'UPDATE employee_profiles SET working_days=$1::smallint[] WHERE user_id=$2',[pattern,employee]),e=>e.code==='23514');
});
await check('owner can configure weekends and seven-day patterns',async()=>{
 for(const pattern of [[0,6],[0,1,2,3,4,5,6]]) {
 await act(owner,'UPDATE employee_profiles SET working_days=$1 WHERE user_id=$2',[pattern,employee]);
 assert.deepEqual((await db.query('SELECT working_days FROM employee_profiles WHERE user_id=$1',[employee])).rows[0].working_days,pattern);
 }
});
await check('deactivated manager cannot change working days',async()=>{
 await db.query('UPDATE memberships SET is_active=false WHERE user_id=$1',[manager]);
 assert.equal((await act(manager,'UPDATE employee_profiles SET working_days=$1 WHERE user_id=$2 RETURNING id',[[1],employee])).rows.length,0);
});
console.log(`${passed} working-pattern database checks passed.`);
await db.close();
