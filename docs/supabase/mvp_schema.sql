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

do $$
begin
  if not exists (select 1 from pg_type where typname = 'question_kind') then
    create type question_kind as enum (
      'single_choice',
      'multi_choice',
      'boolean',
      'number',
      'text',
      'date'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'risk_level') then
    create type risk_level as enum ('none','low','moderate','high','critical');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'case_status') then
    create type case_status as enum ('new','in_progress','resolved','dismissed');
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
-- QUESTIONÁRIOS PREDITIVOS
-- =============================
create table if not exists public.predictive_questionnaires (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid references public.municipios(id) on delete cascade, -- null = template global plataforma
  ubs_id uuid references public.ubs(id) on delete cascade,              -- opcional escopo por UBS
  code text not null,                                                    -- slug técnico estável
  nome text not null,
  descricao text,
  area text,                                                             -- ex: odontologia, enfermagem
  ativo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipio_id, ubs_id, code)
);
create index if not exists idx_pred_q_scope on public.predictive_questionnaires(municipio_id, ubs_id, ativo);

create table if not exists public.predictive_questionnaire_versions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references public.predictive_questionnaires(id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft', -- draft | published | archived
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  config jsonb not null default '{}'::jsonb, -- metadados de render/formato
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (questionnaire_id, version_number)
);
create index if not exists idx_pred_qv_questionnaire on public.predictive_questionnaire_versions(questionnaire_id, status);

create table if not exists public.predictive_questions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_version_id uuid not null references public.predictive_questionnaire_versions(id) on delete cascade,
  code text not null,
  label text not null,
  help_text text,
  kind question_kind not null,
  required boolean not null default false,
  order_index integer not null default 0,
  weight numeric(10,2) not null default 0,
  rules jsonb not null default '{}'::jsonb, -- ex validação min/max
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (questionnaire_version_id, code)
);
create index if not exists idx_pred_questions_version on public.predictive_questions(questionnaire_version_id, order_index);

create table if not exists public.predictive_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.predictive_questions(id) on delete cascade,
  code text not null,
  label text not null,
  score numeric(10,2) not null default 0,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  unique (question_id, code)
);
create index if not exists idx_pred_options_question on public.predictive_question_options(question_id, order_index);

create table if not exists public.predictive_risk_bands (
  id uuid primary key default gen_random_uuid(),
  questionnaire_version_id uuid not null references public.predictive_questionnaire_versions(id) on delete cascade,
  label text not null, -- baixo/moderado/alto etc.
  level risk_level not null default 'none',
  min_score numeric(10,2) not null,
  max_score numeric(10,2) not null,
  color_hex text,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  check (min_score <= max_score)
);
create index if not exists idx_pred_risk_bands_version on public.predictive_risk_bands(questionnaire_version_id, priority);

create table if not exists public.predictive_submissions (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id) on delete cascade,
  ubs_id uuid not null references public.ubs(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  profissional_id uuid references public.profissionais(id) on delete set null,
  questionnaire_id uuid not null references public.predictive_questionnaires(id) on delete cascade,
  questionnaire_version_id uuid not null references public.predictive_questionnaire_versions(id) on delete cascade,
  source text not null default 'esus_extension', -- extension|web
  answers jsonb not null, -- snapshot de respostas
  score numeric(10,2) not null default 0,
  risk_label text,
  risk_level risk_level not null default 'none',
  factors jsonb not null default '[]'::jsonb, -- fatores que puxaram risco
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_pred_sub_scope on public.predictive_submissions(municipio_id, ubs_id, created_at desc);
create index if not exists idx_pred_sub_paciente on public.predictive_submissions(paciente_id, created_at desc);
create index if not exists idx_pred_sub_risk on public.predictive_submissions(risk_level, created_at desc);

create table if not exists public.predictive_risk_cases (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id) on delete cascade,
  ubs_id uuid not null references public.ubs(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  latest_submission_id uuid references public.predictive_submissions(id) on delete set null,
  status case_status not null default 'new',
  current_level risk_level not null default 'none',
  current_label text,
  opened_at timestamptz not null default now(),
  last_update_at timestamptz not null default now(),
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  notes text,
  unique (municipio_id, ubs_id, paciente_id)
);
create index if not exists idx_pred_cases_scope on public.predictive_risk_cases(municipio_id, ubs_id, status, current_level);

create table if not exists public.predictive_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.predictive_risk_cases(id) on delete cascade,
  event_type text not null, -- opened|recalculated|assigned|status_changed|comment
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_pred_case_events on public.predictive_case_events(case_id, created_at desc);

-- =============================
-- CONFIGS DE MENSAGERIA POR ESCOPO
-- =============================
create table if not exists public.messaging_settings (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id) on delete cascade,
  ubs_id uuid references public.ubs(id) on delete cascade,
  primary_channel msg_channel not null default 'whatsapp_evolution',
  secondary_channel msg_channel,
  enable_fallback boolean not null default true,
  evolution_base_url text,
  evolution_instance text,
  evolution_token_encrypted text,
  telegram_bot_token_encrypted text,
  ativo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipio_id, ubs_id)
);
create index if not exists idx_msg_settings_scope on public.messaging_settings(municipio_id, ubs_id, ativo);

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
alter table public.predictive_questionnaires enable row level security;
alter table public.predictive_questionnaire_versions enable row level security;
alter table public.predictive_questions enable row level security;
alter table public.predictive_question_options enable row level security;
alter table public.predictive_risk_bands enable row level security;
alter table public.predictive_submissions enable row level security;
alter table public.predictive_risk_cases enable row level security;
alter table public.predictive_case_events enable row level security;
alter table public.messaging_settings enable row level security;

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

