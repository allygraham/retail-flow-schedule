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
await load('20260519144634_1d8eab15-bcdb-4dbe-a4c7-aaf5f4351e3f.sql');
const submit = async (actor, patch={}) => {
 const data = { business_id:business, user_id:actor, source:'employee_request', created_by_user_id:actor,
 created_by_role:'employee', status:'pending', start_date:'2026-11-02', end_date:'2026-11-03', ...patch };
 const keys=Object.keys(data);
 return act(actor, `INSERT INTO leave_requests (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`, Object.values(data));
};
const update = (actor,id,patch) => {
 const keys=Object.keys(patch);
 return act(actor,`UPDATE leave_requests SET ${keys.map((key,i)=>key+'=$'+(i+1)).join(',')} WHERE id=$${keys.length+1} RETURNING *`,[...Object.values(patch),id]);
};
const {rows:[baseline]}=await submit(employee,{status:'approved'});
console.log('Confirmed baseline pre-approved employee INSERT.');
await db.query('DELETE FROM leave_requests WHERE id=$1',[baseline.id]);
await load('20261003154500_enforce_leave_approval_permissions.sql');
await load('20261003154500_enforce_leave_approval_permissions.sql');
let passed=0;
async function denied(name,task){await assert.rejects(task,e=>e.code==='42501'); console.log('PASS:',name);passed++;}
async function ok(name,task){await task();console.log('PASS:',name);passed++;}
await denied('employee cannot INSERT approved leave',()=>submit(employee,{status:'approved'}));
await denied('employee cannot INSERT rejected leave',()=>submit(employee,{status:'rejected'}));
await denied('employee cannot forge approval fields on INSERT',()=>submit(employee,{approved_by:owner,approved_at:new Date().toISOString()}));
await denied('employee cannot forge review fields on INSERT',()=>submit(employee,{reviewed_by:manager,reviewed_at:new Date().toISOString()}));
await denied('employee cannot forge management-created leave',()=>submit(employee,{source:'manager_created',created_by_role:'manager',status:'approved',approved_by:employee}));
await denied('inactive owner cannot submit leave',()=>submit(inactiveOwner));
await denied('outsider cannot submit leave',()=>submit(outsider));
const {rows:[pending]}=await submit(employee);
console.log('PASS: employee submits pending leave');passed++;
await denied('employee cannot approve own pending leave',()=>update(employee,pending.id,{status:'approved'}));
await denied('employee cannot reject own pending leave',()=>update(employee,pending.id,{status:'rejected'}));
await denied('employee cannot spoof approval attribution',()=>update(employee,pending.id,{approved_by:owner}));
await denied('employee cannot modify management notes',()=>update(employee,pending.id,{manager_note:'forged'}));
await denied('employee cannot switch request source',()=>update(employee,pending.id,{source:'manager_created'}));
await denied('employee cannot change subject identity',()=>update(employee,pending.id,{user_id:manager}));
await ok('employee edits pending request reason',()=>update(employee,pending.id,{reason:'Updated request'}));
const {rows:[approved]}=await update(manager,pending.id,{status:'approved',reviewed_by:employee,reviewed_at:'2020-01-01'});
assert.equal(approved.reviewed_by,manager);assert.equal(approved.approved_by,manager);
console.log('PASS: manager approves employee leave with database attribution');passed++;
await denied('employee cannot change dates after approval',()=>update(employee,pending.id,{end_date:'2026-11-20'}));
await ok('employee cancels own approved request',()=>update(employee,pending.id,{status:'cancelled'}));
await denied('employee cannot reopen cancelled leave',()=>update(employee,pending.id,{status:'pending'}));
const {rows:[cancel]}=await submit(employee);
await ok('employee cancels pending request',()=>update(employee,cancel.id,{status:'cancelled'}));
const {rows:[reject]}=await submit(employee);
await ok('manager rejects employee request',()=>update(manager,reject.id,{status:'rejected'}));
const {rows:[self]}=await submit(manager);
await denied('manager cannot approve own pending leave',()=>update(manager,self.id,{status:'approved'}));
await denied('manager cannot record approved leave for self',()=>submit(manager,{source:'manager_created',created_by_role:'manager',status:'approved',approved_by:manager}));
await denied('manager cannot change subject to bypass self-review',()=>update(manager,self.id,{user_id:employee,status:'approved'}));
await ok('owner approves manager request',()=>update(owner,self.id,{status:'approved'}));
await ok('manager records approved leave for employee',()=>submit(manager,{user_id:employee,source:'manager_created',created_by_role:'manager',status:'approved',approved_by:manager}));
const {rows:[own]}=await submit(owner);
await ok('owner retains existing own-request review permission',()=>update(owner,own.id,{status:'approved'}));
await ok('owner records management-created leave',()=>submit(owner,{user_id:employee,source:'owner_created',created_by_role:'owner',status:'approved',approved_by:owner}));
const {rows:[unreviewed]}=await submit(employee);
const inactiveUpdate=await update(inactiveOwner,unreviewed.id,{status:'approved'});
assert.equal(inactiveUpdate.rows.length,0);
console.log('PASS: inactive owner cannot review leave');passed++;
const otherUpdate=await update(outsider,unreviewed.id,{status:'approved'});
assert.equal(otherUpdate.rows.length,0);
console.log('PASS: outsider cannot review leave');passed++;
console.log(`${passed} leave permission checks passed.`);
await db.close();
