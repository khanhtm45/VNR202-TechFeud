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


test('Tất cả 20 câu đều có SVG gốc, banner và QR ở cả MC/máy chiếu',()=>{
 const root=path.join(__dirname,'../docs');
 const files=['r1','r2','r3','r4','r5','r6','r7','r8','f1','f2','f3','f4','f5','f6','g1','g2','g3','g4','g5','g6'];
 assert.equal(files.length,20);
 for(const id of files){
   const file=path.join(root,'art/questions',id+'.svg');
   const content=fs.readFileSync(file,'utf8');
   assert.match(content,/<svg\s/);
   assert.match(content,/<\/svg>\s*$/);
   assert.ok(!content.includes('correctIndex'),'Không được lộ đáp án trong hình');
 }
 for(const stage of ['rapid','feud','green']){
   const file=path.join(root,'art/banners',stage+'.svg');
   assert.match(fs.readFileSync(file,'utf8'),/<svg\s/);
 }
 const html=fs.readFileSync(path.join(root,'live.html'),'utf8');
 const js=fs.readFileSync(path.join(root,'live.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'live.css'),'utf8');
 for(const name of ['qrImage','boardQRImage','boardLobby','boardJoinCode','boardJoinCount','playerArt','boardArt']){
   assert.match(html,new RegExp('id="'+name+'"'));
 }
 assert.match(js,/function renderQr\(which\)/);
 assert.match(js,/quickchart\.io\/qr/);
 assert.match(js,/function questionArt\(/);
 assert.match(js,/function syncArt\(/);
 assert.match(js,/querySelectorAll\('button'\)/);
 assert.match(css,/\.board-lobby/);
 assert.match(css,/\.question-art/);
 assert.match(css,/\.leaderboard-row/);
 assert.match(css,/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});


test('Regression: Supabase Auth ID maps to Firebase-style UID for MC and player',()=>{
 const adapter=fs.readFileSync(path.join(__dirname,'../docs/supabase-adapter.js'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../docs/live.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../docs/live.html'),'utf8');
 assert.match(adapter,/export function normalizeAuthUser\(user\)/);
 assert.match(adapter,/uid:\s*user\.id/);
 assert.match(adapter,/cb\(normalizeAuthUser\(data\?\.session\?\.user \|\| null\)\)/);
 assert.match(adapter,/return \{user:normalizeAuthUser\(data\.user\)\}/);
 assert.match(js,/room\?\.hostUid===user\?\.uid/);
 assert.match(js,/teams\.find\(t=>t\.uid===user\?\.uid\)/);
 assert.match(js,/optimisticMember=\{code:res\.code,uid:res\.teamId\|\|user\?\.uid/);
 assert.match(js,/getMember\(\)/);
 assert.match(html,/<form class="live-panel player-form" id="joinFormPanel"/);
 assert.match(html,/id="joinRoom" class="live-button primary" type="submit"/);
 assert.match(js,/\$\('joinFormPanel'\)\.addEventListener\('submit'/);
 assert.match(js,/event\.preventDefault\(\)/);
 assert.match(html,/id="playerWaiting"/);
 assert.match(js,/showText\('playerWaitingCode',code/);
 const input=fs.readFileSync(path.join(__dirname,'../docs/live.css'),'utf8');
 assert.match(input,/\.player-waiting/);
});


test('MC thấy đội nào đã nộp câu hiện tại mà không lộ đáp án trước công bố',()=>{
 const root=path.join(__dirname,'..');
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/202611090004_live_answer_progress.sql'),'utf8');
 const adapter=fs.readFileSync(path.join(root,'docs/supabase-adapter.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'docs/live.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'docs/live.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'docs/live.css'),'utf8');
 assert.match(sql,/add column if not exists answered_cursor integer not null default -1/);
 assert.match(sql,/update public\.vnr_room_teams\s+set answered_cursor=v_room\.cursor/);
 assert.match(sql,/room_code=p_code and uid=v_uid/);
 assert.match(sql,/Do NOT return points, correctness, or the answer/);
 assert.ok(!/create policy .*submissions/.test(sql),'Không cấp quyền đọc đáp án cho client');
 assert.match(adapter,/answeredCursor:data\.answered_cursor \?\? -1/);
 assert.match(adapter,/select\('uid,name,position,score,last_gain,answered_cursor'\)/);
 assert.match(adapter,/kind==='teams'\?4000:9500/);
 assert.match(js,/function renderHostAnswerProgress\(isHost\)/);
 assert.match(js,/t\.answeredCursor===room\.cursor/);
 assert.match(js,/renderHostAnswerProgress\(host\)/);
 assert.match(js,/showText\('hostAnswerCount'/);
 assert.match(js,/showText\('revealQuestion','✓ Công bố và chấm điểm/);
 for(const id of ['hostAnswerTracker','hostAnswerCount','hostAnswerProgress','hostAnswerFill','hostAnswerList','hostAnswerHint']){
   assert.ok(html.includes('id="'+id+'"'),id+' missing in MC markup');
 }
 assert.match(css,/\.host-answer-item\.answered/);
 assert.match(css,/\.host-answer-list/);
});


test('Phòng đã bắt đầu khóa đội mới, kết thúc chặn đăng ký và xem trạng thái riêng',()=>{
 const root=path.join(__dirname,'..');
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/202611090005_lock_room_registration.sql'),'utf8');
 const adapter=fs.readFileSync(path.join(root,'docs/supabase-adapter.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'docs/live.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'docs/live.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'docs/live.css'),'utf8');

 // The DB enforces these rules atomically with MC START via a room row lock.
 assert.match(sql,/where code=p_code for update/);
 const finishCheck=sql.indexOf("if v_room.status='finished' then");
 const existingRejoin=sql.indexOf('select * into v_team');
 const lobbyGuard=sql.indexOf("if v_room.status<>'lobby' then");
 assert.ok(finishCheck>=0&&finishCheck<existingRejoin,'Finished rooms reject all new join calls before existing-team lookup');
 assert.ok(lobbyGuard>existingRejoin,'Already-registered teams can reconnect during an active match');
 assert.match(sql,/create or replace function public\.vnr_room_join_status/);
 assert.match(sql,/v_status='lobby' and v_count<8/);
 assert.match(sql,/v_room\.status='finished' then 'finished'/);
 assert.match(sql,/grant execute on function public\.vnr_room_join_status\(text\) to authenticated/);
 assert.ok(!sql.includes('private_payload'),'Public room status must never include private answer data');

 // UI displays a persistent closed screen for nonmembers, instead of a wait state.
 assert.match(adapter,/roomJoinStatus:'vnr_room_join_status'/);
 assert.match(adapter,/name==='roomJoinStatus' \? \{p_code:payload\.code\}/);
 assert.match(js,/async function inspectRoomJoinStatus\(requested\)/);
 assert.match(js,/if\(!status\.member&&!status\.canJoin\)/);
 assert.match(js,/status\.status==='finished'&&status\.member/);
 assert.match(js,/status\?\.member&&status\.status!=='expired'/);
 assert.match(js,/\$\('hostRoomCard'\)\.hidden=!room\|\|!host\|\|phase!=='lobby'/);
 assert.match(js,/const waiting=!room\|\|phase==='lobby'/);
 for(const id of ['playerClosedPanel','playerClosedTitle','playerClosedMessage','playerTryOtherRoom','playerFinishedPanel','playerFinishedScore','hostRoomClosed']){
   assert.ok(html.includes('id="'+id+'"'),'Missing '+id+' in UI');
 }
 assert.match(css,/\.player-closed-panel/);
 assert.match(css,/\.player-finished-panel/);
 assert.match(html,/live\.js\?v=room-switch7/);
 assert.match(js,/supabase-adapter\.js\?v=room-switch7/);
});


test('Runtime phone room switch: finished, expired, active and stale responses',async()=>{
 const vm=require('node:vm');
 const source=fs.readFileSync(path.join(__dirname,'../docs/live.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../docs/live.html'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../docs/live.css'),'utf8');
 const part=(start,end)=>{
   const a=source.indexOf(start);
   const b=source.indexOf(end,a+start.length);
   assert.ok(a>=0&&b>a,'Missing function block: '+start);
   return source.slice(a,b);
 };
 const renderer=part('function renderPlayer(){','\nfunction renderBoard(){');
 const inspection=part('async function inspectRoomJoinStatus(requested){','\nfunction clearPlayerRoom(){');
 const clear=part('function clearPlayerRoom(){','\n/* Host privilege');
 const elements=new Map(),saved=new Map();
 let focused=false,unsubscribed=0,allowLeave=true;
 const $=id=>{
   if(!elements.has(id))elements.set(id,{
     hidden:false,disabled:false,value:'',style:{},textContent:'',
     focus(){focused=true;}
   });
   return elements.get(id);
 };
 const state={
   mode:'player',code:'638908',user:{uid:'device-a'},app:{},
   room:{status:'finished',expiresAtMs:Date.now()+60000,cursor:19,current:null},
   teams:[{uid:'device-a',name:'Đội A',score:350}],optimisticMember:null,joinRoomInfo:null,
   joinedCode:'638908',playerRoomEpoch:0,submitToken:0,submitting:false,latestCursor:19,selectedChoice:null,
   $,
   sanitizedCode:value=>String(value||'').replace(/\D/g,'').slice(0,6),
   showText:(id,value)=>{$(id).textContent=String(value??'');},
   getMember:()=>state.teams.find(t=>t.uid===state.user.uid)||null,
   roomPhase:()=>state.room?.status==='finished'?'finished':state.room?.expiresAtMs<Date.now()?'expired':state.room?.status||null,
   syncArt(){},renderQuestion(){},readLocal:()=>'',remaining:()=>15000,
   saveLocal:(key,value)=>saved.set(key,value),
   stopListening:()=>{unsubscribed++;},
   setCode:value=>{state.code=value;$('joinCode').value=value;},
   render:()=>state.renderPlayer(),
   URL,location:{href:'https://example.test/live.html?mode=player&code=638908'},
   history:{replaceState(...args){state.lastUrl=args[2];}},
   confirm:()=>allowLeave,LETTERS:['A','B','C','D'],
   call:()=>Promise.resolve({status:'finished',canJoin:false,member:false})
 };
 vm.createContext(state);
 vm.runInContext(renderer+'\n'+inspection+'\n'+clear,state);
 $('joinCode').value='638908';

 // Registered player, completed room: visible result AND switch button.
 state.renderPlayer();
 assert.equal($('playerGame').hidden,false);
 assert.equal($('playerFinishedPanel').hidden,false);
 assert.equal($('playerRoomToolbar').hidden,false);
 assert.match($('playerFinishedTitle').textContent,/kết thúc/i);

 // An expired room, regardless of its lingering database status 'lobby'.
 state.room={status:'lobby',expiresAtMs:Date.now()-60000,cursor:-1,current:null};
 state.renderPlayer();
 assert.equal($('playerWaiting').hidden,true);
 assert.equal($('playerFinishedPanel').hidden,false);
 assert.match($('playerFinishedTitle').textContent,/hết hạn/i);

 // Switching clears localStorage and old subscriptions, revealing a usable form.
 state.clearPlayerRoom();
 assert.equal(state.code,'');
 assert.equal($('joinFormPanel').hidden,false);
 assert.equal($('playerGame').hidden,true);
 assert.equal(saved.get('vnr202-joined-code'),'');
 assert.ok(!state.lastUrl.includes('code='));
 assert.ok(unsubscribed>0&&focused);

 // A late QR to a finished room also has an escape hatch.
 state.code='638908';$('joinCode').value='638908';
 state.joinRoomInfo={code:'638908',status:'finished',canJoin:false,member:false};
 state.renderPlayer();
 assert.equal($('playerClosedPanel').hidden,false);
 assert.equal($('joinFormPanel').hidden,true);
 assert.equal($('playerRoomToolbar').hidden,false);
 state.clearPlayerRoom();
 assert.equal($('joinFormPanel').hidden,false);

 // During a live question, the switch requires consent, and then works.
 state.code='123456';$('joinCode').value='123456';
 state.room={status:'question',expiresAtMs:Date.now()+60000,cursor:1,current:{id:'r1',stage:'rapid',choices:[],prompt:'Question'}};
 state.teams=[{uid:'device-a',name:'Đội A',score:350}];
 allowLeave=false;state.clearPlayerRoom();
 assert.equal(state.code,'123456','Cancel must keep current question open');
 allowLeave=true;state.clearPlayerRoom();
 assert.equal(state.code,'','Confirmed switch must return to join form');

 // Async room inspection returning later must not bring back a previous room.
 state.code='123456';$('joinCode').value='123456';
 let respond;
 state.call=()=>new Promise(resolve=>{respond=resolve;});
 const oldStatus=state.inspectRoomJoinStatus('123456');
 state.clearPlayerRoom();
 respond({status:'finished',canJoin:false,member:false});
 await oldStatus;
 assert.equal(state.joinRoomInfo,null);
 assert.equal($('joinFormPanel').hidden,false);

 // Confirm the visible switch control is wired and cached closed rooms do not auto-restore.
 assert.match(html,/id="playerSwitchRoom"/);
 assert.match(source,/\$\('playerSwitchRoom'\)\.onclick=clearPlayerRoom/);
 assert.match(source,/restoredFromCache&&\['finished','expired','not_found','invalid'\]/);
 assert.match(source,/const epoch=playerRoomEpoch/);
 assert.match(source,/if\(!stillHere\(\)\)return/);
 assert.match(source,/const answerCode=code,answerCursor=room\.cursor/);
 assert.match(css,/\.player-room-toolbar/);
});


test('Bộ 20 câu được ghép ảnh tư liệu đúng chủ đề và không lộ đáp án',()=>{
 const vm=require('node:vm');
 const root=path.join(__dirname,'../docs');
 const manifest=fs.readFileSync(path.join(root,'art/question-photos.js'),'utf8');
 const frontend=fs.readFileSync(path.join(root,'live.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'live.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'live.css'),'utf8');
 const fallback=fs.readFileSync(path.join(root,'art/photo-fallback.svg'),'utf8');
 const code=manifest.replaceAll('export const ','const ').replaceAll('export function ','function ');
 const context={};
 vm.runInNewContext(code+';globalThis.publicPhotos=QUESTION_PHOTOS;globalThis.getPhoto=getQuestionPhoto;',context);
 const photoIds=['r1','r2','r3','r4','r5','r6','r7','r8','f1','f2','f3','f4','f5','f6','g1','g2','g3','g4','g5','g6'];
 assert.deepEqual(Object.keys(context.publicPhotos).sort(),photoIds.sort());
 for(const id of photoIds){
   const q={id,stage:id[0]==='r'?'rapid':id[0]==='f'?'feud':'green'};
   const photo=context.getPhoto(q);
   assert.equal(photo.id,id);
   assert.match(photo.url,/^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//);
   assert.match(photo.source,/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
   assert.match(photo.fallback,/^\.\/art\/photo-fallback\.svg$/);
   assert.ok(photo.credit&&photo.alt);
   assert.ok(!/correctIndex|correctText|choice|score|answer/i.test(JSON.stringify(context.publicPhotos[id])));
 }
 assert.equal(context.getPhoto({id:'unknown',stage:'rapid'}),null);
 assert.match(frontend,/import \{getQuestionPhoto\} from/);
 assert.match(frontend,/function attachQuestionPhoto\(img,q\)/);
 assert.match(frontend,/function updatePhotoCredit\(fig,photo\)/);
 assert.match(frontend,/function syncArt\(wrapId,imgId,q/);
 assert.match(frontend,/attachQuestionPhoto\(art,q\)/);
 assert.match(frontend,/unavailablePhotos\.add\(desired\)/);
 assert.match(frontend,/photo\.credit\|\|'Wikimedia Commons'/);
 assert.match(fallback,/<svg\s/);
 assert.ok(!/Segoe UI Emoji/.test(fallback),'Photo fallback should not be a giant emoji');
 assert.match(css,/\.question-art\.photo-frame/);
 assert.match(css,/\.host-question-photo/);
 assert.match(css,/\.photo-attribution/);
 assert.match(html,/id="playerArtWrap" class="question-art player-art photo-frame"/);
 assert.match(html,/id="boardArtWrap" class="question-art board-art photo-frame"/);
 assert.match(html,/live\.js\?v=photo8/);
 assert.match(html,/live\.css\?v=photo8/);
});
