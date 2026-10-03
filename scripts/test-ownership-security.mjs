// Run: node scripts/test-ownership-security.mjs
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
// Reproduce the vulnerability against the checked-in baseline.
await act(employee,"INSERT INTO user_roles(user_id,business_id,role) VALUES ($1,$2,'owner')",[employee,business]);
await db.query("DELETE FROM user_roles WHERE user_id=$1 AND role='owner'",[employee]);
console.log('Confirmed baseline self-owner escalation.');
await load('20261003153000_prevent_self_assigned_ownership.sql');
await load('20261003153000_prevent_self_assigned_ownership.sql'); // Idempotent dashboard reruns.
let passed=0;
async function denied(name, task) { await assert.rejects(task, e=>e.code==='42501'); console.log('PASS:',name); passed++; }
await denied('employee cannot assign owner',()=>act(employee,"INSERT INTO user_roles(user_id,business_id,role) VALUES ($1,$2,'owner')",[employee,business]));
await denied('outsider cannot join another business',()=>act(outsider,'INSERT INTO memberships(user_id,business_id) VALUES($1,$2)',[outsider,business]));
await denied('outsider cannot assign a role',()=>act(outsider,"INSERT INTO user_roles(user_id,business_id,role) VALUES($1,$2,'owner')",[outsider,business]));
await denied('manager cannot assign owner',()=>act(manager,"INSERT INTO user_roles(user_id,business_id,role) VALUES($1,$2,'owner')",[manager,business]));
await denied('inactive owner cannot add membership',()=>act(inactiveOwner,'INSERT INTO memberships(user_id,business_id) VALUES($1,$2)',[outsider,business]));
await denied('owner cannot grant a role to a nonmember',()=>act(owner,"INSERT INTO user_roles(user_id,business_id,role) VALUES($1,$2,'employee')",[outsider,business]));
await denied('manager cannot forge an owner invite',()=>act(manager,"INSERT INTO invitations(business_id,email,role,token) VALUES($1,'manager@test.invalid','owner','forged-owner')",[business]));
await act(manager,"INSERT INTO invitations(business_id,email,role,token) VALUES($1,'new@test.invalid','employee','normal-invite')",[business]);
await denied('manager cannot upgrade an invite to owner',()=>act(manager,"UPDATE invitations SET role='owner' WHERE token='normal-invite'"));
await act(owner,'INSERT INTO memberships(user_id,business_id) VALUES($1,$2)',[outsider,business]);
await act(owner,"INSERT INTO user_roles(user_id,business_id,role) VALUES($1,$2,'employee')",[outsider,business]);
console.log('PASS: owner can add member and role'); passed++;
await act(newcomer,"SELECT accept_invitation('normal-invite')");
const {rows:accepted}=await db.query('SELECT role FROM user_roles WHERE user_id=$1 AND business_id=$2',[newcomer,business]);
assert.equal(accepted[0].role,'employee'); console.log('PASS: normal invitation acceptance'); passed++;
const {rows:[fresh]}=await act(newcomer,"SELECT bootstrap_business('New workspace','new-workspace') AS id");
const {rows:ownership}=await db.query("SELECT role FROM user_roles WHERE user_id=$1 AND business_id=$2",[newcomer,fresh.id]);
assert.equal(ownership[0].role,'owner'); console.log('PASS: workspace bootstrap creates initial owner'); passed++;
await act(owner,"UPDATE user_roles SET role='manager' WHERE user_id=$1 AND business_id=$2",[outsider,business]);
console.log('PASS: existing owner can change a member role'); passed++;
console.log(`${passed} security and workflow checks passed.`);
await db.close();
