'use strict';
/*
 VNR202 multiplayer backend — Firebase Cloud Functions v2 + Firestore.
 Every mutation is authenticated and validated server-side.
 All answer keys live in private roomSecrets documents and are NEVER sent to players.
*/
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {setGlobalOptions}=require('firebase-functions/v2');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {randomInt}=require('node:crypto');
const {MAX_TEAMS,validateQuestions,publicQuestion,scoreFor,normalizeTeamName,getCode}=require('./lib/quiz');

initializeApp();
setGlobalOptions({region:'asia-southeast1',maxInstances:5,memory:'256MiB',timeoutSeconds:30});
const db=getFirestore();
const HOUR=60*60*1000;
const roomRef=code=>db.collection('rooms').doc(code);
const secretRef=code=>db.collection('roomSecrets').doc(code);
function auth(request){
  const uid=request.auth?.uid;
  if(!uid)throw new HttpsError('unauthenticated','Vui lòng đăng nhập ẩn danh trước khi vào phòng.');
  return uid;
}
function fail(code,message){throw new HttpsError(code,message);}
function parseCode(raw){
  try{return getCode(raw);}
  catch(err){fail('invalid-argument',err.message);}
}
function verifyHost(room,uid){
  if(room.hostUid!==uid)fail('permission-denied','Chỉ MC của phòng mới có thể điều khiển trò chơi.');
}
function verifyRoom(room){
  if(!room)fail('not-found','Không tìm thấy phòng chơi.');
  if(room.expiresAtMs<=Date.now())fail('failed-precondition','Phòng chơi đã hết hạn.');
}
const callable={region:'asia-southeast1',maxInstances:5,memory:'256MiB',timeoutSeconds:30};

/** Host uploads the private questions directly to Firebase; never store the answer key in GitHub Pages. */
exports.createRoom=onCall(callable,async request=>{
  const uid=auth(request);
  let questions;
  try{questions=validateQuestions(request.data?.questions);}
  catch(err){fail('invalid-argument',err.message);}
  for(let attempt=0;attempt<8;attempt++){
    const code=String(randomInt(100000,1000000));
    const ref=roomRef(code),privateRef=secretRef(code);
    const now=Date.now();
    const room={
      code,hostUid:uid,status:'lobby',members:[],maxTeams:MAX_TEAMS,cursor:-1,
      current:null,reveal:null,startedAtMs:0,deadlineMs:0,updatedAtMs:now,
      expiresAtMs:now+4*HOUR,questionCount:questions.length
    };
    try{
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(snap.exists)fail('already-exists','Trùng mã phòng.');
        tx.create(ref,room);
        tx.create(privateRef,{questions,hostUid:uid,createdAtMs:now});
      });
      return {code,expiresAtMs:room.expiresAtMs};
    }catch(err){
      if(err.code==='already-exists'||err.code===6)continue;
      throw err;
    }
  }
  fail('resource-exhausted','Không tạo được mã phòng. Hãy thử lại.');
});

/** One anonymous Firebase user corresponds to one team per room. */
exports.joinRoom=onCall(callable,async request=>{
  const uid=auth(request),code=parseCode(request.data?.code);
  let name;
  try{name=normalizeTeamName(request.data?.teamName);}
  catch(err){fail('invalid-argument',err.message);}
  const ref=roomRef(code),teamRef=ref.collection('teams').doc(uid);
  return db.runTransaction(async tx=>{
    const roomSnap=await tx.get(ref);
    verifyRoom(roomSnap.exists?roomSnap.data():null);
    const room=roomSnap.data();
    const teamSnap=await tx.get(teamRef);
    if(teamSnap.exists)return {code,teamId:uid,teamName:teamSnap.data().name,rejoined:true};
    if(room.status!=='lobby')fail('failed-precondition','Phòng đã bắt đầu. Chỉ đội đã tham gia mới có thể vào lại.');
    if(room.members.length>=MAX_TEAMS)fail('resource-exhausted','Phòng đã đủ 8 đội.');
    // Check all existing team documents before writes to prevent duplicate names.
    const existing=await Promise.all(room.members.map(member=>tx.get(ref.collection('teams').doc(member))));
    const normalized=name.toLocaleLowerCase('vi');
    if(existing.some(s=>s.exists&&s.data().name.toLocaleLowerCase('vi')===normalized)){
      fail('already-exists','Tên đội đã có trong phòng. Hãy nhập tên khác.');
    }
    const position=room.members.length+1,now=Date.now();
    tx.create(teamRef,{uid,name,position,score:0,joinedAtMs:now,lastGain:0});
    tx.update(ref,{members:[...room.members,uid],updatedAtMs:now});
    return {code,teamId:uid,teamName:name,rejoined:false};
  });
});

