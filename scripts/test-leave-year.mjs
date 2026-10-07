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
await load('20261007140000_single_use_invitations.sql');
await db.exec(readFileSync(new URL('20261003160000_protect_hr_data_and_active_access.sql', root), 'utf8').split('-- Restrictive policies')[0]);
await load('20261007200000_business_leave_year.sql');
const read = async () => (await db.query('SELECT leave_year_mode,leave_year_start_date FROM businesses WHERE id=$1',[business])).rows[0];
assert.deepEqual(await read(), { leave_year_mode: 'calendar', leave_year_start_date: null });
await act(owner, "UPDATE businesses SET leave_year_mode='tax' WHERE id=$1", [business]);
assert.equal((await read()).leave_year_mode,'tax');
for (const person of [employee,manager,outsider,inactiveOwner]) {
  const response = await act(person,"UPDATE businesses SET leave_year_mode='financial', leave_year_start_date='2026-07-15' WHERE id=$1 RETURNING id",[business]);
  assert.equal(response.rows.length,0);
  assert.equal((await read()).leave_year_mode,'tax');
}
for (const sql of ["UPDATE businesses SET leave_year_mode='financial' WHERE id=$1", "UPDATE businesses SET leave_year_mode='unknown' WHERE id=$1", "UPDATE businesses SET leave_year_start_date='2026-07-15' WHERE id=$1"]) {
 await assert.rejects(()=>act(owner,sql,[business]),/businesses_leave_year_check/);
}
await act(owner,"UPDATE businesses SET leave_year_mode='financial', leave_year_start_date='2026-07-15' WHERE id=$1",[business]);
assert.equal((await read()).leave_year_start_date.toISOString().slice(0,10),'2026-07-15');
const visible = await act(employee, 'SELECT leave_year_mode FROM businesses WHERE id=$1',[business]);
assert.equal(visible.rows[0].leave_year_mode,'financial');
console.log('Leave year defaults, owner writes, active membership, tenant isolation and configuration validation passed.');
await db.close();
