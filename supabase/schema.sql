-- ============================================================
-- Mi Mundo · esquema de Supabase
-- Ejecuta este archivo una vez en tu proyecto: Supabase → SQL Editor → New query → pegar → Run.
-- Se puede volver a ejecutar sin problemas.
-- ============================================================

-- Cada obra, persona, pareja, colección, nota o ajuste se guarda como un documento JSON.
-- Así la app no tiene que convertir campos ni cambiar sus ids.
create table if not exists public.items (
    user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
    kind       text        not null check (kind in ('works', 'persons', 'couples', 'collections', 'notes', 'settings')),
    id         text        not null check (char_length(id) between 1 and 100),
    data       jsonb,                                   -- null cuando el registro se ha borrado
    deleted    boolean     not null default false,      -- marca de borrado: evita que lo borrado "resucite"
    updated_at bigint      not null,                    -- momento del cambio en el dispositivo (ms); gana el más reciente
    server_at  timestamptz not null default clock_timestamp(), -- momento en que llegó al servidor; sirve para pedir solo lo nuevo
    primary key (user_id, kind, id)
);

create index if not exists items_user_server_at on public.items (user_id, server_at);

-- Gana el último cambio: si llega una versión más antigua que la guardada, se ignora.
create or replace function public.items_last_write_wins()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
        return old;
    end if;
    new.server_at := clock_timestamp();
    return new;
end;
$$;

drop trigger if exists items_last_write_wins on public.items;
create trigger items_last_write_wins
    before insert or update on public.items
    for each row execute function public.items_last_write_wins();

-- Seguridad: cada usuario solo puede ver y cambiar sus propios datos.
alter table public.items enable row level security;

drop policy if exists "items: ver los propios" on public.items;
create policy "items: ver los propios" on public.items
    for select to authenticated using (user_id = auth.uid());

drop policy if exists "items: crear los propios" on public.items;
create policy "items: crear los propios" on public.items
    for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "items: cambiar los propios" on public.items;
create policy "items: cambiar los propios" on public.items
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "items: borrar los propios" on public.items;
create policy "items: borrar los propios" on public.items
    for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- Imágenes: bucket privado. Cada usuario usa la carpeta con su id: images/<user_id>/<imagen>
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', false, 5242880, array['image/webp', 'image/jpeg', 'image/png', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "images: ver las propias" on storage.objects;
create policy "images: ver las propias" on storage.objects
    for select to authenticated
    using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "images: subir las propias" on storage.objects;
create policy "images: subir las propias" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "images: reemplazar las propias" on storage.objects;
create policy "images: reemplazar las propias" on storage.objects
    for update to authenticated
    using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "images: borrar las propias" on storage.objects;
create policy "images: borrar las propias" on storage.objects
    for delete to authenticated
    using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
