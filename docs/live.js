import {initializeApp,getAuth,onAuthStateChanged,signInAnonymously,getFirestore,doc,collection,onSnapshot,getFunctions,httpsCallable} from "./supabase-adapter.js?v=room-lock6";
import {supabaseConfig,isSupabaseConfigured} from "./supabase-config.js?v=20261109-fix2";

const $=id=>document.getElementById(id);
const MODES=['host','player','board'];
const MODE_LABELS={host:'MC',player:'Đội chơi',board:'Máy chiếu'};
const STAGES={rapid:'Vòng 1 · Dấu mốc lịch sử',feud:'Vòng 2 · Giải mã Đại hội',green:'Vòng 3 · Việt Nam xanh'};
const LETTERS=['A','B','C','D'];
const ART_IDS={
  rapid:new Set(['r1','r2','r3','r4','r5','r6','r7','r8']),
  feud:new Set(['f1','f2','f3','f4','f5','f6']),
  green:new Set(['g1','g2','g3','g4','g5','g6'])
};
let mode=new URLSearchParams(location.search).get('mode')||'player';
// The Supabase email magic-link may also use ?code=PKCE_TOKEN. Only six digits are a room code.
const urlCode=(new URLSearchParams(location.search).get('code')||'').trim();
let code=/^\d{6}$/.test(urlCode)?urlCode:'';
let app,auth,db,functions,user,room,teams=[],privateQuestions=null,hostAuthorized=false;
let unRoom=null,unTeams=null,joinedCode='',optimisticMember=null,joinRoomInfo=null,selectedChoice=null,submitting=false,closingKey='',latestCursor=-1;
let toastTimer=null;