/** Server-sent state is sanitized: answer keys remain in roomSecrets only. */
exports.controlGame=onCall(callable,async request=>{
  const uid=auth(request),code=parseCode(request.data?.code);
  const action=String(request.data?.action||'');
  if(!['NEXT','REVEAL','FINISH'].includes(action))fail('invalid-argument','Hành động MC không hợp lệ.');
  const secretSnap=await secretRef(code).get();
  if(!secretSnap.exists)fail('not-found','Không tìm thấy bộ câu hỏi riêng của phòng.');
  const questions=secretSnap.data().questions;
  const ref=roomRef(code);

  if(action==='NEXT'){
    return db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      verifyRoom(snap.exists?snap.data():null);
      const room=snap.data();verifyHost(room,uid);
      if(!['lobby','revealed'].includes(room.status)){
        fail('failed-precondition','Hãy công bố đáp án câu hiện tại trước khi chuyển câu.');
      }
      if(room.members.length===0)fail('failed-precondition','Chưa có đội nào vào phòng.');
      const next=room.cursor+1;
      if(next>=questions.length){
        tx.update(ref,{status:'finished',current:null,deadlineMs:0,updatedAtMs:Date.now()});
        return {status:'finished',cursor:room.cursor};
      }
      const q=questions[next],now=Date.now();
      tx.update(ref,{status:'question',cursor:next,current:publicQuestion(q,next,questions.length),
        reveal:null,startedAtMs:now,deadlineMs:now+q.durationSeconds*1000,updatedAtMs:now});
      return {status:'question',cursor:next};
    });
  }

  if(action==='FINISH'){
    return db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      verifyRoom(snap.exists?snap.data():null);
      const room=snap.data();verifyHost(room,uid);
      if(room.status==='question')fail('failed-precondition','Hãy công bố đáp án để chấm câu hiện tại trước khi kết thúc.');
      tx.update(ref,{status:'finished',current:null,deadlineMs:0,updatedAtMs:Date.now()});
      return {status:'finished'};
    });
  }

  // REVEAL: One transaction atomically closes submissions, scores up to eight teams,
  // and publishes only the correct option and explanation AFTER scoring.
  return db.runTransaction(async tx=>{
    const roomSnap=await tx.get(ref);
    verifyRoom(roomSnap.exists?roomSnap.data():null);
    const room=roomSnap.data();verifyHost(room,uid);
    if(room.status==='revealed')return {status:'revealed',alreadyRevealed:true};
    if(room.status!=='question')fail('failed-precondition','Không có câu hỏi đang mở.');
    const q=questions[room.cursor];
    if(!q||q.id!==room.current?.id)fail('failed-precondition','Dữ liệu câu hỏi bị lệch.');
    const memberIds=room.members;
    const docs=await Promise.all(memberIds.map(async id=>{
      const teamRef=ref.collection('teams').doc(id);
      const responseRef=ref.collection('submissions').doc(room.cursor+'_'+id);
      const [team,response]=await Promise.all([tx.get(teamRef),tx.get(responseRef)]);
      return {teamRef,team,response};
    }));
    // No reads after first write. Firestore will retry on conflicting submissions.
    for(const item of docs){
      if(!item.team.exists)continue;
      const points=Number(item.response.exists?item.response.data().points:0)||0;
      if(points){
        tx.update(item.teamRef,{score:(Number(item.team.data().score)||0)+points,lastGain:points});
      }else tx.update(item.teamRef,{lastGain:0});
    }
    tx.update(ref,{status:'revealed',reveal:{
      correctIndex:q.correctIndex,correctText:q.choices[q.correctIndex],explanation:q.explanation
    },deadlineMs:0,updatedAtMs:Date.now()});
    return {status:'revealed',scoredTeams:docs.length};
  });
});

/** Submit exactly once per question, on one phone; server checks time and correctness. */
exports.submitAnswer=onCall(callable,async request=>{
  const uid=auth(request),code=parseCode(request.data?.code);
  const choice=Number(request.data?.choice);
  if(!Number.isInteger(choice)||choice<0||choice>3)fail('invalid-argument','Lựa chọn không hợp lệ.');
  const secretSnap=await secretRef(code).get();
  if(!secretSnap.exists)fail('not-found','Không tìm thấy phòng chơi.');
  const questions=secretSnap.data().questions;
  const ref=roomRef(code);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    verifyRoom(snap.exists?snap.data():null);
    const room=snap.data(),now=Date.now();
    if(room.status!=='question')fail('failed-precondition','Câu hỏi hiện không nhận đáp án.');
    if(now>room.deadlineMs)fail('deadline-exceeded','Đã hết thời gian trả lời.');
    if(!room.members.includes(uid))fail('permission-denied','Bạn chưa vào phòng với tư cách đội chơi.');
    const q=questions[room.cursor];
    if(!q||q.id!==room.current?.id)fail('failed-precondition','Không tìm thấy câu hỏi hiện tại.');
    const receiptRef=ref.collection('submissions').doc(room.cursor+'_'+uid);
    const teamRef=ref.collection('teams').doc(uid);
    const [receipt,team]=await Promise.all([tx.get(receiptRef),tx.get(teamRef)]);
    if(!team.exists)fail('permission-denied','Đội không hợp lệ.');
    if(receipt.exists)fail('already-exists','Đội đã gửi đáp án cho câu này.');
    const points=scoreFor(q,choice,now-room.startedAtMs);
    tx.create(receiptRef,{uid,cursor:room.cursor,choice,points,answeredAtMs:now});
    // Do not return points or the correct answer until the host reveals.
    return {accepted:true,cursor:room.cursor};
  });
});
