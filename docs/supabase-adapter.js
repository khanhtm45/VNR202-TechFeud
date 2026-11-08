/**
 * Small compatibility adapter: Firebase-style VNR202 UI calls -> Supabase Free.
 * No service_role key is ever shipped to the browser.
 * Real scoring + all permission checks are handled in Postgres SECURITY DEFINER RPCs.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function initializeApp(config) {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:false },
    realtime: { params: { eventsPerSecond:10 } }
  });
}

export function getAuth(client) { return { client }; }
export function onAuthStateChanged(auth, cb, onError) {
  let active = true;
  auth.client.auth.getSession().then(({data,error}) => {
    if (!active) return;
    if(error) return onError?.(error);
    cb(data?.session?.user || null);
  }).catch(e => { if(active) onError?.(e); });
  return () => { active = false; };
}
export async function signInAnonymously(auth) {
  const {data,error} = await auth.client.auth.signInAnonymously();
  if(error) throw new Error('Không thể đăng nhập ẩn danh: '+error.message);
  return {user:data.user};
}

export function getFirestore(client) {return client;}
export function getFunctions(client) {return client;}

const RPC_NAMES={
  createRoom:'vnr_create_room',
  joinRoom:'vnr_join_room',
  authorizeSpectator:'vnr_authorize_spectator',
  controlGame:'vnr_control_room',
  submitAnswer:'vnr_submit_answer'
};

export function httpsCallable(client, name) {
  const rpc=RPC_NAMES[name];
  if(!rpc) throw new Error('Không tìm thấy thao tác Supabase '+name);
  return async payload => {
    const args = name==='createRoom' ? {p_questions:payload.questions} :
      name==='joinRoom' ? {p_code:payload.code,p_name:payload.teamName} :
      name==='authorizeSpectator' ? {p_code:payload.code} :
      name==='controlGame' ? {p_code:payload.code,p_action:payload.action} :
      {p_code:payload.code,p_choice:payload.choice};
    const {data,error}=await client.rpc(rpc,args);
    if(error){
      const e=new Error(error.message||'Thao tác cơ sở dữ liệu bị lỗi.');
      // Keep the existing phone UI's duplicate-answer treatment.
      e.code=/đã gửi đáp án|đã trả lời/i.test(e.message)?'functions/already-exists':
        'supabase/'+(error.code||'rpc-error');
      throw e;
    }
    return {data};
  };
}

export function doc(client,collection,code) {
  if(collection!=='rooms') throw new Error('Tài liệu không hỗ trợ: '+collection);
  return {client,kind:'room',code};
}
export function collection(client,parent,code,child) {
  if(parent!=='rooms'||child!=='teams') throw new Error('Bộ sưu tập không hỗ trợ.');
  return {client,kind:'teams',code};
}

function toRoom(data) {
  if(!data) return null;
  return {
    code:data.code,
    hostUid:data.host_uid,
    status:data.status,
    cursor:data.cursor,
    current:data.current,
    reveal:data.reveal,
    questionCount:data.question_count,
    startedAtMs:data.started_at?Date.parse(data.started_at):0,
    deadlineMs:data.deadline_at?Date.parse(data.deadline_at):0,
    expiresAtMs:data.expires_at?Date.parse(data.expires_at):0
  };
}

function toTeam(data) {
  return {
    uid:data.uid,
    name:data.name,
    position:data.position,
    score:data.score,
    lastGain:data.last_gain
  };
}

/**
 * Query RLS-protected tables, then subscribe to Postgres Changes.
 * A low-frequency refresh handles suspended mobile tabs and missed realtime events.
 * The callback shape matches the UI's earlier Firestore snapshot handlers.
 */
export function onSnapshot(ref, callback, onError) {
  const {client,kind,code}=ref;
  const table=kind==='room'?'vnr_rooms':'vnr_room_teams';
  const key=kind==='room'?'code':'room_code';
  let closed=false,inFlight=false,pending=false;
  async function refresh(){
    if(closed)return;
    if(inFlight){pending=true;return;}
    inFlight=true;
    try{
      if(kind==='room'){
        const {data,error}=await client.from(table).select('*').eq(key,code).maybeSingle();
        if(error)throw error;
        if(!closed)callback({exists:()=>Boolean(data),data:()=>toRoom(data)});
      }else{
        const {data,error}=await client.from(table).select('uid,name,position,score,last_gain').eq(key,code).order('position',{ascending:true});
        if(error)throw error;
        if(!closed)callback({docs:(data||[]).map(row=>({id:row.uid,data:()=>toTeam(row)}))});
      }
    }catch(err){if(!closed)onError?.(err);}
    finally{
      inFlight=false;
      if(pending&&!closed){pending=false;refresh();}
    }
  }
  const channel=client.channel('vnr_'+kind+'_'+code+'_'+Math.random().toString(36).slice(2))
    .on('postgres_changes',{event:'*',schema:'public',table,filter:key+'=eq.'+code},()=>refresh())
    .subscribe(s=>{if(s==='SUBSCRIBED')refresh();});
  refresh();
  const timer=setInterval(refresh,9500);
  return ()=>{closed=true;clearInterval(timer);client.removeChannel(channel);};
}
