# Plano de Implementação - MVP Preditivo + Gestão

## Sprint 0 (Infra e Segurança)
- Provisionar Supabase (projeto produção + homologação).
- Aplicar `docs/supabase/mvp_schema.sql`.
- Criar usuários iniciais e papéis.
- Configurar secrets (Evolution/Telegram) no backend.
- Checklist LGPD mínimo (consentimento + auditoria ativa).

## Sprint 1 (Questionário ponta a ponta)
- Backend:
  - `POST /predictive/questionnaires`
  - `POST /predictive/questionnaires/{id}/versions`
  - `PUT /predictive/versions/{id}/structure`
  - `POST /predictive/versions/{id}/publish`
  - `GET /predictive/questionnaires/{id}/active-version`
- Frontend Admin:
  - tela de criar questionário
  - editor de perguntas/opções/pesos/faixas
  - publicar versão
- Entregável:
  - um questionário publicado funcional.

## Sprint 2 (Submissão e cálculo de risco)
- Backend:
  - `POST /predictive/submissions`
  - criação/atualização de `predictive_risk_cases`
  - eventos em `predictive_case_events`
- Extensão:
  - carregar aba de questionário por permissão
  - enviar submissão para API
  - exibir retorno de score/nível
- Entregável:
  - profissional preenche e risco aparece no caso.

## Sprint 3 (Dashboard gestores)
- Backend:
  - `GET /predictive/cases`
  - `PATCH /predictive/cases/{id}`
  - `GET /predictive/cases/{id}/events`
- Frontend:
  - dashboard municipal/UBS
  - tabela de casos com filtros
  - edição de status/atribuição
- Entregável:
  - gestão operacional do risco por escopo.

## Sprint 4 (Relatórios + mensageria avançada)
- Backend:
  - `POST /reports/predictive/export`
  - `GET /reports/jobs/{id}`
  - ajustes de fallback e métricas de mensageria
- Frontend:
  - tela de exportações e histórico
  - indicadores trimestrais
- Entregável:
  - exportação e governança operacional completa.

## Critérios de aceite MVP
- Multi-tenant isolado por município (RLS validada).
- Profissional sem acesso aos pacientes de outro profissional.
- Gestor UBS não enxerga outra UBS.
- Questionário versionado com publicação.
- Submissão gera score + caso de risco.
- Relatório exportável por período.

