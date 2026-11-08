import {initializeApp,getAuth,onAuthStateChanged,signInAnonymously,getFirestore,doc,collection,onSnapshot,getFunctions,httpsCallable} from "./supabase-adapter.js";
import {supabaseConfig,isSupabaseConfigured} from "./supabase-config.js";

const $=id=>document.getElementById(id);
const MODES=['host','player','board'];
const MODE_LABELS={host:'MC',player:'Đội chơi',board:'Máy chiếu'};
const STAGES={rapid:'Vòng 1 · Dấu mốc lịch sử',feud:'Vòng 2 · Giải mã Đại hội',green:'Vòng 3 · Việt Nam xanh'};
const LETTERS=['A','B','C','D'];
let mode=new URLSearchParams(location.search).get('mode')||'player';
// The Supabase email magic-link may also use ?code=PKCE_TOKEN. Only six digits are a room code.
const urlCode=(new URLSearchParams(location.search).get('code')||'').trim();
let code=/^\d{6}$/.test(urlCode)?urlCode:'';
let app,auth,db,functions,user,room,teams=[],privateQuestions=null,hostAuthorized=false;
let unRoom=null,unTeams=null,joinedCode='',selectedChoice=null,submitting=false,closingKey='',latestCursor=-1;
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
function getMember(){return teams.find(t=>t.uid===user?.uid)||null;}
function sortedTeams(){return [...teams].sort((a,b)=>(a.position||0)-(b.position||0));}
function rankings(){return [...teams].sort((a,b)=>(b.score||0)-(a.score||0)||(a.position||0)-(b.position||0));}
function formatClock(ms){const total=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');}
function remaining(){return room?.status==='question'?Math.max(0,(room.deadlineMs||0)-Date.now()):0;}
function call(name,data){return httpsCallable(functions,name)(data).then(r=>r.data);}

/* Host privilege is checked by a Supabase RPC. UI-only checks are not the security boundary:
   vnr_create_room and vnr_control_room independently enforce the allowlist server-side. */
function renderHostAccess(){
  $('hostAuthPanel').hidden=hostAuthorized;
  $('hostLayout').hidden=!hostAuthorized;
  $('hostAuthStatus').hidden=!hostAuthorized;
  if(hostAuthorized)showText('hostAuthIdentity','🔐 MC: '+(user?.email||'Tài khoản đã xác thực'));
}
async function checkHostAccess(){
  hostAuthorized=false;
  if(user&&!user.is_anonymous&&app){
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
async function hostSendOtp(){
  const email=$('hostEmail').value.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return notify('Nhập email MC hợp lệ.',true);
  $('hostSendOtp').disabled=true;
  try{
    const redirect=new URL('./live.html?mode=host',location.href).toString();
    const {error}=await app.auth.signInWithOtp({
      email,options:{emailRedirectTo:redirect,shouldCreateUser:true}
    });
    if(error)throw error;
    showText('hostAuthMessage','Đã gửi email đăng nhập. Hãy mở liên kết trong thư hoặc nhập mã OTP nếu thư có mã 6 chữ số.');
    notify('Đã gửi email đăng nhập MC.');
  }catch(err){notify('Lỗi gửi email: '+err.message,true);}
  finally{$('hostSendOtp').disabled=false;}
}
async function hostVerifyOtp(){
  const email=$('hostEmail').value.trim().toLowerCase();
  const token=$('hostOtp').value.trim().replace(/\s/g,'');
  if(!email||!/^\d{6,8}$/.test(token))return notify('Nhập email và mã OTP hợp lệ.',true);
  $('hostVerifyOtp').disabled=true;
  try{
    const {data,error}=await app.auth.verifyOtp({email,token,type:'email'});
    if(error)throw error;
    user=data.user;
    if(await checkHostAccess()){
      notify('✓ Đăng nhập MC thành công.');
      if(code)watchRoom(code);
    }else{
      showText('hostAuthMessage','Email đã xác thực nhưng chưa được người quản lý cho phép làm MC.');
      notify('Email này chưa có quyền MC.',true);
    }
  }catch(err){notify('Không xác minh được mã: '+err.message,true);}
  finally{$('hostVerifyOtp').disabled=false;}
}
async function hostSignOut(){
  try{
    await app.auth.signOut();
    user=null;hostAuthorized=false;
    stopListening();room=null;teams=[];
    renderHostAccess();render();
    notify('Đã đăng xuất MC.');
  }catch(err){notify('Lỗi đăng xuất: '+err.message,true);}
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
function renderQr(){
  const link=joinLink();
  $('qrImage').src='https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data='+encodeURIComponent(link);
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
    render();
  },err=>notify('Không đọc được đội chơi: '+err.message,true));
  render();
}
function teamCard(team,position){
  const card=element('div','live-team'+(team?'':' empty'));
  card.append(element('div','live-team-number',team?.position||position));
  const detail=element('div','live-team-info');
  detail.append(element('strong','',team?.name||'Chờ đội tham gia'),
    element('span','',team?(team.score||0)+' điểm':'Chưa đăng ký'));
  card.append(detail);
  return card;
}
function renderTeams(target){
  const sorted=sortedTeams(),frag=document.createDocumentFragment();
  for(let i=0;i<8;i++)frag.append(teamCard(sorted[i],i+1));
  $(target).replaceChildren(frag);
}
function createChoice(text,index,interactive,selected,correct){
  const button=element(interactive?'button':'div',interactive?'':'choice-display');
  if(interactive)button.type='button';
  const letter=element('span','',LETTERS[index]);
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
function renderHost(){
  renderTeams('hostTeams');
  showText('teamCount',teams.length+'/8 đội');
  const host=hostAuthorized&&room?.hostUid===user?.uid;
  $('hostRoomCard').hidden=!room||!host;
  $('createRoom').disabled=!privateQuestions||!user||!hostAuthorized;
  if(room&&host){
    showText('hostRoomCode',code);
    if($('qrImage').dataset.code!==code){$('qrImage').dataset.code=code;renderQr();}
  }
  const active=room?.status||'Chưa tạo phòng';
  const labels={lobby:'Chờ đội',question:'Đang nhận đáp án',revealed:'Đã chấm điểm',finished:'Hoàn thành'};
  showText('hostStatus',labels[active]||active);
  const q=room?.current;
  $('hostPrompt').replaceChildren(element('p','',q?.prompt||(room?.status==='finished'?'Gameshow đã kết thúc.':'Đang chờ MC tạo phòng hoặc bắt đầu câu hỏi.')));
  const isLobby=room?.status==='lobby',isRevealed=room?.status==='revealed';
  $('nextQuestion').disabled=!host||!teams.length||!(isLobby||isRevealed);
  $('revealQuestion').disabled=!host||room?.status!=='question';
  $('finishGame').disabled=!host||!isRevealed;
  showText('nextQuestion',isLobby?'▶ Bắt đầu vòng thi':isRevealed?'→ Câu tiếp theo':'Đang trong câu hỏi');
  $('hostReveal').hidden=room?.status!=='revealed';
  showText('hostReveal',room?.status==='revealed'?
    'Đáp án đúng: '+LETTERS[room.reveal.correctIndex]+'. '+room.reveal.correctText+' — '+room.reveal.explanation:'');
}
function renderPlayer(){
  const member=getMember();
  $('joinFormPanel').hidden=Boolean(member);
  $('playerGame').hidden=!member;
  if(!member)return;
  showText('myTeamName',member.name);
  showText('myScore',(member.score||0)+' điểm');
  const labels={lobby:'Đã vào phòng. Hãy chờ MC và các đội khác.',question:'Chọn một trong bốn đáp án!',revealed:'Đã công bố đáp án và cập nhật điểm.',finished:'Gameshow kết thúc. Chúc mừng tất cả các đội!'};
  showText('playerStatus',labels[room?.status]||'Đang đồng bộ…');
  const q=room?.current;
  showText('playerRound',q?.stageLabel||'CHỜ BẮT ĐẦU');
  showText('playerPrompt',q?.prompt||(room?.status==='finished'?'🏆 Đội của bạn đạt '+member.score+' điểm':'Hãy chuẩn bị!'));
  $('playerChoices').hidden=!q;
  renderQuestion('playerChoices',true);
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
  const q=room?.current;
  showText('boardRound',q?.stageLabel?.toLocaleUpperCase('vi')||'HÀNH TRÌNH ĐỔI MỚI');
  showText('boardPrompt',q?.prompt||(room?.status==='finished'?'🏆 KẾT QUẢ CHUNG CUỘC':'Các đội hãy vào phòng bằng mã QR hoặc mã phòng.'));
  renderQuestion('boardChoices');
  $('boardChoices').hidden=!q;
  $('boardReveal').hidden=room?.status!=='revealed';
  showText('boardReveal',room?.status==='revealed'?'Đáp án: '+LETTERS[room.reveal.correctIndex]+'. '+room.reveal.correctText+' — '+room.reveal.explanation:'');
  const results=$('leaderboard');
  results.hidden=room?.status!=='finished';
  if(!results.hidden){
    results.replaceChildren(element('h2','','🏆 BẢNG XẾP HẠNG 8 ĐỘI'));
    rankings().forEach((t,i)=>{
      const row=element('div','live-team');
      row.append(element('div','live-team-number',i+1),element('strong','',t.name+' — '+(t.score||0)+' điểm'));
      results.append(row);
    });
  }
}
function render(){
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
  if(mode==='player'&&room?.status==='question'&&time===0)renderQuestion('playerChoices',true);
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
    const res=await call('joinRoom',{code:wanted,teamName});
    joinedCode=res.code;saveLocal('vnr202-joined-code',res.code);
    watchRoom(res.code);
    notify(res.rejoined?'✓ Đã vào lại phòng với tên '+res.teamName:'✓ Đăng ký đội thành công!');
  }catch(err){notify(err.message||'Vào phòng thất bại.',true);}
  finally{$('joinRoom').disabled=false;}
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
    if(b.dataset.mode==='host'&&user&&!user.is_anonymous&&!hostAuthorized)await checkHostAccess();
    if(b.dataset.mode!=='host'&&!user&&auth){
      try{user=(await signInAnonymously(auth)).user;render();}
      catch(err){notify('Không đăng nhập được người chơi: '+err.message,true);}
    }
  }));
  $('createRoom').onclick=createRoom;
  $('hostSendOtp').onclick=hostSendOtp;
  $('hostVerifyOtp').onclick=hostVerifyOtp;
  $('hostSignOut').onclick=hostSignOut;
  $('questionUpload').addEventListener('change',e=>loadQuestions(e.target.files[0]));
  $('joinRoom').onclick=joinRoom;
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
  // Do not create an anonymous session for MC. Email-verified account is required.
  user=existing||(mode==='host'?null:(await signInAnonymously(auth)).user);
  setConnection('✓ Đã kết nối Supabase • '+MODE_LABELS[mode],true);
  $('joinRoom').disabled=false;$('watchBoard').disabled=false;
  if(mode==='host'){
    if(!code)code=readLocal('vnr202-host-code');
    if(user&&!user.is_anonymous)await checkHostAccess();
    else renderHostAccess();
  }
  if(mode==='player'&&!code)code=readLocal('vnr202-joined-code');
  if(code&&(mode!=='host'||hostAuthorized)){
    if(mode==='board'){
      try{await call('authorizeSpectator',{code});watchRoom(code);}
      catch(err){notify(err.message||'Không thể xem phòng.',true);render();}
    }else watchRoom(code);
  }else render();
}
init().catch(err=>{
  $('setupBanner').hidden=false;
  setConnection('Không kết nối được Supabase.');
  notify('Không thể khởi động: '+(err.message||err),true);
  console.error(err);
});
