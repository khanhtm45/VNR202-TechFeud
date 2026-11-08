'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const core=require('../functions/lib/quiz.js');
const fake=[
 {id:'r1',stage:'rapid',prompt:'Năm Đại hội XI?',choices:['2011','2006','2016','2021'],correctIndex:0,durationSeconds:20,explanation:'Năm 2011.'},
 {id:'f1',stage:'feud',prompt:'Khái niệm đổi mới?',choices:['Một','Hai','Ba','Bốn'],correctIndex:1,durationSeconds:30,explanation:'Giải thích.'},
 {id:'g1',stage:'green',prompt:'Giải pháp bảo vệ môi trường?',choices:['Giảm rác','Đốt rác','Xả rác','Không làm gì'],correctIndex:0,durationSeconds:30,explanation:'Phân loại tại nguồn.'}
];
test('Bộ đề 3 vòng: chuẩn hóa và loại đáp án không hợp lệ',()=>{
 const q=core.validateQuestions(fake);
 assert.equal(q.length,3);
 assert.equal(q[0].correctIndex,0);
 assert.equal(core.publicQuestion(q[0],0,3).correctIndex,undefined);
 assert.equal(core.publicQuestion(q[0],0,3).explanation,undefined);
 assert.throws(()=>core.validateQuestions(fake.map(v=>({...v,correctIndex:9}))),/0–3/);
 assert.throws(()=>core.validateQuestions([fake[0],fake[0],fake[2]]));
 assert.throws(()=>core.validateQuestions([fake[1],fake[0],fake[2]]),/Vòng 1/);
});
test('Điểm do server tính: sai 0, đúng thưởng tốc độ',()=>{
 const [rapid,feud,green]=core.validateQuestions(fake);
 assert.equal(core.scoreFor(rapid,1,0),0);
 assert.equal(core.scoreFor(rapid,0,0),150);
 assert.equal(core.scoreFor(rapid,0,20000),100);
 assert.equal(core.scoreFor(feud,1,0),200);
 assert.equal(core.scoreFor(green,0,0),200);
});
test('Bảo vệ tên đội và mã phòng',()=>{
 assert.equal(core.MAX_TEAMS,8);
 assert.equal(core.getCode('482916'),'482916');
 assert.throws(()=>core.getCode('4829'));
 assert.equal(core.normalizeTeamName('  Đội Tri Thức  '),'Đội Tri Thức');
 assert.throws(()=>core.normalizeTeamName('   '));
});
test('Supabase: khóa đáp án và điểm chỉ nằm ở private tables / RPC',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611090001_vnr_multiplayer.sql'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../docs/live.js'),'utf8');
 const adapter=fs.readFileSync(path.join(__dirname,'../docs/supabase-adapter.js'),'utf8');
 assert.match(sql,/alter table public\.vnr_room_questions enable row level security/i);
 assert.match(sql,/alter table public\.vnr_room_submissions enable row level security/i);
 assert.match(sql,/revoke all on table/i);
 assert.match(sql,/security definer set search_path = ''/i);
 assert.match(sql,/public\.vnr_submit_answer/);
 assert.match(sql,/public\.vnr_control_room/);
 assert.match(sql,/status='revealed'/);
 assert.match(sql,/on conflict do nothing/);
 assert.match(adapter,/https:\/\/esm\.sh\/@supabase/);
 assert.match(adapter,/\.rpc\(rpc,args\)/);
 assert.match(adapter,/postgres_changes/);
 assert.match(js,/supabase-config\.js/);
 assert.match(js,/authorizeSpectator/);
 assert.ok(!js.includes('firebasejs')&&!js.includes('firebaseConfig'),'Client không dùng Firebase');
 assert.ok(!js.includes('correctIndex:0')&&!js.includes('correctIndex:1'),'Không chứa khóa đáp án cứng');
});
test('Backend và frontend không có lỗi cú pháp JS',()=>{
 for(const [f,esm] of [['functions/index.js',false],['functions/lib/quiz.js',false],['docs/live.js',true],['docs/supabase-adapter.js',true],['docs/supabase-config.js',true]]){
   const input=fs.readFileSync(path.join(__dirname,'..',f),'utf8');
   const args=esm?['--input-type=module','--check']:['--check'];
   if(!esm)args.push(path.join(__dirname,'..',f));
   const result=spawnSync(process.execPath,args,{encoding:'utf8',input:esm?input:undefined});
   assert.equal(result.status,0,f+': '+result.stderr);
 }
});


test('MC requires private hashed credentials and time-limited server sessions',()=>{
 const initial=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611090002_host_allowlist.sql'),'utf8');
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611090003_mc_password_login.sql'),'utf8');
 const frontend=fs.readFileSync(path.join(__dirname,'../docs/live.js'),'utf8');
 const page=fs.readFileSync(path.join(__dirname,'../docs/live.html'),'utf8');
 assert.match(initial,/if not public\.vnr_is_authorized_host\(\)/);
 assert.match(sql,/private\.vnr_mc_accounts/);
 assert.match(sql,/private\.vnr_mc_sessions/);
 assert.match(sql,/password_hash/);
 assert.match(sql,/extensions\.crypt\(p_password/);
 assert.match(sql,/failed_attempts/);
 assert.match(sql,/interval '15 minutes'/);
 assert.match(sql,/interval '2 hours'/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/vnr_mc_login/);
 assert.match(sql,/vnr_mc_logout/);
 assert.match(frontend,/app\.rpc\('vnr_mc_login'/);
 assert.match(frontend,/app\.rpc\('vnr_is_authorized_host'/);
 assert.match(frontend,/hostAuthorized/);
 assert.match(page,/id="hostUsername"/);
 assert.match(page,/id="hostPassword"/);
 assert.match(page,/id="hostLayout" class="host-layout" hidden/);
 assert.ok(!frontend.includes('040503'),'MC password never appears in JavaScript');
 assert.ok(!sql.includes('040503'),'MC password never appears in public migration');
});
