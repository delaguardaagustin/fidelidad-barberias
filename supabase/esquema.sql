-- ============================================================
-- Tarjeta de fidelidad para barberías · base de datos compartida (Supabase)
--
-- Quién ve qué:
--   · El personal de una barbería (cuenta con correo y clave) lee y cambia SOLO los datos de su barbería.
--   · El cliente no tiene cuenta: abre su tarjeta con un enlace secreto (un token de 32 caracteres al azar,
--     el mismo que va en su código QR). Con ese enlace lee SU tarjeta y nada más, a través de la función
--     tarjeta_por_token(). Sin sesión no se puede leer ninguna tabla.
--   · Los sellos no se escriben a mano: se cambian solo con las funciones marcar_visita(), canjear_premio()
--     y deshacer_visita(), que revisan las reglas (no pasar la meta, canjear solo con la tarjeta llena…).
--
--   barberias   una fila por barbería
--   personal    qué cuenta trabaja en qué barbería (rol: dueno o barbero)
--   ajustes     color, WhatsApp, sellos para el premio, días para recordar y premio (uno por barbería)
--   clientes    nombre, celular, enlace secreto, sellos y permiso para recordatorios por WhatsApp
--   visitas     una fila por visita marcada
--   canjes      una fila por premio canjeado
--
-- Se puede ejecutar más de una vez: no borra datos.
-- Probado en una base Postgres local (PGlite) antes de ejecutarlo en Supabase. NO está ejecutado en ninguna base.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- 1. TABLAS
-- ------------------------------------------------------------
create table if not exists public.barberias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (char_length(trim(nombre)) between 2 and 40),
  activa     boolean not null default true,          -- apagada = el personal no entra y las tarjetas no se muestran
  creado_en  timestamptz not null default now()
);

create table if not exists public.personal (
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  barberia_id uuid not null references public.barberias(id) on delete cascade,
  rol         text not null default 'barbero' check (rol in ('dueno', 'barbero')),
  creado_en   timestamptz not null default now(),
  primary key (usuario_id, barberia_id)
);

