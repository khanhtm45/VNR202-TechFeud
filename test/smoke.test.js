'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const bank=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','questions.json'),'utf8'));
test('Ngân hàng 3 vòng: 6 + 2 + 3 câu',()=>{
 assert.equal(bank.rounds.rapid.length,6);assert.equal(bank.rounds.feud.length,2);assert.equal(bank.rounds.green.length,3);
 for(const q of bank.rounds.feud){assert.equal(q.answers.length,5);assert.equal(q.answers.reduce((a,b)=>a+b.points,0),100)}
});
test('HTTP: PIN MC, câu hỏi ẩn, chấm điểm không lặp, chuyển ba vòng',async(t)=>{
 const port=32000+Math.floor(Math.random()*20000),pin='vnr202-test-pin',base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST_PIN:pin},stdio:'ignore'});
 t.after(()=>child.kill());
 let ok=false;for(let i=0;i<50;i++){try{const r=await fetch(base+'/api/health');if(r.ok){ok=true;break;}}catch{}await new Promise(r=>setTimeout(r,70));}
 assert.ok(ok,'server ready');
 const get=async()=> (await fetch(base+'/api/state')).json();
 const post=async(action,password=pin)=>{const r=await fetch(base+'/api/action',{method:'POST',headers:{'content-type':'application/json','x-host-pin':password},body:JSON.stringify(action)});return {status:r.status,data:await r.json()}};
 assert.equal((await post({type:'start'},'wrong')).status,401);
 assert.equal((await post({type:'start'})).status,200);
 let s=await get();assert.equal(s.stage,'rapid');assert.equal(s.question.answer,null);
 assert.equal((await post({type:'reveal'})).status,200);
 assert.equal((await post({type:'award',team:'A'})).status,200);
 assert.equal((await post({type:'award',team:'A'})).status,400);
 s=await get();assert.equal(s.teamA.score,10);
 await post({type:'select',stage:'feud',index:0});s=await get();assert.ok(s.question.answers.every(a=>a.text===null));
 await post({type:'reveal',index:0});s=await get();assert.equal(s.roundPoints,30);
 await post({type:'select',stage:'green',index:0});s=await get();assert.equal(s.question.answer,null);assert.ok(s.question.image);
 await post({type:'finish'});s=await get();assert.equal(s.stage,'finale');
});
