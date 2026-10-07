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
await db.query("INSERT INTO store_locations(id,business_id,name) VALUES ($1,$2,'Main store')",[uid(10),business]);
const store=uid(10);
await load('20261008090000_rota_week_publication.sql');
const status=async(actor=employee)=>(await act(actor,"SELECT * FROM get_rota_week_status($1,'2026-11-02')",[business])).rows[0].is_published;
assert.equal(await status(),false);
const {rows:[{id:shift}]}=await db.query("INSERT INTO shifts(business_id,store_id,shift_date,start_time,end_time,is_published) VALUES($1,$2,'2026-11-02','09:00','17:00',false) RETURNING id",[business,store]);
assert.equal(await status(),false);
await db.query('UPDATE shifts SET is_published=true WHERE id=$1',[shift]);
assert.equal(await status(),true);
await db.query('UPDATE shifts SET is_published=false WHERE id=$1',[shift]);
assert.equal(await status(),false);
await db.query('UPDATE shifts SET is_published=true WHERE id=$1',[shift]);
await db.query('DELETE FROM shifts WHERE id=$1',[shift]);
assert.equal(await status(),true);
assert.equal((await act(employee,"SELECT * FROM get_rota_week_status($1,'2026-11-09')",[business])).rows[0].is_published,false);
for(const person of [outsider,inactiveOwner]) await assert.rejects(()=>status(person),/Active membership/);
await assert.rejects(()=>act(employee,"INSERT INTO rota_week_publications VALUES($1,$2,'2026-11-09')",[business,store]),/permission denied/);
await db.exec('BEGIN');
await db.query("INSERT INTO shifts(business_id,store_id,shift_date,start_time,end_time,is_published) VALUES($1,$2,'2026-11-09','09:00','17:00',true)",[business,store]);
await db.exec('ROLLBACK');
assert.equal((await act(employee,"SELECT * FROM get_rota_week_status($1,'2026-11-09')",[business])).rows[0].is_published,false);
await db.query("INSERT INTO store_locations(id,business_id,name) VALUES($1,$2,'Second store')",[uid(11),business]);
assert.equal((await act(employee,"SELECT * FROM get_rota_week_status($1,'2026-11-02')",[business])).rows.find(row=>row.store_id===uid(11)).is_published,false);
console.log('Rota publication: draft, published, new drafts, deleted shifts, unplanned weeks, employee visibility and access protection passed.');
await db.close();