create table if not exists public.ajustes (
  barberia_id    uuid primary key references public.barberias(id) on delete cascade,
  color          text not null default '#c08f55' check (color ~ '^#[0-9a-f]{6}$'),
  whatsapp       text not null default '' check (whatsapp ~ '^([0-9]{8})?$'),         -- 8 dígitos después de +56 9
  sellos_meta    integer not null default 8 check (sellos_meta between 4 and 15),
  dias_recordar  integer not null default 15 check (dias_recordar between 5 and 90),
  premio         text not null default 'Corte gratis' check (char_length(trim(premio)) between 3 and 40),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.clientes (
  id                 uuid primary key default gen_random_uuid(),
  barberia_id        uuid not null references public.barberias(id) on delete cascade,
  numero             integer not null,                                  -- Nº de tarjeta dentro de la barbería
  nombre             text not null check (char_length(trim(nombre)) between 2 and 40),
  telefono           text not null check (telefono ~ '^\+569[0-9]{8}$'),
  -- Enlace secreto: 24 bytes al azar en base64url (32 caracteres). No se puede adivinar ni deducir del teléfono.
  token              text not null unique
                     default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_')
                     check (token ~ '^[A-Za-z0-9_-]{32}$'),
  sellos             integer not null default 0 check (sellos >= 0),
  canjes             integer not null default 0 check (canjes >= 0),
  acepta_whatsapp    boolean not null default false,                    -- consentimiento para recordatorios
  acepta_whatsapp_en timestamptz,                                       -- cuándo lo dio o lo quitó
  recordado_en       timestamptz,                                       -- último recordatorio abierto por el barbero
  creado_en          timestamptz not null default now(),
  unique (barberia_id, telefono),
  unique (barberia_id, numero)
);

create table if not exists public.visitas (
  id          uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references public.barberias(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  fecha       timestamptz not null default now(),
  marcada_por uuid references auth.users(id) on delete set null
);
create index if not exists idx_visitas_cliente on public.visitas (cliente_id, fecha desc);
create index if not exists idx_visitas_barberia on public.visitas (barberia_id, fecha);

create table if not exists public.canjes (
  id           uuid primary key default gen_random_uuid(),
  barberia_id  uuid not null references public.barberias(id) on delete cascade,
  cliente_id   uuid not null references public.clientes(id) on delete cascade,
  visita_id    uuid not null unique references public.visitas(id) on delete cascade,
  premio       text not null,
  sellos_antes integer not null,           -- para poder deshacer el canje
  fecha        timestamptz not null default now()
);
create index if not exists idx_canjes_barberia on public.canjes (barberia_id, fecha);


-- ------------------------------------------------------------
-- 2. QUIÉN ES QUIÉN
-- ------------------------------------------------------------
-- «security definer» para que las reglas consulten la tabla personal sin dejarla abierta.
create or replace function public.es_personal(p_barberia uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.personal p join public.barberias b on b.id = p.barberia_id
                  where p.usuario_id = auth.uid() and p.barberia_id = p_barberia and b.activa);
$$;

create or replace function public.es_dueno(p_barberia uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.personal p join public.barberias b on b.id = p.barberia_id
                  where p.usuario_id = auth.uid() and p.barberia_id = p_barberia and p.rol = 'dueno' and b.activa);
$$;

revoke all on function public.es_personal(uuid) from public, anon;
revoke all on function public.es_dueno(uuid) from public, anon;
grant execute on function public.es_personal(uuid) to authenticated;
grant execute on function public.es_dueno(uuid) to authenticated;


-- ------------------------------------------------------------
-- 3. AUTOMÁTICOS DE LA TABLA CLIENTES
-- ------------------------------------------------------------
-- Al crear: Nº de tarjeta correlativo por barbería y fecha del consentimiento.
-- Al cambiar: el cliente no se muda de barbería y se anota cuándo cambió el permiso de WhatsApp.
create or replace function public.clientes_antes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.nombre := regexp_replace(trim(new.nombre), '\s+', ' ', 'g');
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext(new.barberia_id::text));
    new.numero := coalesce((select max(c.numero) from public.clientes c where c.barberia_id = new.barberia_id), 0) + 1;
    new.acepta_whatsapp_en := case when new.acepta_whatsapp then now() else null end;
  else
    if new.barberia_id is distinct from old.barberia_id or new.token is distinct from old.token or new.numero is distinct from old.numero then
      raise exception 'La barbería, el número y el enlace de una tarjeta no se pueden cambiar.';
    end if;
    if new.acepta_whatsapp is distinct from old.acepta_whatsapp then new.acepta_whatsapp_en := now(); end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_clientes_antes on public.clientes;
create trigger trg_clientes_antes before insert or update on public.clientes
  for each row execute function public.clientes_antes();

-- Una barbería nueva parte con sus ajustes por defecto.
create or replace function public.barberias_despues()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ajustes (barberia_id) values (new.id) on conflict do nothing;
  return new;
end; $$;
drop trigger if exists trg_barberias_despues on public.barberias;
create trigger trg_barberias_despues after insert on public.barberias
  for each row execute function public.barberias_despues();

create or replace function public.ajustes_antes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.barberia_id is distinct from old.barberia_id then raise exception 'Los ajustes no se pueden pasar a otra barbería.'; end if;
  new.actualizado_en := now();
  return new;
end; $$;
drop trigger if exists trg_ajustes_antes on public.ajustes;
create trigger trg_ajustes_antes before update on public.ajustes
  for each row execute function public.ajustes_antes();


-- ------------------------------------------------------------
-- 4. REGLAS DE ACCESO (RLS) Y PERMISOS POR COLUMNA
-- ------------------------------------------------------------
alter table public.barberias enable row level security;
alter table public.personal  enable row level security;
alter table public.ajustes   enable row level security;
alter table public.clientes  enable row level security;
alter table public.visitas   enable row level security;
alter table public.canjes    enable row level security;

-- Sin sesión (anon) no se toca ninguna tabla: el cliente lee su tarjeta solo con tarjeta_por_token().
revoke all on public.barberias, public.personal, public.ajustes, public.clientes, public.visitas, public.canjes from anon;
-- Con sesión, solo lo que se nombra aquí abajo (y siempre filtrado por las reglas de fila).
revoke all on public.barberias, public.personal, public.ajustes, public.clientes, public.visitas, public.canjes from authenticated;
grant select on public.barberias, public.personal, public.ajustes, public.clientes, public.visitas, public.canjes to authenticated;
grant update (nombre) on public.barberias to authenticated;
grant update (color, whatsapp, sellos_meta, dias_recordar, premio) on public.ajustes to authenticated;
-- Sellos, canjes, número y enlace NO se escriben directo: los pone la base.
grant insert (barberia_id, nombre, telefono, acepta_whatsapp) on public.clientes to authenticated;
grant update (nombre, telefono, acepta_whatsapp, recordado_en) on public.clientes to authenticated;
grant delete on public.clientes to authenticated;

-- barberias: el personal ve la suya; el dueño le cambia el nombre. Crearlas o apagarlas: solo SENTRY-CODE (editor SQL).
drop policy if exists barberias_leer on public.barberias;
create policy barberias_leer on public.barberias for select to authenticated using (public.es_personal(id));
drop policy if exists barberias_cambiar on public.barberias;
create policy barberias_cambiar on public.barberias for update to authenticated
  using (public.es_dueno(id)) with check (public.es_dueno(id));

-- personal: cada cuenta ve solo sus propias filas (para saber a qué barbería entra). Nadie se agrega solo.
drop policy if exists personal_leer on public.personal;
create policy personal_leer on public.personal for select to authenticated using (usuario_id = auth.uid());

-- ajustes: el personal los lee; solo el dueño los cambia.
drop policy if exists ajustes_leer on public.ajustes;
create policy ajustes_leer on public.ajustes for select to authenticated using (public.es_personal(barberia_id));
drop policy if exists ajustes_cambiar on public.ajustes;
create policy ajustes_cambiar on public.ajustes for update to authenticated
  using (public.es_dueno(barberia_id)) with check (public.es_dueno(barberia_id));

-- clientes: el personal de esa barbería los ve, registra y corrige. Borrar (derecho de supresión): solo el dueño.
drop policy if exists clientes_leer on public.clientes;
create policy clientes_leer on public.clientes for select to authenticated using (public.es_personal(barberia_id));
drop policy if exists clientes_crear on public.clientes;
create policy clientes_crear on public.clientes for insert to authenticated with check (public.es_personal(barberia_id));
drop policy if exists clientes_cambiar on public.clientes;
create policy clientes_cambiar on public.clientes for update to authenticated
  using (public.es_personal(barberia_id)) with check (public.es_personal(barberia_id));
drop policy if exists clientes_borrar on public.clientes;
create policy clientes_borrar on public.clientes for delete to authenticated using (public.es_dueno(barberia_id));

-- visitas y canjes: el personal los lee; se escriben solo con las funciones de la sección 5.
drop policy if exists visitas_leer on public.visitas;
create policy visitas_leer on public.visitas for select to authenticated using (public.es_personal(barberia_id));
drop policy if exists canjes_leer on public.canjes;
create policy canjes_leer on public.canjes for select to authenticated using (public.es_personal(barberia_id));


-- ------------------------------------------------------------
-- 5. ACCIONES DEL PANEL (sellos, canje, deshacer)
-- ------------------------------------------------------------
-- Marca una visita y suma un sello. Devuelve el id de la visita (para poder deshacerla).
create or replace function public.marcar_visita(p_cliente uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.clientes; meta integer; ultima timestamptz; v uuid;
begin
  select * into c from public.clientes where id = p_cliente for update;
  if not found or not public.es_personal(c.barberia_id) then
    raise exception 'No tienes permiso para marcar visitas a este cliente.' using errcode = '42501';
  end if;
  select a.sellos_meta into meta from public.ajustes a where a.barberia_id = c.barberia_id;
  if c.sellos >= coalesce(meta, 8) then raise exception 'La tarjeta ya está completa: canjea el premio.'; end if;
  -- Protección contra el doble toque o dos barberos marcando al mismo cliente a la vez.
  select max(fecha) into ultima from public.visitas where cliente_id = c.id;
  if ultima is not null and ultima > now() - interval '2 minutes' then
    raise exception 'Ya le marcaste una visita hace un momento.';
  end if;
  insert into public.visitas (barberia_id, cliente_id, marcada_por) values (c.barberia_id, c.id, auth.uid()) returning id into v;
  update public.clientes set sellos = sellos + 1, recordado_en = null where id = c.id;
  return v;
end; $$;

-- Canjea el premio (la visita del corte gratis también queda anotada) y la tarjeta vuelve a cero.
create or replace function public.canjear_premio(p_cliente uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.clientes; a public.ajustes; v uuid;
begin
  select * into c from public.clientes where id = p_cliente for update;
  if not found or not public.es_personal(c.barberia_id) then
    raise exception 'No tienes permiso para canjear premios de este cliente.' using errcode = '42501';
  end if;
  select * into a from public.ajustes where barberia_id = c.barberia_id;
  if c.sellos < coalesce(a.sellos_meta, 8) then raise exception 'Todavía le faltan sellos para el premio.'; end if;
  insert into public.visitas (barberia_id, cliente_id, marcada_por) values (c.barberia_id, c.id, auth.uid()) returning id into v;
  insert into public.canjes (barberia_id, cliente_id, visita_id, premio, sellos_antes)
    values (c.barberia_id, c.id, v, coalesce(a.premio, 'Corte gratis'), c.sellos);
  update public.clientes set sellos = 0, canjes = canjes + 1, recordado_en = null where id = c.id;
  return v;
end; $$;

-- Deshace la ÚLTIMA visita de un cliente (sello o canje) si fue en las últimas 24 horas. Devuelve el id del cliente.
create or replace function public.deshacer_visita(p_visita uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.visitas; c public.clientes; k public.canjes;
begin
  select * into v from public.visitas where id = p_visita;
  if not found or not public.es_personal(v.barberia_id) then
    raise exception 'No tienes permiso para deshacer esa visita.' using errcode = '42501';
  end if;
  select * into c from public.clientes where id = v.cliente_id for update;
  if exists (select 1 from public.visitas x where x.cliente_id = c.id and (x.fecha > v.fecha or (x.fecha = v.fecha and x.id > v.id))) then
    raise exception 'Solo se puede deshacer la última visita del cliente.';
  end if;
  if v.fecha < now() - interval '24 hours' then raise exception 'Esa visita tiene más de un día: ya no se puede deshacer.'; end if;
  select * into k from public.canjes where visita_id = v.id;
  if found then
    update public.clientes set sellos = k.sellos_antes, canjes = greatest(canjes - 1, 0) where id = c.id;
  else
    update public.clientes set sellos = greatest(sellos - 1, 0) where id = c.id;
  end if;
  delete from public.visitas where id = v.id;   -- borra también el canje (on delete cascade)
  return c.id;
end; $$;

revoke all on function public.marcar_visita(uuid) from public, anon;
revoke all on function public.canjear_premio(uuid) from public, anon;
revoke all on function public.deshacer_visita(uuid) from public, anon;
grant execute on function public.marcar_visita(uuid) to authenticated;
grant execute on function public.canjear_premio(uuid) to authenticated;
grant execute on function public.deshacer_visita(uuid) to authenticated;


-- ------------------------------------------------------------
-- 6. LA TARJETA DEL CLIENTE (sin cuenta, con su enlace secreto)
-- ------------------------------------------------------------
-- Devuelve SOLO esa tarjeta: datos de la barbería para dibujarla, nombre, sellos, últimas 12 visitas y si
-- acepta recordatorios. No devuelve el teléfono ni el id interno. Si el enlace no existe, devuelve null
-- (no dice si «casi» existe).
create or replace function public.tarjeta_por_token(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.clientes; b public.barberias; a public.ajustes;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' then return null; end if;
  select * into c from public.clientes where token = p_token;
  if not found then return null; end if;
  select * into b from public.barberias where id = c.barberia_id and activa;
  if not found then return null; end if;
  select * into a from public.ajustes where barberia_id = c.barberia_id;
  return jsonb_build_object(
    'barberia', jsonb_build_object('nombre', b.nombre, 'color', a.color, 'whatsapp', a.whatsapp,
                                   'sellos', a.sellos_meta, 'dias', a.dias_recordar, 'premio', a.premio),
    'cliente', jsonb_build_object('nombre', c.nombre, 'numero', c.numero, 'sellos', c.sellos, 'canjes', c.canjes,
                                  'acepta', c.acepta_whatsapp,
                                  'visitas', coalesce((select jsonb_agg(x.fecha order by x.fecha)
                                                         from (select fecha from public.visitas where cliente_id = c.id
                                                               order by fecha desc limit 12) x), '[]'::jsonb)));
end; $$;

-- El cliente acepta o quita los recordatorios por WhatsApp desde su tarjeta. Devuelve true si encontró la tarjeta.
create or replace function public.cambiar_avisos(p_token text, p_acepta boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' or p_acepta is null then return false; end if;
  update public.clientes c set acepta_whatsapp = p_acepta
   where c.token = p_token and exists (select 1 from public.barberias b where b.id = c.barberia_id and b.activa);
  return found;
end; $$;

revoke all on function public.tarjeta_por_token(text) from public;
revoke all on function public.cambiar_avisos(text, boolean) from public;
grant execute on function public.tarjeta_por_token(text) to anon, authenticated;
grant execute on function public.cambiar_avisos(text, boolean) to anon, authenticated;

-- Las funciones internas de los automáticos no se llaman desde afuera.
revoke all on function public.clientes_antes() from public, anon, authenticated;
revoke all on function public.barberias_despues() from public, anon, authenticated;
revoke all on function public.ajustes_antes() from public, anon, authenticated;


-- ------------------------------------------------------------
-- 7. AVISOS EN VIVO (dos barberos con el panel abierto ven los sellos del otro)
-- ------------------------------------------------------------
-- Realtime respeta las reglas de la sección 4: cada cuenta recibe solo cambios de su barbería.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clientes') then
    alter publication supabase_realtime add table public.clientes;
  end if;
end $$;


-- ------------------------------------------------------------
-- CÓMO DAR DE ALTA UNA BARBERÍA (en el editor SQL de Supabase, con los datos reales)
-- ------------------------------------------------------------
-- 1) Crear la cuenta del dueño en Authentication > Users > Add user (correo y clave, «Auto Confirm User»).
-- 2) insert into public.barberias (nombre) values ('Nombre de la Barbería');      -- crea también sus ajustes
-- 3) insert into public.personal (usuario_id, barberia_id, rol)
--      select u.id, b.id, 'dueno' from auth.users u, public.barberias b
--       where u.email = 'CORREO-DEL-DUEÑO' and b.nombre = 'Nombre de la Barbería';
--    (Para un barbero más: igual, con su correo y rol 'barbero'.)
-- 4) Authentication > Sign In / Providers: apagar «Allow new users to sign up» (las cuentas las crea SENTRY-CODE).
--
-- Limpieza sugerida (Ley 21.719, no guardar datos más de lo necesario): borrar clientes sin visitas hace 2 años.
--   delete from public.clientes c where not exists (select 1 from public.visitas v where v.cliente_id = c.id and v.fecha > now() - interval '2 years')
--     and c.creado_en < now() - interval '2 years';
