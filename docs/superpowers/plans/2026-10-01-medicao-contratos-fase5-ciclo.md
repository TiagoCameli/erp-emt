# Medição de Contratos, Fase 5 (ciclo da medição e alertas): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fechar, reabrir, ajustar, enviar, revisar, aprovar (com glosa) e revisar depois de aprovada cada medição, com o banco conferindo cada passo, e mostrar os alertas dos contratos.

**Architecture:** Toda escrita por RPC `security definer`, um RPC por passo do ciclo, cada um gravando evento em `mc_medicao_eventos`. As travas da Fase 1c passam a aceitar só as transições do ciclo. A view `mc_v_medicao_itens` é recriada com as mesmas colunas: medição aprovada usa a medida congelada da revisão aprovada; item fora da versão da medição usa o preço da última versão em que aparece. Alertas saem de uma view calculada (`mc_v_alertas`). O TS só monta as telas.

**Tech Stack:** Supabase Postgres 17 (MCP `apply_migration` / `execute_sql`, CLI linkado `supabase db query --linked -f`), Next.js App Router, canônicos do repo, vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-25-medicao-contratos-design.md` (seções 5.3, 7, 8, 9.6, 9.8 e emenda de 01/10/2026 na seção 13).

## Decisões do Tiago (01/10/2026)

- Q4: a medição usa a versão da planilha vigente no último dia do período; troca ao fechar.
- Q8: item medido que saiu num aditivo continua contando no acumulado, com o preço da última versão em que aparece.
- Vínculo de insumos (alerta CBUQ sem CAP): fica para depois.

## Regras (escritas e testadas no SQL da Task 1)

| Passo | De → para | RPC | Ação |
|---|---|---|---|
| Fechar | aberta → em conferência (troca a versão para a vigente no fim do período; evento `versao` se mudou) | `fn_mc_medicao_fechar(p_id)` | editar |
| Reabrir | em conferência → aberta, motivo ≥ 3 | `fn_mc_medicao_reabrir(p_id, p_motivo)` | editar |
| Ajuste | revisão em aberto (em conferência, ou pós-aprovação); quantidade ≠ 0, até 4 casas; motivo | `fn_mc_ajuste_lancar(p_medicao, p_item, p_quantidade, p_motivo)` | editar |
| Enviar | em conferência → enviada (ou revisão pós-aprovação em aberto → enviada); congela a medida por item em `mc_revisao_itens` | `fn_mc_medicao_enviar(p_id)` | editar |
| Nova revisão | revisão enviada → substituída; REVnn+1 em aberto com motivo; medição enviada → em conferência | `fn_mc_medicao_nova_revisao(p_id, p_motivo)` | editar |
| Aprovar | enviada → aprovada; `p_itens = [{item_id, quantidade}]` ou `p_tudo_como_medido`; item congelado sem quantidade = 0; na pós-aprovação a aprovada anterior vira substituída | `fn_mc_medicao_aprovar(p_id, p_itens, p_tudo_como_medido)` | aprovar |
| Revisar aprovada | aprovada (continua aprovada); REVnn pós-aprovação em aberto com motivo; uma pendente por vez | `fn_mc_medicao_revisar_aprovada(p_id, p_motivo)` | desaprovar |

Números conferidos ao vivo (transação desfeita) com o contrato de teste K5 (`item_por_medicao`, 01.01 preço 10 previsto 100; 01.02 preço 5 previsto 10):
1ª lança 30 no 01.01 → fechar → ajuste −2 → enviar (REV00 congelada 28) → nova revisão "DNIT devolveu" (REV00 substituída, medição em conferência) → ajuste +1 → enviar (REV01 29) → aprovar 27: medida 29, aprovada 27, **glosa 2**, **valor 270,00** → revisar aprovada + ajuste +1: continua 29 / 27 / 270 → enviar + aprovar tudo como medido: **30 / 30 / 300,00**, revisões 0 e 1 substituídas, 2 aprovada (pós). 2ª (fevereiro) lança 01.01 5 e 01.02 2; aditivo com v1 vigente desde 15/02 (01.01 a 12, previsto 30; 01.02 fora) → fechar passa a v1: 01.01 5 × 12 = 60, 01.02 2 × 5 (preço da v0) = 10, **total 70,00**, eventos abrir, fechar, versao. Recusas: enviar e aprovar medição aberta; lançar em medição em conferência. Alertas de K5: acumulado acima (01.01 35 > 30), prazo (61 dias ≤ 90), valor (102,78% ≥ 90%), valor do contrato (999,00 × 1.050,00). L09 (acumulado 36.541.661,77; 10ª 680.738,27) e L10 (11.103.466,25) iguais; alertas reais só `valor_contrato_diferente` de L09 (243.927.498,02 × 243.927.483,49) e L10 (121.590.621,00 × 121.573.053,78).

## Global Constraints

- Migration vai direto para produção: só mudança aditiva (funções e views recriadas com as mesmas colunas). Aplicar por `apply_migration`; arquivo com a versão REAL de `supabase_migrations.schema_migrations` e texto idêntico (md5). `db push` proibido.
- RPCs: `security definer`, `set search_path to ''`, revoke de public/anon, grant a authenticated; as internas (`fn_mc_medicao_para`, `fn_mc_revisao_corrente`) sem grant. Advisors sem aviso novo.
- Dinheiro só do banco (D7). Nenhuma escrita em outro módulo (D1).
- Backfill só para os 4 Admins ativos; `$confere$` com 4 usuários e **84** linhas `medicao.%`.
- Nenhuma medição de produção muda de status por mim: quem fecha, envia e aprova é o Tiago, pela tela. Testes no banco vivo só em transação desfeita.
- Canônicos obrigatórios (DataTable, FormDrawer, ConfirmDialog, Trilha, SecaoDetalhe, InputQuantidade, MoneyText, EmptyState, SeloMedicao).
- Trabalho só no clone fora do iCloud: `/Users/tiagocameli/.claude/jobs/84e7ccda/tmp/erp` (branch `medicao-fase5-ciclo`). Nunca editar `.git` à mão.
- Textos pt-BR com acentos, sem travessão (—). Commits com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Portão: `npx tsc --noEmit`, `npm run lint` (0 erros), `npx vitest run`, `npm run build`, CI verde, provas da Fase 5 e da Fase 4 no banco vivo, advisors. Depois merge, deploy, conferência na tela sem gravar.

## Review Focus

1. Duplo clique em Aprovar ou Enviar: o banco trava a medição (`for update`) e o segundo pedido é recusado pela regra do status; a tela desabilita o botão. Teste Task 3/4.
2. Aprovar com campo vazio: a tela mostra antes de confirmar quais itens vão com aprovada 0, e o banco grava 0 para eles. Teste Task 4.
3. Revisão pós-aprovação pendente não muda boletim, painel nem glosa da medição até ser aprovada. Prova Task 1 e teste Task 4.
4. Medição de carga (L09, L10) aprovada sem quantidade congelada continua mostrando a medida e a aprovada da carga. Prova Task 1.
5. Quantidade aprovada digitada em pt-BR (`1.234,5`) chega ao banco como `1234.5`; número ambíguo é recusado como no colar. Teste Task 4.

---

### Task 1: SQL do ciclo e dos alertas + prova

**Files:**
- Create: `supabase/provas/mc_fase5_banco.sql`
- Create: `supabase/migrations/<versão real>_mc_fase5a_ciclo.sql`
- Modify: `src/lib/database.types.ts` (as 7 funções com grant e a view `mc_v_alertas`)

**Interfaces:**
- Produces as RPCs da tabela de regras e a view `mc_v_alertas` com colunas `contrato_id, codigo, tipo ('acumulado_acima_previsto' | 'prazo_perto_do_fim' | 'valor_perto_do_previsto' | 'valor_contrato_diferente'), gravidade ('alta'|'media'|'baixa'), item_id, item_codigo, unidade, valor text, referencia text, data date, com_motivo boolean` (significado de valor/referência no comentário do SQL).

- [ ] **Step 1: prova** no estilo de `supabase/provas/mc_fase4_banco.sql` (ler inteira): contrato K5 e o roteiro dos números acima, como casos `5a..`, mais: reabrir sem motivo recusado; reabrir com motivo volta a aberta e aceita lançamento; ajuste com quantidade 0 ou sem motivo recusado; nova revisão sem motivo recusada; aprovar com item fora da revisão recusado; aprovar com quantidade negativa recusado; revisar aprovada com outra pendente recusado; aprovar a 2ª antes da 1ª recusado; transição direta (update como dono aberta → aprovada fora da carga) recusada pela trava; usuário sem `aprovar` recusado; fora da lista do contrato recusado; L09/L10 iguais; controle (glosa 2 comparada com 3 tem de dar DIFERENTE); nada fora do módulo mudou. Permissões novas do Tiago inseridas na transação (a Task 2 faz o backfill).
- [ ] **Step 2:** rodar a prova: falha porque as funções não existem.
- [ ] **Step 3:** migration com este texto:

```sql
-- Medição de Contratos, Fase 5a: ciclo da medição (fechar, reabrir, ajuste, enviar, nova revisão,
-- aprovar, revisão pós-aprovação) e alertas. Decisões do Tiago em 01/10/2026: a medição usa a versão
-- da planilha vigente no último dia do período (troca ao fechar); item que saiu da planilha continua
-- contando no acumulado (Q8); vínculo de insumos fica para depois. Só aditivo: funções e views
-- recriadas com as mesmas colunas.

