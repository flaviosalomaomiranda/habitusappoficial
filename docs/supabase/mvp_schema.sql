-- MVP Schema - Plataforma Saude Multi-tenant
-- Requer: extensao pgcrypto

create extension if not exists pgcrypto;

-- =============================
-- ENUMS
-- =============================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum (
      'admin_platform',
      'gestor_municipal',
      'gestor_ubs',
      'same',
      'profissional'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'msg_channel') then
    create type msg_channel as enum ('whatsapp_evolution','telegram');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'msg_template_type') then
    create type msg_template_type as enum ('reminder','cancel');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'schedule_status') then
    create type schedule_status as enum ('scheduled','cancelled','rescheduled','completed','absent');
  end if;
end $$;

-- =============================
-- BASE ORG
-- =============================
create table if not exists public.municipios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  uf char(2),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ubs (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id) on delete cascade,
  nome text not null,
  cnes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_ubs_municipio on public.ubs(municipio_id);

-- =============================
-- USERS / ROLES
-- =============================
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  municipio_id uuid references public.municipios(id) on delete cascade,
  ubs_id uuid references public.ubs(id) on delete cascade,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, role, municipio_id, ubs_id)
);
create index if not exists idx_user_roles_user on public.user_roles(user_id);
create index if not exists idx_user_roles_scope on public.user_roles(municipio_id, ubs_id);

-- =============================
-- PACIENTES / PROFISSIONAIS
-- =============================
create table if not exists public.pacientes (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id) on delete cascade,
  ubs_id uuid not null references public.ubs(id) on delete cascade,
  nome text not null,
  nascimento date,
  cpf text,
  cns text,
  telefone text,
  telegram_chat_id text,
  consent_whatsapp boolean not null default false,
  consent_telegram boolean not null default false,
  consent_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pacientes_scope on public.pacientes(municipio_id, ubs_id);

create table if not exists public.profissionais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  municipio_id uuid not null references public.municipios(id) on delete cascade,
  ubs_id uuid not null references public.ubs(id) on delete cascade,
  nome text not null,
  cbo text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_profissionais_scope on public.profissionais(municipio_id, ubs_id);

create table if not exists public.profissional_paciente (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id) on delete cascade,
  ubs_id uuid not null references public.ubs(id) on delete cascade,
  profissional_id uuid not null references public.profissionais(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (profissional_id, paciente_id)
);
create index if not exists idx_prof_pac_scope on public.profissional_paciente(municipio_id, ubs_id);

-- =============================
-- AGENDA / REAGENDAMENTO
-- =============================
create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id) on delete cascade,
  ubs_id uuid not null references public.ubs(id) on delete cascade,
  profissional_id uuid not null references public.profissionais(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  starts_at timestamptz not null,
  status schedule_status not null default 'scheduled',
  source text default 'esus_extension',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_agendamentos_scope on public.agendamentos(municipio_id, ubs_id, profissional_id, starts_at);

create table if not exists public.reagendamentos (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id) on delete cascade,
  ubs_id uuid not null references public.ubs(id) on delete cascade,
  profissional_id uuid not null references public.profissionais(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  status text not null default 'pending', -- pending | done
  cancel_reason text,
  done_at timestamptz,
  expires_at timestamptz, -- para itens done (24h)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reag_scope on public.reagendamentos(municipio_id, ubs_id, profissional_id, status);

-- =============================
-- MENSAGENS / LOGS
-- =============================
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id) on delete cascade,
  ubs_id uuid references public.ubs(id) on delete cascade,
  template_type msg_template_type not null,
  channel msg_channel not null,
  body text not null,
  ativo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_templates_scope on public.message_templates(municipio_id, ubs_id, template_type, channel);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id) on delete cascade,
  ubs_id uuid not null references public.ubs(id) on delete cascade,
  profissional_id uuid references public.profissionais(id) on delete set null,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  template_type msg_template_type not null,
  final_channel msg_channel,
  status text not null default 'queued', -- queued|sent|failed|fallback_sent
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_scope on public.messages(municipio_id, ubs_id, created_at desc);

create table if not exists public.message_attempts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  channel msg_channel not null,
  provider_status text,
  provider_message_id text,
  success boolean not null default false,
  error_text text,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_attempts_message on public.message_attempts(message_id, attempted_at desc);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid references public.municipios(id) on delete set null,
  ubs_id uuid references public.ubs(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id text,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_scope on public.audit_events(municipio_id, ubs_id, created_at desc);

-- =============================
-- HELPERS (RLS)
-- =============================
create or replace function public.has_role(_role app_role)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.ativo = true
      and ur.role = _role
  );
$$;

