# eSUS Platform Backend

Backend isolado do módulo preditivo (Firebase Functions + Supabase).

## Estrutura

- `functions/predictive.js`: API HTTP do questionário preditivo.
- `functions/index.js`: exporta `predictiveApi`.
- `docs/supabase/mvp_schema.sql`: schema inicial do Supabase.
- `docs/*.md`: contratos e mapa de telas.

## Configuração

1. Copie `.firebaserc.example` para `.firebaserc` e ajuste o `projectId`.
2. Entre na pasta `functions` e instale dependências:
   - `npm install`
3. Configure segredos no Firebase Functions:
   - `firebase functions:config:set supabase.url="https://SEU-PROJETO.supabase.co"`
   - `firebase functions:config:set supabase.service_key="SUA_SERVICE_ROLE_KEY"`
4. Deploy:
   - `firebase deploy --only functions:predictiveApi`

## Banco (Supabase)

Execute o SQL abaixo no projeto Supabase correto:

- `docs/supabase/mvp_schema.sql`

## Observação

Este backend foi extraído para evitar acoplamento com o projeto `habitusappoficial`.