-- ------------------------------------------------------------------ travas
-- Medição: só as transições do ciclo (a carga continua livre). Corpo igual ao de 20260925233632
-- com o bloco de transições acrescentado.
create or replace function public.fn_mc_trava_medicao()
returns trigger language plpgsql set search_path to '' as $$
declare v_max int; v_status_versao text; v_status_anterior text;
begin
  if tg_op = 'DELETE' then
    if old.status = 'aprovada' then
      raise exception 'A %ª medição está aprovada e não pode ser apagada', old.numero using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.numero is distinct from old.numero or new.contrato_id is distinct from old.contrato_id then
      raise exception 'Número e contrato da medição não mudam depois de criados' using errcode = 'P0001';
    end if;
    if old.status = 'aprovada' then
      raise exception 'A %ª medição está aprovada e é imutável. Correção entra por revisão pós-aprovação', old.numero using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status and not (public.fn_mc_em_carga() and new.origem = 'carga')
       and (old.status, new.status) not in (('aberta', 'em_conferencia'), ('em_conferencia', 'aberta'),
                                            ('em_conferencia', 'enviada'), ('enviada', 'em_conferencia'), ('enviada', 'aprovada')) then
      raise exception 'A %ª medição está % e não passa direto para %', old.numero, public.fn_mc_rotulo_status(old.status),
        public.fn_mc_rotulo_status(new.status) using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('mc_medicao:' || new.contrato_id::text, 0));
    select coalesce(max(numero), 0) into v_max from public.mc_medicoes where contrato_id = new.contrato_id;
    if new.numero <> v_max + 1 then
      raise exception 'A próxima medição do contrato é a %ª, não a %ª', v_max + 1, new.numero using errcode = 'P0001';
    end if;
    if new.status <> 'aberta' and not (public.fn_mc_em_carga() and new.origem = 'carga') then
      raise exception 'A medição só nasce aberta. Só a carga nasce com outro status' using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'aprovada' and (tg_op = 'INSERT' or old.status <> 'aprovada') then
    if new.numero > 1 then
      select status into v_status_anterior from public.mc_medicoes where contrato_id = new.contrato_id and numero = new.numero - 1;
      if v_status_anterior is distinct from 'aprovada' then
        raise exception 'Aprove a %ª medição antes da %ª', new.numero - 1, new.numero using errcode = 'P0001';
      end if;
      if exists (select 1 from public.mc_medicoes m2 join public.mc_medicao_revisoes rv on rv.medicao_id = m2.id
                 where m2.contrato_id = new.contrato_id and m2.numero = new.numero - 1
                   and rv.fase = 'pos_aprovacao' and rv.status in ('em_aberto', 'enviada')) then
        raise exception 'A %ª medição tem revisão pós-aprovação pendente. Resolva antes de aprovar a %ª', new.numero - 1, new.numero
          using errcode = 'P0001';
      end if;
    end if;
    if tg_op = 'UPDATE' and not (public.fn_mc_em_carga() and new.origem = 'carga') then
      if not exists (select 1 from public.mc_medicao_revisoes where medicao_id = new.id and status = 'aprovada') then
        raise exception 'A medição só aprova com ao menos uma revisão aprovada' using errcode = 'P0001';
      end if;
      if exists (select 1 from public.mc_medicao_revisoes where medicao_id = new.id and status in ('em_aberto', 'enviada')) then
        raise exception 'A medição não aprova com revisão em aberto ou enviada pendente' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or new.versao_id is distinct from old.versao_id then
    select status into v_status_versao from public.mc_planilha_versoes where id = new.versao_id for share;
    if v_status_versao is distinct from 'vigente' then
      raise exception 'A medição só usa versão vigente da planilha' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- Revisão: a revisão enviada que é trocada por outra (o DNIT devolveu) vira substituída.
