-- VNR202 multiplayer (Supabase Free)
-- Apply this entire migration via Supabase SQL Editor / migrations.
-- No payment, Edge Functions, or service_role key required.
-- Private answer keys are stored in a table with NO browser SELECT grants.
-- Only SECURITY DEFINER functions can read them and award points.

begin;

create table if not exists public.vnr_rooms (
  code text primary key check (code ~ '^[0-9]{6}$'),
  host_uid uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby','question','revealed','finished')),
  cursor integer not null default -1,
  current jsonb,
  reveal jsonb,
  started_at timestamptz,
  deadline_at timestamptz,
  question_count smallint not null check (question_count between 3 and 25),
  max_teams smallint not null default 8 check (max_teams = 8),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '4 hours'),
  updated_at timestamptz not null default now()
);

create table if not exists public.vnr_room_teams (
  room_code text not null references public.vnr_rooms(code) on delete cascade,
  uid uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  position smallint not null check (position between 1 and 8),
  score integer not null default 0 check (score >= 0),
  last_gain integer not null default 0 check (last_gain >= 0),
  joined_at timestamptz not null default now(),
  primary key (room_code,uid),
  unique (room_code,position)
);

create table if not exists public.vnr_room_spectators (
  room_code text not null references public.vnr_rooms(code) on delete cascade,
  uid uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_code,uid)
);

create table if not exists public.vnr_room_questions (
  room_code text not null references public.vnr_rooms(code) on delete cascade,
  cursor integer not null,
  private_payload jsonb not null,
  primary key (room_code,cursor)
);

create table if not exists public.vnr_room_submissions (
  room_code text not null references public.vnr_rooms(code) on delete cascade,
  cursor integer not null,
  uid uuid not null references auth.users(id) on delete cascade,
  choice smallint not null check (choice between 0 and 3),
  points integer not null default 0 check (points between 0 and 250),
  answered_at timestamptz not null default now(),
  primary key (room_code,cursor,uid)
);

create index if not exists vnr_teams_uid_idx on public.vnr_room_teams(uid);
create index if not exists vnr_spectators_uid_idx on public.vnr_room_spectators(uid);

-- Table access: read-only for browsers, never allow direct scoring or answer reads.
alter table public.vnr_rooms enable row level security;
alter table public.vnr_room_teams enable row level security;
alter table public.vnr_room_spectators enable row level security;
alter table public.vnr_room_questions enable row level security;
alter table public.vnr_room_submissions enable row level security;

revoke all on table public.vnr_rooms,public.vnr_room_teams,public.vnr_room_spectators,
  public.vnr_room_questions,public.vnr_room_submissions from anon,authenticated;
grant select on public.vnr_rooms,public.vnr_room_teams to authenticated;

create or replace function public.vnr_can_view_room(p_code text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    exists(select 1 from public.vnr_rooms r where r.code=p_code and r.host_uid=auth.uid())
    or exists(select 1 from public.vnr_room_teams t where t.room_code=p_code and t.uid=auth.uid())
    or exists(select 1 from public.vnr_room_spectators s where s.room_code=p_code and s.uid=auth.uid())
  );
$$;

drop policy if exists vnr_room_read on public.vnr_rooms;
create policy vnr_room_read on public.vnr_rooms
for select to authenticated using (public.vnr_can_view_room(code));
drop policy if exists vnr_team_read on public.vnr_room_teams;
create policy vnr_team_read on public.vnr_room_teams
for select to authenticated using (public.vnr_can_view_room(room_code));
-- No client policies on the 3 remaining tables.
-- Even a browser's authenticated key cannot read private answers or submissions.

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

