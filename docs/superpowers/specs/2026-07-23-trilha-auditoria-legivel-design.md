# Trilha de auditoria legível — Design

Data: 2026-07-23
Status: aprovado (design), pendente de plano
Autor: Léo (com Tiago)

## Problema

A trilha (histórico do audit_log) mostra o diff CRU do banco. O helper canônico
`src/components/canonicos/trilha-helpers.ts` (`eventosDoAuditLog`) gera:
- título fixo "Registro criado/editado/excluído";
- descrição = `campo: antes → depois` por campo, com nome técnico do campo
  (`condicao_pagamento_id`, `aprovado_por`, `motivo_rejeicao`), UUID cru no lugar
  de nome, timestamp ISO cru, e "vazio" para null.

Ex. real: `condicao_pagamento_id: vazio → 07144f18-5284-4abf-a8ce-efa20d3d7d13`,
`aprovado_em: 2026-07-22T19:30:24.625861+00:00 → vazio`, `valor_total: 0 → 3680`.
Ilegível para o usuário.

## Objetivo

Trilha legível em todo o app: título que diz o que aconteceu, rótulo amigável de
campo, valor formatado (R$, data, situação em palavras), UUID resolvido para nome
real, e sem ruído técnico. É melhoria do helper canônico (afeta todas as telas que
usam a trilha) + resolução de nomes nas telas.

## Decisões (fechadas com o Tiago)

1. **Título por ação, não "Registro editado".** Derivado da transição de situação
   (`status`): pendente_aprovacao→"Enviada para aprovação"; aprovado→"Aprovada";
   aprovado→pendente (desaprovação)→"Aprovação revertida"; rejeitado→"Rejeitada";
   cancelado→"Cancelada"; recebido→"Recebida". INSERT→"{Entidade} criada".
   DELETE→"{Entidade} excluída". UPDATE sem mudança de situação→"Dados alterados".
2. **Nome da entidade por tela.** Cada chamador passa o rótulo ("Ordem", "Cotação",
   "Lançamento"), então o título fica "Ordem criada", "Cotação finalizada" etc.
3. **Só o valor NOVO** nas mudanças de campo (não "de → para"). Ex.:
   "Valor total: R$ 3.680,00", "Condição de pagamento: À vista".
4. **Rótulo amigável + valor formatado** por campo (mapa de metadados).
5. **UUID → nome real** via resolvedor compartilhado (condição, usuário, fornecedor,
   centro de custo, insumo). A query da trilha resolve em lote e passa um mapa
   uuid→nome ao helper.
6. **Esconde o ruído:** `created_by`, `updated_at`, `created_at`, `aprovado_por`,
   `aprovado_em` (já estão na assinatura "quem · quando"), e id de FK sem nome
   resolvido.

## Design

### Metadados de campo (no helper)
Mapa `CAMPOS: Record<string, { rotulo: string; tipo: TipoCampo; oculto?: boolean; fkTabela?: TabelaFk }>`,
onde `TipoCampo = 'texto' | 'dinheiro' | 'data' | 'datahora' | 'situacao' | 'booleano' | 'fk'`.
Exemplos:
- `status` → { rotulo: "Situação", tipo: "situacao" }
- `valor_total`, `valor`, `preco_unitario` → { tipo: "dinheiro" }
- `condicao_pagamento_id` → { rotulo: "Condição de pagamento", tipo: "fk", fkTabela: "condicoes_pagamento" }
- `fornecedor_id` → { rotulo: "Fornecedor", tipo: "fk", fkTabela: "fornecedores" }
- `centro_custo_id` → { tipo: "fk", fkTabela: "centros_custo" }, `insumo_id` → { fkTabela: "insumos" }
- `aprovado_por`, `aprovado_em`, `created_by`, `updated_at`, `created_at` → { oculto: true }
- `motivo_rejeicao` → { rotulo: "Motivo" }, `observacoes` → { rotulo: "Observações" }
- `data_emissao`, `data_recebimento`, `data_vencimento` → { tipo: "data" }
Campo fora do mapa: rótulo = o nome do campo com underscore→espaço, tipo "texto"
(fallback legível). Campo terminando em `_id` sem entrada e sem nome resolvido: ocultar.