-- Corpo igual ao de 20260925233632 com (enviada -> substituida) acrescentado.
create or replace function public.fn_mc_trava_revisao()
returns trigger language plpgsql set search_path to '' as $$
declare v_status_medicao text; v_origem_medicao text; v_max_numero int;
begin
  if tg_op = 'DELETE' then
    if old.status in ('aprovada', 'substituida') then
      raise exception 'A REV% está % e não pode ser apagada', lpad(old.numero::text, 2, '0'), public.fn_mc_rotulo_status_revisao(old.status)
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('mc_revisao:' || new.medicao_id::text, 0));
    select coalesce(max(numero), -1) into v_max_numero from public.mc_medicao_revisoes where medicao_id = new.medicao_id;
    if new.numero <> v_max_numero + 1 then
      raise exception 'A próxima revisão da medição é a REV%, não a REV%', lpad((v_max_numero + 1)::text, 2, '0'), lpad(new.numero::text, 2, '0')
        using errcode = 'P0001';
    end if;
    select status, origem into v_status_medicao, v_origem_medicao from public.mc_medicoes where id = new.medicao_id;
    if public.fn_mc_em_carga() and v_origem_medicao = 'carga' then
      return new;
    end if;
    if new.status <> 'em_aberto' then
      raise exception 'A revisão só nasce com status em aberto' using errcode = 'P0001';
    end if;
    if v_status_medicao = 'aprovada' and new.fase <> 'pos_aprovacao' then
      raise exception 'A revisão de medição aprovada entra só na fase pós aprovação' using errcode = 'P0001';
    end if;
    if v_status_medicao <> 'aprovada' and new.fase <> 'antes_aprovacao' then
      raise exception 'A revisão de medição não aprovada entra só na fase antes da aprovação' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.medicao_id is distinct from old.medicao_id or new.contrato_id is distinct from old.contrato_id
     or new.numero is distinct from old.numero or new.fase is distinct from old.fase then
    raise exception 'Medição, contrato, número e fase da revisão não mudam depois de criados' using errcode = 'P0001';
  end if;

  if new.status in ('aprovada', 'enviada') and new.fase = 'antes_aprovacao' then
    select status, origem into v_status_medicao, v_origem_medicao from public.mc_medicoes where id = new.medicao_id;
    if v_status_medicao = 'aprovada' and not (public.fn_mc_em_carga() and v_origem_medicao = 'carga') then
      raise exception 'A medição já está aprovada. A revisão de antes da aprovação não vira %', public.fn_mc_rotulo_status_revisao(new.status)
        using errcode = 'P0001';
    end if;
  end if;

  if not (
    (old.status = new.status and old.status in ('em_aberto', 'enviada'))
    or (old.status = 'em_aberto' and new.status in ('enviada', 'aprovada'))
    or (old.status = 'enviada' and new.status in ('em_aberto', 'aprovada', 'substituida'))
    or (old.status = 'aprovada' and new.status = 'substituida')
  ) then
    raise exception 'A REV% está % e não muda para %', lpad(old.numero::text, 2, '0'),
      public.fn_mc_rotulo_status_revisao(old.status), public.fn_mc_rotulo_status_revisao(new.status) using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------ cálculo