create or replace function public.vnr_join_room(p_code text,p_name text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.vnr_rooms%rowtype;
  v_team public.vnr_room_teams%rowtype;
  v_name text:=trim(coalesce(p_name,''));
  v_count integer;
begin
  if v_uid is null then raise exception 'Bạn phải đăng nhập ẩn danh để tham gia.'; end if;
  if p_code !~ '^[0-9]{6}$' then raise exception 'Mã phòng phải gồm sáu số.'; end if;
  if char_length(v_name) not between 1 and 32 then raise exception 'Tên đội phải có 1–32 ký tự.'; end if;
  select * into v_room from public.vnr_rooms where code=p_code for update;
  if not found or v_room.expires_at<=clock_timestamp() then
    raise exception 'Phòng không tồn tại hoặc đã hết hạn.';
  end if;
  select * into v_team from public.vnr_room_teams where room_code=p_code and uid=v_uid;
  if found then
    return jsonb_build_object('code',p_code,'teamId',v_uid,'teamName',v_team.name,'rejoined',true);
  end if;
  if v_room.status<>'lobby' then raise exception 'Phòng đã bắt đầu, không thể thêm đội mới.'; end if;
  select count(*) into v_count from public.vnr_room_teams where room_code=p_code;
  if v_count>=8 then raise exception 'Phòng đã có đủ tám đội.'; end if;
  if exists(select 1 from public.vnr_room_teams
    where room_code=p_code and lower(name)=lower(v_name))
  then raise exception 'Tên đội đã được sử dụng, hãy chọn tên khác.'; end if;
  insert into public.vnr_room_teams(room_code,uid,name,position)
  values(p_code,v_uid,v_name,v_count+1);
  update public.vnr_rooms set updated_at=clock_timestamp() where code=p_code;
  return jsonb_build_object('code',p_code,'teamId',v_uid,'teamName',v_name,'rejoined',false);
end;
$$;

create or replace function public.vnr_authorize_spectator(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Cần xác thực để xem bảng chiếu.'; end if;
  if p_code !~ '^[0-9]{6}$' then raise exception 'Mã phòng phải gồm sáu số.'; end if;
  if not exists(select 1 from public.vnr_rooms
    where code=p_code and expires_at>clock_timestamp()) then
    raise exception 'Không tìm thấy phòng đang hoạt động.';
  end if;
  insert into public.vnr_room_spectators(room_code,uid) values(p_code,v_uid)
  on conflict do nothing;
  return jsonb_build_object('authorized',true,'code',p_code);
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

create or replace function public.vnr_submit_answer(p_code text,p_choice integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_room public.vnr_rooms%rowtype;
  v_q jsonb;
  v_correct integer;
  v_duration integer;
  v_elapsed_ms numeric;
  v_bonus integer:=0;
  v_points integer:=0;
  v_inserted integer;
begin
  if v_uid is null then raise exception 'Bạn chưa đăng nhập đội chơi.'; end if;
  if p_code !~ '^[0-9]{6}$' then raise exception 'Mã phòng không hợp lệ.'; end if;
  if p_choice is null or p_choice not between 0 and 3 then
    raise exception 'Đáp án phải là A, B, C hoặc D.';
  end if;
  -- Serialize answers against MC reveal and room status changes.
  select * into v_room from public.vnr_rooms where code=p_code for update;
  if not found or v_room.expires_at<=clock_timestamp() then
    raise exception 'Không tìm thấy phòng đang hoạt động.';
  end if;
  if v_room.status<>'question' or clock_timestamp()>v_room.deadline_at then
    raise exception 'Đã hết giờ hoặc câu hỏi đã được đóng.';
  end if;
  if not exists(select 1 from public.vnr_room_teams
    where room_code=p_code and uid=v_uid)
  then raise exception 'Bạn chưa tham gia phòng với tư cách đội.'; end if;
  select private_payload into v_q from public.vnr_room_questions
  where room_code=p_code and cursor=v_room.cursor;
  if not found then raise exception 'Không tìm thấy câu hỏi.'; end if;
  v_correct:=(v_q->>'correctIndex')::int;
  v_duration:=(v_q->>'durationSeconds')::int;
  v_elapsed_ms:=greatest(0,extract(epoch from clock_timestamp()-v_room.started_at)*1000);
  if p_choice=v_correct then
    if v_q->>'stage'='rapid' then v_points:=100;
    elsif v_q->>'stage'='feud' then v_points:=150;
    else v_points:=200; end if;
    if v_q->>'stage'<>'green' then
      v_bonus:=round(50*greatest(0,least(1,1-v_elapsed_ms/(v_duration*1000))));
      v_points:=v_points+v_bonus;
    end if;
  end if;
  insert into public.vnr_room_submissions(room_code,cursor,uid,choice,points)
  values(p_code,v_room.cursor,v_uid,p_choice,v_points)
  on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted<>1 then
    raise exception 'Đội đã gửi đáp án cho câu này.';
  end if;
  -- Do NOT return points, correctness, or the answer to the team.
  return jsonb_build_object('accepted',true,'cursor',v_room.cursor);
end;
$$;

-- Revoke default PUBLIC execution, explicitly allow authenticated anonymous-login users.
revoke execute on function public.vnr_can_view_room(text) from public,anon;
revoke execute on function public.vnr_create_room(jsonb) from public,anon;
revoke execute on function public.vnr_join_room(text,text) from public,anon;
revoke execute on function public.vnr_authorize_spectator(text) from public,anon;
revoke execute on function public.vnr_control_room(text,text) from public,anon;
revoke execute on function public.vnr_submit_answer(text,integer) from public,anon;
grant execute on function public.vnr_can_view_room(text) to authenticated;
grant execute on function public.vnr_create_room(jsonb) to authenticated;
grant execute on function public.vnr_join_room(text,text) to authenticated;
grant execute on function public.vnr_authorize_spectator(text) to authenticated;
grant execute on function public.vnr_control_room(text,text) to authenticated;
grant execute on function public.vnr_submit_answer(text,integer) to authenticated;

-- Enable realtime publications for the two public read-only tables.
do $$
begin
  if not exists(select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='vnr_rooms')
  then alter publication supabase_realtime add table public.vnr_rooms; end if;
  if not exists(select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='vnr_room_teams')
  then alter publication supabase_realtime add table public.vnr_room_teams; end if;
end;
$$;

commit;
