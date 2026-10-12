# Financeiro PR 3: rateio do custo indireto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo mês o custo dos centros indiretos é distribuído nas obras pelo custo direto de cada uma; o Tiago ajusta os percentuais do mês e confirma; Custo por centro e Custo x receita mostram a obra com o indireto e a margem com e sem ele. Nenhum lançamento muda.

**Architecture:** `centros_custo.papel_rateio` ('indireto' | 'fora' | null) marca por id quem rateia e quem fica de fora (tipo não decide: 002 Colorado e 001 Carretas são tipo obra). Tabelas `rateio_indireto_meses` e `rateio_indireto_percentuais` guardam o mês ajustado/confirmado. `fn_rateio_indireto_mes(mes)` devolve por obra custo direto, % sugerido, % vigente e o indireto em centavos (maior resto); `fn_rateio_indireto_periodo(inicio, fim)` soma por obra numa janela. Base do custo: `fn_rel_custo_receita` (mesmo predicado de custo dos relatórios).

**Tech Stack:** Supabase Postgres (plpgsql), Next.js 16, zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-09-financeiro-controle-total-design.md` (frente C; D6, D7, D8).

## Global Constraints
- Dinheiro só no banco, centavos (maior resto); TS formata e exibe.
- Prova SQL begin/rollback, RED sem a migration, marca `v_msg` fora do bloco.
- Migrations aplicadas sem pedir; versionar com o version real; merge do PR pelo número do branch.
- Permissão: ver = `financeiro.relatorios ver`; ajustar/confirmar = `financeiro.competencias aprovar` (quem fecha o mês). Competência fechada: `fn_exigir_competencia_aberta` (quem pode reabrir passa com exceção).

## Decisões do plano
- Indiretos: Escritório Central (0a327d7e…), Manutenção/Documentação de Equipamentos (fbd2556a…), 002 - Equipamentos Colorado 2026 (891f3c63…). Fora: 001 - Carretas EMT (a39e45c0…). Recebem: raízes tipo `obra` sem papel e com custo direto > 0 no mês.
- Mês sem obra com custo: o indireto aparece como "não rateado" (não some).
- Ajuste: percentuais por obra somando 100 (6 casas); salvar = `ajustado`; confirmar = `confirmado`; reabrir = voltar ao automático com motivo. Obra nova com custo num mês já ajustado entra com 0% e um aviso.

## Review Focus
- Mês ajustado em que uma obra deixa de ter custo depois (lançamento cancelado): o % gravado continua valendo e o indireto vai para uma obra sem custo — mostrar aviso.
- Soma dos indiretos rateados + não rateado = custo dos indiretos no mês, ao centavo.
- Custo por centro "com indireto": total geral não muda (o indireto só troca de linha).
- Período de vários meses: soma mês a mês (não aplica % do período inteiro).
- Competência fechada: perfil sem reabrir é recusado; Admin passa com exceção.

---

### Task 1: Banco — papel, tabelas e funções
**Files:** `supabase/migrations/<v>_rateio_indireto.sql`, `supabase/provas/rateio_indireto.sql`.
- [ ] Prova (RED): `fn_rateio_indireto_mes('2026-04-01')` existe; soma de `indireto` + não rateado = custo dos 3 indiretos em abril (via `fn_rel_custo_receita`); 001 Carretas e os indiretos não recebem; percentuais sugeridos somam 100; salvar percentuais ajustados (60/40 entre duas obras) muda o indireto e grava `ajustado`; soma ≠ 100 recusa; usuário sem `financeiro.competencias aprovar` recusa; confirmar grava `confirmado`; voltar ao automático com motivo apaga os percentuais; `fn_rateio_indireto_periodo('2026-03-01','2026-05-01')` = soma de março e abril.
- [ ] Migration: coluna `papel_rateio` (check) + marcação dos 4 centros; tabelas com RLS de leitura para `financeiro.relatorios ver`; `fn_rateio_indireto_mes(p_mes date)` returns `(centro_id uuid, centro text, custo_direto numeric, pct_sugerido numeric, pct_vigente numeric, indireto numeric, sem_custo boolean, status text, nao_rateado numeric, custo_indireto_mes numeric)`; `fn_rateio_indireto_salvar(p_mes date, p_percentuais jsonb, p_motivo text, p_confirmar boolean)`; `fn_rateio_indireto_automatico(p_mes date, p_motivo text)`; `fn_rateio_indireto_periodo(p_inicio date, p_fim date)` returns `(centro_id uuid, indireto numeric, nao_rateado numeric)`.

### Task 2: Tela "Rateio do indireto" (Relatórios)
**Files:** `relatorios.ts` (id `rateio-indireto`), `relatorios-nav.tsx`, `page.tsx`, `actions.ts` (case + server actions salvar/confirmar/automático), `queries.ts` (`rateioIndiretoDoMes`), componente `rateio-indireto-tabela.tsx` (+ test), filtro de mês na URL (`mes_rateio`).
- [ ] Teste (RED) do componente: soma dos % editados ≠ 100 desabilita salvar e mostra a diferença; status "Automático/Ajustado/Confirmado"; linha "Não rateado" quando > 0.
- [ ] Implementar com `InputPercentual`, motivo obrigatório para salvar/confirmar/voltar ao automático; só leitura sem permissão.

### Task 3: Custo por centro e Custo x receita com indireto
**Files:** `filtros-custo-cc.ts` (`comIndireto`), `custo-cc-tabela.tsx`, `page.tsx` (ConteudoCustoCc, ConteudoCustoReceita), `queries.ts` (`indiretoDoPeriodo`), `custo-receita.ts` (margem por obra) + tests.
- [ ] Teste (RED): `aplicarIndireto(centros, indiretoPorObra)` tira as linhas dos indiretos, soma o indireto nas obras e mantém o total (com "Não rateado" quando houver); `margemPorObra(linhas, indireto)` dá margem sem e com indireto por obra.
- [ ] Implementar; toggle "Com indireto rateado" no Custo por centro (modos mês/período/total); tabela "Margem por obra" no Custo x receita.

### Task 4: Portão, revisão e entrega
- [ ] vitest, tsc, build; revisão independente; migrations; PR; merge pelo número do branch; deploy; conferir em produção abril/2026; vault.