-- Mesmas colunas da versão de 20260925223613, com duas mudanças:
--  1) medição aprovada: a quantidade medida é a congelada no envio da revisão aprovada
--     (mc_revisao_itens); revisão pós-aprovação pendente não mexe no medido nem na glosa até ser
--     aprovada. Medição de carga (sem quantidade congelada) usa a medida viva, como antes.
--  2) item que não está na versão da medição (saiu num aditivo; a medição trocou de versão ao
--     fechar) usa o preço da última versão em que aparece (Q8: continua contando).
create or replace view public.mc_v_medicao_itens with (security_invoker = true) as
with chaves as (
  select medicao_id, item_id from public.mc_v_medicao_qtd
  union
  select r.medicao_id, ai.item_id from public.mc_aprovacoes_item ai join public.mc_medicao_revisoes r on r.id = ai.revisao_id
), base as (
  select m.id as medicao_id, m.contrato_id, m.numero, m.status, m.versao_id, k.item_id,
         case when m.status = 'aprovada' and exists (select 1 from public.mc_revisao_itens x where x.revisao_id = ra.revisao_id)
              then coalesce((select ri.quantidade from public.mc_revisao_itens ri where ri.revisao_id = ra.revisao_id and ri.item_id = k.item_id), 0)
              else coalesce(q.qtd_medida, 0) end as qtd_medida,
         case when m.status = 'aprovada' then coalesce(ai.quantidade_aprovada, 0) end as qtd_aprovada
  from chaves k
  join public.mc_medicoes m on m.id = k.medicao_id
  left join public.mc_v_medicao_qtd q on q.medicao_id = k.medicao_id and q.item_id = k.item_id
  left join public.mc_v_medicao_revisao_aprovada ra on ra.medicao_id = m.id
  left join public.mc_aprovacoes_item ai on ai.revisao_id = ra.revisao_id and ai.item_id = k.item_id
), efetiva as (
  select b.*, case when b.status = 'aprovada' then b.qtd_aprovada else b.qtd_medida end as qtd_efetiva from base b
), acumulada as (
  select e.*, sum(e.qtd_efetiva) over (partition by e.contrato_id, e.item_id order by e.numero) as qtd_acumulada from efetiva e
), preco as (
  select a.*, coalesce(pi.id, ult.id) as planilha_item_id, coalesce(pi.preco_unitario, ult.preco_unitario) as preco_unitario
  from acumulada a
  left join public.mc_planilha_itens pi on pi.versao_id = a.versao_id and pi.item_id = a.item_id
  left join lateral (
    select x.id, x.preco_unitario from public.mc_planilha_itens x join public.mc_planilha_versoes v on v.id = x.versao_id
     where x.item_id = a.item_id and pi.id is null and x.tipo = 'servico'
     order by v.numero desc limit 1) ult on true
)
select p.medicao_id, p.contrato_id, p.numero, p.status, p.item_id, p.planilha_item_id, p.preco_unitario,
       p.qtd_medida, p.qtd_aprovada, p.qtd_efetiva, p.qtd_medida - p.qtd_aprovada as glosa, p.qtd_acumulada,
       case c.regra_arredondamento
         when 'item_por_acumulado' then
           round(p.qtd_acumulada * p.preco_unitario, 2) - round((p.qtd_acumulada - p.qtd_efetiva) * p.preco_unitario, 2)
         else public.fn_mc_valor(p.qtd_efetiva, p.preco_unitario, c.regra_arredondamento)
       end as valor_medicao
from preco p
join public.mc_contratos c on c.id = p.contrato_id;

-- ------------------------------------------------------------------ RPCs do ciclo
-- Carrega a medição travada (for update) e confere permissão e contrato. Interna.
create or replace function public.fn_mc_medicao_para(p_id uuid, p_acao text, p_mensagem text)
returns public.mc_medicoes language plpgsql security definer set search_path to '' as $$
declare m public.mc_medicoes%rowtype;
begin
  select * into m from public.mc_medicoes where id = p_id for update;
  perform public.fn_mc_exigir('medicao.medicoes', p_acao, m.contrato_id, p_mensagem);
  if m.id is null then raise exception 'Medição não encontrada' using errcode = 'P0001'; end if;
  return m;
end $$;

create or replace function public.fn_mc_revisao_corrente(p_medicao uuid)
returns public.mc_medicao_revisoes language sql stable security definer set search_path to '' as $$
  select * from public.mc_medicao_revisoes where medicao_id = p_medicao and status in ('em_aberto', 'enviada')
   order by numero desc limit 1;
$$;

create or replace function public.fn_mc_medicao_fechar(p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare m public.mc_medicoes%rowtype; v_versao uuid; v_num_nova int; v_num_antiga int;
begin
  m := public.fn_mc_medicao_para(p_id, 'editar', 'Sem permissão para fechar medição');
  if m.status <> 'aberta' then
    raise exception 'A %ª medição está % e só fecha quando aberta', m.numero, public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
  end if;
  -- Decisão do Tiago (01/10/2026): vale a versão vigente no último dia do período.
  select id, numero into v_versao, v_num_nova from public.mc_planilha_versoes
   where contrato_id = m.contrato_id and status = 'vigente' and excluido_em is null and vigente_desde <= m.periodo_fim
   order by numero desc limit 1;
  update public.mc_medicoes set status = 'em_conferencia', versao_id = coalesce(v_versao, versao_id) where id = p_id;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, de_status, para_status)
  values (p_id, m.contrato_id, 'fechar', 'aberta', 'em_conferencia');
  if v_versao is not null and v_versao <> m.versao_id then
    select numero into v_num_antiga from public.mc_planilha_versoes where id = m.versao_id;
    insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, motivo)
    values (p_id, m.contrato_id, 'versao', format('Passou da planilha v%s para a v%s, vigente em %s (fim do período)',
            v_num_antiga, v_num_nova, to_char(m.periodo_fim, 'DD/MM/YYYY')));
  end if;
end $$;

