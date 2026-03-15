# Setup do Backend de Mensageria (Firebase Functions + Supabase)

## 1) Functions adicionadas
- `messagingApi` (HTTP):
  - `POST /messages/queue`
  - `POST /messages/send-now`
  - `GET /messages/list`
  - `POST /templates/upsert`
- `processQueuedMessages` (agendado a cada 1 minuto)

Arquivos:
- `functions/messaging.js`
- `functions/index.js` (exporta as funções acima)

## 2) Configurar variáveis
No projeto Firebase:

```bash
firebase functions:config:set \
  supabase.url="https://SEU-PROJETO.supabase.co" \
  supabase.service_key="SUA_SERVICE_ROLE_KEY" \
  evolution.url="https://SEU-EVOLUTION-ENDPOINT/sendText" \
  evolution.api_key="SUA_EVOLUTION_API_KEY" \
  telegram.bot_token="SEU_BOT_TOKEN" \
  messaging.default_fallback_channel="telegram"
```

## 3) Deploy
```bash
firebase deploy --only functions:messagingApi,functions:processQueuedMessages
```

## 4) Segurança atual (MVP)
- Requer Firebase ID Token válido (`Authorization: Bearer <idToken>`).
- O refinamento de RBAC por escopo (município/UBS/perfil) será aplicado na camada Supabase + claims.

## 5) Observação Evolution API
O payload atual enviado para Evolution é:
```json
{
  "number": "55DDDNXXXXXXXX",
  "text": "mensagem"
}
```
Se sua instância usar outro formato/rota, ajuste `sendViaEvolution` em `functions/messaging.js`.

