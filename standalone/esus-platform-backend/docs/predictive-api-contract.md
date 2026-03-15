# Contrato de API - MVP Preditivo (v1)

Base URL (exemplo): `https://api.seudominio.com/v1`

Auth:
- JWT do usuário (Bearer).
- Todas as rotas aplicam escopo por `municipio_id` + `ubs_id` via RLS/backend.

## 1) Questionários (Admin/Gestores)

### `POST /predictive/questionnaires`
Cria questionário.

Request:
```json
{
  "municipio_id": "uuid",
  "ubs_id": "uuid|null",
  "code": "caries_risk_v1",
  "nome": "Risco de Cárie",
  "descricao": "Questionário odontológico",
  "area": "odontologia"
}
```

Response `201`:
```json
{ "id": "uuid", "status": "ok" }
```

### `POST /predictive/questionnaires/{id}/versions`
Cria nova versão (`draft`).

Request:
```json
{
  "version_number": 1,
  "config": { "layout": "default" }
}
```

### `POST /predictive/versions/{version_id}/publish`
Publica versão e fecha versão ativa anterior.

Request:
```json
{ "publish_note": "Ajuste de pesos março/2026" }
```

### `PUT /predictive/versions/{version_id}/structure`
Upsert em lote de perguntas/opções/faixas.

Request:
```json
{
  "questions": [
    {
      "code": "sugar_frequency",
      "label": "Consumo de açúcar",
      "kind": "single_choice",
      "required": true,
      "order_index": 1,
      "weight": 1,
      "options": [
        { "code": "low", "label": "Baixo (<3x)", "score": 0, "order_index": 1 },
        { "code": "high", "label": "Alto (>=3x)", "score": 3, "order_index": 2 }
      ]
    }
  ],
  "risk_bands": [
    { "label": "Baixo", "level": "low", "min_score": 0, "max_score": 5, "priority": 1 },
    { "label": "Moderado", "level": "moderate", "min_score": 6, "max_score": 10, "priority": 2 },
    { "label": "Alto", "level": "high", "min_score": 11, "max_score": 999, "priority": 3 }
  ]
}
```

### `GET /predictive/questionnaires?municipio_id=&ubs_id=&area=&active=true`
Lista questionários.

### `GET /predictive/questionnaires/{id}/active-version`
Retorna versão publicada + perguntas/opções/faixas para render na extensão.

---

## 2) Submissão e cálculo (Extensão / Profissional)

### `POST /predictive/submissions`
Envia respostas e recebe score/risco calculado.

Request:
```json
{
  "municipio_id": "uuid",
  "ubs_id": "uuid",
  "paciente": {
    "nome": "Nome Paciente",
    "cpf": "00000000000",
    "telefone": "5569999999999"
  },
  "profissional_id": "uuid",
  "questionnaire_id": "uuid",
  "questionnaire_version_id": "uuid",
  "answers": {
    "sugar_frequency": "high",
    "toothbrushing_frequency": "lt_2"
  },
  "source": "esus_extension"
}
```

Response `201`:
```json
{
  "submission_id": "uuid",
  "score": 12,
  "risk": {
    "label": "Alto",
    "level": "high"
  },
  "factors": [
    { "question_code": "sugar_frequency", "option_code": "high", "score": 3 },
    { "question_code": "toothbrushing_frequency", "option_code": "lt_2", "score": 2 }
  ],
  "case": {
    "id": "uuid",
    "status": "new"
  }
}
```

Regras backend:
- cria/atualiza paciente (upsert por cpf/cns + escopo UBS).
- persiste `predictive_submissions`.
- atualiza `predictive_risk_cases` por paciente.
- registra evento em `predictive_case_events`.

---

## 3) Casos de risco (Gestores)

### `GET /predictive/cases`
Filtros:
- `municipio_id`, `ubs_id`, `status`, `risk_level`, `from`, `to`, `search`.

Response:
```json
{
  "items": [
    {
      "id": "uuid",
      "paciente_nome": "Maria",
      "cpf": "000...",
      "telefone": "55...",
      "current_level": "high",
      "current_label": "Alto",
      "status": "new",
      "last_update_at": "2026-03-15T10:00:00Z"
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 132
}
```

### `PATCH /predictive/cases/{id}`
Atualiza status, responsável e notas.

Request:
```json
{
  "status": "in_progress",
  "assigned_to_user_id": "uuid",
  "notes": "Contato ativo com equipe da UBS"
}
```

### `GET /predictive/cases/{id}/events`
Timeline do caso.

---

## 4) Exportações (Gestores)

### `POST /reports/predictive/export`
Gera CSV assíncrono com filtros.

Request:
```json
{
  "municipio_id": "uuid",
  "ubs_id": "uuid|null",
  "from": "2026-01-01",
  "to": "2026-03-31",
  "risk_level": ["moderate", "high", "critical"]
}
```

Response:
```json
{ "job_id": "uuid", "status": "queued" }
```

### `GET /reports/jobs/{job_id}`
Retorna status e URL temporária do arquivo.

---

## 5) Permissões por perfil

- `admin_platform`: tudo.
- `gestor_municipal`: CRUD de questionário no município + visão casos município.
- `gestor_ubs`: leitura/config no escopo UBS + visão casos UBS.
- `profissional`: leitura de questionário publicado + submissão + leitura de seus casos/pacientes.
- `same`: sem acesso ao módulo preditivo.

---

## 6) Idempotência e auditoria

- `POST /predictive/submissions` aceita header `Idempotency-Key`.
- Toda ação de criação/publicação/edição/export grava `audit_events`.