create or replace function public.fn_mc_medicao_reabrir(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare m public.mc_medicoes%rowtype;
begin
  m := public.fn_mc_medicao_para(p_id, 'editar', 'Sem permissão para reabrir medição');
  if m.status <> 'em_conferencia' then
    raise exception 'A %ª medição está % e só reabre em conferência', m.numero, public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
  end if;
  if char_length(coalesce(btrim(p_motivo), '')) < 3 then raise exception 'Informe o motivo para reabrir' using errcode = 'P0001'; end if;
  update public.mc_medicoes set status = 'aberta' where id = p_id;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, de_status, para_status, motivo)
  values (p_id, m.contrato_id, 'reabrir', 'em_conferencia', 'aberta', btrim(p_motivo));
end $$;

-- Ajuste na revisão em aberto: em conferência (antes da aprovação) ou na revisão pós-aprovação.
create or replace function public.fn_mc_ajuste_lancar(p_medicao uuid, p_item uuid, p_quantidade text, p_motivo text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare m public.mc_medicoes%rowtype; rv public.mc_medicao_revisoes%rowtype; v_q numeric; v_id uuid;
begin
  m := public.fn_mc_medicao_para(p_medicao, 'editar', 'Sem permissão para lançar ajuste');
  rv := public.fn_mc_revisao_corrente(p_medicao);
  if rv.id is null or rv.status <> 'em_aberto' or not (m.status = 'em_conferencia' or (m.status = 'aprovada' and rv.fase = 'pos_aprovacao')) then
    raise exception 'A %ª medição não está recebendo ajuste: feche a medição ou abra a revisão pós-aprovação', m.numero using errcode = 'P0001';
  end if;
  v_q := nullif(btrim(p_quantidade), '')::numeric;
  if v_q is null or v_q = 0 then raise exception 'Informe a quantidade do ajuste, positiva ou negativa' using errcode = 'P0001'; end if;
  if v_q <> round(v_q, 4) then raise exception 'A quantidade tem no máximo 4 casas' using errcode = 'P0001'; end if;
  if char_length(coalesce(btrim(p_motivo), '')) < 3 then raise exception 'Informe o motivo do ajuste' using errcode = 'P0001'; end if;
  insert into public.mc_ajustes (medicao_id, contrato_id, revisao_id, item_id, quantidade, motivo, tipo)
  values (p_medicao, m.contrato_id, rv.id, p_item, v_q, btrim(p_motivo), 'manual') returning id into v_id;
  return v_id;
end $$;

-- Envia a revisão em aberto: congela a quantidade medida de cada item.
create or replace function public.fn_mc_medicao_enviar(p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare m public.mc_medicoes%rowtype; rv public.mc_medicao_revisoes%rowtype;
begin
  m := public.fn_mc_medicao_para(p_id, 'editar', 'Sem permissão para enviar medição');
  rv := public.fn_mc_revisao_corrente(p_id);
  if rv.id is null or rv.status <> 'em_aberto' or not (m.status = 'em_conferencia' or (m.status = 'aprovada' and rv.fase = 'pos_aprovacao')) then
    raise exception 'A %ª medição não tem revisão para enviar: feche a medição antes', m.numero using errcode = 'P0001';
  end if;
  insert into public.mc_revisao_itens (revisao_id, item_id, contrato_id, quantidade)
  select rv.id, q.item_id, m.contrato_id, q.qtd_medida from public.mc_v_medicao_qtd q where q.medicao_id = p_id and q.qtd_medida <> 0;
  update public.mc_medicao_revisoes set status = 'enviada' where id = rv.id;
  if m.status = 'em_conferencia' then
    update public.mc_medicoes set status = 'enviada' where id = p_id;
  end if;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, de_status, para_status, motivo)
  values (p_id, m.contrato_id, 'enviar', m.status, case when m.status = 'em_conferencia' then 'enviada' else m.status end,
          format('REV%s enviada', lpad(rv.numero::text, 2, '0')));
end $$;

-- Nova revisão depois de uma enviada (o contratante devolveu): a enviada vira substituída.
create or replace function public.fn_mc_medicao_nova_revisao(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare m public.mc_medicoes%rowtype; rv public.mc_medicao_revisoes%rowtype;
begin
  m := public.fn_mc_medicao_para(p_id, 'editar', 'Sem permissão para abrir nova revisão');
  rv := public.fn_mc_revisao_corrente(p_id);
  if rv.id is null or rv.status <> 'enviada' then
    raise exception 'A %ª medição não tem revisão enviada para refazer', m.numero using errcode = 'P0001';
  end if;
  if char_length(coalesce(btrim(p_motivo), '')) < 3 then raise exception 'Informe o motivo da nova revisão' using errcode = 'P0001'; end if;
  update public.mc_medicao_revisoes set status = 'substituida' where id = rv.id;
  insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero, fase, motivo)
  values (p_id, m.contrato_id, rv.numero + 1, rv.fase, btrim(p_motivo));
  if m.status = 'enviada' then
    update public.mc_medicoes set status = 'em_conferencia' where id = p_id;
  end if;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, de_status, para_status, motivo)
  values (p_id, m.contrato_id, 'nova_revisao', m.status, case when m.status = 'enviada' then 'em_conferencia' else m.status end,
          format('REV%s: %s', lpad((rv.numero + 1)::text, 2, '0'), btrim(p_motivo)));
end $$;

