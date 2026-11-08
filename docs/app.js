/* VNR202 Pages: controller for 8 teams, 3 rounds, host and projector. */
(() => {
  'use strict';
  const E = window.VNR202Engine;
  if (!E) throw new Error('Thiếu bộ luật chơi VNR202.');
  const KEY='vnr202-pages-v2', OLD='vnr202-pages-v1', CHANNEL='vnr202-eight-teams';
  const $=id=>document.getElementById(id);
  let bank, state=E.createInitialState(), channel, toastTimer, soundEnabled=false, audio;
  const views=['home','board','host'];
  function read(k){try{const s=localStorage.getItem(k);return s?JSON.parse(s):null;}catch{return null;}}
  function txt(id,value){const el=$(id);if(el)el.textContent=value==null?'':String(value);}
  function node(tag,cls,content){const el=document.createElement(tag);if(cls)el.className=cls;if(content!==undefined)el.textContent=String(content);return el;}
  function icon(name){const e=document.createElementNS('http://www.w3.org/2000/svg','svg');const u=document.createElementNS('http://www.w3.org/2000/svg','use');u.setAttribute('href','#i-'+name);e.append(u);return e;}
  function toast(message,error=false){const el=$('toast');el.textContent=message;el.classList.toggle('error',error);el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3500);}
  function clock(ms){const x=Math.max(0,Math.ceil((ms||0)/1000));return String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0');}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{toast('Không thể lưu điểm vào bộ nhớ trình duyệt.',true);}try{channel?.postMessage({kind:'change'});}catch{}}
  function sync(){const next=read(KEY);if(!next)return;state=E.restore(next);render();}
  function action(type,args={}){
    if(!bank)return toast('Chưa tải xong câu hỏi.',true);
    if(type==='RESET'&&!confirm('Xóa điểm cả 8 đội để chơi lại từ đầu?'))return;
    try{
      state=E.reduce(state,{type,...args},bank,Date.now());save();render();
      if(type==='REVEAL'||type==='AWARD')sfx('correct');
      if(type==='STRIKE')sfx('wrong');
      if(type==='NEXT'||type==='START')sfx('change');
      if(type==='RESET')toast('Đã đặt lại trò chơi, giữ tên 8 đội.');
    }catch(err){toast(err.message||'Không thực hiện được thao tác.',true);}
  }
  function show(view,updateURL=true){
    const selected=views.includes(view)?view:'home';
    views.forEach(v=>$(v+'View').hidden=v!==selected);
    document.querySelectorAll('[data-view]').forEach(b=>{
      const active=b.dataset.view===selected;b.classList.toggle('active',active);
      if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    });
    if(updateURL){const url=new URL(location.href);url.searchParams.set('view',selected);history.replaceState({},'',url.pathname+url.search+url.hash);}
    render();
  }
  function leadingScore(){return Math.max(0,...state.teams.map(t=>t.score));}
  function smallTeam(team){
    const card=node('div','team-card');if(team.score&&team.score===leadingScore())card.classList.add('leader');
    const crest=node('span','team-emblem',team.id);crest.setAttribute('aria-hidden','true');
    const copy=node('div','team-copy');copy.append(node('strong','',team.name),node('span','team-score',team.score+' điểm'));
    card.append(crest,copy);return card;
  }
  function scoreboards(){
    for(const id of ['homeTeamGrid','boardTeamGrid']){
      const f=document.createDocumentFragment();state.teams.forEach(t=>f.append(smallTeam(t)));$(id).replaceChildren(f);
    }
  }
  function renderFinal(){
    const target=$('finalLeaderboard');target.replaceChildren();
    const ranking=E.rankTeams(state.teams),top=ranking[0].score;
    const winners=ranking.filter(t=>t.score===top).map(t=>t.name).join(' & ');
    target.append(node('h2','', '🏆 CHÚC MỪNG '+winners.toLocaleUpperCase('vi')+'!'));
    target.append(node('p','muted','BẢNG XẾP HẠNG CHUNG CUỘC'));
    const list=node('div','final-list');
    ranking.forEach((t,i)=>{
      const row=node('div','final-item');
      row.append(node('span','final-place',i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)),
        node('span','final-name',t.name),node('strong','final-score',t.score+' điểm'));
      list.append(row);
    });target.append(list);
  }
  function renderBoard(){
    const q=E.question(bank,state),stage=state.stage;
    txt('stageName',E.STAGE_LABELS[stage]||'Sẵn sàng');
    txt('questionPosition',q?'Câu '+(state.index+1)+' / '+bank.rounds[stage].length:'');
    txt('roundBadge',stage==='lobby'?'SẴN SÀNG KHỞI ĐỘNG':stage==='finale'?'CÔNG BỐ KẾT QUẢ':E.STAGE_LABELS[stage].toLocaleUpperCase('vi'));
    txt('questionText',q?.question||(stage==='finale'?'Chúc mừng các đội hoàn thành thử thách!':'Chào mừng đến với HÀNH TRÌNH ĐỔI MỚI!'));
    $('picturePanel').hidden=stage!=='green';txt('pictureIcon',stage==='green'?q?.image||'🌿':'');txt('pictureHint',stage==='green'?q?.hint||'':'');
    const answers=$('answersGrid'),reveal=$('revealPanel');answers.replaceChildren();
    answers.hidden=!(stage==='feud'&&q);reveal.hidden=!(q&&stage!=='feud');
    if(q&&stage==='feud')q.answers.forEach((ans,i)=>{
      const open=state.slots.includes(i),tile=node('div','answer-tile'+(open?' is-revealed':''));
      tile.append(node('span','answer-index',i+1),
        node('span','answer-word'+(open?'':' answer-hidden'),open?ans.text:'••••••••••••'),
        node('span','answer-value',open?ans.points:''));
      answers.append(tile);
    });
    else if(q)reveal.textContent=state.revealed?q.answer:'❓  ĐÁP ÁN BÍ MẬT';
    txt('strikeText',stage==='feud'?'✕ '.repeat(state.strikes):'');
    const marked=q&&state.awards[q.id];
    const team=marked?state.teams.find(t=>t.id===Number(marked.teamId)):null;
    txt('scoreNote',marked?(team?team.name:'Đội thắng')+' +'+(marked.points||0)+' điểm':
      stage==='feud'?'Điểm đang chờ: '+state.roundPoints+' / 100':'MC điều khiển câu hỏi và bảng điểm');
    $('finalLeaderboard').hidden=stage!=='finale';
    document.querySelector('.game-area').hidden=stage==='finale';
    if(stage==='finale')renderFinal();
  }
  function renderQuestionList(){
    const target=$('questionList');target.replaceChildren();
    const stage=E.STAGES.includes(state.stage)?state.stage:'rapid';
    (bank.rounds[stage]||[]).forEach((q,i)=>{
      const button=node('button','', (i+1)+'. '+q.question);
      if(stage===state.stage&&state.index===i)button.classList.add('selected');
      button.onclick=()=>action('SELECT',{stage,index:i});target.append(button);
    });
  }
  function renderHostTeams(){
    const select=$('awardTeamSelect');select.replaceChildren();
    state.teams.forEach(t=>{const o=node('option','',t.id+'. '+t.name);o.value=t.id;select.append(o);});
    select.value=String(state.selectedTeamId);
    const fragment=document.createDocumentFragment();
    state.teams.forEach(team=>{
      const card=node('div','host-team');card.classList.toggle('active',team.id===state.selectedTeamId);
      const top=node('div','host-team-top'),crest=node('span','team-emblem',team.id);
      const choose=node('button','',team.name);choose.title='Chọn '+team.name+' để trao điểm';
      choose.onclick=()=>action('SELECT_TEAM',{teamId:team.id});
      const edit=node('button','','✎');edit.style.flex='0 0 24px';edit.title='Đổi tên '+team.name;
      edit.onclick=()=>{const name=prompt('Tên mới cho '+team.name+' (tối đa 32 ký tự):',team.name);if(name!==null)action('RENAME',{teamId:team.id,name});};
      top.append(crest,choose,edit);
      const controls=node('div','host-team-actions');
      for(const delta of [10,-10]){const b=node('button','',delta>0?'+10':'−10');b.title=(delta>0?'Cộng':'Trừ')+' 10 điểm cho '+team.name;b.onclick=()=>action('ADJUST',{teamId:team.id,delta});controls.append(b);}
      card.append(top,node('div','host-team-score',team.score+' điểm'),controls);fragment.append(card);
    });
    $('hostTeamGrid').replaceChildren(fragment);
  }
  function renderHost(){
    const q=E.question(bank,state),stage=state.stage;
    txt('hostRoundTitle',q?E.STAGE_LABELS[stage]+' • Câu '+(state.index+1):(E.STAGE_LABELS[stage]||'Sẵn sàng'));
    txt('hostQuestion',q?.question||'Chọn vòng thi để bắt đầu.');
    txt('hostAnswer',q?(stage==='feud'?'Đáp án: '+q.answers.map(a=>a.text+' ('+a.points+'đ)').join(' · '):'Đáp án: '+q.answer):'Đáp án sẽ hiển thị tại đây (chỉ MC thấy).');
    txt('roundPoints',q?(state.awards[q.id]?'✓ Câu này đã chấm điểm':stage==='feud'?state.roundPoints+' điểm đang chờ':q.points+' điểm nếu đúng'):'Chưa có câu hỏi');
    $('awardPoints').disabled=!q||Boolean(state.awards[q.id]);$('feudControls').hidden=stage!=='feud';
    const controls=$('revealButtons');controls.replaceChildren();
    if(q&&stage==='feud')q.answers.forEach((ans,i)=>{
      const opened=state.slots.includes(i);
      const b=node('button',opened?'small-btn':'btn btn-outline-gold',opened?'✓ Ô '+(i+1):'Mở ô '+(i+1));
      b.disabled=opened;b.onclick=()=>action('REVEAL',{index:i});controls.append(b);
    });
    else if(q){const b=node('button','btn btn-outline-gold',state.revealed?'✓ Đã công bố đáp án':'Mở đáp án');b.disabled=state.revealed;b.onclick=()=>action('REVEAL');controls.append(b);}
    document.querySelectorAll('[data-stage]').forEach(b=>b.classList.toggle('active',b.dataset.stage===stage));
    renderQuestionList();renderHostTeams();
    const marked=q&&state.awards[q.id],team=state.teams.find(t=>t.id===Number(marked?.teamId));
    txt('awardStatus',marked&&team?team.name+' +'+marked.points+' điểm':'Có thể trao điểm cho bất kỳ đội nào.');
  }
  function render(){if(!bank)return;scoreboards();renderBoard();renderHost();refreshClock();}
  function refreshClock(){
    const remain=E.remainingMs(state);txt('clockBoard',clock(remain));txt('clockHost',clock(remain));
    if(state.running&&remain<=0){action('TIMER_PAUSE');toast('⏱ Hết giờ trả lời!');sfx('wrong');}
  }
  function sfx(kind){
    if(!soundEnabled||!window.AudioContext)return;
    try{
      audio||=new AudioContext();const notes=kind==='correct'?[523,784]:kind==='wrong'?[220,175]:[440];
      notes.forEach((hz,i)=>{
        const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.1;
        o.type=kind==='wrong'?'sawtooth':'sine';o.frequency.value=hz;g.gain.setValueAtTime(.0001,t);
        g.gain.exponentialRampToValueAtTime(.07,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+.18);
        o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.19);
      });
    }catch{}
  }
  function wire(){
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>show(b.dataset.view));
    document.querySelectorAll('[data-stage]').forEach(b=>b.onclick=()=>action('SELECT',{stage:b.dataset.stage,index:0}));
    document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));
    $('resetGame').onclick=()=>action('RESET');
    $('awardPoints').onclick=()=>action('AWARD',{teamId:state.selectedTeamId});
    $('awardTeamSelect').onchange=e=>action('SELECT_TEAM',{teamId:Number(e.target.value)});
    $('openProjector').onclick=()=>window.open('?view=board','_blank','noopener');
    $('boardFullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Nhấn F11 để bật toàn màn hình.',true);}};
    $('soundToggle').onclick=()=>{soundEnabled=!soundEnabled;$('soundToggle').replaceChildren(icon(soundEnabled?'volume':'volume-off'),document.createTextNode(soundEnabled?' Bật tiếng':' Tắt tiếng'));if(soundEnabled)sfx('correct');};
    window.addEventListener('popstate',()=>show(new URLSearchParams(location.search).get('view')||'home',false));
    window.addEventListener('storage',e=>{if(e.key===KEY)sync();});
    try{channel=new BroadcastChannel(CHANNEL);channel.onmessage=e=>{if(e.data?.kind==='change')sync();};}catch{}
    setInterval(refreshClock,250);
  }
  async function init(){
    wire();
    const r=await fetch('./questions.json?v=2',{cache:'no-cache'});
    if(!r.ok)throw Error('Lỗi HTTP '+r.status+' khi tải câu hỏi');
    bank=await r.json();
    const old=read(KEY);
    state=E.restore(old,old?null:read(OLD));
    if(!old)save();
    show(new URLSearchParams(location.search).get('view')||'home',false);
  }
  init().catch(e=>{toast('Lỗi khởi động: '+e.message,true);console.error(e);});
})();