create or replace function public.can_access_scope(_municipio_id uuid, _ubs_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.ativo = true
      and (
        ur.role = 'admin_platform'
        or (ur.role = 'gestor_municipal' and ur.municipio_id = _municipio_id)
        or (ur.role in ('gestor_ubs','same') and ur.municipio_id = _municipio_id and ur.ubs_id = _ubs_id)
      )
  )
  or exists (
    select 1
    from public.user_roles ur
    join public.profissionais p on p.user_id = ur.user_id and p.ativo = true
    where ur.user_id = auth.uid()
      and ur.ativo = true
      and ur.role = 'profissional'
      and p.municipio_id = _municipio_id
      and p.ubs_id = _ubs_id
  );
$$;

create or replace function public.prof_can_access_paciente(_paciente_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profissional_paciente pp
    join public.profissionais p on p.id = pp.profissional_id and p.ativo = true
    join public.user_roles ur on ur.user_id = auth.uid() and ur.role = 'profissional' and ur.ativo = true
    where pp.paciente_id = _paciente_id
      and pp.ativo = true
      and p.user_id = auth.uid()
  );
$$;

-- =============================
-- RLS ENABLE
-- =============================
alter table public.municipios enable row level security;
alter table public.ubs enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.pacientes enable row level security;
alter table public.profissionais enable row level security;
alter table public.profissional_paciente enable row level security;
alter table public.agendamentos enable row level security;
alter table public.reagendamentos enable row level security;
alter table public.message_templates enable row level security;
alter table public.messages enable row level security;
alter table public.message_attempts enable row level security;
alter table public.audit_events enable row level security;

-- =============================
-- RLS POLICIES (base)
-- =============================
-- Admin platform full
create policy if not exists p_admin_all_municipios on public.municipios
for all using (public.has_role('admin_platform'))
with check (public.has_role('admin_platform'));

create policy if not exists p_admin_all_ubs on public.ubs
for all using (public.has_role('admin_platform'))
with check (public.has_role('admin_platform'));

-- Scope read for common tables
create policy if not exists p_scope_read_pacientes on public.pacientes
for select using (
  public.can_access_scope(municipio_id, ubs_id)
  and (
    not public.has_role('profissional')
    or public.prof_can_access_paciente(id)
  )
);

create policy if not exists p_scope_write_pacientes on public.pacientes
for all using (
  public.can_access_scope(municipio_id, ubs_id)
  and not public.has_role('profissional')
)
with check (
  public.can_access_scope(municipio_id, ubs_id)
  and not public.has_role('profissional')
);

create policy if not exists p_scope_read_agendamentos on public.agendamentos
for select using (
  public.can_access_scope(municipio_id, ubs_id)
  and (
    not public.has_role('profissional')
    or exists (
      select 1 from public.profissionais p
      where p.id = profissional_id and p.user_id = auth.uid()
    )
  )
);

create policy if not exists p_scope_write_agendamentos on public.agendamentos
for all using (
  public.can_access_scope(municipio_id, ubs_id)
)
with check (
  public.can_access_scope(municipio_id, ubs_id)
);

create policy if not exists p_scope_read_reag on public.reagendamentos
for select using (public.can_access_scope(municipio_id, ubs_id));

create policy if not exists p_scope_write_reag on public.reagendamentos
for all using (
  public.can_access_scope(municipio_id, ubs_id)
)
with check (
  public.can_access_scope(municipio_id, ubs_id)
);

create policy if not exists p_scope_read_messages on public.messages
for select using (public.can_access_scope(municipio_id, ubs_id));

create policy if not exists p_scope_write_messages on public.messages
for all using (public.can_access_scope(municipio_id, ubs_id))
with check (public.can_access_scope(municipio_id, ubs_id));

create policy if not exists p_scope_read_templates on public.message_templates
for select using (
  public.can_access_scope(municipio_id, coalesce(ubs_id, ubs_id))
);

create policy if not exists p_scope_write_templates on public.message_templates
for all using (
  public.has_role('admin_platform')
  or public.has_role('gestor_municipal')
  or public.has_role('gestor_ubs')
)
with check (
  public.has_role('admin_platform')
  or public.has_role('gestor_municipal')
  or public.has_role('gestor_ubs')
);

create policy if not exists p_scope_read_audit on public.audit_events
for select using (
  public.has_role('admin_platform')
  or public.can_access_scope(municipio_id, ubs_id)
);

create policy if not exists p_scope_write_audit on public.audit_events
for insert with check (
  auth.uid() is not null
);

-- =============================
-- RETENCAO TRIMESTRAL (exemplo)
-- =============================
-- executar via cron/job:
-- delete from public.message_attempts where attempted_at < now() - interval '90 days';
-- delete from public.messages where created_at < now() - interval '90 days';
-- delete from public.audit_events where created_at < now() - interval '90 days';