-- Aprova a revisão enviada. p_itens = [{item_id, quantidade}] (texto); p_tudo_como_medido copia a
-- quantidade congelada de cada item. Item congelado sem linha em p_itens fica com aprovada = 0.
create or replace function public.fn_mc_medicao_aprovar(p_id uuid, p_itens jsonb, p_tudo_como_medido boolean default false)
returns void language plpgsql security definer set search_path to '' as $$
declare m public.mc_medicoes%rowtype; rv public.mc_medicao_revisoes%rowtype; v_ant uuid; v_txt text;
begin
  m := public.fn_mc_medicao_para(p_id, 'aprovar', 'Sem permissão para aprovar medição');
  rv := public.fn_mc_revisao_corrente(p_id);
  if rv.id is null or rv.status <> 'enviada' or not (m.status = 'enviada' or (m.status = 'aprovada' and rv.fase = 'pos_aprovacao')) then
    raise exception 'A %ª medição não tem revisão enviada para aprovar', m.numero using errcode = 'P0001';
  end if;
  if not p_tudo_como_medido then
    if jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' then raise exception 'Itens aprovados em formato inválido' using errcode = 'P0001'; end if;
    select string_agg(e ->> 'item_id', ', ') into v_txt from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e
     where not exists (select 1 from public.mc_revisao_itens ri where ri.revisao_id = rv.id and ri.item_id = (e ->> 'item_id')::uuid);
    if v_txt is not null then raise exception 'Item aprovado que não está na revisão enviada: %', v_txt using errcode = 'P0001'; end if;
    select string_agg(e ->> 'item_id', ', ') into v_txt from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e
     where nullif(btrim(e ->> 'quantidade'), '') is null or (e ->> 'quantidade')::numeric < 0
        or (e ->> 'quantidade')::numeric <> round((e ->> 'quantidade')::numeric, 4);
    if v_txt is not null then raise exception 'Quantidade aprovada inválida (zero ou mais, até 4 casas) nos itens: %', v_txt using errcode = 'P0001'; end if;
  end if;
  update public.mc_medicao_revisoes set status = 'em_aberto' where id = rv.id;
  insert into public.mc_aprovacoes_item (revisao_id, item_id, contrato_id, quantidade_aprovada)
  select rv.id, ri.item_id, m.contrato_id,
         case when p_tudo_como_medido then ri.quantidade
              else coalesce((select (e ->> 'quantidade')::numeric from jsonb_array_elements(p_itens) e
                              where (e ->> 'item_id')::uuid = ri.item_id limit 1), 0) end
    from public.mc_revisao_itens ri where ri.revisao_id = rv.id;
  if rv.fase = 'pos_aprovacao' then
    select revisao_id into v_ant from public.mc_v_medicao_revisao_aprovada where medicao_id = p_id;
    update public.mc_medicao_revisoes set status = 'substituida' where id = v_ant;
  end if;
  update public.mc_medicao_revisoes set status = 'aprovada' where id = rv.id;
  if m.status = 'enviada' then
    update public.mc_medicoes set status = 'aprovada', aprovada_em = now(), aprovada_por = (select auth.uid()) where id = p_id;
  end if;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, de_status, para_status, motivo)
  values (p_id, m.contrato_id, case when rv.fase = 'pos_aprovacao' then 'aprovar_revisao' else 'aprovar' end, m.status, 'aprovada',
          format('REV%s aprovada%s', lpad(rv.numero::text, 2, '0'), case when p_tudo_como_medido then ' como medida' else '' end));
end $$;

-- Revisão pós-aprovação: a medição continua aprovada; a revisão nova recebe ajustes, é enviada e
-- aprovada, e então substitui a aprovada.
create or replace function public.fn_mc_medicao_revisar_aprovada(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare m public.mc_medicoes%rowtype; v_num int;
begin
  m := public.fn_mc_medicao_para(p_id, 'desaprovar', 'Sem permissão para revisar medição aprovada');
  if m.status <> 'aprovada' then
    raise exception 'A %ª medição está %: a revisão pós-aprovação é só para medição aprovada', m.numero, public.fn_mc_rotulo_status(m.status)
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.mc_medicao_revisoes where medicao_id = p_id and status in ('em_aberto', 'enviada')) then
    raise exception 'A %ª medição já tem revisão pós-aprovação pendente', m.numero using errcode = 'P0001';
  end if;
  if char_length(coalesce(btrim(p_motivo), '')) < 3 then raise exception 'Informe o motivo da revisão' using errcode = 'P0001'; end if;
  select max(numero) + 1 into v_num from public.mc_medicao_revisoes where medicao_id = p_id;
  insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero, fase, motivo)
  values (p_id, m.contrato_id, v_num, 'pos_aprovacao', btrim(p_motivo));
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, de_status, para_status, motivo)
  values (p_id, m.contrato_id, 'revisao_pos', 'aprovada', 'aprovada', format('REV%s: %s', lpad(v_num::text, 2, '0'), btrim(p_motivo)));
end $$;

