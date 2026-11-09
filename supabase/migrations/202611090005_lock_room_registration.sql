-- Lock new registrations at start; reject all join attempts after finish.

-- The registered teams may reconnect during active/reveal phases, without taking a new slot.

-- Join-status RPC leaks no team names, questions, private answers or points.

begin;

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
  if v_room.status='finished' then
    raise exception 'Gameshow đã kết thúc, phòng đã đóng đăng ký và không thể tham gia nữa.';
  end if;
  select * into v_team from public.vnr_room_teams where room_code=p_code and uid=v_uid;
  if found then
    return jsonb_build_object('code',p_code,'teamId',v_uid,'teamName',v_team.name,'rejoined',true,'roomStatus',v_room.status);
  end if;
  if v_room.status<>'lobby' then raise exception 'MC đã bắt đầu: phòng đã khóa đăng ký đội mới.'; end if;
  select count(*) into v_count from public.vnr_room_teams where room_code=p_code;
  if v_count>=8 then raise exception 'Phòng đã có đủ tám đội.'; end if;
  if exists(select 1 from public.vnr_room_teams
    where room_code=p_code and lower(name)=lower(v_name))
  then raise exception 'Tên đội đã được sử dụng, hãy chọn tên khác.'; end if;
  insert into public.vnr_room_teams(room_code,uid,name,position)
  values(p_code,v_uid,v_name,v_count+1);
  update public.vnr_rooms set updated_at=clock_timestamp() where code=p_code;
  return jsonb_build_object('code',p_code,'teamId',v_uid,'teamName',v_name,'rejoined',false,'roomStatus',v_room.status);
end;
$$;

create or replace function public.vnr_room_join_status(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $fn$
declare
  v_room public.vnr_rooms%rowtype;
  v_count integer := 0;
  v_member boolean := false;
  v_status text;
  v_open boolean;
begin
  if auth.uid() is null then
    raise exception 'Bạn phải đăng nhập ẩn danh để kiểm tra phòng.';
  end if;
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return jsonb_build_object('status','invalid','canJoin',false,'member',false,'teamCount',0);
  end if;
  select * into v_room from public.vnr_rooms where code=p_code;
  if not found then
    return jsonb_build_object('status','not_found','canJoin',false,'member',false,'teamCount',0);
  end if;
  select count(*) into v_count from public.vnr_room_teams where room_code=p_code;
  select exists(select 1 from public.vnr_room_teams where room_code=p_code and uid=auth.uid()) into v_member;
  v_status := case
    when v_room.status='finished' then 'finished'
    when v_room.expires_at<=clock_timestamp() then 'expired'
    else v_room.status end;
  v_open := v_status='lobby' and v_count<8;
  return jsonb_build_object('status',v_status,'canJoin',v_open,
    'member',v_member,'teamCount',v_count,'capacity',8);
end;
$fn$;

revoke execute on function public.vnr_join_room(text,text) from public,anon;

grant execute on function public.vnr_join_room(text,text) to authenticated;

revoke execute on function public.vnr_room_join_status(text) from public,anon;

grant execute on function public.vnr_room_join_status(text) to authenticated;

commit;