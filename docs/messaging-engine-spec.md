# Motor de Mensageria (WhatsApp Evolution + Telegram)

## 1) Objetivo
Permitir envio operacional de mensagens para agenda com:
- Canal principal configurável (WhatsApp Evolution ou Telegram)
- Fallback automático para canal secundário em caso de falha
- Log completo de tentativas e resultado final

## 2) Fluxo de envio
1. Extensão/painel cria registro em `messages` (status `queued`).
2. Worker backend processa a fila:
   - monta payload pelo template escolhido
   - tenta canal primário
3. Se sucesso:
   - grava `message_attempts.success = true`
   - `messages.status = sent`, `final_channel = canal`
4. Se falha:
   - grava tentativa com erro
   - tenta canal secundário (se habilitado)
5. Se fallback sucesso:
   - `messages.status = fallback_sent`, `final_channel = secundário`
6. Se ambos falham:
   - `messages.status = failed`

## 3) Regras de fallback
- Configuração por município/UBS:
  - `primary_channel`: whatsapp_evolution | telegram
  - `secondary_channel`: whatsapp_evolution | telegram | null
  - `enable_fallback`: boolean
- Fallback só dispara em erro técnico de envio (timeout, auth, indisponibilidade).
- Não dispara fallback quando paciente não tem identificador do canal secundário.

## 4) Endpoints sugeridos
## Backend (interno)
- `POST /v1/messages/send`
- `POST /v1/messages/bulk-send`
- `GET /v1/messages/:id`
- `GET /v1/messages?municipio_id=&ubs_id=&status=&from=&to=`

## Provider adapters
- `EvolutionAdapter.send(to, text, metadata)`
- `TelegramAdapter.send(chatIdOrPhone, text, metadata)`

## 5) Estrutura de logs
Salvar em `message_attempts`:
- `message_id`
- `channel`
- `success`
- `provider_status`
- `provider_message_id`
- `error_text`
- `attempted_at`

## 6) Resiliência
- Retry com backoff (ex.: 1m, 5m, 15m, máx 3 tentativas por canal).
- Idempotência: chave única (`message_id + channel + attempt_number`).
- Circuit breaker por canal quando houver sequência alta de falhas.

## 7) Segurança
- Tokens Evolution/Telegram cifrados (KMS/secret manager).
- Não logar token em texto.
- Assinatura JWT entre frontend e backend.

## 8) Métricas de gestão
- Taxa de envio por canal.
- Taxa de fallback.
- Falhas por motivo.
- Tempo médio de entrega (quando houver callback do provider).

