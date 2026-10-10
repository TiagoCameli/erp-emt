# Financeiro PR 2: reclassificação (estrutura, relatórios e lote) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O resultado e o custo das obras deixam de incluir retirada de sócio, dinheiro de empresa ligada e compra de imobilizado; existe o relatório "Sócios e ligadas"; existe o lote que reclassifica rateios com motivo; e a planilha de-para dos dados fica pronta para o Tiago aprovar.

**Architecture:** Naturezas novas `distribuicao` e `mutuo` e tipos de centro novos `socio`, `empresa_ligada`, `imobilizado` entram nas mesmas listas de exclusão que hoje tiram `movimentacao`/`investimento` e os centros `financeiro`/`investimento` das 10 funções de custo. O DRE separa os blocos novos no TS (a função SQL já devolve a natureza). Os dados só mudam pelo lote, depois da aprovação da planilha (D11).

**Tech Stack:** Supabase Postgres (plpgsql), Next.js 16, zod, Vitest, openpyxl (planilha).

**Spec:** `docs/superpowers/specs/2026-10-09-financeiro-controle-total-design.md` (frente B; D3, D4, D5, D11).

## Global Constraints
- Migrations versionadas com o version real (`list_migrations`); aplicar sem pedir (autorização do Tiago, 09/10), na ordem que não quebra a tela antiga.
- Prova SQL em begin/rollback: rodar SEM a migration primeiro (RED); marca `v_msg` fora do bloco, nunca `raise 'FALHOU'` dentro do bloco com handler.
- Natureza vem do rateio com fallback no lançamento (`coalesce(r.categoria_id, l.categoria_id)`, D4).
- Dinheiro só no banco, centavos; ids com `idSchema`.
- DADOS de lançamento não mudam neste PR: o lote é aplicado só depois da planilha aprovada.

## Decisões do plano (rulings antecipados)
- `Aquisição de Equipamentos` e `Aquisição de Imóveis` viram tipo **`imobilizado`**, não `investimento`: o tipo `investimento` é o das aplicações financeiras e várias RPCs (`fn_salvar_transferencia`, `fn_criar_etapa_de_investimento`, conciliação) aceitariam essas etapas como CDB. Spec D5 diz "investimento" no sentido contábil; o efeito pedido (fora do custo) é o mesmo.
- `James Cameli Pessoa Fisica` vira `Sócio James Castro Cameli` (tipo `socio`); `Casa James` vira tipo `socio` e os rateios dele vão para o centro do sócio pela planilha; cria-se `Sócio Tiago de Melo Cameli`. `Amazônia Agroindústria` e `Juruá FM` viram `empresa_ligada`.
- Log de troca de natureza/tipo: os triggers `trg_audit_categorias_financeiras` e `trg_audit_centros_custo` já gravam antes/depois com usuário; não se cria outro.
- Drill: `sem_movimentacao=1` passa a excluir também `distribuicao` e `mutuo` (todos "fora do resultado"), sem parâmetro novo.
- Fluxo de caixa: distribuição e mútuo continuam como saída/entrada comum (é dinheiro real); série própria fica para depois.

## Review Focus
- Centro retipado (Amazônia, Aquisição) com lançamentos em categoria operacional: some do Custo por centro mas continua no DRE até a planilha ser aplicada; o DRE não pode quebrar nem somar duas vezes.
- `naturezaDe()` mandava natureza desconhecida para operacional: `distribuicao`/`mutuo` não podem cair no resultado em nenhuma tela (DRE, Excel, cards).
- Cadastro de categorias hoje não conhece `investimento`: editar uma categoria de investimento não pode quebrar nem trocar a natureza para operacional.
- Lote de reclassificação em competência fechada (2024-10) e em lançamento cancelado/de aplicação: recusa o item com mensagem, não grava metade.
- Relatório Sócios e ligadas com período vazio e com centro inativo.

---

