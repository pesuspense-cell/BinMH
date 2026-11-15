-- 일곱등잔 · 계시록 암송: 사용자별 기록 보관
-- Supabase 대시보드 → SQL Editor → New query 에 붙여넣고 Run

create table if not exists public.lamp_state (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  state jsonb not null,
  rev integer not null default 1,
  updated_at timestamptz not null default now()
);

-- 하루에 한 번, 그 날 처음 바뀌기 직전의 기록을 남겨 둡니다 (90일 보관)
create table if not exists public.lamp_state_history (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  state jsonb not null,
  rev integer not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, day)
);

grant select, insert, update on public.lamp_state to authenticated;
grant select on public.lamp_state_history to authenticated;

alter table public.lamp_state enable row level security;
alter table public.lamp_state_history enable row level security;

drop policy if exists "lamp_state select own" on public.lamp_state;
drop policy if exists "lamp_state insert own" on public.lamp_state;
drop policy if exists "lamp_state update own" on public.lamp_state;
drop policy if exists "lamp_state_history select own" on public.lamp_state_history;

create policy "lamp_state select own" on public.lamp_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "lamp_state insert own" on public.lamp_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "lamp_state update own" on public.lamp_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "lamp_state_history select own" on public.lamp_state_history
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.lamp_state_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  insert into public.lamp_state_history (user_id, day, state, rev)
  values (old.user_id, (now() at time zone 'Asia/Seoul')::date, old.state, old.rev)
  on conflict (user_id, day) do nothing;
  delete from public.lamp_state_history
  where user_id = old.user_id and day < (now() at time zone 'Asia/Seoul')::date - 90;
  return new;
end;
$$;

drop trigger if exists lamp_state_before_update on public.lamp_state;
create trigger lamp_state_before_update
  before update on public.lamp_state
  for each row execute function public.lamp_state_before_update();
