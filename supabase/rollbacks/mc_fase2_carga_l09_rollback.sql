-- Desfaz a carga do Lote 09 (supabase/migrations/*mc_fase2_carga_l09.sql): apaga só o contrato
-- L09-BR364 que a carga criou e tudo dele, na ordem das dependências. As linhas de audit_log
-- ficam (são o rastro, inclusive destas exclusões).
--
-- Vale ANTES de alguém mexer no contrato pelo app: se houver lançamento, evento, aditivo,
-- revisão além da REV00, versão além da v0, medição fora da carga, anexo, reajuste ou índice
-- por item, o bloco para em vez de apagar o que não é da carga (desfazer à mão).
--
-- Como passa pelas travas: medição aprovada, revisão aprovada, ajuste e aprovação por item não
-- se apagam nem com app.mc_carga = '1' (o caminho de carga das travas vale só para INSERT).
-- Por isso, e só neste arquivo, os 4 gatilhos de trava dessas tabelas ficam desligados DENTRO
-- da transação (alter table ... disable trigger <nome>) e voltam a ligar no fim do mesmo bloco.
-- É transacional: se qualquer coisa falhar, o disable também é desfeito. Escolhido em vez de
-- set local session_replication_role = replica (que o papel do MCP também pode usar) porque o
-- replica desliga TODOS os gatilhos, inclusive as FKs e a auditoria: aqui as FKs continuam
-- conferindo a ordem e o audit_log registra cada exclusão. O alter table segura lock exclusivo
-- nas 4 tabelas até o fim da transação (segundos).
-- A versão 0 e as linhas da planilha saem pelo caminho normal: sem medição, a versão vigente
-- pode voltar a rascunho (fn_mc_trava_versao) e, em rascunho, linha e versão se apagam.

do $rollback$
declare
  v_contrato uuid;
  v_n bigint;
  v_txt text;
begin
  select id into v_contrato from public.mc_contratos where codigo = 'L09-BR364' and excluido_em is null;
  if v_contrato is null then
    raise exception 'Não há contrato L09-BR364 ativo: nada a desfazer';
  end if;

  select string_agg(t, ', ') into v_txt from (
    select 'lançamentos' t where exists (select 1 from public.mc_lancamentos where contrato_id = v_contrato)
    union all select 'eventos de medição' where exists (select 1 from public.mc_medicao_eventos where contrato_id = v_contrato)
    union all select 'aditivos' where exists (select 1 from public.mc_aditivos where contrato_id = v_contrato)
    union all select 'versões além da v0' where exists (select 1 from public.mc_planilha_versoes where contrato_id = v_contrato and numero <> 0)
    union all select 'medições fora da carga' where exists (select 1 from public.mc_medicoes where contrato_id = v_contrato and origem <> 'carga')
    union all select 'revisões além da REV00' where exists (select 1 from public.mc_medicao_revisoes where contrato_id = v_contrato and numero <> 0)
    union all select 'itens de revisão' where exists (select 1 from public.mc_revisao_itens where contrato_id = v_contrato)
    union all select 'ajustes manuais' where exists (select 1 from public.mc_ajustes where contrato_id = v_contrato and tipo <> 'carga')
    union all select 'reajuste aplicado' where exists (select 1 from public.mc_reajuste_aplicado where contrato_id = v_contrato)
    union all select 'itens de reajuste' where exists (select 1 from public.mc_reajuste_aplicado_itens where contrato_id = v_contrato)
    union all select 'índices por item' where exists (select 1 from public.mc_item_indices where contrato_id = v_contrato)
    union all select 'reajuste configurado' where exists (select 1 from public.mc_reajuste_config where contrato_id = v_contrato and tem_reajuste)
    union all select 'anexos' where exists (
      select 1 from public.anexo_vinculos v
       where public.fn_mc_contrato_da_entidade(v.entidade_tipo, v.entidade_id) = v_contrato)
  ) x;
  if v_txt is not null then
    raise exception 'O contrato L09-BR364 já foi mexido pelo app (%): desfazer à mão', v_txt;
  end if;

  perform set_config('app.mc_carga', '1', true);
  alter table public.mc_aprovacoes_item disable trigger trg_mc_trava_aprovacoes;
  alter table public.mc_ajustes disable trigger trg_mc_trava_ajuste;
  alter table public.mc_medicao_revisoes disable trigger trg_mc_trava_revisao;
  alter table public.mc_medicoes disable trigger trg_mc_trava_medicao;

  delete from public.mc_aprovacoes_item where contrato_id = v_contrato;
  delete from public.mc_ajustes where contrato_id = v_contrato;
  delete from public.mc_medicao_revisoes where contrato_id = v_contrato;
  delete from public.mc_medicoes where contrato_id = v_contrato;

  alter table public.mc_aprovacoes_item enable trigger trg_mc_trava_aprovacoes;
  alter table public.mc_ajustes enable trigger trg_mc_trava_ajuste;
  alter table public.mc_medicao_revisoes enable trigger trg_mc_trava_revisao;
  alter table public.mc_medicoes enable trigger trg_mc_trava_medicao;

  update public.mc_planilha_versoes set status = 'rascunho' where contrato_id = v_contrato and status = 'vigente';
  delete from public.mc_planilha_itens where contrato_id = v_contrato;
  delete from public.mc_planilha_versoes where contrato_id = v_contrato;
  delete from public.mc_itens where contrato_id = v_contrato;
  delete from public.mc_reajuste_config where contrato_id = v_contrato;
  delete from public.mc_contrato_usuarios where contrato_id = v_contrato;
  delete from public.mc_contratos where id = v_contrato;

  select count(*) into v_n from pg_trigger
   where tgname in ('trg_mc_trava_aprovacoes', 'trg_mc_trava_ajuste', 'trg_mc_trava_revisao', 'trg_mc_trava_medicao')
     and tgenabled <> 'O';
  if v_n > 0 then raise exception 'Gatilho de trava ficou desligado: parei'; end if;
  perform set_config('app.mc_carga', '', true);
end $rollback$;