-- ------------------------------------------------------------------ alertas
-- Calculados, sem tabela (spec 8). Índice provisório e item sem índice entram na Fase 6; vínculo de
-- insumo fica para depois (decisão do Tiago, 01/10/2026).
create or replace view public.mc_v_alertas with (security_invoker = true) as
with c as (
  select * from public.mc_contratos where excluido_em is null
), vig as (
  select distinct on (v.contrato_id) v.contrato_id, v.id as versao_id, v.numero
    from public.mc_planilha_versoes v join c on c.id = v.contrato_id
   where v.status = 'vigente' and v.excluido_em is null order by v.contrato_id, v.numero desc
), v0 as (
  select v.contrato_id, t.total_previsto from public.mc_planilha_versoes v join public.mc_v_versao_totais t on t.versao_id = v.id
   where v.numero = 0 and v.status = 'vigente' and v.excluido_em is null
), acum as (
  select contrato_id, round(sum(valor_acumulado_exato), 2) as valor from public.mc_v_item_acumulado group by contrato_id
), fim as (
  select c.id as contrato_id,
         (coalesce(case when c.inicio_prazo = 'ordem_servico' then c.data_ordem_servico end, c.data_assinatura)
          + make_interval(months => c.prazo_meses + coalesce((select sum(a.prazo_acrescido_meses) from public.mc_aditivos a
                                                              where a.contrato_id = c.id and a.excluido_em is null), 0)::int))::date as fim_prazo
    from c
)
-- Colunas: valor e referencia como texto (sem passar por float); a tela monta a frase em pt-BR.
--   acumulado_acima_previsto: valor = quantidade acumulada, referencia = quantidade prevista (versão vigente)
--   prazo_perto_do_fim: data = fim do prazo, valor = dias que faltam (negativo = vencido)
--   valor_perto_do_previsto: valor = % executado, referencia = limite do contrato (%)
--   valor_contrato_diferente: valor = valor do contrato, referencia = previsto da v0
select c.id as contrato_id, c.codigo, 'acumulado_acima_previsto'::text as tipo, 'alta'::text as gravidade, pi.item_id,
       pi.codigo as item_codigo, pi.unidade, a.qtd_acumulada::text as valor, pi.quantidade_prevista::text as referencia,
       null::date as data,
       exists (select 1 from public.mc_lancamentos l where l.contrato_id = c.id and l.item_id = pi.item_id
               and l.excluido_em is null and l.motivo_excesso is not null) as com_motivo
  from c join vig on vig.contrato_id = c.id
  join public.mc_planilha_itens pi on pi.versao_id = vig.versao_id and pi.tipo = 'servico'
  join public.mc_v_item_acumulado a on a.contrato_id = c.id and a.item_id = pi.item_id
 where a.qtd_acumulada > pi.quantidade_prevista
union all
select c.id, c.codigo, 'prazo_perto_do_fim', case when f.fim_prazo < current_date then 'alta' else 'media' end, null, null, null,
       (f.fim_prazo - current_date)::text, c.alerta_prazo_dias::text, f.fim_prazo, false
  from c join fim f on f.contrato_id = c.id
 where c.status = 'ativo' and f.fim_prazo is not null and f.fim_prazo - current_date <= c.alerta_prazo_dias
union all
select c.id, c.codigo, 'valor_perto_do_previsto', 'media', null, null, null,
       round(ac.valor / t.total_previsto * 100, 2)::text, c.alerta_valor_pct::text, null, false
  from c join vig on vig.contrato_id = c.id join public.mc_v_versao_totais t on t.versao_id = vig.versao_id
  join acum ac on ac.contrato_id = c.id
 where c.regra_arredondamento is not null and t.total_previsto > 0 and ac.valor / t.total_previsto * 100 >= c.alerta_valor_pct
union all
select c.id, c.codigo, 'valor_contrato_diferente', 'baixa', null, null, null,
       c.valor_inicial::text, v0.total_previsto::text, null, false
  from c join v0 on v0.contrato_id = c.id
 where c.valor_inicial is not null and v0.total_previsto is not null and c.valor_inicial <> v0.total_previsto;
revoke all on public.mc_v_alertas from anon, authenticated;
grant select on public.mc_v_alertas to authenticated;

