-- VNR202 access-control hardening: only verified, allowlisted email accounts can host.
-- No email is authorized by default. Add only the MC's verified email in Dashboard SQL Editor.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.vnr_host_allowlist (
  email text primary key check (email = lower(trim(email)) and email like '%@%'),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table private.vnr_host_allowlist enable row level security;
revoke all on table private.vnr_host_allowlist from public, anon, authenticated;

create or replace function public.vnr_is_authorized_host()
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1
    from auth.users u
    join private.vnr_host_allowlist h on h.email = lower(u.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and u.is_anonymous is false
      and h.enabled = true
  );
$function$;
revoke execute on function public.vnr_is_authorized_host() from public, anon;
grant execute on function public.vnr_is_authorized_host() to authenticated;

create or replace function public.vnr_create_room(p_questions jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_q jsonb;
  v_stage text;
  v_id text;
  v_idx integer := 0;
  v_before integer := 0;
  v_order integer;
  v_seconds integer;
  v_correct integer;
  v_choices jsonb;
  v_attempt integer;
  v_inserted integer;
  v_ids text[] := array[]::text[];
begin
  if v_uid is null then raise exception 'Bạn phải đăng nhập trước khi tạo phòng.'; end if;
  if not public.vnr_is_authorized_host() then raise exception 'Tài khoản này chưa được cấp quyền MC.'; end if;
  if p_questions is null or jsonb_typeof(p_questions)<>'array'
     or jsonb_array_length(p_questions) not between 3 and 25 then
    raise exception 'Bộ câu hỏi phải có 3–25 câu.';
  end if;

  for v_q in select value from jsonb_array_elements(p_questions) loop
    v_id := trim(coalesce(v_q->>'id',''));
    v_stage := trim(coalesce(v_q->>'stage',''));
    v_order := case v_stage when 'rapid' then 1 when 'feud' then 2 when 'green' then 3 else 0 end;
    if v_order=0 or v_order<v_before then
      raise exception 'Câu hỏi phải được xếp đúng thứ tự ba vòng.';
    end if;
    v_before:=v_order;
    if v_id !~ '^[A-Za-z0-9_-]{1,24}$' or v_id=any(v_ids) then
      raise exception 'Mã câu hỏi trùng hoặc không hợp lệ: %', v_id;
    end if;
    v_ids:=array_append(v_ids,v_id);
    if char_length(trim(coalesce(v_q->>'prompt',''))) not between 1 and 350 then
      raise exception 'Nội dung câu hỏi không hợp lệ tại %', v_id;
    end if;
    v_choices:=v_q->'choices';
    if v_choices is null or jsonb_typeof(v_choices)<>'array' or jsonb_array_length(v_choices)<>4 then
      raise exception 'Mỗi câu phải có đúng 4 đáp án lựa chọn.';
    end if;
    if (select count(distinct lower(trim(c.choice))) from jsonb_array_elements_text(v_choices) as c(choice))<>4
       or exists(select 1 from jsonb_array_elements_text(v_choices) as c(choice) where char_length(trim(c.choice)) not between 1 and 200)
    then raise exception 'Các đáp án phải có nội dung khác nhau.'; end if;
    if coalesce(v_q->>'correctIndex','') !~ '^[0-3]$' then
      raise exception 'Đáp án đúng phải là số 0–3.';
    end if;
    v_correct:=(v_q->>'correctIndex')::integer;
    if coalesce(v_q->>'durationSeconds','') !~ '^[0-9]{2}$' then
      raise exception 'Thời gian phải từ 10 đến 90 giây.';
    end if;
    v_seconds:=(v_q->>'durationSeconds')::integer;
    if v_seconds not between 10 and 90 then
      raise exception 'Thời gian phải từ 10 đến 90 giây.';
    end if;
    if char_length(trim(coalesce(v_q->>'explanation',''))) not between 1 and 500 then
      raise exception 'Cần có giải thích tối đa 500 ký tự.';
    end if;
    v_idx:=v_idx+1;
  end loop;
  if not exists(select 1 from jsonb_array_elements(p_questions) v where v->>'stage'='rapid')
  or not exists(select 1 from jsonb_array_elements(p_questions) v where v->>'stage'='feud')
  or not exists(select 1 from jsonb_array_elements(p_questions) v where v->>'stage'='green')
  then raise exception 'Bộ câu hỏi phải có đủ cả 3 vòng.'; end if;

  v_inserted:=0;
  for v_attempt in 1..15 loop
    v_code:=(floor(100000+random()*900000)::integer)::text;
    insert into public.vnr_rooms(code,host_uid,question_count)
    values(v_code,v_uid,jsonb_array_length(p_questions))
    on conflict (code) do nothing;
    get diagnostics v_inserted=row_count;
    exit when v_inserted=1;
  end loop;
  if v_inserted<>1 then raise exception 'Không tạo được mã phòng, hãy thử lại.'; end if;

  v_idx:=0;
  for v_q in select value from jsonb_array_elements(p_questions) loop
    insert into public.vnr_room_questions(room_code,cursor,private_payload)
    values(v_code,v_idx,v_q);
    v_idx:=v_idx+1;
  end loop;
  return jsonb_build_object('code',v_code,'expiresAtMs',
    (extract(epoch from now()+interval '4 hours')*1000)::bigint);
end;
$$;

create or replace function public.vnr_control_room(p_code text,p_action text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_room public.vnr_rooms%rowtype;
  v_q jsonb;
  v_cursor integer;
  v_start timestamptz;
  v_duration integer;
  v_stage_label text;
begin
  if v_uid is null then raise exception 'MC chưa đăng nhập.'; end if;
  if not public.vnr_is_authorized_host() then raise exception 'Tài khoản này không có quyền MC.'; end if;
  if p_code !~ '^[0-9]{6}$' then raise exception 'Mã phòng không hợp lệ.'; end if;
  select * into v_room from public.vnr_rooms where code=p_code for update;
  if not found or v_room.expires_at<=clock_timestamp() then
    raise exception 'Phòng không tồn tại hoặc đã hết hạn.'; end if;
  if v_room.host_uid<>v_uid then raise exception 'Chỉ MC của phòng có quyền điều khiển.'; end if;

  if p_action='NEXT' then
    if v_room.status not in ('lobby','revealed') then
      raise exception 'Hãy công bố đáp án hiện tại trước khi chuyển câu.';
    end if;
    if not exists(select 1 from public.vnr_room_teams where room_code=p_code) then
      raise exception 'Chưa có đội nào tham gia.';
    end if;
    v_cursor:=v_room.cursor+1;
    if v_cursor>=v_room.question_count then
      update public.vnr_rooms set status='finished',current=null,
        deadline_at=null,updated_at=clock_timestamp() where code=p_code;
      return jsonb_build_object('status','finished','cursor',v_room.cursor);
    end if;
    select private_payload into v_q from public.vnr_room_questions
    where room_code=p_code and cursor=v_cursor;
    if not found then raise exception 'Câu hỏi không tồn tại.'; end if;
    v_duration:=(v_q->>'durationSeconds')::integer;
    v_stage_label:=case v_q->>'stage' when 'rapid' then 'Dấu mốc lịch sử'
      when 'feud' then 'Giải mã Đại hội' else 'Việt Nam xanh' end;
    v_start:=clock_timestamp();
    update public.vnr_rooms set
      status='question',cursor=v_cursor,started_at=v_start,
      deadline_at=v_start+make_interval(secs=>v_duration),
      reveal=null,
      current=jsonb_build_object('id',v_q->>'id','stage',v_q->>'stage',
        'stageLabel',v_stage_label,'prompt',v_q->>'prompt',
        'choices',v_q->'choices','durationSeconds',v_duration,
        'icon',coalesce(v_q->>'icon','📚'),'number',v_cursor+1,'total',v_room.question_count),
      updated_at=v_start
    where code=p_code;
    return jsonb_build_object('status','question','cursor',v_cursor);
  elsif p_action='REVEAL' then
    if v_room.status='revealed' then
      return jsonb_build_object('status','revealed','alreadyRevealed',true);
    end if;
    if v_room.status<>'question' then raise exception 'Không có câu hỏi cần chấm điểm.'; end if;
    select private_payload into v_q from public.vnr_room_questions
    where room_code=p_code and cursor=v_room.cursor;
    if not found then raise exception 'Không tìm thấy đáp án riêng tư.'; end if;
    -- UPDATE is idempotent: room lock + status='question' prevents double scoring.
    update public.vnr_room_teams t
    set score=t.score+coalesce((select s.points from public.vnr_room_submissions s
      where s.room_code=p_code and s.cursor=v_room.cursor and s.uid=t.uid),0),
      last_gain=coalesce((select s.points from public.vnr_room_submissions s
      where s.room_code=p_code and s.cursor=v_room.cursor and s.uid=t.uid),0)
    where t.room_code=p_code;
    update public.vnr_rooms set status='revealed',deadline_at=null,
      reveal=jsonb_build_object('correctIndex',(v_q->>'correctIndex')::int,
        'correctText',v_q->'choices'->(v_q->>'correctIndex')::int,
        'explanation',v_q->>'explanation'),
      updated_at=clock_timestamp()
    where code=p_code;
    return jsonb_build_object('status','revealed');
  elsif p_action='FINISH' then
    if v_room.status not in ('lobby','revealed') then
      raise exception 'Hãy công bố đáp án câu hiện tại trước khi kết thúc.';
    end if;
    update public.vnr_rooms set status='finished',current=null,
      deadline_at=null,updated_at=clock_timestamp() where code=p_code;
    return jsonb_build_object('status','finished');
  end if;
  raise exception 'Thao tác MC không hợp lệ.';
end;
$$;

commit;
