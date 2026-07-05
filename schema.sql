create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  source_url text unique not null,
  slug text,
  name text not null,
  category text,
  description text,
  price_text text,
  image_url text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_chunks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536) not null,
  content_tsv tsvector generated always as (to_tsvector('simple', coalesce(content, ''))) stored,
  created_at timestamptz not null default now()
);

create index if not exists products_source_url_idx on public.products(source_url);
create index if not exists products_category_idx on public.products(category);
create index if not exists product_chunks_product_id_idx on public.product_chunks(product_id);
create index if not exists product_chunks_tsv_idx on public.product_chunks using gin(content_tsv);
create index if not exists product_chunks_embedding_idx on public.product_chunks using hnsw (embedding vector_cosine_ops);

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

create or replace function public.match_product_chunks(
  query_embedding vector(1536),
  match_count int default 8
)
returns table (
  id uuid,
  product_id uuid,
  product_name text,
  category text,
  price_text text,
  source_url text,
  image_url text,
  content text,
  metadata jsonb,
  vector_score double precision,
  keyword_score double precision,
  combined_score double precision
)
language sql stable
as $$
  select
    pc.id,
    p.id as product_id,
    p.name as product_name,
    p.category,
    p.price_text,
    p.source_url,
    p.image_url,
    pc.content,
    pc.metadata,
    (1 - (pc.embedding <=> query_embedding))::double precision as vector_score,
    0::double precision as keyword_score,
    (1 - (pc.embedding <=> query_embedding))::double precision as combined_score
  from public.product_chunks pc
  join public.products p on p.id = pc.product_id
  order by pc.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.hybrid_search_product_chunks(
  query_text text,
  query_embedding vector(1536),
  match_count int default 8
)
returns table (
  id uuid,
  product_id uuid,
  product_name text,
  category text,
  price_text text,
  source_url text,
  image_url text,
  content text,
  metadata jsonb,
  vector_score double precision,
  keyword_score double precision,
  combined_score double precision
)
language sql stable
as $$
  with scored as (
    select
      pc.id,
      p.id as product_id,
      p.name as product_name,
      p.category,
      p.price_text,
      p.source_url,
      p.image_url,
      pc.content,
      pc.metadata,
      (1 - (pc.embedding <=> query_embedding))::double precision as vector_score,
      ts_rank_cd(pc.content_tsv, plainto_tsquery('simple', query_text))::double precision as keyword_score,
      case
        when lower(p.name) like '%' || lower(query_text) || '%' then 0.12
        when lower(coalesce(p.category, '')) like '%' || lower(query_text) || '%' then 0.06
        else 0
      end as metadata_boost
    from public.product_chunks pc
    join public.products p on p.id = pc.product_id
  )
  select
    id,
    product_id,
    product_name,
    category,
    price_text,
    source_url,
    image_url,
    content,
    metadata,
    vector_score,
    keyword_score,
    (vector_score * 0.72 + least(keyword_score, 1) * 0.22 + metadata_boost)::double precision as combined_score
  from scored
  order by combined_score desc
  limit match_count;
$$;
