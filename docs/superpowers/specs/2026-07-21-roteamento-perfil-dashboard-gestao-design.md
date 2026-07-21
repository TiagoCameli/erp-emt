# Roteamento por perfil + Dashboard de Gestão

Data: 2026-07-21
Status: aprovado (design), pendente de plano de implementação

## Problema

Ao entrar no ERP (logo após o login), o usuário cai numa tela de início (`/inicio`)
com cards de módulos e um "Bem-vindo ao ERP da EMT Construtora". O Tiago não quer
essa tela. Em vez dela, cada usuário deve cair direto no lugar que faz sentido pro
seu perfil:

- Perfil de **Compras** cai no módulo de Compras.
- Perfil de **Financeiro** cai no módulo de Financeiro.
- Perfil de **RH** cai no módulo de RH.
- Perfil **Admin** (e **Gestor**) cai num **dashboard de Gestão** que apresenta o
  que importa de Compras, Financeiro e RH.

O dashboard de Gestão não existe ainda. Ele é parte deste trabalho.

## Objetivos

1. Remover a tela `/inicio`.
2. A raiz (`/`) passa a redirecionar cada usuário para a sua tela inicial conforme
   o perfil, de forma dirigida por permissão (sem depender do nome do perfil).
3. Criar o módulo **Gestão** (`/gestao`) com um dashboard de visão geral equilibrada
   dos três módulos (Compras, Financeiro, RH), cada seção linkando pro módulo.

## Não-objetivos (fora de escopo desta rodada)

- Gráficos de evolução no tempo (Recharts). O v1 do dashboard é KPI puro. Evolução
  temporal fica pra uma rodada futura.
- Painéis dos módulos ainda não construídos (Estoque, Manutenção, Medição).
- Coluna configurável de "rota inicial" por perfil na tela de Perfis (avaliado e
  descartado como overkill; ver Decisão 1).

## Contexto do código (estado atual)

- Next.js 15 App Router, grupos `(auth)` e `(app)`.
- `src/app/page.tsx`: `redirect("/inicio")`.
- `src/app/(app)/inicio/page.tsx`: tela de cards a ser removida. É o único lugar
  que referencia a rota `/inicio` (o logo do AppShell é texto, não link; o
  middleware manda o usuário logado para `/`, não `/inicio`).
- `src/app/(app)/layout.tsx`: calcula `modulosVisiveis` filtrando `MODULOS` por
  `temPermissao(usuario, recurso, "ver")`. Essa lógica de filtro está duplicada
  entre o layout e a página de início atual.
- `src/config/recursos.ts`: fonte de verdade tipada. `MODULOS` (ordem da sidebar) e
  `RECURSOS` (abas). Hoje: cadastros, compras, financeiro, rh, administracao.
- `src/lib/permissoes.ts`: `getUsuarioLogado()`, `temPermissao()`, `exigirPermissao()`.
- `src/components/canonicos/app-shell.tsx`: `MAPA_ICONES` mapeia id de módulo para
  ícone lucide; sem entrada cai em `Circle`.
- Componentes canônicos existentes: KPICard, PageHeader, MoneyText, EmptyState,
  entre outros. Regra de ouro: usar canônico, não duplicar.

### Perfis reais no banco (2026-07-21)

| Perfil     | Vê (módulos com permissão de ver)                 | Usuários ativos |
|------------|---------------------------------------------------|-----------------|
| Admin      | administracao, cadastros, compras, financeiro, rh | 1               |
| Gestor     | cadastros, compras, financeiro, rh                | 0               |
| Compras    | compras                                           | 0               |
| Financeiro | financeiro                                        | 0               |
| RH         | rh                                                | 0               |
| Apontador  | rh                                                | 0               |
| Almoxarife | (nenhum módulo construído)                        | 0               |
| Engenharia | (nenhum módulo construído)                        | 0               |
| Mecanico   | (nenhum módulo construído)                        | 0               |

## Decisões de design

### Decisão 1 — Mapeamento perfil → tela inicial: dirigido por permissão

O perfil é livre (nome + descrição + matriz de permissões, criado pelo admin). Não
há enum fixo de perfis no código. Então o mapeamento não pode depender do nome do
perfil.

