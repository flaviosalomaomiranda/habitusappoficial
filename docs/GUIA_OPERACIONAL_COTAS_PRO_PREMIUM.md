# Guia Operacional: Cotas Diárias PRO/PREMIUM

## O que foi implementado

Este guia descreve a implementação ativa no app para:

1. Metas configuráveis por cidade (admin)
2. Dashboard diário de performance
3. Alertas de saturação (>= 80%)
4. Priorização automática de entrega (soft cap)

---

## 1) Onde configurar metas por cidade (admin)

Tela:
- `Admin: Rede de Serviços Profissionais`
- Arquivo: `components/ManageSupportNetworkModal.tsx`

Bloco:
- **Metas de cota diária por cidade**

Campos:
- Cidade (dropdown)
- Meta PREMIUM hero (impressões/dia/profissional)
- Meta PRO carrossel (impressões/dia/profissional)

Ação:
- Botão **Salvar metas da cidade**

Persistência:
- Documento: `supportNetworkSettings/adQuotaTargets`
- Estrutura:
  - `defaults.premiumHeroTarget`
  - `defaults.proCarouselTarget`
  - `byCityId.{cityId}.premiumHeroTarget`
  - `byCityId.{cityId}.proCarouselTarget`

---

## 2) Dashboard diário (admin)

Tela:
- Mesmo modal da Rede de Serviços, bloco:
- **Dashboard diário de cotas e performance**

Filtros:
- Data
- Cidade (opcional)

Botão:
- **Atualizar dashboard**

Exibe:
- Quantidade de profissionais com alerta (>=80%)
- Impressões totais no dia
- CTR médio de contato
- Tabela por profissional + slot:
  - Impressões
  - Meta
  - % da cota
  - CTR de contato

Alerta visual:
- qualquer linha com saturação >=80% entra em alerta

---

## 3) Como o app usa a cota na entrega (soft cap)

Arquivo principal:
- `components/ParentDashboard.tsx`

### PREMIUM (hero_exclusive)
Passos:
1. Monta candidatos por localização (cidade > UF > fallback)
2. Lê impressões diárias por profissional no slot `hero_exclusive`
3. Compara com meta da cidade (ou default)
4. Prioriza quem está abaixo da meta
5. Se todos atingiram meta: continua rodízio pelos menos saturados

### PRO (pro_carousel)
Passos:
1. Monta candidatos PRO (`top/pro`) por localização
2. Lê impressões diárias por profissional no slot group `pro_carousel`
3. Ordena por:
   - abaixo da meta primeiro
   - menor razão de saturação
   - menor volume absoluto
4. Mantém regras de blocos (5 por bloco, até 3 blocos)

Resultado:
- equidade melhor
- sem “buraco” de anúncio
- sem hard stop quando meta é alcançada

---

## 4) Fontes de dados de métricas

### Agregado por profissional
Coleção:
- `supportNetworkStats/{professionalId}`

Campos:
- `impressions`
- `contactClicks`
- `whatsappClicks`
- `locationClicks`
- `favoriteAdds`
- `routineImportClicks`

### Diário por profissional/slot/cidade
Coleção:
- `supportNetworkDailyStats/{dailyDocId}`

`dailyDocId`:
- `{date}__{professionalId}__{slotGroup}__{cityId|global}`

Campos úteis:
- `date`
- `professionalId`
- `cityId`
- `slot`
- `slotGroup`
- `impressions`
- `contactClicks`
- `whatsappClicks`

---

## 5) Cálculos usados

### Saturação de cota
- `% cota = (impressions / target) * 100`

### CTR de contato
- `CTR contato = ((contactClicks + whatsappClicks) / impressions) * 100`

---

## 6) Dedupe de impressões

Para evitar inflação:
- dedupe por `profissional + slot`
- janela: 5 minutos por sessão

Arquivo:
- `context/AppContext.tsx` (`trackProfessionalEvent`)

---

## 7) Defaults atuais

Se cidade não tiver meta própria:
- PREMIUM hero: 400
- PRO carrossel: 250

---

## 8) Comportamento esperado em produção

1. Cidade com muitos patrocinados:
- distribuição tende a ficar mais justa ao longo do dia

2. Cidade com poucos patrocinados:
- continua entregando anúncio sem parar
- alternando pelos menos saturados

3. Pico de tráfego:
- alertas >=80% ajudam a ajustar meta antes da saturação total

---

## 9) Próximas melhorias recomendadas

1. Tornar defaults globais também editáveis na interface admin
2. Adicionar export CSV do dashboard diário
3. Adicionar histórico de 7/30 dias com tendência de CTR
