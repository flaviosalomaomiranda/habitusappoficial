# Política de Cota Diária (PRO/PREMIUM) - Implementação Atual

## Objetivo
Garantir entrega comercial mais justa para profissionais patrocinados sem quebrar a experiência do usuário.

A regra implementada é **soft cap**:
- prioriza quem ainda está abaixo da meta diária
- nunca deixa o slot vazio
- se todos bateram meta, continua rodízio pelos menos saturados

---

## 1) Metas Diárias Atuais

- `PREMIUM hero`: **400 impressões/dia** por profissional
- `PRO carrossel`: **250 impressões/dia** por profissional

Essas metas estão no `ParentDashboard.tsx` como constantes:
- `PREMIUM_DAILY_TARGET = 400`
- `PRO_DAILY_TARGET = 250`

---

## 2) Onde os Dados São Gravados

### 2.1 Estatística agregada (já existente)
Coleção:
- `supportNetworkStats/{professionalId}`

Campos incrementados:
- `impressions`
- `contactClicks`
- `whatsappClicks`
- `locationClicks`
- `favoriteAdds`
- `routineImportClicks`

### 2.2 Estatística diária por slot (nova base da cota)
Coleção:
- `supportNetworkDailyStats/{dailyDocId}`

Formato do id:
- `${date}__${professionalId}__${slotGroup}__${cityId|global}`

Campos principais:
- `date` (`yyyy-mm-dd`)
- `professionalId`
- `cityId`
- `slot` (ex.: `hero_exclusive`, `pro_carousel_1`)
- `slotGroup` (ex.: `hero_exclusive`, `pro_carousel`)
- contadores incrementais por evento (ex.: `impressions`)

---

## 3) Como a Cota é Aplicada no PREMIUM

Fluxo resumido:
1. Monta pool de `exclusive` por localização (cidade -> UF -> fallback).
2. Lê impressões diárias por profissional no slot group `hero_exclusive`.
3. Calcula razão de saturação: `impressions / PREMIUM_DAILY_TARGET`.
4. Seleção:
   - se houver profissionais abaixo da meta, escolhe apenas entre eles
   - se todos bateram meta, usa todos, ordenando por menor saturação
5. Aplica rodízio temporal (bucket de tempo + hash da cidade).

Resultado:
- distribuição mais justa
- mantém alternância
- não para a exibição quando a meta é atingida

---

## 4) Como a Cota é Aplicada no PRO

Fluxo resumido:
1. Monta pool de `top/pro` por localização (cidade -> UF -> fallback).
2. Lê impressões diárias por profissional no slot group `pro_carousel`.
3. Ordena profissionais por prioridade de entrega:
   - abaixo da meta primeiro
   - menor razão de saturação
   - menor número absoluto de impressões
4. Depois aplica rotação de ordem diária e quebra em blocos:
   - até 5 por bloco
   - até 3 blocos

Resultado:
- blocos PRO favorecem profissionais menos entregues no dia
- mantém diversidade visual e sem repetição dentro do ciclo

---

## 5) Dedupe de Impressão

Para evitar inflação de view:
- dedupe por `profissional + slot`
- janela de **5 minutos por sessão**

Assim, múltiplos re-renders não contam como novas impressões imediatamente.

---

## 6) Comportamento em Pico

Como a política é `soft cap`:
- o rodízio **não para**
- quando todos batem meta, o sistema continua exibindo, priorizando os menos saturados

Isso evita “buraco” comercial e mantém cobertura.

---

## 7) Vantagens da Política Atual

1. Equidade melhor entre patrocinados
2. Continuidade de entrega (sem slot vazio)
3. Métrica diária auditável por cidade e slot
4. Base pronta para painel de performance (CTR por profissional)

---

## 8) Próximos Passos Recomendados

1. Tornar metas configuráveis por cidade no admin
2. Criar dashboard com:
   - `% da cota atingida`
   - `impressions` por dia/slot/profissional
   - CTR de contato
3. Adicionar alertas de saturação (ex.: 80% da meta)