### Formatação de valor (helper)
- `situacao`: mapa de rótulos (reusar/estender o do `StatusBadge`): pendente_aprovacao→"Pendente de aprovação", rascunho→"Rascunho", aprovado→"Aprovado", rejeitado→"Rejeitado", cancelado→"Cancelado", recebido→"Recebido", recebido_parcial→"Recebido parcial", finalizada→"Finalizada", pago→"Pago", pendente→"Pendente", etc. Desconhecido → o próprio valor.
- `dinheiro`: `formatarBRL` (R$ 1.234,56).
- `data`/`datahora`: `formatarData`/`formatarDataHora`.
- `booleano`: sim/não.
- `fk`: `nomes[uuid]` se resolvido; senão o campo é ocultado (não mostra uuid cru).
- null/undefined → "—".

### Título (helper)
`tituloEvento(registro, entidade)`:
- INSERT → `${Entidade} criada` (entidade default "Registro").
- DELETE → `${Entidade} excluída`.
- UPDATE: se `status` mudou, derivar da transição (mapa TRANSICOES por valor novo, com o caso especial aprovado→pendente = "Aprovação revertida"); senão "Dados alterados".

### Resolvedor de nomes (server)
`resolverNomesAuditLog(supabase, registros): Promise<Record<string,string>>`
(em um arquivo server, ex. `src/lib/trilha-nomes.ts`):
- Varre `dados_antes`/`dados_depois` dos registros; para cada campo com `fkTabela`
  no mapa, coleta os uuids (valores não nulos).
- Também resolve `usuario_id` do próprio registro (já vem via join hoje como
  `usuario_nome`, então esse não precisa) — foco nos FKs dentro do diff.
- Agrupa por tabela e faz um `select id, <coluna_nome>` por tabela
  (condicoes_pagamento→descricao, fornecedores→razao_social/nome_fantasia,
  centros_custo→nome, insumos→nome, usuarios→nome). Batch (in.(...)).
- Devolve `{ [uuid]: nome }`. Erros de lookup não quebram a trilha (degrada para ocultar).

### Assinatura do helper
`eventosDoAuditLog(registros, opcoes?: { nomes?: Record<string,string>; entidade?: string }): EventoTrilha[]`.
Retrocompatível (opcoes opcional). A `descricao` passa a ser as linhas
"Rótulo: valor novo" (só campos visíveis e efetivamente mudados), sem o "de→para".

### Wiring
- `compras/ordens/queries.ts`, `compras/cotacoes/queries.ts`,
  `financeiro/lancamentos/queries.ts`: chamam `resolverNomesAuditLog` e passam
  `{ nomes, entidade: "Ordem"/"Cotação"/"Lançamento" }`.
- `administracao/auditoria` (viewer global de todas as tabelas): ganha os rótulos e
  a formatação (o mapa é global). Resolução de nome: aplica o resolvedor onde os
  campos batem com o mapa; para tabelas/campos fora do mapa, mantém o fallback
  legível (nome do campo, valor cru). Não é objetivo resolver 100% das tabelas ali.

## Testes e definição de pronto

- Vitest em `trilha-helpers.test.ts`: título por transição de situação (criar/enviar/
  aprovar/reverter/rejeitar/cancelar/receber); rótulo amigável; valor formatado
  (R$, data, situação em palavras, null→"—"); fk resolvido pelo mapa `nomes` vs
  ocultado quando ausente; campos de ruído ocultos; só valor novo (sem "→").
- Testes existentes verdes; typecheck/lint/build verdes; sem any/console.log.
- Conferência visual no preview: a trilha da OC do QA fica legível.

## Fora de escopo

- Não muda o audit_log nem os triggers (é só leitura/apresentação).
- Não resolve nomes de TODA tabela na tela global de Auditoria (só as do mapa); o
  resto mantém o fallback legível.
- `administracao/lixeira` e `administracao/perfis` (que também tocam audit/Trilha)
  herdam o helper melhorado, mas sem esforço extra de resolução dedicada nesta v1.

## Riscos

- O resolvedor faz N queries (uma por tabela de FK presente) por render da trilha —
  aceitável (poucas tabelas, ids em lote); se pesar, cachear por request.
- Mapa de campos precisa cobrir os campos reais das tabelas transacionais; campo não
  mapeado cai no fallback legível (nunca mostra pior que hoje).
