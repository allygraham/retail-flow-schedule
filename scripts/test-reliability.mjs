// Run: npm run test:reliability
// Isolated PostgreSQL fixture: never connects to production.
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
// Match production: sickness columns are absent before the repair.
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

await load('20261004100000_add_employee_working_days.sql');
await load('20261004120000_atomic_leave_and_private_notes.sql');
await db.query('UPDATE employee_profiles SET working_days=ARRAY[1,3,5]::smallint[]');
await db.exec(readFileSync(new URL('20260419182657_421d0a6f-8a54-4318-baeb-63ba9e8832b1.sql',root),'utf8').split('ALTER PUBLICATION')[0]);
await db.exec('GRANT ALL ON notifications TO authenticated');
await load('20261004130000_leave_cancellation_and_charge_history.sql');
await load('20261004140000_atomic_publish_and_team_edits.sql');
await load('20261004140000_atomic_publish_and_team_edits.sql');
const shift=async(user=employee,date='2026-11-02')=>(await act(owner,"INSERT INTO shifts(business_id,store_id,assigned_user_id,shift_date,start_time,end_time,is_published) VALUES($1,$2,$3,$4,'09:00','17:00',false) RETURNING id",[business,store,user,date])).rows[0].id;
const publish=(ids,actor=owner,biz=business)=>act(actor,"SELECT * FROM publish_rota_shifts($1,$2,'2026-11-02')",[biz,ids]);
const edit=(actor=owner,role='manager',subject=employee,storeId=otherStore,days=[2,4])=>act(actor,'SELECT update_team_member($1,$2,$3,NULL,20,$4,$5)',[business,subject,storeId,days,role]);
const roles=async(subject=employee)=>(await db.query('SELECT role FROM user_roles WHERE business_id=$1 AND user_id=$2 ORDER BY role',[business,subject])).rows.map(r=>r.role);
const profile=async(subject=employee)=>(await db.query('SELECT * FROM employee_profiles WHERE business_id=$1 AND user_id=$2',[business,subject])).rows[0];
const fetch=async(id)=>(await db.query('SELECT * FROM shifts WHERE id=$1',[id])).rows[0];
const clear=()=>db.exec('DELETE FROM shifts;DELETE FROM notifications');
let passed=0;const check=async(name,task)=>{await task();console.log('PASS:',name);passed++;};
const denied=(task,code='42501')=>assert.rejects(task,e=>e.code===code);
await check('publishing creates one notification per actual assignee and counts open shifts',async()=>{
 const ids=[await shift(),await shift(employee,'2026-11-03'),await shift(manager),await shift(null)];
 const result=(await publish(ids)).rows[0];assert.deepEqual(result,{published_count:4,notified_count:2});
 const notes=(await db.query('SELECT * FROM notifications')).rows;assert.equal(notes.length,2);
 assert.equal(notes.find(n=>n.user_id===employee).body.includes('2 shifts'),true);
 for(const id of ids)assert.equal((await fetch(id)).is_published,true);
});
await check('retrying an already committed publication does not duplicate notifications',async()=>{
 const ids=(await db.query('SELECT id FROM shifts')).rows.map(r=>r.id);
 assert.deepEqual((await publish(ids)).rows[0],{published_count:0,notified_count:0});assert.equal((await db.query('SELECT count(*)::int AS count FROM notifications')).rows[0].count,2);
});await clear();
await check('assignee changes before publication notify the current employee',async()=>{
 const id=await shift();await act(owner,'UPDATE shifts SET assigned_user_id=$1 WHERE id=$2',[manager,id]);await publish([id]);
 assert.equal((await db.query('SELECT user_id FROM notifications')).rows[0].user_id,manager);
});await clear();
await check('notification failure rolls back publication and previously inserted notifications',async()=>{
 const ids=[await shift(),await shift(manager)];
 await db.exec(`CREATE FUNCTION fail_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected notification failure' USING ERRCODE='23514'; END $$;
 CREATE TRIGGER fail_notification BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fail_notification();`);
 await denied(()=>publish(ids),'23514');for(const id of ids)assert.equal((await fetch(id)).is_published,false);
 assert.equal((await db.query('SELECT count(*)::int AS count FROM notifications')).rows[0].count,0);await db.exec('DROP TRIGGER fail_notification ON notifications');
});await clear();
await check('deferred scheduling failure rolls back both publication and notifications',async()=>{
 const id=await shift();await db.exec(`CREATE CONSTRAINT TRIGGER fail_publish_deferred AFTER UPDATE ON shifts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_notification();`);
 await denied(()=>publish([id]),'23514');assert.equal((await fetch(id)).is_published,false);assert.equal((await db.query('SELECT count(*)::int AS count FROM notifications')).rows[0].count,0);
 await db.exec('DROP TRIGGER fail_publish_deferred ON shifts');
});await clear();
await check('employees, outsiders and inactive managers cannot publish',async()=>{
 const id=await shift();for(const actor of [employee,outsider,inactiveOwner])await denied(()=>publish([id],actor));assert.equal((await fetch(id)).is_published,false);
});await clear();
await check('missing, wrong-week and cancelled shifts cannot partially publish a batch',async()=>{
 const id=await shift();await denied(()=>publish([id,uid(999)]),'40001');assert.equal((await fetch(id)).is_published,false);
 const late=await shift(employee,'2026-11-09');await denied(()=>publish([id,late]),'40001');
 await act(owner,"UPDATE shifts SET status='cancelled' WHERE id=$1",[late]);await denied(()=>publish([late]),'40001');
});await clear();
await check('owner role and employment edits commit together',async()=>{
 await edit();assert.deepEqual(await roles(),['manager']);assert.equal((await profile()).primary_store_id,otherStore);assert.deepEqual((await profile()).working_days,[2,4]);
});
await check('profile write failure rolls back a preceding role change',async()=>{
 const before=await profile();await db.exec(`CREATE FUNCTION fail_profile() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected profile failure' USING ERRCODE='23514'; END $$;
 CREATE TRIGGER fail_profile BEFORE UPDATE ON employee_profiles FOR EACH ROW EXECUTE FUNCTION fail_profile();`);
 await denied(()=>edit(owner,'employee',employee,store),'23514');assert.deepEqual(await roles(),['manager']);assert.deepEqual(await profile(),before);await db.exec('DROP TRIGGER fail_profile ON employee_profiles');
});
await check('deferred profile failure also rolls back role changes',async()=>{
 await db.exec(`CREATE CONSTRAINT TRIGGER fail_profile_deferred AFTER UPDATE ON employee_profiles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_profile();`);
 await denied(()=>edit(owner,'employee'),'23514');assert.deepEqual(await roles(),['manager']);await db.exec('DROP TRIGGER fail_profile_deferred ON employee_profiles');
});
await check('manager can update employment but cannot change roles',async()=>{
 await edit(manager,null,employee,store,[1,3,5]);assert.deepEqual(await roles(),['manager']);assert.equal((await profile()).primary_store_id,store);
 await denied(()=>edit(manager,'owner'));assert.deepEqual(await roles(),['manager']);
});
await check('inactive management and ordinary employees cannot edit staff',async()=>{
 // Employee currently has a manager role from the successful edit; restore it.
 await db.query("UPDATE user_roles SET role='employee' WHERE user_id=$1",[employee]);
 for(const actor of [employee,outsider,inactiveOwner])await denied(()=>edit(actor,null));
 await denied(()=>edit(owner,null,outsider));
});
await check('invalid store, weekdays and hours cannot alter a role',async()=>{
 await denied(()=>edit(owner,'manager',employee,uid(999)),'23514');await denied(()=>edit(owner,'manager',employee,store,[1,1]),'23514');
 await denied(()=>act(owner,'SELECT update_team_member($1,$2,$3,NULL,-1,ARRAY[1]::smallint[],NULL)',[business,employee,store]),'23514');assert.deepEqual(await roles(),['employee']);
});
await check('profile creation and role change work for an active member with no profile',async()=>{
 await db.query('DELETE FROM employee_profiles WHERE user_id=$1',[manager]);await edit(owner,'employee',manager,store);assert.ok(await profile(manager));assert.deepEqual(await roles(manager),['employee']);
});
await check('owner self-role change still saves profile atomically',async()=>{
 await edit(owner,'employee',owner,store);assert.deepEqual(await roles(owner),['employee']);assert.ok(await profile(owner));
});
console.log(`${passed} publication and employee-edit checks passed.`);await db.close();