revoke all on function public.fn_mc_medicao_para(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fn_mc_revisao_corrente(uuid) from public, anon, authenticated;
do $g$
declare f text;
begin
  foreach f in array array['fn_mc_medicao_fechar(uuid)', 'fn_mc_medicao_reabrir(uuid, text)', 'fn_mc_ajuste_lancar(uuid, uuid, text, text)',
                           'fn_mc_medicao_enviar(uuid)', 'fn_mc_medicao_nova_revisao(uuid, text)', 'fn_mc_medicao_aprovar(uuid, jsonb, boolean)',
                           'fn_mc_medicao_revisar_aprovada(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $g$;
```

- [ ] **Step 4:** aplicar por `apply_migration` (nome `mc_fase5a_ciclo`), versão real, md5, advisors.
- [ ] **Step 5:** prova verde; mutação: na transação, voltar a view para usar a medida viva também na aprovada e ver o caso "pós-aprovação pendente não mexe" falhar.
- [ ] **Step 6:** types e commit `Medição Fase 5a: ciclo da medição e alertas no banco (aplicadas) + prova`.

### Task 2: Recursos e backfill

**Files:** `src/config/recursos.ts`, `src/modules/medicao/_shared/recursos.test.ts`, `supabase/migrations/<versão real>_mc_fase5b_permissoes.sql`

- [ ] `medicao.medicoes` com `["ver","criar","editar","aprovar","desaprovar"]`; novo `{ id: "medicao.alertas", nome: "Alertas", acoes: ["ver"], rota: "/medicao/alertas" }` no fim do módulo (ordem: Painel, Contratos, Planilha, Lançamentos, Medições, Boletim, Alertas). Teste da ordem e das ações.
- [ ] Migration no molde de `20260928165457_mc_fase4c_permissoes.sql` com 4 ações novas; pré-conferência 68 linhas / 4 usuários; `$confere$` 84 / 4. Aplicar, versão real, md5, advisors.
- [ ] Commit `Medição Fase 5b: permissões do ciclo e dos alertas`.

### Task 3: Detalhe da medição (status, passos, itens, ajuste, trilha)

**Files:**
- Create: `src/app/(app)/medicao/medicoes/[id]/page.tsx` (+ `loading.tsx`)
- Create: `src/modules/medicao/medicoes/detalhe-queries.ts`, `ciclo-actions.ts`, `ciclo-schemas.ts`, `components/medicao-detalhe.tsx`, `components/acoes-ciclo.tsx`, `components/itens-medicao.tsx`, `components/ajuste-drawer.tsx`, `eventos.ts` (+ testes)
- Modify: `components/medicoes-tabela.tsx` (clique na linha abre o detalhe; o link para Lançamentos passa a ser botão no detalhe)

**Interfaces:**
- `carregarMedicao(id)`: medição (número, período, status, versão nº, contrato), revisões (número, fase, status, motivo, datas), itens de `mc_v_medicao_itens` com código/descrição/unidade da planilha da versão da medição (ou da última em que aparece) e `ajustes` somados por item da revisão corrente, eventos.
- Actions (todas com `exigirPermissao`, `idSchema`, `mensagemDeNegocio`, `revalidatePath` da lista e do detalhe): `fecharMedicao(id)`, `reabrirMedicao(id, motivo)`, `lancarAjuste({medicaoId, itemId, quantidade, motivo})`, `enviarMedicao(id)`, `novaRevisao(id, motivo)`, `revisarAprovada(id, motivo)`. Quantidade por `normalizarNumeroDigitado` (4 casas).
- `eventoMedicaoParaTrilha(evento)` no molde de `src/modules/financeiro/pagamentos/eventos.ts` (abrir, fechar, versao, reabrir, enviar, nova_revisao, aprovar, aprovar_revisao, revisao_pos, carga).

- [ ] Página com guarda `medicao.medicoes/ver` e 404 fora da lista. Cabeçalho: Nª, período, `SeloMedicao`, versão da planilha, revisão corrente (REVnn e status), valor (`MoneyText`). Botões conforme status e permissão (calculados no servidor): aberta → Fechar (editar); em conferência → Reabrir (motivo), Ajuste, Enviar REVnn; enviada → Nova revisão (motivo), Aprovar (Task 4); aprovada sem revisão pendente → Revisar aprovada (desaprovar); aprovada com revisão pós em aberto → Ajuste, Enviar; com pós enviada → Nova revisão, Aprovar. Confirmação canônica para Fechar e Enviar; botão desabilitado enquanto envia.
- [ ] Tabela de itens (`DataTable`): código, descrição, unid., medida, ajustes da revisão corrente, aprovada, glosa, valor; números com `numeroExibicao`, dinheiro com `MoneyText`.
- [ ] Ajuste (`FormDrawer`): serviço da versão da medição, quantidade (pode ser negativa), motivo.
- [ ] `Trilha` dos eventos.
- [ ] Testes de componente: botões por status/permissão; fechar chama a action e mostra o erro do banco; ajuste negativo vai como `-2`; trilha traduz os eventos. Commit `Medição: detalhe da medição com o ciclo`.

### Task 4: Aprovação, glosa e comparação de revisões

**Files:** `components/aprovar-drawer.tsx`, `components/revisoes-medicao.tsx`, `aprovacao.ts` (+ testes); Modify `ciclo-actions.ts` (`aprovarMedicao({id, itens, tudoComoMedido})`), `detalhe-queries.ts` (`revisaoItens(medicaoId)`: quantidades congeladas por revisão)

- [ ] Drawer de aprovação: tabela com cada item da revisão enviada (medida congelada) e campo de quantidade aprovada (`InputQuantidade`), botão "Aprovar tudo como medido" (preenche com a medida), glosa calculada na tela só para mostrar (o banco recalcula); antes de confirmar, aviso com a lista de itens que vão com aprovada 0 e a glosa total em quantidade por item; confirmar chama a action; ambíguo (`1.234`) recusado como no colar.
- [ ] Aba Revisões: lista REV00..REVnn com fase, status, motivo; comparação de duas revisões escolhidas, item a item (quantidade congelada de cada, diferença).
- [ ] Testes: aprovar tudo como medido manda `tudoComoMedido: true`; campo vazio vira 0 e aparece no aviso; comparação mostra a diferença. Commit `Medição: aprovação com glosa e comparação de revisões`.

### Task 5: Tela de alertas

**Files:** `src/app/(app)/medicao/alertas/page.tsx` (+ loading), `src/modules/medicao/alertas/{queries,tipos,formato}.ts`, `components/alertas-tabela.tsx` (+ testes)

- [ ] Guarda `medicao.alertas/ver`; lê `mc_v_alertas` (RLS); filtro por contrato e gravidade; `DataTable` com contrato, gravidade (selo), tipo e a frase em pt-BR montada em `formato.ts` a partir de `valor`, `referencia`, `data`, `unidade`, `com_motivo` (ex.: "01.01 acumulado 35 m, acima do previsto de 30 m (com motivo: precisa de aditivo)"; "Prazo termina em 01/12/2026, em 61 dias"; "Executado 102,78% do previsto (limite 90%)"; "Valor do contrato R$ 121.590.621,00 e planilha v0 R$ 121.573.053,78: diferença R$ 17.567,22"). Dinheiro por `MoneyText`/formatação de texto, sem `Number` para conta.
- [ ] Testes de `formato.ts` para os 4 tipos e de componente. Commit `Medição: tela de alertas`.

### Task 6: Fechamento

- [ ] `docs/decisoes.md` (entrada 2026-10-01 da Fase 5 com as decisões e rulings), vault (status e log).
- [ ] Portão completo; provas `mc_fase5_banco.sql` e `mc_fase4_banco.sql` no banco vivo; revisão final do branch; PR, CI, merge, deploy; conferência na tela sem gravar (detalhe de uma medição do L09: aprovada, sem botão de aprovar; aba Alertas com os 2 alertas de valor do contrato).
