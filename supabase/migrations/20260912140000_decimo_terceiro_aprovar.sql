-- Aprovacao e desaprovacao do lote de 13o: onde o dinheiro sai.
--
-- Molde: fn_aprovar_rescisao (definicao viva lida em 12/09/2026, identica ao
-- arquivo 20260829210000).

-- A guia do 13o ganha origem PROPRIA, e nao 'folha_guia'.
-- Motivo: folha_guias.folha_id e NOT NULL e aponta para `folhas`, entao o id
-- de um lote de 13o nao cabe la. E rh/folha/queries.ts:611 le folha_guias e
-- casa por lancamento_id para classificar a linha como guia: um lancamento
-- 'folha_guia' sem linha correspondente viraria orfao silencioso naquela tela.
alter table public.lancamentos drop constraint lancamentos_origem_check;

alter table public.lancamentos add constraint lancamentos_origem_check
  check (origem in ('oc','manual','diaria','folha','folha_guia',
                    'adiantamento','rescisao','decimo_terceiro','ferias',
                    'decimo_terceiro_guia'));

create or replace function public.fn_aprovar_decimo_terceiro(p_lote uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_l record; v_item record;
  v_uid uuid := (select auth.uid());
  v_comp date; v_venc date; v_lanc uuid; v_parcela uuid;
  v_aprova_pgto boolean := public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar');
  v_st_parcela text;
  v_grupo_inss text; v_grupo_irrf text;
  v_tot_inss numeric(14,2); v_tot_irrf numeric(14,2);
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'aprovar') then
    raise exception 'Sem permissao para aprovar o 13o';
  end if;

  select * into v_l from public.rh_decimo_terceiro
   where id = p_lote and excluido_em is null for update;
  if not found then raise exception 'Lote nao encontrado'; end if;

  if v_l.status <> 'pendente_aprovacao' then
    raise exception 'O lote esta em "%": so da para aprovar o que esta pendente de aprovacao.', v_l.status;
  end if;

  -- Competencia: dezembro do ano do lote, nas duas parcelas. O 13o e do ano,
  -- nao do mes em que a parcela e paga.
  v_comp := make_date(v_l.ano, 12, 1);
  perform public.fn_exigir_competencia_aberta(v_comp, 'decimo_terceiro', p_lote);

  v_venc := coalesce(v_l.data_vencimento, make_date(v_l.ano, 12, 20));
  v_st_parcela := case when v_aprova_pgto then 'aprovado' else 'pendente' end;

  -- ===== 1. Uma conta a pagar POR PESSOA =====
  -- Por pessoa e nao pelo total, porque cada um tem seu centro de custo e o
  -- custo tem que cair na obra certa. fn_aprovar_folha faz assim.
  for v_item in
    select i.*, c.nome
      from public.rh_decimo_terceiro_itens i
      join public.colaboradores c on c.id = i.colaborador_id
     where i.decimo_terceiro_id = p_lote
       and i.valor_liquido > 0
     order by c.nome
  loop
    insert into public.lancamentos
      (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
       data_compra, mes_competencia, data_vencimento, created_by)
    values
      ('a_pagar', 'decimo_terceiro', v_item.id, v_item.centro_custo_id,
       '13o ' || v_item.nome || ' ' || v_l.parcela || 'a parcela ' || v_l.ano,
       v_item.valor_liquido, 'a_pagar',
       (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc, v_uid)
    returning id into v_lanc;

    insert into public.lancamento_parcelas
      (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by,
       aprovado_por, aprovado_em, data_programada, data_programada_origem)
    values (v_lanc, 1, v_item.valor_liquido, v_venc, v_st_parcela, v_uid,
       case when v_aprova_pgto then v_uid end,
       case when v_aprova_pgto then now() end,
       case when v_aprova_pgto then v_venc end,
       case when v_aprova_pgto then 'vencimento' end)
    returning id into v_parcela;

    if v_aprova_pgto then
      insert into public.parcela_eventos (parcela_id, tipo, data_para, created_by)
      values (v_parcela, 'aprovou', v_venc, v_uid);
    end if;

    if v_item.centro_custo_id is not null then
      insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
      values (v_lanc, v_item.centro_custo_id, v_item.valor_liquido, v_uid);
    end if;

    update public.rh_decimo_terceiro_itens set lancamento_id = v_lanc where id = v_item.id;
  end loop;

  -- ===== 2. As guias do retido =====
  -- Grupo nao configurado = retido que NAO vira conta a pagar e some. A folha
  -- tem o mesmo buraco e a tela avisa antes; aqui a tela avisa igual.
  if v_l.com_desconto then
    select grupo_recolhimento_inss, grupo_recolhimento_irrf
      into v_grupo_inss, v_grupo_irrf
      from public.folha_parametros where id = 1;

    select coalesce(sum(valor_inss), 0), coalesce(sum(valor_irrf), 0)
      into v_tot_inss, v_tot_irrf
      from public.rh_decimo_terceiro_itens where decimo_terceiro_id = p_lote;

    if v_grupo_inss is not null and v_tot_inss > 0 then
      insert into public.lancamentos
        (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
         data_compra, mes_competencia, data_vencimento, created_by)
      values ('a_pagar', 'decimo_terceiro_guia', p_lote, null,
        v_grupo_inss || ' 13o ' || v_l.parcela || 'a parcela ' || v_l.ano,
        v_tot_inss, 'a_pagar',
        (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc, v_uid)
      returning id into v_lanc;
      insert into public.lancamento_parcelas
        (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
      values (v_lanc, 1, v_tot_inss, v_venc, 'pendente', v_uid);
    end if;

    if v_grupo_irrf is not null and v_tot_irrf > 0 then
      insert into public.lancamentos
        (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
         data_compra, mes_competencia, data_vencimento, created_by)
      values ('a_pagar', 'decimo_terceiro_guia', p_lote, null,
        v_grupo_irrf || ' 13o ' || v_l.parcela || 'a parcela ' || v_l.ano,
        v_tot_irrf, 'a_pagar',
        (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc, v_uid)
      returning id into v_lanc;
      insert into public.lancamento_parcelas
        (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
      values (v_lanc, 1, v_tot_irrf, v_venc, 'pendente', v_uid);
    end if;
  end if;

  update public.rh_decimo_terceiro
     set status = 'aprovado', aprovado_por = v_uid, aprovado_em = now(),
         motivo_rejeicao = null, updated_at = now()
   where id = p_lote;
end $$;

comment on function public.fn_aprovar_decimo_terceiro(uuid) is
  'Aprova o lote: uma conta a pagar por colaborador (origem decimo_terceiro, centro de custo do colaborador) e uma guia por grupo de recolhimento quando com_desconto (origem decimo_terceiro_guia). Item com liquido <= 0 nao gera lancamento. Competencia e dezembro do ano do lote.';

create or replace function public.fn_desaprovar_decimo_terceiro(p_lote uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_l record; v_ids uuid[]; v_guias uuid[];
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'desaprovar') then
    raise exception 'Sem permissao para desaprovar o 13o';
  end if;

  if btrim(coalesce(p_motivo, ''), E' \t\r\n') = '' then
    raise exception 'Informe o motivo da desaprovacao';
  end if;

  select * into v_l from public.rh_decimo_terceiro
   where id = p_lote and excluido_em is null for update;
  if not found then raise exception 'Lote nao encontrado'; end if;
  if v_l.status <> 'aprovado' then
    raise exception 'O lote esta em "%": so da para desaprovar o que esta aprovado.', v_l.status;
  end if;

  select array_agg(id) into v_guias from public.lancamentos
   where origem = 'decimo_terceiro_guia' and origem_id = p_lote;

  select array_agg(lancamento_id) into v_ids
    from public.rh_decimo_terceiro_itens
   where decimo_terceiro_id = p_lote and lancamento_id is not null;

  -- Parcela ja paga trava a volta: o dinheiro saiu do banco.
  if exists (
    select 1 from public.lancamento_parcelas lp
     where lp.lancamento_id = any(coalesce(v_ids, '{}') || coalesce(v_guias, '{}'))
       and lp.status = 'pago'
  ) then
    raise exception 'Ha parcela ja paga neste lote. Nao da para desaprovar.';
  end if;

  -- SOLTA a referencia ANTES do delete. rh_decimo_terceiro_itens_lancamento_id_fkey
  -- e FK simples, sem on delete set null: inverter a ordem estoura no meio da
  -- desaprovacao e deixa metade feito.
  update public.rh_decimo_terceiro_itens
     set lancamento_id = null where decimo_terceiro_id = p_lote;

  if v_ids is not null then
    delete from public.lancamento_rateios where lancamento_id = any(v_ids);
    delete from public.parcela_eventos where parcela_id in
      (select id from public.lancamento_parcelas where lancamento_id = any(v_ids));
    delete from public.lancamento_parcelas where lancamento_id = any(v_ids);
    delete from public.lancamentos where id = any(v_ids);
  end if;

  if v_guias is not null then
    delete from public.parcela_eventos where parcela_id in
      (select id from public.lancamento_parcelas where lancamento_id = any(v_guias));
    delete from public.lancamento_parcelas where lancamento_id = any(v_guias);
    delete from public.lancamentos where id = any(v_guias);
  end if;

  update public.rh_decimo_terceiro
     set status = 'rascunho', aprovado_por = null, aprovado_em = null,
         motivo_rejeicao = p_motivo, updated_at = now()
   where id = p_lote;
end $$;

comment on function public.fn_desaprovar_decimo_terceiro(uuid, text) is
  'Desaprova o lote e apaga os lancamentos (itens e guias), soltando lancamento_id ANTES do delete. Recusa se alguma parcela ja foi paga.';
