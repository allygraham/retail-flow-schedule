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
await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth;
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
await load('20260420140153_8c1679c1-075b-4ba9-9dc9-cd01dbd9654a.sql');
await load('20261003153000_prevent_self_assigned_ownership.sql');
await load('20261003154500_enforce_leave_approval_permissions.sql');
await load('20260419141750_b3c3f056-971f-4664-af88-dc7a9aba466e.sql');
await load('20261003160000_protect_hr_data_and_active_access.sql');
await db.query("INSERT INTO store_locations(id,business_id,name) VALUES ($1,$3,'Main store'),($2,$3,'Second store')",[uid(10),uid(11),business]);
const store=uid(10),otherStore=uid(11);
await db.query('INSERT INTO employee_profiles(user_id,business_id,primary_store_id) VALUES ($1,$3,$4),($2,$3,$4)',[employee,manager,business,store]);
await load('20261004103000_validate_shifts_and_atomic_moves.sql');
await load('20261004103000_validate_shifts_and_atomic_moves.sql');
await load('20261006100000_versioned_coverage_and_invite_lookup.sql');
await load('20261006100000_versioned_coverage_and_invite_lookup.sql');
const create=async (patch={},actor=owner)=>{
 const data={business_id:business,store_id:store,assigned_user_id:employee,shift_date:'2026-11-02',start_time:'09:00',end_time:'17:00',break_minutes:30,...patch};
 const keys=Object.keys(data);
 return act(actor,`INSERT INTO shifts (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(data));
};
const edit=async (id,patch,actor=owner)=>{
 const keys=Object.keys(patch);
 return act(actor,`UPDATE shifts SET ${keys.map((key,i)=>key+'=$'+(i+1)).join(',')} WHERE id=$${keys.length+1} RETURNING *`,[...Object.values(patch),id]);
};
const move=(source,assigned,date,target=null,actor=owner)=>act(actor,'SELECT move_rota_shift($1,$2,$3,$4,$5,$6,$7)',[business,source.id,assigned,date,source.updated_at,target?.id??null,target?.updated_at??null]);
const fetch=async(id)=>(await db.query('SELECT * FROM shifts WHERE id=$1',[id])).rows[0];
const clear=()=>db.exec('DELETE FROM shifts;DELETE FROM availability;DELETE FROM custom_holidays;DELETE FROM leave_requests;');
let passed=0;
async function check(name,task){await task();console.log('PASS:',name);passed++;}
const denied=(task,code='23514')=>assert.rejects(task,e=>e.code===code);
const release=(shifts,actor=owner,biz=business)=>act(actor,'SELECT release_coverage_shifts($1,$2::jsonb) AS n',[biz,JSON.stringify(shifts.map(s=>({id:s.id,updated_at:s.updated_at})))]);
await check('stale replacement cannot overwrite another manager assignment',async()=>{
 const {rows:[source]}=await create({assigned_user_id:null});
 await move(source,employee,source.shift_date);
 await denied(()=>move(source,manager,source.shift_date),'40001');
 assert.equal((await fetch(source.id)).assigned_user_id,employee);
});
await clear();
await check('a stale release rolls back the entire selection',async()=>{
 const {rows:[first]}=await create();
 const {rows:[second]}=await create({shift_date:'2026-11-03'});
 await edit(second.id,{assigned_user_id:manager});
 await denied(()=>release([first,second]),'40001');
 assert.equal((await fetch(first.id)).assigned_user_id,employee);
 assert.equal((await fetch(second.id)).assigned_user_id,manager);
});
await clear();
await check('current versions release every shift and stale retries do nothing',async()=>{
 const {rows:[first]}=await create();
 const {rows:[second]}=await create({shift_date:'2026-11-03'});
 assert.equal((await release([first,second])).rows[0].n,2);
 for(const row of [first,second]) assert.equal((await fetch(row.id)).assigned_user_id,null);
 await denied(()=>release([first,second]),'40001');
});
await clear();
await check('cancelled or missing shifts reject the whole batch',async()=>{
 const {rows:[first]}=await create();
 const {rows:[cancelled]}=await create({shift_date:'2026-11-03',status:'cancelled'});
 await denied(()=>release([first,cancelled]),'40001');
 await denied(()=>release([first,{id:uid(900),updated_at:first.updated_at}]),'40001');
 assert.equal((await fetch(first.id)).assigned_user_id,employee);
});
await clear();
await check('employees, inactive managers and other businesses cannot release shifts',async()=>{
 const {rows:[source]}=await create();
 for(const actor of [employee,inactiveOwner,outsider]) await denied(()=>release([source],actor),'42501');
 await denied(()=>release([source],owner,uid(900)),'42501');
 assert.equal((await fetch(source.id)).assigned_user_id,employee);
});
await check('duplicate ids and missing versions fail closed',async()=>{
 const {rows:[source]}=await create({shift_date:'2026-11-04'});
 await denied(()=>release([source,source]),'22023');
 await denied(()=>release([{id:source.id}]),'40001');
});
await check('lookup covers users beyond the first 200 accounts and ignores inactive membership',async()=>{
 const users=Array.from({length:250},(_,i)=>({id:uid(1000+i),email:`person${i}@test.invalid`}));
 await db.query('INSERT INTO auth.users(id,email) SELECT unnest($1::uuid[]),unnest($2::text[])',[users.map(u=>u.id),users.map(u=>u.email)]);
 const target=users.at(-1);
 await db.query('INSERT INTO memberships(user_id,business_id,is_active) VALUES($1,$2,true)',[target.id,business]);
 const lookup=async(email,biz=business)=>(await db.query('SELECT has_active_team_email($1,$2) AS present',[biz,email])).rows[0].present;
 assert.equal(await lookup(' PERSON249@TEST.INVALID '),true);
 assert.equal(await lookup(target.email,uid(900)),false);
 await db.query('UPDATE memberships SET is_active=false WHERE user_id=$1',[target.id]);
 assert.equal(await lookup(target.email),false);
 assert.equal(await lookup('unknown@test.invalid'),false);
});
await check('membership email lookup is not available to frontend users',async()=>{
 await denied(()=>act(owner,'SELECT has_active_team_email($1,$2)',[business,'owner@test.invalid']),'42501');
 await db.exec('SET ROLE anon');
 try {await assert.rejects(()=>db.query('SELECT has_active_team_email($1,$2)',[business,'owner@test.invalid']),e=>e.code==='42501');}
 finally {await db.exec('RESET ROLE');}
 await db.exec('SET ROLE service_role');
 try {assert.equal((await db.query('SELECT has_active_team_email($1,$2) AS present',[business,'owner@test.invalid'])).rows[0].present,true);}
 finally {await db.exec('RESET ROLE');}
});
await db.close();
console.log(`All ${passed} coverage concurrency and invitation lookup checks passed.`);
