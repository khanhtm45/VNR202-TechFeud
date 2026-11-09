-- VNR202 MC live answer progress (2026-11-09)
-- Only indicates if a team has sent an answer for the current cursor.
-- Actual choice, correct answer and scored points stay in RLS-private tables.
begin;

alter table public.vnr_room_teams
  add column if not exists answered_cursor integer not null default -1;
alter table public.vnr_room_teams
  add column if not exists answered_at timestamptz;

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
  -- Record only whether the team has submitted this question.
  -- Updating the read-only team row triggers Supabase Realtime for the MC.
  -- Correctness, selected option and scored points remain in private submissions.
  update public.vnr_room_teams
  set answered_cursor=v_room.cursor,answered_at=clock_timestamp()
  where room_code=p_code and uid=v_uid;
  -- Do NOT return points, correctness, or the answer to the team.
  return jsonb_build_object('accepted',true,'cursor',v_room.cursor);
end;
$$;

-- Preserve authenticated-client access and block unauthenticated invocation.
revoke execute on function public.vnr_submit_answer(text,integer) from public,anon;
grant execute on function public.vnr_submit_answer(text,integer) to authenticated;
commit;
