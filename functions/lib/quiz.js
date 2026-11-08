'use strict';

/** Pure validation and scoring shared by the Cloud Functions and tests. */
const STAGES=['rapid','feud','green'];
const STAGE_LABELS={rapid:'Dấu mốc lịch sử',feud:'Giải mã Đại hội',green:'Việt Nam xanh'};
const MAX_TEAMS=8;
const MAX_QUESTIONS=25;
function check(condition,message){if(!condition)throw new Error(message);}
function cleanString(value,max=160){
  const text=String(value??'').trim().normalize('NFKC');
  check(text.length>0&&text.length<=max,'Văn bản phải có 1–'+max+' ký tự.');
  return text;
}
function validateQuestions(items){
  check(Array.isArray(items)&&items.length>=3&&items.length<=MAX_QUESTIONS,'Bộ đề phải có 3–25 câu hỏi.');
  const seen=new Set(),out=[];
  let previous=-1;
  for(const [i,raw] of items.entries()){
    check(raw&&typeof raw==='object','Câu hỏi #'+(i+1)+' không hợp lệ.');
    const stage=String(raw.stage||'');
    const index=STAGES.indexOf(stage);
    check(index>=0,'Loại vòng không hợp lệ: '+stage);
    check(index>=previous,'Hãy sắp câu hỏi theo Vòng 1 → Vòng 2 → Vòng 3.');
    previous=index;
    const id=cleanString(raw.id,24);
    check(/^[a-zA-Z0-9_-]+$/.test(id)&&!seen.has(id),'Mã câu hỏi trùng hoặc không hợp lệ.');
    seen.add(id);
    const prompt=cleanString(raw.prompt,350);
    check(Array.isArray(raw.choices)&&raw.choices.length===4,'Mỗi câu phải có đúng 4 lựa chọn.');
    const choices=raw.choices.map(c=>cleanString(c,200));
    check(new Set(choices.map(c=>c.toLocaleLowerCase('vi'))).size===4,'Các lựa chọn không được trùng nhau.');
    const correctIndex=Number(raw.correctIndex);
    check(Number.isInteger(correctIndex)&&correctIndex>=0&&correctIndex<4,'Chỉ số đáp án đúng phải trong khoảng 0–3.');
    const explanation=cleanString(raw.explanation||'Xem lại bài học VNR202.',500);
    const durationSeconds=Number(raw.durationSeconds||25);
    check(Number.isInteger(durationSeconds)&&durationSeconds>=10&&durationSeconds<=90,'Thời gian câu hỏi phải 10–90 giây.');
    const icon=String(raw.icon||'📚').trim().slice(0,8);
    out.push({id,stage,prompt,choices,correctIndex,explanation,durationSeconds,icon});
  }
  for(const stage of STAGES)check(out.some(q=>q.stage===stage),'Thiếu câu hỏi thuộc '+STAGE_LABELS[stage]+'.');
  return out;
}
function publicQuestion(question,cursor,total){
  return {id:question.id,stage:question.stage,stageLabel:STAGE_LABELS[question.stage],
    prompt:question.prompt,choices:question.choices,durationSeconds:question.durationSeconds,
    icon:question.icon,number:cursor+1,total};
}
function scoreFor(question,choice,elapsedMs){
  if(choice!==question.correctIndex)return 0;
  const durationMs=question.durationSeconds*1000;
  const remaining=Math.max(0,Math.min(durationMs,durationMs-Math.max(0,elapsedMs)));
  const bonus=question.stage==='green'?0:Math.round(50*(remaining/durationMs));
  const base=question.stage==='rapid'?100:question.stage==='feud'?150:200;
  return base+bonus;
}
function normalizeTeamName(name){return cleanString(name,32);}
function getCode(input){const value=String(input||'').trim();check(/^[0-9]{6}$/.test(value),'Mã phòng phải gồm 6 chữ số.');return value;}
module.exports={STAGES,STAGE_LABELS,MAX_TEAMS,MAX_QUESTIONS,validateQuestions,publicQuestion,scoreFor,normalizeTeamName,getCode};