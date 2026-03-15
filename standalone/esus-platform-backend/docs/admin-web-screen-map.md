# Mapa de Telas - Web Admin (MVP)

## 1) Super Admin (Plataforma)

### 1.1 Login
- Email/senha + MFA opcional.

### 1.2 Tenants (Municípios)
- Lista de municípios.
- Criar/editar município.
- Ativar/desativar.

### 1.3 UBS
- Lista por município.
- Criar/editar UBS.

### 1.4 Usuários e Perfis
- Vincular usuário a papel:
  - `gestor_municipal`, `gestor_ubs`, `same`, `profissional`.
- Escopo por município/UBS.

### 1.5 Catálogo de Questionários
- Criar questionário global ou por município.
- Duplicar questionário.
- Histórico de versões.

### 1.6 Configurações de Mensageria
- WhatsApp Evolution/Telegram por município/UBS.
- Canal primário/secundário e fallback.

---

## 2) Gestor Municipal

### 2.1 Dashboard Municipal
- Total de casos por nível de risco.
- Evolução semanal/mensal/trimestral.
- Top UBS por volume de risco.

### 2.2 Casos de Risco (Município)
- Tabela com filtros:
  - UBS, risco, status, período, busca por nome/cpf/telefone.
- Ações:
  - atribuir responsável,
  - mudar status,
  - adicionar observação.

### 2.3 Questionários (Escopo municipal)
- Edita versões do município.
- Publica versão.

### 2.4 Relatórios
- Exportação CSV/PDF.
- Histórico de exportações.

---

## 3) Gestor UBS

### 3.1 Dashboard UBS
- Casos novos hoje.
- Casos em andamento.
- Casos críticos.

### 3.2 Casos de Risco (UBS)
- Mesmo padrão da municipal, restrito à UBS.

### 3.3 Operação de Reagendamentos
- Visão consolidada de:
  - reagendamentos necessários,
  - reagendamentos feitos,
  - arquivados.

---

## 4) Profissional

### 4.1 Meus Pacientes em Risco
- Lista de casos vinculados ao profissional.
- Timeline por paciente.

### 4.2 Execução de Questionário
- Visualização do questionário publicado.
- Submissão e retorno imediato do score/risco.

---

## 5) SAME

### 5.1 Agenda Operacional
- Somente módulo agenda/mensageria.
- Sem acesso a painel preditivo.

---

## 6) Navegação principal (MVP)

- `Dashboard`
- `Casos de Risco`
- `Questionários`
- `Reagendamentos`
- `Mensageria`
- `Relatórios`
- `Admin` (apenas super admin)

---

## 7) Regras UX mínimas

- Cores de risco padronizadas:
  - baixo (verde), moderado (amarelo), alto (laranja), crítico (vermelho).
- Tabelas com paginação server-side.
- Filtros sempre persistidos por sessão.
- Auditoria visível no detalhe do caso.

