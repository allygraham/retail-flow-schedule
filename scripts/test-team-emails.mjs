// Run: node scripts/test-team-emails.mjs
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
await load('20261007210000_team_member_emails.sql');
const emails = async user => (await act(user, 'SELECT * FROM public.get_team_member_emails($1)', [business])).rows;
for (const person of [owner, manager]) {
 const rows = await emails(person);
 assert.equal(rows.find(row => row.user_id === employee).email, 'employee@test.invalid');
 assert.equal(rows.find(row => row.user_id === owner).email, 'owner@test.invalid');
 assert.equal(rows.some(row => row.user_id === outsider), false);
 assert.equal(rows.some(row => row.user_id === newcomer), false);
}
for (const person of [employee, outsider, inactiveOwner]) {
 await assert.rejects(() => emails(person), /Not authorised/);
}
const { rows: [{ id: otherBusiness }] } = await act(outsider, "SELECT public.bootstrap_business('Other business','other-business') AS id");
await assert.rejects(() => act(owner,'SELECT * FROM public.get_team_member_emails($1)',[otherBusiness]), /Not authorised/);
await db.query("UPDATE auth.users SET email='changed@test.invalid' WHERE id=$1", [employee]);
assert.equal((await emails(owner)).find(row => row.user_id === employee).email, 'changed@test.invalid');
await db.exec('SET ROLE anon');
try { await assert.rejects(() => db.query('SELECT * FROM public.get_team_member_emails($1)',[business]), /permission denied/); }
finally { await db.exec('RESET ROLE'); }
console.log('Team emails: owner/manager access, updated account address, employee denial, inactive access and business isolation passed.');
await db.close();
