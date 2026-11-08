'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { timingSafeEqual } = require('node:crypto');
const PORT = Number(process.env.PORT || 3000);
const HOST_PIN = process.env.HOST_PIN || '2026';
const ROOT = __dirname;
const BANK_PATH = path.join(ROOT, 'data/questions.json');
const STATE_PATH = path.join(ROOT, 'data/state.json');
let bank = JSON.parse(fs.readFileSync(BANK_PATH,'utf8'));
const stages=['rapid','feud','green'];
function blank(){return {stage:'lobby',index:0,teamA:{name:'Đội Đổi Mới',score:0},teamB:{name:'Đội Việt Nam Xanh',score:0},revealed:false,slots:[],strikes:0,roundPoints:0,awards:{},deadline:null,remainingMs:0,running:false};}
let state=blank();
try{const s=JSON.parse(fs.readFileSync(STATE_PATH,'utf8'));if(s && s.teamA && s.awards){state=s;if(state.running){state.remainingMs=Math.max(0,state.deadline-Date.now());state.deadline=null;state.running=false;}}}catch{}
const listeners=new Set();
function save(){fs.writeFileSync(STATE_PATH,JSON.stringify(state,null,2));}
function current(){return bank.rounds[state.stage]?.[state.index]||null;}
function remaining(){return state.running?Math.max(0,state.deadline-Date.now()):state.remainingMs;}
function publicState(){
 const q=current(); let question=null;
 if(q){
  question={id:q.id,question:q.question,duration:q.duration,points:state.stage==='feud'?100:q.points};
  if(state.stage==='feud')question.answers=q.answers.map((a,i)=>({revealed:state.slots.includes(i),text:state.slots.includes(i)?a.text:null,points:state.slots.includes(i)?a.points:null}));
  else{question.answer=state.revealed?q.answer:null;if(state.stage==='green'){question.image=q.image;question.hint=q.hint;}}
 }
 return {gameTitle:bank.gameTitle,subtitle:bank.subtitle,stage:state.stage,index:state.index,total:bank.rounds[state.stage]?.length||0,teamA:state.teamA,teamB:state.teamB,question,remainingMs:remaining(),running:state.running,roundPoints:state.roundPoints,strikes:state.strikes,awarded:Boolean(q&&state.awards[q.id])};
}
function broadcast(){const message='event: state\ndata: '+JSON.stringify(publicState())+'\n\n';for(const res of listeners)try{res.write(message);}catch{listeners.delete(res);}}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function pinOK(req){const received=Buffer.from(String(req.headers['x-host-pin']||''));const expected=Buffer.from(HOST_PIN);return received.length===expected.length&&timingSafeEqual(received,expected);}
function choose(stage,index){
 if(!stages.includes(stage)||!Number.isInteger(index)||index<0||index>=bank.rounds[stage].length)throw Error('Vòng hoặc câu hỏi không hợp lệ.');
 const q=bank.rounds[stage][index];
 Object.assign(state,{stage,index,revealed:false,slots:[],strikes:0,roundPoints:0,deadline:null,remainingMs:q.duration*1000,running:false});
}
function act(a){
 const type=a?.type,q=current();
 if(type==='newGame'){const names=[state.teamA.name,state.teamB.name];state=blank();state.teamA.name=names[0];state.teamB.name=names[1];}
 else if(type==='setNames'){for(const k of ['teamA','teamB']){const n=String(a[k]||'').trim().slice(0,30);if(!n)throw Error('Tên đội không hợp lệ');state[k].name=n;}}
 else if(type==='start')choose('rapid',0);
 else if(type==='select')choose(a.stage,Number(a.index));
 else if(type==='next'){if(!q)throw Error('Chưa bắt đầu');if(state.index+1<bank.rounds[state.stage].length)choose(state.stage,state.index+1);else{const next=stages[stages.indexOf(state.stage)+1];if(next)choose(next,0);else{state.stage='finale';state.running=false;state.remainingMs=0;}}}
 else if(type==='finish'){state.stage='finale';state.running=false;state.remainingMs=0;}
 else if(type==='reveal'){
  if(!q)throw Error('Chưa có câu hỏi');
  if(state.stage==='feud'){const i=Number(a.index);if(!Number.isInteger(i)||i<0||i>=q.answers.length||state.slots.includes(i))throw Error('Ô đáp án không hợp lệ hoặc đã mở');state.slots.push(i);state.roundPoints+=q.answers[i].points;}
  else state.revealed=true;
 }
 else if(type==='wrong'){if(state.stage!=='feud')throw Error('Chỉ dùng tại vòng 2');state.strikes=Math.min(3,state.strikes+1);}
 else if(type==='clearStrikes')state.strikes=0;
 else if(type==='award'){
  if(!q||!['A','B'].includes(a.team))throw Error('Đội không hợp lệ');
  if(state.awards[q.id])throw Error('Câu hỏi đã được chấm điểm');
  if(state.stage!=='feud'&&!state.revealed)throw Error('Hãy công bố đáp án trước');
  const points=state.stage==='feud'?state.roundPoints:q.points;
  if(points<=0)throw Error('Chưa có điểm để trao');
  state[a.team==='A'?'teamA':'teamB'].score+=points;
  state.awards[q.id]={team:a.team,points};
 }
 else if(type==='adjustScore'){const k=a.team==='A'?'teamA':a.team==='B'?'teamB':null;if(!k||!Number.isInteger(a.amount)||Math.abs(a.amount)>500)throw Error('Điểm không hợp lệ');state[k].score=Math.max(0,state[k].score+a.amount);}
 else if(type==='timerStart'){if(!q)throw Error('Chưa có câu hỏi');if(!state.running&&state.remainingMs>0){state.deadline=Date.now()+state.remainingMs;state.running=true;}}
 else if(type==='timerPause'){state.remainingMs=remaining();state.running=false;state.deadline=null;}
 else if(type==='timerReset'){if(!q)throw Error('Chưa có câu hỏi');state.remainingMs=q.duration*1000;state.deadline=null;state.running=false;}
 else throw Error('Thao tác không hỗ trợ');
 save();broadcast();return publicState();
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true,title:bank.gameTitle});
 if(req.method==='GET'&&url.pathname==='/api/state')return send(res,200,publicState());
 if(req.method==='GET'&&url.pathname==='/api/events'){
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive'});
  listeners.add(res);res.write('retry: 1500\nevent: state\ndata: '+JSON.stringify(publicState())+'\n\n');req.on('close',()=>listeners.delete(res));return;
 }
 if(req.method==='POST'&&['/api/action','/api/host-state'].includes(url.pathname)){
  if(!pinOK(req))return send(res,401,{error:'Mã PIN MC chưa đúng'});
  if(url.pathname==='/api/host-state')return send(res,200,{...publicState(),bank});
  try{
   const chunks=[];for await(const part of req){chunks.push(part);if(Buffer.concat(chunks).length>20000)throw Error('Dữ liệu quá lớn');}
   return send(res,200,act(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')));
  }catch(e){return send(res,400,{error:e.message});}
 }
 if(req.method==='GET'){
  let file=url.pathname;
  if(['/', '/board.html','/host.html'].includes(file))file='/index.html';
  if(file==='/favicon.ico'){res.writeHead(204);return res.end();}
  let decoded;try{decoded=decodeURIComponent(file);}catch{return send(res,400,{error:'Đường dẫn lỗi'});}
  const target=path.resolve(ROOT,'public','.'+decoded);
  const pub=path.resolve(ROOT,'public');
  if(!target.startsWith(pub+path.sep))return send(res,403,{error:'Bị chặn'});
  try{const stat=fs.statSync(target);if(!stat.isFile())throw Error('not file');const ext=path.extname(target);res.writeHead(200,{'Content-Type':ext==='.js'?'text/javascript':ext==='.css'?'text/css':'text/html; charset=utf-8'});return fs.createReadStream(target).pipe(res);}catch{return send(res,404,{error:'Không tìm thấy trang'});}
 }
 send(res,405,{error:'Không hỗ trợ phương thức'});
});
setInterval(()=>{if(state.running&&remaining()<=0){state.running=false;state.deadline=null;state.remainingMs=0;save();broadcast();}},250).unref();
setInterval(()=>{for(const r of listeners)try{r.write(': ping\n\n')}catch{listeners.delete(r)}},20000).unref();
server.listen(PORT,()=>{console.log('VNR202 TechFeud: http://localhost:'+PORT);if(!process.env.HOST_PIN)console.log('Mã PIN mặc định: 2026 — nên đổi khi sử dụng qua mạng.');});