function showText(id,value){const el=$(id);if(el)el.textContent=value==null?'':String(value);}
function element(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el;}
function notify(message,error=false){
  const box=$('liveToast');box.textContent=message;box.classList.toggle('error',error);box.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.hidden=true,4400);
}
function setConnection(text,connected=false){const el=$('connection');el.textContent=text;el.classList.toggle('good',connected);}
function displayMode(next,writeUrl=true){
  mode=MODES.includes(next)?next:'player';
  for(const m of MODES)$(m+'Screen').hidden=m!==mode;
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  if(writeUrl){
    const url=new URL(location.href);url.searchParams.set('mode',mode);
    if(code)url.searchParams.set('code',code);
    history.replaceState({},'',url.pathname+url.search);
  }
  render();
}
function readLocal(key){try{return localStorage.getItem(key)||'';}catch{return '';}}
function saveLocal(key,value){try{localStorage.setItem(key,value);}catch{}}
function teamName(uid){return teams.find(t=>t.uid===uid)?.name||'Đội chơi';}
function getMember(){
  // Give immediate feedback after a successful server join; realtime snapshot may take a moment.
  return teams.find(t=>t.uid===user?.uid)
    || (optimisticMember?.uid===user?.uid&&optimisticMember?.code===code?optimisticMember:null);
}
function sortedTeams(){return [...teams].sort((a,b)=>(a.position||0)-(b.position||0));}
function rankings(){return [...teams].sort((a,b)=>(b.score||0)-(a.score||0)||(a.position||0)-(b.position||0));}
function formatClock(ms){const total=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');}
function remaining(){return room?.status==='question'?Math.max(0,(room.deadlineMs||0)-Date.now()):0;}
function call(name,data){return httpsCallable(functions,name)(data).then(r=>r.data);}
async function inspectRoomJoinStatus(requested){
  if(!user||!app||!/^[0-9]{6}$/.test(requested))return null;
  const result=await call('roomJoinStatus',{code:requested});
  // Ignore stale async responses after another room code has been entered.
  if(mode==='player'&&sanitizedCode($('joinCode').value)===requested){
    joinRoomInfo={...result,code:requested};
    renderPlayer();
  }
  return result;
}
function clearPlayerRoom(){
  stopListening();
  room=null;teams=[];optimisticMember=null;joinRoomInfo=null;joinedCode='';
  saveLocal('vnr202-joined-code','');
  setCode('');
  const url=new URL(location.href);
  url.searchParams.delete('code');
  history.replaceState({},'',url.pathname+url.search);
  render();
  $('joinCode').focus();
}

/* Host privilege is checked by a Supabase RPC. UI-only checks are not the security boundary:
   vnr_create_room and vnr_control_room independently enforce the allowlist server-side. */
function renderHostAccess(){
  $('hostAuthPanel').hidden=hostAuthorized;
  $('hostLayout').hidden=!hostAuthorized;
  $('hostAuthStatus').hidden=!hostAuthorized;
  $('hostLogin').disabled=!user||!app||hostAuthorized;
  if(hostAuthorized)showText('hostAuthIdentity','🔐 MC đã đăng nhập');
}
async function checkHostAccess(){
  hostAuthorized=false;
  if(user&&app){
    try{
      const {data,error}=await app.rpc('vnr_is_authorized_host');
      if(error)throw error;
      hostAuthorized=data===true;
    }catch(err){notify('Không xác minh được quyền MC: '+err.message,true);}
  }
  renderHostAccess();
  render();
  return hostAuthorized;
}
async function hostLogin(){
  if(!user||!app)return notify('Chưa có kết nối đăng nhập Supabase. Hãy bật Anonymous Sign-Ins.',true);
  const username=$('hostUsername').value.trim().toLowerCase();
  const password=$('hostPassword').value;
  if(!/^[a-z0-9_]{4,32}$/.test(username)||!password)return notify('Nhập tên đăng nhập và mật khẩu MC.',true);
  $('hostLogin').disabled=true;
  try{
    const {data,error}=await app.rpc('vnr_mc_login',{p_username:username,p_password:password});
    if(error)throw error;
    $('hostPassword').value='';
    if(data?.ok===true && await checkHostAccess()){
      notify('✓ Đăng nhập MC thành công.');
      if(code)watchRoom(code);
    }else{
      const reason=data?.error==='locked'
        ?'Tạm khóa 15 phút do nhập sai nhiều lần. Hãy thử lại sau.'
        : 'Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản chưa kích hoạt.';
      showText('hostAuthMessage',reason);
      notify(reason,true);
    }
  }catch(err){
    $('hostPassword').value='';
    notify('Lỗi xác thực MC: '+err.message,true);
  }finally{$('hostLogin').disabled=!user||hostAuthorized;}
}
async function hostSignOut(){
  try{
    if(app&&user){
      const {error}=await app.rpc('vnr_mc_logout');
      if(error)throw error;
    }
    hostAuthorized=false;
    stopListening();room=null;teams=[];
    renderHostAccess();render();
    notify('Đã đăng xuất quyền MC.');
  }catch(err){notify('Không thể đăng xuất MC: '+err.message,true);}
}

function sanitizedCode(value){return String(value||'').replace(/\D/g,'').slice(0,6);}
function setCode(value){
  code=sanitizedCode(value);
  $('hostCode').value=code;$('joinCode').value=code;$('boardCode').value=code;
  if(code)showText('boardRoomCode','PHÒNG '+code);
}
function joinLink(){
  const url=new URL('./live.html',location.href);
  url.searchParams.set('mode','player');url.searchParams.set('code',code);
  return url.toString();
}
function qrImageUrl(link,size,backup=false){
  return backup
    ?'https://quickchart.io/qr?size='+size+'&margin=2&text='+encodeURIComponent(link)
    :'https://api.qrserver.com/v1/create-qr-code/?size='+size+'x'+size+'&margin=12&data='+encodeURIComponent(link);
}
function renderQr(which){
  if(code.length!==6)return;
  const link=joinLink();
  const targets=which==='host'?[['qrImage',320]]:[['boardQRImage',392]];
  for(const [id,size] of targets){
    const img=$(id);
    if(!img||img.dataset.code===code)continue;
    img.dataset.code=code;
    img.dataset.backup='';
    img.onerror=()=>{
      if(!img.dataset.backup){
        img.dataset.backup='yes';
        img.src=qrImageUrl(link,size,true);
      }
    };
    img.src=qrImageUrl(link,size);
  }
}
function questionArt(q){
  if(!q)return './art/banners/rapid.svg';
  const stage=Object.prototype.hasOwnProperty.call(ART_IDS,q.stage)?q.stage:'rapid';
  if(ART_IDS[stage].has(q.id))return './art/questions/'+q.id+'.svg';
  return './art/banners/'+stage+'.svg';
}
function syncArt(wrapId,imgId,q,showOnLobby=false){
  const wrap=$(wrapId),img=$(imgId);
  if(!wrap||!img)return;
  const visible=Boolean(q)||(showOnLobby&&room?.status==='lobby');
  wrap.hidden=!visible;
  if(!visible)return;
  const src=questionArt(q);
  if(img.getAttribute('src')!==src){
    img.src=src;
    img.alt=q?'Hình minh họa chủ đề câu '+(q.number||''):'Ảnh chủ đề mở đầu gameshow';
  }
}
function stopListening(){unRoom?.();unTeams?.();unRoom=null;unTeams=null;}
function watchRoom(value){
  if(!db)return;
  const next=sanitizedCode(value);
  if(next.length!==6)return notify('Mã phòng phải có 6 chữ số.',true);
  stopListening();setCode(next);room=null;teams=[];latestCursor=-1;selectedChoice=null;
  unRoom=onSnapshot(doc(db,'rooms',next),snapshot=>{
    if(!snapshot.exists()){
      room=null;notify('Không tìm thấy phòng '+next+'.',true);render();return;
    }
    room=snapshot.data();
    if(room.expiresAtMs&&room.expiresAtMs<Date.now())notify('Phòng đã hết hạn.',true);
    if(latestCursor!==room.cursor){selectedChoice=null;latestCursor=room.cursor;}
    render();
  },err=>{setConnection('Mất kết nối Supabase');notify('Không đọc được phòng: '+err.message,true);});
  unTeams=onSnapshot(collection(db,'rooms',next,'teams'),snapshot=>{
    teams=snapshot.docs.map(d=>({uid:d.id,...d.data()}));
    if(optimisticMember?.code===next&&teams.some(t=>t.uid===optimisticMember.uid))
      optimisticMember=null;
    render();
  },err=>notify('Không đọc được đội chơi: '+err.message,true));
  render();
}
function teamCard(team,position,ranked=false){
  const leader=ranked&&position===1&&Boolean(team);
  const card=element('div','live-team'+(team?'':' empty')+(leader?' winner':''));
  card.append(element('div','live-team-number',team?(ranked?position:team.position):position));
  const detail=element('div','live-team-info');
  detail.append(element('strong','',team?.name||'Chờ đội tham gia'),
    element('span','',team?(team.score||0)+' điểm':'Chưa đăng ký'));
  if(team&&ranked&&(team.lastGain||0)>0)
    detail.append(element('span','team-gain','+'+team.lastGain+' điểm vừa nhận'));
  card.append(detail);
  if(leader)card.append(element('span','leader-crown','👑'));
  return card;
}
function renderTeams(target){
  const ranked=room?.status==='revealed'||room?.status==='finished';
  const sorted=ranked?rankings():sortedTeams();
  const frag=document.createDocumentFragment();
  for(let i=0;i<8;i++)frag.append(teamCard(sorted[i],i+1,ranked));
  $(target).replaceChildren(frag);
}
function createChoice(text,index,interactive,selected,correct){
  const button=element(interactive?'button':'div',interactive?'':'choice-display');
  if(interactive)button.type='button';
  const letter=element('span','choice-letter',LETTERS[index]);
  button.append(letter,document.createTextNode(text));
  if(correct===index)button.classList.add('correct');
  if(correct!==null&&correct!==undefined&&correct!==index&&selected===index)button.classList.add('incorrect');
  if(interactive&&selected===index)button.classList.add('selected');
  return button;
}
function renderQuestion(target,interactive=false){
  const section=$(target),q=room?.current;
  section.replaceChildren();
  if(!q||!['question','revealed'].includes(room?.status))return;
  const member=getMember();
  const submitted=readLocal('vnr202-answer-'+code+'-'+room.cursor+'-'+user?.uid);
  const disabled=Boolean(submitted)||submitting||room.status!=='question'||remaining()===0;
  const correct=room?.status==='revealed'?room?.reveal?.correctIndex:null;
  q.choices.forEach((choice,i)=>{
    const button=createChoice(choice,i,interactive,selectedChoice,correct);
    if(interactive){
      button.disabled=disabled||!member;
      button.addEventListener('click',()=>submitChoice(i));
    }
    section.append(button);
  });
}
function renderHostAnswerProgress(isHost){
  const active=isHost&&(room?.status==='question'||room?.status==='revealed');
  const panel=$('hostAnswerTracker');
  panel.hidden=!active;
  if(!active)return;
  const participants=sortedTeams();
  const total=participants.length;
  const submitted=participants.filter(t=>t.answeredCursor===room.cursor).length;
  const percent=total?Math.round(submitted*100/total):0;
  showText('hostAnswerCount',submitted+'/'+total+' đội đã trả lời');
  const progress=$('hostAnswerProgress');
  progress.setAttribute('aria-valuenow',String(percent));
  $('hostAnswerFill').style.width=percent+'%';
  $('hostAnswerFill').classList.toggle('complete',total>0&&submitted===total);

  const frag=document.createDocumentFragment();
  for(const team of participants){
    const done=team.answeredCursor===room.cursor;
    const tile=element('div','host-answer-item '+(done?'answered':'pending'));
    const indicator=element('span','host-answer-indicator',done?'✓':'…');
    indicator.setAttribute('aria-hidden','true');
    const detail=element('div','host-answer-detail');
    detail.append(element('strong','',team.name));
    const label=room.status==='revealed'
      ?done?'Đã nộp đáp án':'Không nộp đáp án'
      :done?'Đã gửi đáp án':'Chưa trả lời';
    detail.append(element('span','',label));
    tile.append(indicator,detail);
    if(room.status==='revealed')
      tile.append(element('span','host-answer-points','+'+(team.lastGain||0)+' điểm'));
    frag.append(tile);
  }
  $('hostAnswerList').replaceChildren(frag);
  showText('hostAnswerHint',room.status==='revealed'
    ?'Điểm đã được chấm và công bố. MC có thể chuyển sang câu tiếp theo.'
    :total>0&&submitted===total
      ?'✓ Tất cả đội đã gửi đáp án! MC có thể công bố điểm ngay, không cần chờ hết giờ.'
      :'Còn '+(total-submitted)+' đội chưa trả lời. Có thể chờ thêm hoặc công bố khi MC quyết định.');
}
function renderHost(){
  renderTeams('hostTeams');
  showText('teamCount',teams.length+'/8 đội');
  const host=hostAuthorized&&room?.hostUid===user?.uid;
  renderHostAnswerProgress(host);
  $('hostRoomCard').hidden=!room||!host||room.status!=='lobby';
  $('hostRoomClosed').hidden=!(room&&host&&room.status!=='lobby');
  if(room&&host&&room.status!=='lobby')
    showText('hostRoomClosed',room.status==='finished'
      ?'🏁 Gameshow đã kết thúc. Phòng đã đóng, không thể thêm đội mới.'
      :'🔒 MC đã bắt đầu! Đăng ký đội mới đã khóa; các đội đã tham gia vẫn có thể chơi tiếp.');
  $('createRoom').disabled=!privateQuestions||!user||!hostAuthorized;
  if(room&&host){
    showText('hostRoomCode',code);
    showText('hostJoinCount',teams.length+'/8 đội đã tham gia');
    if(mode==='host')renderQr('host');
  }
  const active=room?.status||'Chưa tạo phòng';
  const labels={lobby:'Chờ đội',question:'Đang nhận đáp án',revealed:'Đã chấm điểm',finished:'Hoàn thành'};
  showText('hostStatus',labels[active]||active);
  const q=room?.current;
  const hostPrompt=$('hostPrompt');
  hostPrompt.replaceChildren();
  if(q){
    const art=element('img','host-question-art');
    art.src=questionArt(q);
    art.alt='Hình minh họa câu '+(q.number||'');
    hostPrompt.append(art);
  }
  hostPrompt.append(element('p','',q?.prompt||(room?.status==='finished'?'Gameshow đã kết thúc.':'Đang chờ MC tạo phòng hoặc bắt đầu câu hỏi.')));
  const isLobby=room?.status==='lobby',isRevealed=room?.status==='revealed';
  $('nextQuestion').disabled=!host||!teams.length||!(isLobby||isRevealed);
  $('revealQuestion').disabled=!host||room?.status!=='question';
  if(room?.status==='question'){
    const done=teams.filter(t=>t.answeredCursor===room.cursor).length;
    showText('revealQuestion','✓ Công bố và chấm điểm ('+done+'/'+teams.length+' đội)');
  }else showText('revealQuestion','✓ Công bố và tự chấm điểm');
  $('finishGame').disabled=!host||!isRevealed;
  showText('nextQuestion',isLobby?'▶ Bắt đầu vòng thi':isRevealed?'→ Câu tiếp theo':'Đang trong câu hỏi');
  $('hostReveal').hidden=room?.status!=='revealed';
  showText('hostReveal',room?.status==='revealed'?
    'Đáp án đúng: '+LETTERS[room.reveal.correctIndex]+'. '+room.reveal.correctText+' — '+room.reveal.explanation:'');
}
function renderPlayer(){
  const member=getMember();
  const currentInput=sanitizedCode($('joinCode').value);
  const info=mode==='player'&&joinRoomInfo?.code===currentInput?joinRoomInfo:null;
  const blocked=Boolean(!member&&info&&(info.status==='expired'||(!info.member&&!(info.status==='lobby'&&info.canJoin))));
  $('joinFormPanel').hidden=Boolean(member)||blocked;
  $('playerClosedPanel').hidden=!blocked;
  $('playerGame').hidden=!member;
  if(blocked){
    const closed={
      question:['🔒 MC đã bắt đầu','Đăng ký đã khóa. Chỉ những đội đã tham gia trước lúc bắt đầu mới được chơi.'],
      revealed:['🔒 Phòng đang thi','MC đã công bố câu hỏi. Phòng không nhận thêm đội mới.'],
      finished:['🏁 Gameshow đã kết thúc','Phòng đã kết thúc và không thể tham gia nữa. Chờ MC tạo phòng mới để chơi tiếp.'],
      expired:['⌛ Phòng đã hết hạn','Mã phòng này đã hết thời gian hoạt động. Hãy lấy mã phòng mới từ MC.'],
      not_found:['Không tìm thấy phòng','Kiểm tra lại mã gồm 6 chữ số được MC cung cấp.'],
      invalid:['Mã phòng không hợp lệ','Mã phòng phải gồm đúng 6 chữ số.'],
      lobby:['Phòng đã đủ 8 đội','MC đã có đủ tám đội. Phòng không thể nhận thêm đội mới.']
    }[info.status]||['Phòng không nhận đội mới','Hãy hỏi MC để nhận mã phòng khác.'];
    showText('playerClosedTitle',closed[0]);
    showText('playerClosedMessage',closed[1]);
    showText('playerClosedCode','PHÒNG '+currentInput);
  }
  if(!member){
    $('playerFinishedPanel').hidden=true;
    return;
  }
  const finished=room?.status==='finished';
  $('playerFinishedPanel').hidden=!finished;
  $('playerQuestionArea').hidden=finished;
  if(finished)showText('playerFinishedScore',(member.score||0)+' điểm');
  const waiting=!room||room.status==='lobby';
  $('playerWaiting').hidden=!waiting;
  showText('playerWaitingCode',code||'------');
  showText('playerWaitingCount',room?(teams.length+'/8 đội đã tham gia'):'Đang đồng bộ phòng chơi…');
  showText('myTeamName',member.name);
  showText('myScore',(member.score||0)+' điểm');
  const labels={lobby:'Đã vào phòng. Hãy chờ MC và các đội khác.',question:'Chọn một trong bốn đáp án!',revealed:'Đã công bố đáp án và cập nhật điểm.',finished:'🏁 Gameshow đã kết thúc. Phòng đã khóa.'};
  showText('playerStatus',labels[room?.status]||'Đang đồng bộ…');
  const q=room?.current;
  showText('playerRound',finished?'KẾT THÚC GAME SHOW':q?.stageLabel||'CHỜ BẮT ĐẦU');
  syncArt('playerArtWrap','playerArt',q,!finished);
  showText('playerPrompt',q?.prompt||(finished?'🏆 Đội của bạn đạt '+member.score+' điểm':waiting?'Hãy sẵn sàng cho câu hỏi đầu tiên!':'Hãy chuẩn bị!'));
  $('playerChoices').hidden=!q||finished;
  if(!finished)renderQuestion('playerChoices',true);
  const submissionKey='vnr202-answer-'+code+'-'+room?.cursor+'-'+user?.uid;
  const sent=readLocal(submissionKey);
  showText('playerFeedback',room?.status==='question'?(sent?'✓ Đã gửi đáp án. Đợi MC công bố.':remaining()===0?'Đã hết thời gian. Chờ MC chấm điểm.':'Trả lời trước khi hết giờ!'):'');
  $('playerReveal').hidden=room?.status!=='revealed';
  showText('playerReveal',room?.status==='revealed'?'Đáp án: '+LETTERS[room.reveal.correctIndex]+'. '+room.reveal.correctText+' — '+room.reveal.explanation:'');
}
function renderBoard(){
  renderTeams('boardTeams');
  showText('boardRoomCode','PHÒNG '+(code||'------'));
  const statusLabels={lobby:'Đang chờ các đội',question:'Đang thi',revealed:'Đã chấm điểm',finished:'Bảng xếp hạng'};
  showText('boardStatus',statusLabels[room?.status]||'Chưa kết nối');
  const waiting=room?.status==='lobby'&&code.length===6;
  $('boardLobby').hidden=!waiting;
  $('boardMainQuestion').hidden=waiting||room?.status==='finished';
  if(waiting){
    showText('boardJoinCode',code);
    showText('boardJoinCount',teams.length+'/8 ĐỘI ĐÃ THAM GIA');
    if(mode==='board')renderQr('board');
  }
  const q=room?.current;
  showText('boardRound',q?.stageLabel?.toLocaleUpperCase('vi')||'HÀNH TRÌNH ĐỔI MỚI');
  showText('boardPrompt',q?.prompt||(room?.status==='finished'?'🏆 KẾT QUẢ CHUNG CUỘC':'Các đội hãy vào phòng bằng mã QR hoặc mã phòng.'));
  syncArt('boardArtWrap','boardArt',q);
  renderQuestion('boardChoices');
  $('boardChoices').hidden=!q;
  $('boardReveal').hidden=room?.status!=='revealed';
  showText('boardReveal',room?.status==='revealed'?'Đáp án: '+LETTERS[room.reveal.correctIndex]+'. '+room.reveal.correctText+' — '+room.reveal.explanation:'');
  const results=$('leaderboard');
  results.hidden=room?.status!=='finished';
  if(!results.hidden){
    results.replaceChildren(element('h2','','🏆 BẢNG XẾP HẠNG CHUNG CUỘC'));
    rankings().forEach((t,i)=>{
      const card=element('div','leaderboard-row'+(i===0?' first-place':''));
      card.append(element('span','leaderboard-medal',i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)));
      const info=element('div','leaderboard-member');
      info.append(element('strong','',t.name),element('span','',(t.score||0)+' điểm'));
      card.append(info);
      results.append(card);
    });
  }
}
function render(){
  const stage=room?.current?.stage;
  document.body.dataset.stage=Object.prototype.hasOwnProperty.call(ART_IDS,stage)?stage:'rapid';
  document.body.dataset.gameStatus=room?.status||'waiting';
  renderHostAccess();
  if(!room&&mode==='host')showText('hostStatus','Chưa tạo phòng');
  renderHost();renderPlayer();renderBoard();
  updateClocks();
}
async function submitChoice(index){
  if(!room||room.status!=='question'||submitting)return;
  const member=getMember();if(!member)return notify('Bạn phải tham gia phòng trước.',true);
  submitting=true;selectedChoice=index;renderPlayer();
  try{
    await call('submitAnswer',{code,choice:index});
    saveLocal('vnr202-answer-'+code+'-'+room.cursor+'-'+user.uid,String(index));
    notify('Đã nhận câu trả lời. Điểm sẽ hiện sau khi MC công bố.');
  }catch(err){
    if(err.code==='functions/already-exists'){
      saveLocal('vnr202-answer-'+code+'-'+room.cursor+'-'+user.uid,'submitted');
      notify('Đội đã trả lời câu này.');
    }else notify(err.message||'Gửi đáp án không thành công.',true);
  }finally{submitting=false;render();}
}
async function control(action){
  if(!hostAuthorized)return notify('Chỉ MC được cấp quyền mới có thể điều khiển.',true);
  if(!room)return notify('Chưa có phòng.',true);
  try{
    const result=await call('controlGame',{code,action});
    notify(result.status==='revealed'?'✓ Đã chấm điểm và công bố đáp án.':
      result.status==='question'?'▶ Câu hỏi đã bắt đầu.':'Đã cập nhật trạng thái phòng.');
  }catch(err){notify(err.message||'Không thể điều khiển phòng.',true);}
}
function updateClocks(){
  const time=remaining();
  for(const id of ['hostTimer','playerTimer','boardTimer'])showText(id,formatClock(time));
  // MC remains authoritative: when the timer ends, trigger server-side scoring exactly once.
  if(room?.status==='question'&&room.hostUid===user?.uid&&time===0){
    const key=code+'_'+room.cursor;
    if(closingKey!==key){
      closingKey=key;
      control('REVEAL').catch(()=>{}).finally(()=>{setTimeout(()=>{if(closingKey===key)closingKey='';},3500);});
    }
  }
  if(mode==='player'&&room?.status==='question'&&time===0)
    $('playerChoices').querySelectorAll('button').forEach(b=>{b.disabled=true;});
}
async function createRoom(){
  if(!hostAuthorized)return notify('Bạn chưa có quyền tạo phòng MC.',true);
  if(!privateQuestions)return notify('Hãy chọn bộ câu hỏi JSON trước.',true);
  $('createRoom').disabled=true;
  try{
    const res=await call('createRoom',{questions:privateQuestions});
    saveLocal('vnr202-host-code',res.code);
    watchRoom(res.code);
    notify('✓ Đã tạo phòng '+res.code+'. Các đội có thể vào!');
  }catch(err){notify(err.message||'Không tạo được phòng.',true);}
  finally{$('createRoom').disabled=false;}
}
async function joinRoom(){
  const wanted=sanitizedCode($('joinCode').value),teamName=$('teamName').value.trim();
  if(wanted.length!==6||!teamName)return notify('Hãy nhập đủ mã phòng và tên đội.',true);
  $('joinRoom').disabled=true;
  try{
    const status=await inspectRoomJoinStatus(wanted);
    if(!status)return notify('Không kiểm tra được mã phòng.',true);
    if(status.status==='finished'&&status.member){
      // An already-registered team may view its final result, without a new join RPC.
      saveLocal('vnr202-joined-code',wanted);
      watchRoom(wanted);
      notify('🏁 Gameshow đã kết thúc. Đây là kết quả đội của bạn.');
      return;
    }
    if(!status.member&&!status.canJoin){
      renderPlayer();
      notify(status.status==='finished'?'Gameshow đã kết thúc. Không thể tham gia.':
        status.status==='question'||status.status==='revealed'?'MC đã bắt đầu. Phòng đã khóa đăng ký.':
        'Phòng không nhận đội mới.',true);
      return;
    }
    if(status.status==='expired')return notify('Phòng đã hết hạn.',true);
    // Server serializes MC start and team joins against the room row lock.
    const res=await call('joinRoom',{code:wanted,teamName});
    joinedCode=res.code;saveLocal('vnr202-joined-code',res.code);
    joinRoomInfo=null;
    optimisticMember={code:res.code,uid:res.teamId||user?.uid,name:res.teamName,score:0,position:0};
    watchRoom(res.code);
    render();
    const resumed=res.rejoined&&res.roomStatus!=='lobby';
    notify(resumed?'✓ Đã vào lại phòng đang thi. Tiếp tục trả lời!':
      res.rejoined?'✓ Đã vào lại phòng. Chờ MC bắt đầu!':
      '✓ Đăng ký đội thành công! Đang chờ MC bắt đầu.');
  }catch(err){
    // The MC may have started between status lookup and the join request.
    await inspectRoomJoinStatus(wanted).catch(()=>{});
    notify(err.message||'Vào phòng thất bại.',true);
  }finally{$('joinRoom').disabled=false;}
}
async function loadQuestions(file){
  if(!file)return;
  try{
    const json=JSON.parse(await file.text());
    if(!Array.isArray(json)||json.length<3)throw Error('Bộ câu hỏi cần là một mảng JSON tối thiểu 3 câu.');
    privateQuestions=json;
    const stages=['rapid','feud','green'];
    showText('fileSummary','✓ Đã nạp '+json.length+' câu: '+stages.map(stage=>json.filter(x=>x.stage===stage).length).join(' / ')+' (vòng 1 / 2 / 3).');
    $('createRoom').disabled=!user||!hostAuthorized;
  }catch(err){privateQuestions=null;showText('fileSummary','Không đọc được tệp: '+err.message);notify(err.message,true);}
}
function wire(){
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',async()=>{
    displayMode(b.dataset.mode);
    if(b.dataset.mode==='host'&&user&&!hostAuthorized)await checkHostAccess();
    if(b.dataset.mode!=='host'&&!user&&auth){
      try{user=(await signInAnonymously(auth)).user;render();}
      catch(err){notify('Không đăng nhập được người chơi: '+err.message,true);}
    }
  }));
  $('createRoom').onclick=createRoom;
  $('hostLogin').onclick=hostLogin;
  $('hostPassword').addEventListener('keydown',e=>{if(e.key==='Enter')hostLogin();});
  $('hostSignOut').onclick=hostSignOut;
  $('questionUpload').addEventListener('change',e=>loadQuestions(e.target.files[0]));
  $('joinCode').addEventListener('input',()=>{
    joinRoomInfo=null;
    if(mode==='player')renderPlayer();
  });
  $('playerTryOtherRoom').onclick=clearPlayerRoom;
  $('playerNewRoom').onclick=clearPlayerRoom;
  $('joinFormPanel').addEventListener('submit',event=>{
    event.preventDefault();
    if(!$('joinRoom').disabled)joinRoom();
  });
  $('resumeHost').onclick=()=>watchRoom($('hostCode').value);
  $('watchBoard').onclick=async()=>{
    const newCode=sanitizedCode($('boardCode').value);
    if(newCode.length!==6)return notify('Mã phòng phải có 6 số.',true);
    try{await call('authorizeSpectator',{code:newCode});watchRoom(newCode);}
    catch(err){notify(err.message||'Không thể xem phòng.',true);}
  };
  $('nextQuestion').onclick=()=>control('NEXT');
  $('revealQuestion').onclick=()=>control('REVEAL');
  $('finishGame').onclick=()=>{if(confirm('Công bố bảng xếp hạng và kết thúc phòng?'))control('FINISH');};
  $('copyJoinLink').onclick=async()=>{
    try{await navigator.clipboard.writeText(joinLink());notify('Đã sao chép link cho các đội.');}
    catch{notify('Link tham gia: '+joinLink());}
  };
  $('openBoard').onclick=()=>window.open('./live.html?mode=board&code='+encodeURIComponent(code),'_blank','noopener');
  $('boardFullscreen').onclick=async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
    catch{notify('Có thể dùng phím F11 để mở toàn màn hình.',true);}
  };
  window.addEventListener('popstate',()=>displayMode(new URLSearchParams(location.search).get('mode')||'player',false));
  setInterval(updateClocks,300);
  // A non-member waiting on the entry form must see when MC closes registration.
  setInterval(()=>{
    if(mode!=='player'||getMember()||!app||!user)return;
    const target=sanitizedCode($('joinCode').value);
    if(target.length===6)inspectRoomJoinStatus(target).catch(()=>{});
  },7500);
}
async function init(){
  wire();
  displayMode(mode,false);
  setCode(code);
  if(!isSupabaseConfigured){
    $('setupBanner').hidden=false;
    setConnection('Chưa cấu hình Supabase — giao diện chưa kết nối cơ sở dữ liệu.');
    return;
  }
  app=initializeApp(supabaseConfig);
  auth=getAuth(app);db=getFirestore(app);functions=getFunctions(app);
  const existing=await new Promise(resolve=>{const unsubscribe=onAuthStateChanged(auth,u=>{unsubscribe();resolve(u);},()=>resolve(null));});
  // Clear consumed auth callback tokens, never misinterpret them as room codes.
  if(urlCode&&!/^\d{6}$/.test(urlCode)){
    const clean=new URL(location.href);
    clean.searchParams.delete('code');
    history.replaceState({},'',clean.pathname+clean.search+clean.hash);
  }
  // Anonymous Supabase identity is used for phones and for the MC password RPC.
  // Host privileges are granted separately by server-side username/password checks.
  user=existing||(await signInAnonymously(auth)).user;
  setConnection('✓ Đã kết nối Supabase • '+MODE_LABELS[mode],true);
  $('joinRoom').disabled=false;$('watchBoard').disabled=false;
  if(mode==='host'){
    if(!code)code=readLocal('vnr202-host-code');
    if(user)await checkHostAccess();
    else renderHostAccess();
  }
  if(mode==='player'&&!code){
    code=readLocal('vnr202-joined-code');
    if(code)setCode(code);
  }
  if(code&&(mode!=='host'||hostAuthorized)){
    if(mode==='board'){
      try{await call('authorizeSpectator',{code});watchRoom(code);}
      catch(err){notify(err.message||'Không thể xem phòng.',true);render();}
    }else if(mode==='player'){
      // A QR link does not grant membership. Check state first, so closed rooms
      // never appear to accept a new player.
      try{
        const status=await inspectRoomJoinStatus(code);
        if(status?.member && status.status!=='expired')watchRoom(code);
        else render();
      }catch(err){notify('Không kiểm tra được trạng thái phòng: '+err.message,true);render();}
    }else watchRoom(code);
  }else render();
}
init().catch(err=>{
  $('setupBanner').hidden=false;
  const msg=String(err.message||err);
  const authProblem=/anonymous|sign.?up|disabled|not allowed/i.test(msg);
  setConnection(authProblem?'Supabase đã cấu hình, nhưng đăng nhập ẩn danh đang bị từ chối.':'Không khởi động được Supabase Auth.');
  $('setupBanner').querySelector('h2').textContent=authProblem?'Cần bật Anonymous Sign-Ins trên Supabase':'Không khởi động được dịch vụ đăng nhập';
  $('setupBanner').querySelector('p').textContent=authProblem
    ?'Vào Supabase → Authentication → Providers → Anonymous Sign-Ins và bật tính năng này. Sau đó tải lại trang.'
    :'Kiểm tra kết nối mạng, cấu hình Supabase và tải lại trang. Chi tiết: '+msg;
  notify('Lỗi đăng nhập Supabase: '+msg,true);
  console.error(err);
});