-- Questionários: criação/edição por admin/gestores; leitura por escopo
create policy if not exists p_scope_read_pred_questionnaires on public.predictive_questionnaires
for select using (
  public.has_role('admin_platform')
  or (
    municipio_id is not null
    and public.can_access_scope(municipio_id, coalesce(ubs_id, ubs_id))
  )
);

create policy if not exists p_scope_write_pred_questionnaires on public.predictive_questionnaires
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

create policy if not exists p_scope_read_pred_versions on public.predictive_questionnaire_versions
for select using (
  exists (
    select 1
    from public.predictive_questionnaires q
    where q.id = questionnaire_id
      and (
        public.has_role('admin_platform')
        or (q.municipio_id is not null and public.can_access_scope(q.municipio_id, q.ubs_id))
      )
  )
);

create policy if not exists p_scope_write_pred_versions on public.predictive_questionnaire_versions
for all using (
  exists (
    select 1
    from public.predictive_questionnaires q
    where q.id = questionnaire_id
      and (
        public.has_role('admin_platform')
        or public.has_role('gestor_municipal')
        or public.has_role('gestor_ubs')
      )
  )
)
with check (
  exists (
    select 1
    from public.predictive_questionnaires q
    where q.id = questionnaire_id
      and (
        public.has_role('admin_platform')
        or public.has_role('gestor_municipal')
        or public.has_role('gestor_ubs')
      )
  )
);

create policy if not exists p_scope_read_pred_questions on public.predictive_questions
for select using (
  exists (
    select 1
    from public.predictive_questionnaire_versions v
    join public.predictive_questionnaires q on q.id = v.questionnaire_id
    where v.id = questionnaire_version_id
      and (
        public.has_role('admin_platform')
        or (q.municipio_id is not null and public.can_access_scope(q.municipio_id, q.ubs_id))
      )
  )
);

create policy if not exists p_scope_write_pred_questions on public.predictive_questions
for all using (
  exists (
    select 1
    from public.predictive_questionnaire_versions v
    join public.predictive_questionnaires q on q.id = v.questionnaire_id
    where v.id = questionnaire_version_id
      and (
        public.has_role('admin_platform')
        or public.has_role('gestor_municipal')
        or public.has_role('gestor_ubs')
      )
  )
)
with check (
  exists (
    select 1
    from public.predictive_questionnaire_versions v
    join public.predictive_questionnaires q on q.id = v.questionnaire_id
    where v.id = questionnaire_version_id
      and (
        public.has_role('admin_platform')
        or public.has_role('gestor_municipal')
        or public.has_role('gestor_ubs')
      )
  )
);

create policy if not exists p_scope_read_pred_options on public.predictive_question_options
for select using (
  exists (
    select 1
    from public.predictive_questions pq
    join public.predictive_questionnaire_versions v on v.id = pq.questionnaire_version_id
    join public.predictive_questionnaires q on q.id = v.questionnaire_id
    where pq.id = question_id
      and (
        public.has_role('admin_platform')
        or (q.municipio_id is not null and public.can_access_scope(q.municipio_id, q.ubs_id))
      )
  )
);

