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
await load('20261003153000_prevent_self_assigned_ownership.sql');
await load('20261005180000_invitation_retry_membership.sql');
const invite = async (email, token, status='pending', expires='2099-01-01') =>
  db.query("INSERT INTO invitations(business_id,email,role,token,status,expires_at) VALUES($1,$2,'employee',$3,$4,$5)",[business,email,token,status,expires]);
await invite('new@test.invalid','new');
await assert.rejects(()=>act(outsider,"SELECT accept_invitation('new')"),/email does not match/);
await assert.rejects(()=>act('',"SELECT accept_invitation('new')"),/Not authenticated/);
await act(newcomer,"SELECT accept_invitation('new')");
await act(newcomer,"SELECT accept_invitation('new')");
for (const table of ['memberships','user_roles','employee_profiles']) {
 const {rows:[row]}=await db.query('SELECT count(*)::int AS n FROM '+table+' WHERE user_id=$1 AND business_id=$2',[newcomer,business]);
 assert.equal(row.n,1);
}
await db.query('UPDATE memberships SET is_active=false WHERE user_id=$1 AND business_id=$2',[newcomer,business]);
await assert.rejects(()=>act(newcomer,"SELECT accept_invitation('new')"),/Membership is inactive/);
await invite('new@test.invalid','return');
await act(newcomer,"SELECT accept_invitation('return')");
const {rows:[member]}=await db.query('SELECT is_active FROM memberships WHERE user_id=$1 AND business_id=$2',[newcomer,business]);
assert.equal(member.is_active,true);
await invite('owner@test.invalid','existing-owner');
await act(owner,"SELECT accept_invitation('existing-owner')");
const {rows:roles}=await db.query('SELECT role FROM user_roles WHERE user_id=$1 AND business_id=$2',[owner,business]);
assert.deepEqual(roles.map(r=>r.role),['owner']);
for (const [token,status,expires,message] of [
 ['revoked','revoked','2099-01-01',/revoked/],
 ['expired','expired','2099-01-01',/expired/],
 ['elapsed','pending','2000-01-01',/expired/]
]) {
 await invite('outsider@test.invalid',token,status,expires);
 await assert.rejects(()=>act(outsider,'SELECT accept_invitation($1)',[token]),message);
 const {rows:[row]}=await db.query('SELECT count(*)::int AS n FROM memberships WHERE user_id=$1 AND business_id=$2',[outsider,business]);
 assert.equal(row.n,0);
}
console.log('Invitation identity, lifecycle, retry, existing role and reactivation checks passed.');
await db.close();