### Task 1: Estrutura (naturezas, tipos, categorias e centros)
**Files:** Create `supabase/migrations/<v>_reclassificacao_estrutura.sql`, `supabase/provas/reclassificacao_estrutura.sql`.
- [ ] Prova (RED): `insert into categorias_financeiras(nome,tipo,natureza) values ('x','despesa','distribuicao')` deve passar; `update centros_custo set tipo='socio' where id=<James PF>` deve passar; existem as categorias e centros novos; Aquisição de Equipamentos com tipo `imobilizado`. Sem a migration: falha no CHECK.
- [ ] Migration: troca os dois CHECKs (natureza + `distribuicao`,`mutuo`; tipo + `socio`,`empresa_ligada`,`imobilizado`); insere categorias "Distribuição a sócio" (despesa, distribuicao), "Mútuo concedido a empresa ligada" (despesa, mutuo), "Devolução de mútuo" (receita, mutuo), "Consórcio a contemplar" (despesa, investimento), "Taxa de administração de consórcio" (despesa, operacional), "Juros de empréstimos" (despesa, financeira) — `where not exists` por nome; renomeia/retipa os centros do ruling; cria "Sócio Tiago de Melo Cameli" (nivel 1, tipo socio). Ensaiar, aplicar, versionar.

### Task 2: Exclusão nas 10 funções de custo
**Files:** Create `supabase/migrations/<v>_custo_sem_socio_ligada_imobilizado.sql`, `supabase/provas/custo_sem_socio_ligada_imobilizado.sql`.
- [ ] Prova (RED): após Task 1, `fn_rel_custo_centro_custo` (jan–set/2026) não devolve linha de centro com raiz `socio`/`empresa_ligada`/`imobilizado`; um rateio de prova com categoria `distribuicao` num centro de obra não entra no total; `fn_rel_custo_por_mes` e `fn_competencias_painel` idem.
- [ ] Migration: para cada uma das 10 funções vivas (`fn_rel_custo_centro_custo`, `_serie`, `_vida`, `fn_rel_custo_itens_oc`, `fn_rel_custo_por_grupo`, `fn_rel_custo_por_mes`, `fn_rel_custo_receita`, `fn_rel_gestao_maiores_custos`, `fn_rel_gestao_maiores_fornecedores`, `fn_competencias_painel`), substituir `not in ('financeiro', 'investimento')` por `not in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado')` e `<> 'movimentacao'` por `not in ('movimentacao', 'distribuicao', 'mutuo')` — script conta as trocas por função e falha se alguma tiver zero. Ensaiar com as provas do PR 1 junto; aplicar; versionar.

### Task 3: TS — naturezas, tipos, DRE e drill
**Files:** `src/modules/cadastros/categorias-financeiras/schemas.ts`, `src/modules/cadastros/centros-custo/schemas.ts`, `src/modules/_shared/centro-custo/selecao.ts`, `src/modules/financeiro/relatorios/calculo.ts` (+ `.test.ts`), `components/dre-tabela.tsx`, `planilha-abas.ts`, `src/modules/financeiro/lancamentos/natureza-no-embed.ts` (+ test).
- [ ] Teste (RED) em `calculo.test.ts`: `agruparDrePorNatureza` com linhas `distribuicao` e `mutuo` não soma nada no resultado e expõe `distribuicao` e `mutuo` como blocos próprios.
- [ ] Implementar: `NATUREZAS` + buckets + `DrePorNatureza`; `naturezaDe` reconhece os novos; `dre-tabela` ganha "Abaixo do resultado: distribuições a sócios" e "Mútuo com empresas ligadas" no padrão de investimento/movimentação; Excel idem.
- [ ] Teste (RED) em natureza-no-embed: `semMovimentacao` exclui também `distribuicao` e `mutuo`; implementar.
- [ ] Cadastro de categorias: naturezas `operacional, financeira, movimentacao, investimento, distribuicao, mutuo` com rótulo e ajuda; teste do schema aceita `investimento`. Centros: `TIPOS_CENTRO` + `socio`, `empresa_ligada`, `imobilizado` com rótulos; `ROTULO_DO_NIVEL_2` sem mudança.
- [ ] tsc, eslint, vitest do módulo; commit.

