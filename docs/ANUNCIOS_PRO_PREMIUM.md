# Anúncios de Profissionais PRO/PREMIUM (Regras Atuais)

## Objetivo
Este documento descreve como o app decide **quando**, **quem** e **como** exibir:
- card **PREMIUM** (tier `exclusive`)
- carrosséis **PRO** (tiers `top`/`pro`)

Também detalha rodízio, prioridade por localização e contagem de visualizações.

---

## 1) Fontes de Dados

Os dados vêm de:
- `supportNetworkProfessionals`: profissionais cadastrados
- `activeSupportNetworkProfessionals`: subconjunto considerado ativo no dia

Regra de fallback:
- sempre tenta primeiro os ativos
- se não houver ativos para o tier, usa os cadastrados

---

## 2) Regras de Exibição do PREMIUM (exclusive)

### 2.1 Seleção de candidatos
Pool de premium:
1. `activeSupportNetworkProfessionals` com `tier === "exclusive"`
2. fallback para `supportNetworkProfessionals` com `tier === "exclusive"`

### 2.2 Prioridade por localização
Ordem de priorização:
1. match exato de cidade (cidade/id da família)
2. fallback por UF
3. fallback global (pool completo)

### 2.3 Rodízio adaptativo (atual)
O premium da home é calculado por janela de tempo:
- **2 minutos** quando usuário está ativo no dashboard e aba visível
- **5 minutos** quando está fora do dashboard ou app em background

Índice do rodízio:
- bucket temporal + hash da cidade
- garante alternância previsível quando há 2+ premium elegíveis

### 2.4 Atualização em tempo real da troca
Para não “travar” no mesmo premium:
- recalcula periodicamente com `tick`
- intervalo menor quando ativo no dashboard
- força recálculo ao voltar para aba visível

---

## 3) Regras de Exibição dos Carrosséis PRO

### 3.1 Seleção de candidatos
Pool de PRO:
1. `activeSupportNetworkProfessionals` com tier `top`/`pro`
2. fallback para `supportNetworkProfessionals` com tier `top`/`pro`

### 3.2 Prioridade por localização
Ordem:
1. cidade
2. UF
3. global

### 3.3 Rodízio base de ordem
Antes de quebrar em blocos, a lista é rotacionada com seed diária
para variar quem aparece primeiro ao longo dos dias.

### 3.4 Quebra em blocos
Regras atuais:
- até **5 profissionais por bloco**
- até **3 blocos**
- sem repetição entre blocos (dedupe por `id`)

### 3.5 Inserção entre hábitos
Posições de inserção:
- `firstIndex = 5` se houver premium hero
- `firstIndex = 1` se não houver premium hero
- espaçamento mínimo entre blocos: `+6` hábitos

Se não couber tudo no miolo da lista, blocos restantes entram no final (`trailing`).

---

## 4) Cenários Especiais de Exibição

### 4.1 Usuário com criança, mas sem hábitos no dia
- mostra fallback de card PREMIUM (se existir)
- mostra blocos PRO disponíveis

### 4.2 Usuário sem criança selecionada (onboarding)
- pode mostrar:
  - card PREMIUM (se houver)
  - primeiro bloco PRO (se houver)

Isso evita tela “sem monetização” quando existem profissionais ativos.

---

## 5) Métricas e Contagem de Visualizações

## 5.1 Eventos por profissional
Coleções usadas:
- `supportNetworkStats/{professionalId}` (contadores agregados)
- `supportNetworkEvents` (eventos detalhados)

Eventos principais:
- `impression`
- `contact_click`
- `whatsapp_click`
- `location_click`
- `favorite_add`
- `routine_import`

### 5.2 Dedupe de impressão
Para evitar inflar números:
- impressão deduplicada por `profissional + slot`
- janela de dedupe: **5 minutos por sessão**

Exemplo de slots:
- `hero_exclusive`
- `pro_carousel_1`, `pro_carousel_2`, `pro_carousel_3`
- `premium_card`, `listed_card` (na rede)

### 5.3 Fórmulas úteis
- Impressões: `supportNetworkStats.impressions`
- Cliques de contato: `contactClicks + whatsappClicks`
- CTR contato (%): `(cliques_contato / impressions) * 100` (se `impressions > 0`)

---

## 6) Regras de Hierarquia (resumo)

Na home:
1. PREMIUM pode aparecer como destaque principal
2. PRO aparece em carrosséis distribuídos ao longo das rotinas
3. sem duplicar profissional no mesmo ciclo de blocos

---

## 7) Limitações Atuais

- O rodízio é por janela temporal + cidade; não usa ainda “cota diária” por profissional.
- Especialidade não é critério de separação no rodízio da home.
- A tela de Rede de Serviços lista também tiers não-PRO (com filtros próprios).

---

## 8) Próximos Passos Recomendados

1. Adicionar **cota diária de impressões** por profissional premium/pro.
2. Criar modo “somente PRO/PREMIUM” na Rede de Serviços ao vir do carrossel.
3. Expor painel admin com:
- impressões por slot
- CTR por profissional
- distribuição por cidade/UF

