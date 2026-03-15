# Plataforma Saúde - MVP (Arquitetura + Regras)

## 1) Objetivo
Plataforma multi-tenant para:
- Extensão (SAME e Profissionais): operação da agenda e ações rápidas.
- Painel web (Gestor UBS, Gestor Municipal, Admin): gestão, monitoramento, relatórios e configuração de mensagens.

## 2) Perfis e escopo
- `admin_platform`: visão global (todos os municípios).
- `gestor_municipal`: vê todas as UBS do seu município.
- `gestor_ubs`: vê apenas sua UBS.
- `same`: agenda e mensagens operacionais da própria UBS.
- `profissional`: apenas pacientes vinculados ao profissional.

## 3) Isolamento multi-tenant
- Tenant principal: `municipio_id`.
- Subnível: `ubs_id`.
- Todas as tabelas operacionais carregam `municipio_id` (e quando aplicável `ubs_id`).
- Isolamento via RLS no Supabase.

## 4) Módulos
- `Agenda`: lembrete/cancelamento/reagendamento, fila de remarcação e históricos.
- `Mensageria`: WhatsApp Evolution + Telegram (fallback configurável).
- `Gestão`: dashboard municipal/UBS, configurações, templates, exportações.
- `Logs`: auditoria completa de ação e de tentativa de envio.

## 5) Regras operacionais
- SAME opera apenas agenda.
- Profissional vê apenas sua carteira de pacientes.
- Gestor municipal pode configurar templates padrão por município.
- Histórico trimestral (90 dias) em produção ativa; arquivamento opcional.

## 6) Consentimento e LGPD
- Consentimento por paciente para canal (WhatsApp/Telegram).
- Registro de versão/termo/data/usuário responsável.
- Auditoria de quem viu, enviou, alterou, exportou.

## 7) Documentos de execução (MVP)
- Schema detalhado: `docs/supabase/mvp_schema.sql`
- Contrato de API preditiva: `docs/predictive-api-contract.md`
- Mapa de telas web admin: `docs/admin-web-screen-map.md`
- Plano de implementação por sprint: `docs/mvp-implementation-plan.md`
