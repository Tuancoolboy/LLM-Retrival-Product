create table if not exists public.daily_prompt_limits (
  client_key text not null,
  route text not null,
  usage_date date not null,
  prompt_count int not null default 0 check (prompt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_key, route, usage_date)
);

create index if not exists daily_prompt_limits_usage_date_idx on public.daily_prompt_limits(usage_date);

create or replace function public.consume_daily_prompt_quota(
  p_client_key text,
  p_route text default 'chat',
  p_limit int default 10,
  p_time_zone text default 'Asia/Ho_Chi_Minh'
)
returns table (
  allowed boolean,
  used_count int,
  remaining int,
  reset_at timestamptz
)
language plpgsql
as $$
declare
  current_usage_date date := (now() at time zone p_time_zone)::date;
  next_reset timestamptz := ((current_usage_date + 1)::timestamp at time zone p_time_zone);
  current_count int;
begin
  if p_limit <= 0 then
    return query select false, 0, 0, next_reset;
    return;
  end if;

  insert into public.daily_prompt_limits (client_key, route, usage_date, prompt_count)
  values (p_client_key, p_route, current_usage_date, 1)
  on conflict (client_key, route, usage_date)
  do update set
    prompt_count = public.daily_prompt_limits.prompt_count + 1,
    updated_at = now()
  where public.daily_prompt_limits.prompt_count < p_limit
  returning prompt_count into current_count;

  if current_count is null then
    select prompt_count into current_count
    from public.daily_prompt_limits
    where client_key = p_client_key
      and route = p_route
      and usage_date = current_usage_date;

    return query select false, coalesce(current_count, p_limit), 0, next_reset;
    return;
  end if;

  return query select true, current_count, greatest(p_limit - current_count, 0), next_reset;
end;
$$;
