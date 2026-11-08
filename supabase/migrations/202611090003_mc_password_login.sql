-- VNR202: MC username + bcrypt password with server-only checks.
-- Never put actual MC password or password hash in any public migration.
-- MC sessions are bound to Supabase Auth user IDs (anonymous sign-in is permitted).
begin;
create table if not exists private.vnr_mc_accounts (
  username text primary key check(username = lower(trim(username)) and username ~ '^[a-z0-9_]{4,32}$'),
  password_hash text not null check(length(password_hash) >= 50),
  enabled boolean not null default true,
  failed_attempts integer not null default 0 check (failed_attempts>=0),
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists private.vnr_mc_sessions (
  uid uuid primary key references auth.users(id) on delete cascade,
  username text not null references private.vnr_mc_accounts(username) on delete cascade,
  expires_at timestamptz not null,
  issued_at timestamptz not null default now()
);
create index if not exists vnr_mc_sessions_expiry_idx on private.vnr_mc_sessions(expires_at);
alter table private.vnr_mc_accounts enable row level security;
alter table private.vnr_mc_sessions enable row level security;
revoke all on private.vnr_mc_accounts,private.vnr_mc_sessions from public,anon,authenticated;

-- Server-side check: no email, no frontend boolean, no JS-only guard.
create or replace function public.vnr_is_authorized_host()
returns boolean language sql stable security definer set search_path = ''
as $fn$
  select auth.uid() is not null and exists(
    select 1
    from private.vnr_mc_sessions s
    join private.vnr_mc_accounts a on a.username = s.username
    where s.uid = auth.uid() and s.expires_at > now() and a.enabled = true
  );
$fn$;

-- Generic response on invalid credentials; failure counter is committed, not rolled back.
-- Global lock per username after five failed attempts; 15-minute cooldown.
create or replace function public.vnr_mc_login(p_username text,p_password text)
returns jsonb language plpgsql security definer set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_name text := lower(trim(coalesce(p_username,'')));
  v_account private.vnr_mc_accounts%rowtype;
  v_attempts integer;
  v_expires timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'error','auth_required');
  end if;
  if length(v_name) not between 4 and 32 or v_name !~ '^[a-z0-9_]+$'
    or p_password is null or length(p_password) not between 1 and 128 then
    return jsonb_build_object('ok',false,'error','invalid');
  end if;

  select * into v_account from private.vnr_mc_accounts
  where username = v_name for update;
  if not found or v_account.enabled is false then
    return jsonb_build_object('ok',false,'error','invalid');
  end if;

  if v_account.locked_until is not null and v_account.locked_until > clock_timestamp() then
    return jsonb_build_object('ok',false,'error','locked');
  end if;

  if extensions.crypt(p_password,v_account.password_hash) = v_account.password_hash then
    update private.vnr_mc_accounts set failed_attempts=0,locked_until=null
    where username=v_name;
    v_expires:=clock_timestamp()+interval '2 hours';
    insert into private.vnr_mc_sessions(uid,username,expires_at)
      values(v_uid,v_name,v_expires)
      on conflict(uid) do update set username=excluded.username,
        expires_at=excluded.expires_at,issued_at=clock_timestamp();
    return jsonb_build_object('ok',true,'username',v_name,
      'expiresAtMs',(extract(epoch from v_expires)*1000)::bigint);
  end if;

  -- Reset the counter after an expired lock window.
  v_attempts:=case when v_account.locked_until is not null
    and v_account.locked_until<=clock_timestamp() then 1
    else v_account.failed_attempts+1 end;
  update private.vnr_mc_accounts
  set failed_attempts=v_attempts,
      locked_until=case when v_attempts>=5 then clock_timestamp()+interval '15 minutes' else null end
  where username=v_name;
  return jsonb_build_object('ok',false,
    'error',case when v_attempts>=5 then 'locked' else 'invalid' end);
end;
$fn$;

create or replace function public.vnr_mc_logout()
returns jsonb language plpgsql security definer set search_path = ''
as $fn$
begin
  if auth.uid() is null then return jsonb_build_object('ok',false); end if;
  delete from private.vnr_mc_sessions where uid=auth.uid();
  return jsonb_build_object('ok',true);
end;
$fn$;

revoke execute on function public.vnr_is_authorized_host() from public,anon;
revoke execute on function public.vnr_mc_login(text,text) from public,anon;
revoke execute on function public.vnr_mc_logout() from public,anon;
grant execute on function public.vnr_is_authorized_host() to authenticated;
grant execute on function public.vnr_mc_login(text,text) to authenticated;
grant execute on function public.vnr_mc_logout() to authenticated;
commit;
