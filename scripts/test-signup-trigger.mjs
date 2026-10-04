import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const load = name => db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
await load('20260418145239_9fbc6b74-99f1-441b-b3ea-9021aa1665ab.sql');
await load('20260418145257_7dd19197-291d-41f6-9d1a-4a3ff270e351.sql');
await load('20260424151917_auto_create_employee_profile.sql');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await assert.rejects(() => db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [id(1), 'new@example.test']), e => e.code === '42703');
assert.equal((await db.query('SELECT count(*)::int AS count FROM auth.users')).rows[0].count, 0);
console.log('PASS: reproduced signup failure and rollback from obsolete employment trigger');
await load('20261004160000_restore_signup_profile_trigger.sql');
await load('20261004160000_restore_signup_profile_trigger.sql');
const metadata = [{ full_name: ' New Owner ', role: 'owner', business_name: 'Shop' }, { full_name: 'Invited Employee' }, {}, { full_name: '   ' }];
for (const [index, value] of metadata.entries()) {
  await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)', [id(index + 1), `person${index}@example.test`, value]);
}
const profiles = (await db.query('SELECT full_name FROM profiles ORDER BY id')).rows;
assert.deepEqual(profiles.map(x => x.full_name), ['New Owner', 'Invited Employee', 'person2@example.test', 'person3@example.test']);
console.log('PASS: owner and invited signups create profiles with safe name fallbacks');
for (const table of ['employee_profiles', 'memberships', 'user_roles', 'businesses']) {
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 0);
}
console.log('PASS: signup metadata cannot grant ownership or create employment without a workspace');
await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id(1)]);
const workspace = (await db.query("SELECT bootstrap_business('Shop','shop') AS id")).rows[0].id;
assert.equal((await db.query('SELECT role FROM user_roles WHERE user_id=$1 AND business_id=$2', [id(1), workspace])).rows[0].role, 'owner');
console.log('PASS: confirmed account can still bootstrap its owner workspace');
await db.query("UPDATE auth.users SET raw_user_meta_data='{}' WHERE id=$1", [id(1)]);
assert.equal((await db.query('SELECT full_name FROM profiles WHERE id=$1', [id(1)])).rows[0].full_name, 'New Owner');
console.log('PASS: auth updates do not overwrite existing profile data');
assert.equal((await db.query("SELECT count(*)::int AS count FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created'")).rows[0].count, 1);
console.log('PASS: repeated migration leaves exactly one signup trigger');
await db.close();