**Escolhido:** a rota inicial é o **primeiro módulo visível** do usuário, na ordem
da sidebar. O módulo Gestão entra como **primeiro** dessa ordem. Como consequência
natural, quem tem permissão de ver Gestão (Admin e Gestor) cai em `/gestao`; quem
não tem cai no primeiro módulo real que enxerga (Compras → `/compras`,
Financeiro → `/financeiro`, RH → `/rh`, Apontador → `/rh`).

Vantagens: não quebra ao criar/renomear perfil; reaproveita a permissão que já
existe; uma única regra cobre todos os casos; some da sidebar e da landing junto,
sem lógica paralela.

**Descartado:** coluna `rota_inicial` no perfil, configurável na tela de Perfis.
Mais flexível, mas exige migration de schema + UI nova + manutenção, sem ganho real
pro que foi pedido.

### Decisão 2 — Gestão é um módulo/recurso de verdade

Adicionar `Gestão` a `MODULOS` (id `gestao`, rota `/gestao`), **primeiro na ordem**,
e o recurso `gestao.painel` (ação apenas `ver`) a `RECURSOS`. Assim a permissão de
Gestão aparece na matriz de Perfis (o admin liga/desliga por perfil) e o módulo
entra na sidebar de quem pode ver. Ícone lucide `LayoutDashboard` no `MAPA_ICONES`.

### Decisão 3 — Concessão inicial da permissão

Migration versionada em `supabase/migrations/` que insere `('gestao.painel','ver')`
em `perfil_permissoes` para os perfis **Admin** e **Gestor** (insert idempotente,
resolvendo o `perfil_id` pelo nome). Segue a regra do projeto: schema/seed por
migration via CLI, nunca pelo dashboard. Rodar os advisors (security e performance)
depois e corrigir o que aparecer.

### Decisão 4 — Fallback sem módulo

Usuário logado, ativo, sem nenhum módulo visível (hoje Almoxarife, Engenharia,
Mecanico) não pode quebrar no redirect. `rotaInicial` retorna `null` nesse caso e o
app leva a uma página enxuta `/sem-acesso` (dentro de `(app)`, com o shell) dizendo
"Você ainda não tem acesso a nenhum módulo. Fale com o administrador.", usando
`EmptyState`.

## Arquitetura

### Parte 1 — Roteamento

- **Helper compartilhado** (em `src/config/recursos.ts` ou `src/lib/permissoes.ts`,
  a definir no plano): `modulosVisiveis(usuario): ModuloDef[]` e
  `rotaInicial(usuario): string | null`. `rotaInicial` = rota do primeiro módulo
  visível na ordem de `MODULOS`, ou `null` se nenhum.
- **`src/app/(app)/layout.tsx`**: passa a usar `modulosVisiveis(usuario)` (remove a
  duplicação do filtro).
- **`src/app/page.tsx`**: vira server component async. Busca o usuário, calcula
  `rotaInicial`. Se rota, `redirect(rota)`; se `null`, `redirect("/sem-acesso")`.
  (Sem sessão, o middleware já cuida de mandar pro `/login` antes disso.)
- **Remover** `src/app/(app)/inicio/page.tsx`.
- **Criar** `src/app/(app)/sem-acesso/page.tsx` (mensagem com EmptyState).
- **`config/recursos.ts`**: `MODULOS` ganha `{ id:"gestao", nome:"Gestão",
  rota:"/gestao" }` como primeiro item; `RECURSOS` ganha `gestao.painel` (ações:
  `["ver"]`).
- **`app-shell.tsx`**: `MAPA_ICONES.gestao = LayoutDashboard`.

### Parte 2 — Dashboard `/gestao`

- **`src/app/(app)/gestao/page.tsx`**: server component. Checa
  `temPermissao(usuario, "gestao.painel", "ver")`; sem permissão → `notFound()`
  (padrão das outras páginas do app). Busca os três resumos em paralelo
  (`Promise.all`) e renderiza `PageHeader` "Gestão" + três seções.
- **`src/modules/gestao/queries.ts`**: três funções de leitura, cada uma retornando
  um objeto pequeno e tipado. Só leitura, sem Server Action, sem tabela nova. Usa o
  client Supabase do servidor (sessão do usuário), então as agregações respeitam o
  RLS de cada tabela de base.
  - `comprasResumo()`
  - `financeiroResumo()`
  - `rhResumo()`
