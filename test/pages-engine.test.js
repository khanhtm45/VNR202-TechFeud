'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const E = require('../docs/engine.js');
const bank = JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/questions.json'),'utf8'));

test('Gameshow có đủ tám đội và ba vòng với 11 câu hỏi', () => {
  const state=E.createInitialState();
  assert.equal(state.teams.length,8);
  assert.deepEqual(state.teams.map(t=>t.id),[1,2,3,4,5,6,7,8]);
  assert.equal(bank.rounds.rapid.length,6);
  assert.equal(bank.rounds.feud.length,2);
  assert.equal(bank.rounds.green.length,3);
  for(const f of bank.rounds.feud){
    assert.equal(f.answers.length,5);
    assert.equal(f.answers.reduce((sum,a)=>sum+a.points,0),100);
  }
});

test('Đổi tên tám đội và chọn đội bất kỳ để trao điểm', () => {
  let s=E.createInitialState();
  s=E.reduce(s,{type:'RENAME',teamId:8,name:'Đội Bảo Vệ Môi Trường'},bank);
  assert.equal(s.teams[7].name,'Đội Bảo Vệ Môi Trường');
  s=E.reduce(s,{type:'SELECT_TEAM',teamId:8},bank);
  assert.equal(s.selectedTeamId,8);
  s=E.reduce(s,{type:'START'},bank);
  assert.equal(s.stage,'rapid');
  s=E.reduce(s,{type:'REVEAL'},bank);
  s=E.reduce(s,{type:'AWARD',teamId:8},bank);
  assert.equal(s.teams[7].score,10);
  assert.throws(()=>E.reduce(s,{type:'AWARD',teamId:8},bank),/đã được chấm/);
});

test('Tám đội được điều chỉnh điểm độc lập', () => {
  let s=E.createInitialState();
  for(let i=1;i<=8;i++)s=E.reduce(s,{type:'ADJUST',teamId:i,delta:10*i},bank);
  assert.deepEqual(s.teams.map(t=>t.score),[10,20,30,40,50,60,70,80]);
  assert.equal(E.rankTeams(s.teams)[0].id,8);
  s=E.reduce(s,{type:'ADJUST',teamId:3,delta:-999},bank);
  assert.equal(s.teams[2].score,0);
});

test('Vòng giải mã: hiện đáp án, tính điểm một lần, chuyển sang Việt Nam xanh', () => {
  let s=E.createInitialState();
  s=E.reduce(s,{type:'SELECT',stage:'feud',index:1},bank);
  s=E.reduce(s,{type:'REVEAL',index:0},bank);
  s=E.reduce(s,{type:'REVEAL',index:1},bank);
  assert.equal(s.roundPoints,55);
  assert.throws(()=>E.reduce(s,{type:'REVEAL',index:0},bank),/đã mở/);
  s=E.reduce(s,{type:'STRIKE'},bank);
  assert.equal(s.strikes,1);
  s=E.reduce(s,{type:'AWARD',teamId:5},bank);
  assert.equal(s.teams[4].score,55);
  s=E.reduce(s,{type:'NEXT'},bank);
  assert.equal(s.stage,'green');
  assert.equal(s.index,0);
  s=E.reduce(s,{type:'REVEAL'},bank);
  s=E.reduce(s,{type:'AWARD',teamId:2},bank);
  assert.equal(s.teams[1].score,40);
});

test('Thời gian được giữ đúng sau khi đồng bộ giữa các tab', () => {
  let s=E.createInitialState();
  s=E.reduce(s,{type:'START'},bank);
  const start=100000;
  s=E.reduce(s,{type:'TIMER_START'},bank,start);
  assert.equal(E.remainingMs(s,start+1000),14000);
  const restored=E.restore(s);
  // The stored timer may have been started in an artificial old clock: it expires.
  assert.equal(restored.running,false);
  s=E.reduce(s,{type:'TIMER_PAUSE'},bank,start+3000);
  assert.equal(s.remainingMs,12000);
  const live=E.reduce(s,{type:'TIMER_START'},bank,Date.now());
  assert.equal(E.restore(live).running,true);
});

test('Khôi phục điểm từ bản hai đội cũ và giữ đủ tám đội', () => {
  const legacy={teamA:{name:'Lịch sử',score:25},teamB:{name:'Môi trường',score:30},stage:'lobby'};
  const s=E.restore(null,legacy);
  assert.equal(s.teams.length,8);
  assert.equal(s.teams[0].score,25);
  assert.equal(s.teams[1].score,30);
  assert.equal(s.teams[7].name,'Đội 8');
});

test('Bản GitHub Pages có các thành phần và JavaScript hợp lệ', () => {
  const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
  for(const id of ['homeTeamGrid','boardTeamGrid','hostTeamGrid','awardTeamSelect','questionList','finalLeaderboard']){
    assert.ok(html.includes('id="'+id+'"'),'missing '+id);
  }
  for(const source of ['./styles.css','./engine.js','./app.js','./questions.json']){
    assert.ok(html.includes(source),'missing static asset '+source);
  }
  const parsed=spawnSync(process.execPath,['--check',path.join(__dirname,'../docs/app.js')],{encoding:'utf8'});
  assert.equal(parsed.status,0,parsed.stderr);
});
