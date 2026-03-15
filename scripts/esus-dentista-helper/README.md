# e-SUS Dentista Helper (MVP)

Extensao Chrome para injetar recursos na tela de atendimento do e-SUS:

- Aba `Anamnese Dentista` para:
  - Queixa e sintomatologia.
  - Triagem sistemica e comorbidades (com alertas automaticos).
- Aba `CPO` separada para:
  - Fatores de risco de carie.
  - CPO e mancha branca.
- Classificacao de risco com etiqueta ao lado de `Sexo`.
- Botao de geracao de texto corrido (narrativa), pronto para colar no SOAP.

## Instalacao (Chrome)

1. Acesse `chrome://extensions`.
2. Ative `Modo do desenvolvedor`.
3. Clique em `Carregar sem compactacao`.
4. Selecione a pasta: `scripts/esus-dentista-helper`.

## URL alvo

- `https://e-sus.portovelho.ro.gov.br/lista-atendimento/atendimento/*`

## Observacoes importantes

- Os dados preenchidos ficam no `localStorage` do navegador (por atendimento).
- Nao envia dados para servidor externo.
- Como o e-SUS pode mudar HTML/seletores, a extensao pode precisar de ajuste.
- Verifique regras da sua instituicao/LGPD para uso de extensoes em sistema assistencial.
- Personalizacao principal: editar as regras em `content.js`:
  - `calculateCariesRisk(state)` para pesos e cortes.
  - `getSystemAlerts(state)` para alertas clinicos.
  - `buildSummary(state)` para texto final gerado.

## Proximos passos recomendados

1. Ajustar os campos da anamnese para o seu protocolo clinico.
2. Calibrar formula de risco com seu time tecnico.
3. Adicionar botao para preencher automaticamente os campos do SOAP (se permitido).
4. Adicionar exportacao para PDF/CSV local.