### Task 4: Relatório "Sócios e ligadas"
**Files:** migration `fn_rel_socios_ligadas(p_inicio date, p_fim date)` returns `(centro_id uuid, centro text, tipo text, ativo boolean, enviado numeric, devolvido numeric, saldo numeric)`; `relatorios.ts`, `relatorios-nav.tsx`, `page.tsx`, `queries.ts`, componente `socios-ligadas-tabela.tsx` (+ test); `relatorios.test.ts`, `relatorios-nav.test.tsx`.
- [ ] SQL: por centro raiz `socio`/`empresa_ligada` (subárvore), lançamentos não cancelados com `mes_competencia` no período: enviado = soma dos rateios a_pagar, devolvido = soma dos rateios a_receber, saldo = enviado − devolvido. Permissão `financeiro.relatorios ver`. Prova com período vazio (0 linhas com valor, centros listados com zero) e com 2026.
- [ ] Teste (RED) do componente: rótulo do tipo, totais e linha de total; implementar; registrar a aba; tsc/vitest; commit.

### Task 5: Lote de reclassificação
**Files:** migration `fn_reclassificar_rateios_lote(p_itens jsonb, p_motivo text) returns int`; prova.
- [ ] Contrato: `p_itens` = `[{rateioId, categoriaId|null, centroCustoId|null}]`; permissão `financeiro.lancamentos editar`; motivo obrigatório; por lançamento: recusa cancelado e `origem='aplicacao'`, `fn_exigir_competencia_aberta(mes,'lancamento',id)`; atualiza `lancamento_rateios.categoria_id`/`centro_custo_id`; grava um `rateio_eventos` por lançamento com antes/depois; tudo ou nada; devolve quantos rateios mudaram. Centro destino ativo.
- [ ] Prova (RED sem migration): item válido muda e grava evento; item em 2024-10 recusa com a mensagem da competência; item de lançamento cancelado recusa; nada grava quando um item falha.
- [ ] Aplicar, versionar, commit.

### Task 6: Planilha de-para
**Files:** script `scripts/reclassificacao/de-para.py` (lê via CLI linkado em JSON) e saída `~/Desktop/personal-os/outputs/reclassificacao-2026-10/de-para.xlsx`.
- [ ] SELECT dos rateios candidatos (não cancelados) com: lançamento, data/competência, valor do rateio, descrição, fornecedor, categoria e centro atuais, categoria e centro propostos, regra, `decidir` (sim/não). Regras: (a) centros James PF/Casa James/descrição com envio a sócio, PF, mãe do Sr. James, plano de saúde Dona Izete, colégio → Distribuição a sócio no centro do sócio (Tiago quando a descrição citar Tiago); (b) Amazônia/Juruá FM → Mútuo concedido (a_pagar) / Devolução de mútuo (a_receber), centro mantido; (c) Paccar, consórcios, Hilux, roll-on, terreno em "Outras despesas" → Aquisição de Equipamento / Consórcio a contemplar / Compra de Terreno; (d) centro Aquisição de Equipamentos com categoria operacional → Aquisição de Equipamento (frete/documentação → decidir); (e) R$ 5.000 "salário/pro labore" em obras, custeio pecuária, Despesas financeiras genéricas → decidir. Abas: Resumo (por regra: qtd, valor), De-para, Decidir.
- [ ] Rodar, conferir totais por regra contra SELECT independente, salvar.

### Task 7: Portão, revisão e entrega
- [ ] vitest completo, tsc, build; revisão independente do branch; corrigir Critical/Important; migrations na ordem; PR, CI, merge, deploy; conferir em produção que Custo por centro não tem mais os centros retipados; vault + log.
- [ ] Entregar a planilha ao Tiago para aprovar (aplicação do lote fica para depois da aprovação).
