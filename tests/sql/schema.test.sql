-- Tests de supabase/schema.sql. Se ejecutan con: npm run test:sql (necesita DATABASE_URL).
\set ON_ERROR_STOP on
\i tests/sql/supabase-stubs.sql
\i supabase/schema.sql
\i supabase/schema.sql
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.items to authenticated;

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');

-- Usuaria A
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

insert into public.items (kind, id, data, deleted, updated_at) values ('works', 'w1', '{"title":"v1"}', false, 100);

-- Una versión más antigua no pisa la guardada
insert into public.items (user_id, kind, id, data, deleted, updated_at)
values ('00000000-0000-0000-0000-00000000000a', 'works', 'w1', '{"title":"antigua"}', false, 50)
on conflict (user_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at;
do $$ begin
    if (select data->>'title' from public.items where id = 'w1') <> 'v1' then raise exception 'FALLO: una versión antigua pisó a la nueva'; end if;
end $$;

-- Una versión más nueva sí, y adelanta server_at
create temp table antes as select server_at from public.items where id = 'w1';
insert into public.items (user_id, kind, id, data, deleted, updated_at)
values ('00000000-0000-0000-0000-00000000000a', 'works', 'w1', '{"title":"v2"}', false, 200)
on conflict (user_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at;
do $$ begin
    if (select data->>'title' from public.items where id = 'w1') <> 'v2' then raise exception 'FALLO: no se aplicó la versión nueva'; end if;
    if (select server_at from public.items where id = 'w1') <= (select server_at from antes) then raise exception 'FALLO: server_at no avanzó'; end if;
end $$;

-- Marca de borrado
insert into public.items (user_id, kind, id, data, deleted, updated_at)
values ('00000000-0000-0000-0000-00000000000a', 'works', 'w1', null, true, 300)
on conflict (user_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at;
do $$ begin
    if not (select deleted from public.items where id = 'w1') then raise exception 'FALLO: no se guardó el borrado'; end if;
end $$;

-- Tipos no permitidos
do $$ begin
    insert into public.items (kind, id, data, updated_at) values ('hackeo', 'x', '{}', 1);
    raise exception 'FALLO: se aceptó un tipo no permitido';
exception when check_violation then null;
end $$;

-- Imágenes en su propia carpeta
insert into storage.objects (bucket_id, name) values ('images', '00000000-0000-0000-0000-00000000000a/img_1');
do $$ begin
    insert into storage.objects (bucket_id, name) values ('images', '00000000-0000-0000-0000-00000000000b/img_2');
    raise exception 'FALLO: se pudo subir una imagen a la carpeta de otra persona';
exception when insufficient_privilege then null;
end $$;

-- Usuario B: no ve ni puede tocar lo de A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
    if (select count(*) from public.items) <> 0 then raise exception 'FALLO: B ve filas de A'; end if;
    if (select count(*) from storage.objects) <> 0 then raise exception 'FALLO: B ve imágenes de A'; end if;
    update public.items set data = '{"title":"robado"}';
    delete from public.items;
end $$;
do $$ begin
    insert into public.items (user_id, kind, id, data, updated_at) values ('00000000-0000-0000-0000-00000000000a', 'works', 'intruso', '{}', 1);
    raise exception 'FALLO: B pudo escribir con el user_id de A';
exception when insufficient_privilege then null;
end $$;
insert into public.items (kind, id, data, updated_at) values ('works', 'w1', '{"title":"de B"}', 1);

-- Sin sesión no se ve nada
reset role;
set role anon;
do $$ begin
    perform count(*) from public.items;
    raise exception 'FALLO: anon pudo leer items';
exception when insufficient_privilege then null;
end $$;
reset role;

do $$ begin
    if (select count(*) from public.items) <> 2 then raise exception 'FALLO: se esperaban 2 filas (una de A, una de B)'; end if;
    if (select data->>'title' from public.items where user_id = '00000000-0000-0000-0000-00000000000a' and id = 'w1') is not null then raise exception 'FALLO: B modificó datos de A'; end if;
end $$;
\echo 'OK: todos los tests de schema.sql pasaron'
