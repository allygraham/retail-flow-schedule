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
await check('valid assigned and unassigned shifts use consistent statuses',async()=>{
 const {rows:[assigned]}=await create({status:'unassigned'});assert.equal(assigned.status,'scheduled');
 const {rows:[open]}=await create({assigned_user_id:null,status:'scheduled'});assert.equal(open.status,'unassigned');
});
await clear();
await check('invalid time, breaks and notes are rejected on insert and edit',async()=>{
 const {rows:[source]}=await create({assigned_user_id:null});
 for(const patch of [{end_time:'08:00'},{end_time:'09:00'},{break_minutes:-1},{break_minutes:241},{end_time:'09:30',break_minutes:30},{notes:'x'.repeat(501)}]) {
 await denied(()=>create(patch));await denied(()=>edit(source.id,patch));
 }
});
await clear();
await check('overlapping shifts are rejected while touching times are allowed',async()=>{
 await create();await denied(()=>create({start_time:'16:00',end_time:'18:00'}));
 await create({start_time:'17:00',end_time:'19:00'});
});
await clear();
await check('overlap validation covers drafts, other stores and direct updates',async()=>{
 await db.query('INSERT INTO employee_stores(employee_profile_id,store_id) SELECT id,$1 FROM employee_profiles WHERE user_id=$2',[otherStore,employee]);
 await create({is_published:false});await denied(()=>create({store_id:otherStore}));
 const {rows:[other]}=await create({assigned_user_id:manager});await denied(()=>edit(other.id,{assigned_user_id:employee}));
});
await clear();
await check('cancelled shifts do not block new assignments',async()=>{
 await create({status:'cancelled'});await create();
});
await clear();
await check('inactive or foreign employees cannot be scheduled',async()=>{
 await denied(()=>create({assigned_user_id:outsider}));await denied(()=>create({assigned_user_id:inactiveOwner}));
});
await clear();
await check('employee must belong to the shift’s store',async()=>{
 await denied(()=>create({assigned_user_id:manager,store_id:otherStore}));
});
await clear();
await check('archived store rejects assignments but existing shifts can be released',async()=>{
 const {rows:[source]}=await create();await db.query('UPDATE store_locations SET is_active=false WHERE id=$1',[store]);
 await denied(()=>create({shift_date:'2026-11-03'}));await edit(source.id,{assigned_user_id:null});
 await db.query('UPDATE store_locations SET is_active=true WHERE id=$1',[store]);
});
await clear();
await check('approved leave blocks edits, inserts, and moves; pending leave does not',async()=>{
 await db.query("INSERT INTO leave_requests(business_id,user_id,start_date,end_date,status,created_by_user_id,created_by_role) VALUES($1,$2,'2026-11-02','2026-11-02','approved',$2,'employee')",[business,employee]);
 await denied(()=>create());
 const {rows:[source]}=await create({shift_date:'2026-11-03'});await denied(()=>edit(source.id,{shift_date:'2026-11-02'}));
 await denied(()=>move(source,employee,'2026-11-02'));
 await db.query("UPDATE leave_requests SET status='pending'");await create();
});
await clear();
await check('blocking company holidays apply to inserts, edits and moves',async()=>{
 await db.query("INSERT INTO custom_holidays(business_id,date,name,blocks_scheduling) VALUES($1,'2026-11-02','Closed',true)",[business]);
 await denied(()=>create());const {rows:[source]}=await create({shift_date:'2026-11-03'});
 await denied(()=>edit(source.id,{shift_date:'2026-11-02'}));await denied(()=>move(source,employee,'2026-11-02'));
 await create({assigned_user_id:null});await db.exec('UPDATE custom_holidays SET blocks_scheduling=false');await create();
});
await clear();
await check('recurring and dated unavailability are enforced consistently',async()=>{
 await db.query("INSERT INTO availability(business_id,user_id,is_recurring,day_of_week,start_time,end_time) VALUES($1,$2,true,1,'12:00','13:00')",[business,employee]);
 await denied(()=>create());await create({start_time:'09:00',end_time:'12:00'});
 await db.exec('DELETE FROM shifts;DELETE FROM availability;');
 await db.query("INSERT INTO availability(business_id,user_id,is_recurring,unavailable_date) VALUES($1,$2,false,'2026-11-02')",[business,employee]);await denied(()=>create());
});
await clear();
await check('cross-business store, role, schedule and moves are rejected',async()=>{
 const {rows:[otherBiz]}=await act(outsider,"SELECT bootstrap_business('Other','other') AS id");
 await db.query("INSERT INTO store_locations(id,business_id,name) VALUES($1,$2,'Foreign')",[uid(20),otherBiz.id]);
 await db.query("INSERT INTO roles_catalog(id,business_id,name) VALUES($1,$2,'Foreign')",[uid(21),otherBiz.id]);
 await db.query("INSERT INTO schedules(id,business_id,week_start) VALUES($1,$2,'2026-11-02')",[uid(22),otherBiz.id]);
 await denied(()=>create({store_id:uid(20)}));await denied(()=>create({role_id:uid(21)}));await denied(()=>create({schedule_id:uid(22)}));
 const {rows:[source]}=await create();await denied(()=>edit(source.id,{business_id:otherBiz.id}));
});
await clear();
await check('copying a batch with any invalid assignment rolls back every copied row',async()=>{
 await denied(()=>act(owner,"INSERT INTO shifts(business_id,store_id,assigned_user_id,shift_date,start_time,end_time) VALUES($1,$2,$3,'2026-11-02','09:00','17:00'),($1,$2,$3,'2026-11-02','10:00','18:00')",[business,store,employee]));
 assert.equal((await db.query('SELECT count(*)::int AS count FROM shifts')).rows[0].count,0);
});
await check('swapping same-day shifts with different times validates the final assignments',async()=>{
 const {rows:[a]}=await create();const {rows:[b]}=await create({assigned_user_id:manager,start_time:'10:00',end_time:'18:00'});
 await move(a,manager,'2026-11-02',b);
 assert.equal((await fetch(a.id)).assigned_user_id,manager);assert.equal((await fetch(b.id)).assigned_user_id,employee);
});
await clear();
await check('invalid second side of a swap rolls back both shifts',async()=>{
 const {rows:[a]}=await create({shift_date:'2026-11-02'});const {rows:[b]}=await create({assigned_user_id:manager,shift_date:'2026-11-03',store_id:store});
 await db.query("INSERT INTO leave_requests(business_id,user_id,start_date,end_date,status,created_by_user_id,created_by_role) VALUES($1,$2,'2026-11-02','2026-11-02','approved',$2,'employee')",[business,employee]);
 // a -> manager on Nov 3 is valid; b -> employee on Nov 2 is not.
 await denied(()=>move(a,manager,'2026-11-03',b));
 assert.equal((await fetch(a.id)).assigned_user_id,employee);assert.equal((await fetch(a.id)).shift_date.toISOString().slice(0,10),'2026-11-02');
 assert.equal((await fetch(b.id)).assigned_user_id,manager);
});
await clear();
await check('stale source or target versions cannot overwrite newer changes',async()=>{
 const {rows:[a]}=await create();const {rows:[b]}=await create({assigned_user_id:manager});
 await edit(a.id,{notes:'New source'});await denied(()=>move(a,manager,'2026-11-02',b),'40001');
 const refreshed=await fetch(a.id);await edit(b.id,{notes:'New target'});await denied(()=>move(refreshed,manager,'2026-11-02',b),'40001');
});
await clear();
await check('employees and deactivated management cannot use the move RPC',async()=>{
 const {rows:[source]}=await create();
 await denied(()=>move(source,manager,'2026-11-03',null,employee),'42501');
 await denied(()=>move(source,manager,'2026-11-03',null,inactiveOwner),'42501');
});
await clear();
await check('an ordinary move preserves shift details and updates its version',async()=>{
 const {rows:[source]}=await create();await move(source,manager,'2026-11-03');
 const moved=await fetch(source.id);assert.equal(moved.assigned_user_id,manager);assert.equal(moved.start_time,source.start_time);
 assert.ok(moved.updated_at>source.updated_at);
});
console.log(`${passed} scheduling integrity checks passed.`);await db.close();