- Cada seção é um bloco de `KPICard` com o título linkando pro módulo. Dinheiro com
  `MoneyText` e `tabular-nums`.
- **Tratamento de erro por seção:** cada resumo é resolvido de forma isolada; se um
  falhar, a página renderiza um estado de erro só naquela seção (as outras
  carregam). Não deixar a página inteira cair por causa de uma query.

### KPIs por seção (v1)

Valores de status confirmados no código: `rascunho`, `pendente_aprovacao`,
`aprovado`, `rejeitado`, `cancelado`, `pago`, `pendente`, `aberto`/`aberta`,
`conciliada`, `vencida`, `fechada`. Os filtros exatos por tabela serão confirmados
lendo `schemas.ts`/`queries.ts` de cada módulo na implementação (não inventar
status).

**Compras** (→ `/compras`), base `ordens_compra`, `cotacoes`:
- OCs a aprovar: contagem + soma de `valor_total` onde `status = 'pendente_aprovacao'`.
- OCs abertas: soma de `valor_total` onde `status = 'aprovado'` (e demais status de
  "em andamento" a confirmar na implementação).
- Cotações em aberto: contagem de `cotacoes` com status não finalizado.

**Financeiro** (→ `/financeiro`), base `lancamento_parcelas`, `lancamentos`,
`contas_bancarias`:
- A pagar (vencendo em 7 dias e vencidas): soma de `valor` de parcelas pendentes com
  `data_vencimento <= hoje + 7`, destacando vencidas.
- Pagamentos a aprovar: contagem + soma pendentes de aprovação.
- Pago no mês: soma de parcelas com `data_pagamento`/`pago_em` no mês corrente.

**RH** (→ `/rh`), base `colaboradores`, `folhas`, `rh_apontamentos`,
`rh_ocorrencias`:
- Colaboradores ativos: contagem.
- Custo da folha da competência: `custo_total` da folha da competência corrente.
- Apontamentos/ocorrências em aberto: contagem de pendentes.

Datas e mês corrente na timezone `America/Rio_Branco` (regra do projeto).

## Fluxo

1. Login → middleware manda o usuário logado para `/`.
2. `/` (`page.tsx`) → `getUsuarioLogado()` → `rotaInicial(usuario)`.
3. Redireciona: Admin/Gestor → `/gestao`; Compras → `/compras`; Financeiro →
   `/financeiro`; RH/Apontador → `/rh`; sem módulo → `/sem-acesso`.
4. Em `/gestao`, o layout `(app)` já injeta a sidebar (com Gestão em primeiro para
   quem pode ver) e o dashboard carrega os três resumos.

## Testes

- **Vitest** em `rotaInicial` (função pura): mapeia conjuntos de permissões para a
  rota esperada, incluindo o caso "sem módulo → null" e a precedência de Gestão.
- Conferir que perfil sem `gestao.painel:ver` recebe `notFound()` em `/gestao` e não
  vê a seção.
- `tsc --noEmit`, lint e build verdes. Sem `any` novo, sem `console.log`.
- Advisors do Supabase rodados após a migration.
- Validado no preview da Vercel antes de pedir validação do Tiago.

## Definição de pronto

- Login de cada perfil cai na tela certa (Admin/Gestor no `/gestao`, demais no seu
  módulo).
- `/inicio` não existe mais e nada aponta pra ela.
- Dashboard de Gestão mostra os três blocos com números reais, dinheiro com
  `MoneyText`, cada seção linkando pro módulo.
- Falha de uma query não derruba a página inteira.
- Migration aplicada, advisors limpos, build/lint/tsc verdes.

## Riscos e pontos de atenção

- **Saldo em contas:** saldo real depende de movimentação (extratos/conciliação); no
  v1, se ficar caro, exibir o que for confiável (ex.: total pago no mês) em vez de um
  saldo impreciso. Confirmar na implementação.
- **Ordem da sidebar:** colocar Gestão em primeiro muda a ordem visual pra todos os
  perfis que a veem. É o comportamento desejado (Gestão é a home do Admin/Gestor).
- **Status exatos:** os filtros de KPI dependem dos valores de status por tabela;
  ler os `schemas.ts` na implementação antes de fixar cada `where`.
