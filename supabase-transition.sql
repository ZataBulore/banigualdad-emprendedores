-- Transicion inicial desde Firebase/Firestore a Supabase.
-- Ejecutar en Supabase SQL Editor.
-- Para esta primera etapa la app mantiene Firebase Auth y usa la anon key del frontend.
-- Si necesitas endurecer seguridad, el siguiente paso recomendado es mover escrituras a Edge Functions.

create table if not exists public.app_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

create table if not exists public.venture_requests (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table public.app_state;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'venture_requests'
  ) then
    alter publication supabase_realtime add table public.venture_requests;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  true,
  131072,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Politicas abiertas para activar la transicion con GitHub Pages + Firebase Auth.
-- Importante: esto permite lectura/escritura desde la anon key. Usarlo como puente operativo.
-- Endurecimiento recomendado: Edge Functions con service role y validacion de correos autorizados.
alter table public.app_state enable row level security;
alter table public.venture_requests enable row level security;

drop policy if exists "app_state_read_transition" on public.app_state;
create policy "app_state_read_transition"
on public.app_state for select
using (true);

drop policy if exists "app_state_write_transition" on public.app_state;
create policy "app_state_write_transition"
on public.app_state for insert
with check (true);

drop policy if exists "app_state_update_transition" on public.app_state;
create policy "app_state_update_transition"
on public.app_state for update
using (true)
with check (true);

drop policy if exists "venture_requests_read_transition" on public.venture_requests;
create policy "venture_requests_read_transition"
on public.venture_requests for select
using (true);

drop policy if exists "venture_requests_insert_transition" on public.venture_requests;
create policy "venture_requests_insert_transition"
on public.venture_requests for insert
with check (true);

drop policy if exists "venture_requests_update_transition" on public.venture_requests;
create policy "venture_requests_update_transition"
on public.venture_requests for update
using (true)
with check (true);

drop policy if exists "comprobantes_read_transition" on storage.objects;
create policy "comprobantes_read_transition"
on storage.objects for select
using (bucket_id = 'comprobantes');

drop policy if exists "comprobantes_insert_transition" on storage.objects;
create policy "comprobantes_insert_transition"
on storage.objects for insert
with check (bucket_id = 'comprobantes');

drop policy if exists "comprobantes_update_transition" on storage.objects;
create policy "comprobantes_update_transition"
on storage.objects for update
using (bucket_id = 'comprobantes')
with check (bucket_id = 'comprobantes');

drop policy if exists "comprobantes_delete_transition" on storage.objects;
create policy "comprobantes_delete_transition"
on storage.objects for delete
using (bucket_id = 'comprobantes');