create policy if not exists p_scope_write_pred_options on public.predictive_question_options
for all using (
  exists (
    select 1
    from public.predictive_questions pq
    join public.predictive_questionnaire_versions v on v.id = pq.questionnaire_version_id
    join public.predictive_questionnaires q on q.id = v.questionnaire_id
    where pq.id = question_id
      and (
        public.has_role('admin_platform')
        or public.has_role('gestor_municipal')
        or public.has_role('gestor_ubs')
      )
  )
)
with check (
  exists (
    select 1
    from public.predictive_questions pq
    join public.predictive_questionnaire_versions v on v.id = pq.questionnaire_version_id
    join public.predictive_questionnaires q on q.id = v.questionnaire_id
    where pq.id = question_id
      and (
        public.has_role('admin_platform')
        or public.has_role('gestor_municipal')
        or public.has_role('gestor_ubs')
      )
  )
);

create policy if not exists p_scope_read_pred_bands on public.predictive_risk_bands
for select using (
  exists (
    select 1
    from public.predictive_questionnaire_versions v
    join public.predictive_questionnaires q on q.id = v.questionnaire_id
    where v.id = questionnaire_version_id
      and (
        public.has_role('admin_platform')
        or (q.municipio_id is not null and public.can_access_scope(q.municipio_id, q.ubs_id))
      )
  )
);

create policy if not exists p_scope_write_pred_bands on public.predictive_risk_bands
for all using (
  exists (
    select 1
    from public.predictive_questionnaire_versions v
    join public.predictive_questionnaires q on q.id = v.questionnaire_id
    where v.id = questionnaire_version_id
      and (
        public.has_role('admin_platform')
        or public.has_role('gestor_municipal')
        or public.has_role('gestor_ubs')
      )
  )
)
with check (
  exists (
    select 1
    from public.predictive_questionnaire_versions v
    join public.predictive_questionnaires q on q.id = v.questionnaire_id
    where v.id = questionnaire_version_id
      and (
        public.has_role('admin_platform')
        or public.has_role('gestor_municipal')
        or public.has_role('gestor_ubs')
      )
  )
);

create policy if not exists p_scope_read_pred_submissions on public.predictive_submissions
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

create policy if not exists p_scope_write_pred_submissions on public.predictive_submissions
for insert with check (
  public.can_access_scope(municipio_id, ubs_id)
);

create policy if not exists p_scope_read_pred_cases on public.predictive_risk_cases
for select using (
  public.can_access_scope(municipio_id, ubs_id)
  and (
    not public.has_role('profissional')
    or exists (
      select 1
      from public.profissionais p
      join public.profissional_paciente pp on pp.profissional_id = p.id and pp.ativo = true
      where p.user_id = auth.uid()
        and pp.paciente_id = predictive_risk_cases.paciente_id
    )
  )
);

create policy if not exists p_scope_write_pred_cases on public.predictive_risk_cases
for all using (
  public.can_access_scope(municipio_id, ubs_id)
)
with check (
  public.can_access_scope(municipio_id, ubs_id)
);

create policy if not exists p_scope_read_pred_case_events on public.predictive_case_events
for select using (
  exists (
    select 1
    from public.predictive_risk_cases c
    where c.id = case_id
      and public.can_access_scope(c.municipio_id, c.ubs_id)
  )
);

create policy if not exists p_scope_write_pred_case_events on public.predictive_case_events
for insert with check (
  exists (
    select 1
    from public.predictive_risk_cases c
    where c.id = case_id
      and public.can_access_scope(c.municipio_id, c.ubs_id)
  )
);

create policy if not exists p_scope_read_msg_settings on public.messaging_settings
for select using (
  public.has_role('admin_platform')
  or public.can_access_scope(municipio_id, ubs_id)
);

create policy if not exists p_scope_write_msg_settings on public.messaging_settings
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

-- =============================
-- RETENCAO TRIMESTRAL (exemplo)
-- =============================
-- executar via cron/job:
-- delete from public.message_attempts where attempted_at < now() - interval '90 days';
-- delete from public.messages where created_at < now() - interval '90 days';
-- delete from public.audit_events where created_at < now() - interval '90 days';
-- delete from public.predictive_case_events where created_at < now() - interval '180 days';
