-- Aprovar e desaprovar o recibo de ferias.
--
-- Molde: fn_aprovar_decimo_terceiro / fn_desaprovar_decimo_terceiro, lidos da
-- definicao VIVA em 18/09/2026, nao do arquivo do repo.
--
-- Duas diferencas de fundo em relacao ao 13o:
--
-- 1. O 13o e um LOTE: percorre os itens e gera uma conta a pagar por pessoa.
--    O recibo de ferias e de UMA pessoa, entao nao ha laco.
-- 2. A competencia do 13o e dezembro do ano. A do recibo e o mes de INICIO DO
--    GOZO: o custo pertence ao mes em que a pessoa esteve de ferias, nao ao mes
--    em que o pagamento saiu.

create or replace function public.fn_aprovar_recibo_ferias(p_ferias uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_f record; v_nome text;
  v_uid uuid := (select auth.uid());
  v_comp date; v_venc date; v_lanc uuid; v_parcela uuid;
  v_lanc_principal uuid;
  v_aprova_pgto boolean := public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar');
  v_st_parcela text;
  v_grupo_inss text; v_grupo_irrf text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'aprovar') then
    raise exception 'Sem permissao para aprovar o recibo';
  end if;

  select f.*, c.nome into v_f
    from public.rh_ferias f
    join public.colaboradores c on c.id = f.colaborador_id
   where f.id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;
  v_nome := v_f.nome;

  if v_f.status_recibo <> 'pendente_aprovacao' then
    raise exception 'O recibo de % esta em "%": so da para aprovar o que esta pendente.',
      v_nome, v_f.status_recibo;
  end if;

  -- Recibo zerado aprovado viraria uma conta a pagar de R$ 0,00 na fila do
  -- financeiro, que ninguem sabe o que e nem consegue baixar.
  if v_f.valor_liquido <= 0 then
    raise exception 'O recibo esta zerado: informe o valor antes de aprovar.';
  end if;

  v_comp := date_trunc('month', v_f.data_inicio)::date;
  perform public.fn_exigir_competencia_aberta(v_comp, 'ferias', p_ferias);

  -- Sem data escolhida, vence dois dias antes do inicio do gozo, que e o prazo
  -- legal de pagamento das ferias (CLT art. 145).
  v_venc := coalesce(v_f.data_vencimento, v_f.data_inicio - 2);
  v_st_parcela := case when v_aprova_pgto then 'aprovado' else 'pendente' end;

  insert into public.lancamentos
    (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
     data_compra, mes_competencia, data_vencimento, created_by)
  values
    ('a_pagar', 'ferias', p_ferias, v_f.centro_custo_id,
     'Ferias ' || v_nome || ' ' || to_char(v_f.data_inicio, 'DD/MM')
       || ' a ' || to_char(v_f.data_fim, 'DD/MM/YYYY'),
     v_f.valor_liquido, 'a_pagar',
     (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc, v_uid)
  returning id into v_lanc_principal;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by,
     aprovado_por, aprovado_em, data_programada, data_programada_origem)
  values (v_lanc_principal, 1, v_f.valor_liquido, v_venc, v_st_parcela, v_uid,
     case when v_aprova_pgto then v_uid end,
     case when v_aprova_pgto then now() end,
     case when v_aprova_pgto then v_venc end,
     case when v_aprova_pgto then 'vencimento' end)
  returning id into v_parcela;

  if v_aprova_pgto then
    insert into public.parcela_eventos (parcela_id, tipo, data_para, created_by)
    values (v_parcela, 'aprovou', v_venc, v_uid);
  end if;

  if v_f.centro_custo_id is not null then
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_lanc_principal, v_f.centro_custo_id, v_f.valor_liquido, v_uid);
  end if;

  -- A guia sai do que foi DIGITADO. Sem desconto digitado nao ha guia, que e o
  -- caso de quem nao tem carteira: recebe ferias e nao gera INSS nem IRRF.
  if v_f.valor_inss > 0 or v_f.valor_irrf > 0 then
    select grupo_recolhimento_inss, grupo_recolhimento_irrf
      into v_grupo_inss, v_grupo_irrf
      from public.folha_parametros where id = 1;

    if v_grupo_inss is not null and v_f.valor_inss > 0 then
      insert into public.lancamentos
        (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
         data_compra, mes_competencia, data_vencimento, created_by)
      values ('a_pagar', 'ferias_guia', p_ferias, null,
        v_grupo_inss || ' ferias ' || v_nome,
        v_f.valor_inss, 'a_pagar',
        (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc, v_uid)
      returning id into v_lanc;
      insert into public.lancamento_parcelas
        (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
      values (v_lanc, 1, v_f.valor_inss, v_venc, 'pendente', v_uid);
    end if;

    if v_grupo_irrf is not null and v_f.valor_irrf > 0 then
      insert into public.lancamentos
        (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
         data_compra, mes_competencia, data_vencimento, created_by)
      values ('a_pagar', 'ferias_guia', p_ferias, null,
        v_grupo_irrf || ' ferias ' || v_nome,
        v_f.valor_irrf, 'a_pagar',
        (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc, v_uid)
      returning id into v_lanc;
      insert into public.lancamento_parcelas
        (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
      values (v_lanc, 1, v_f.valor_irrf, v_venc, 'pendente', v_uid);
    end if;
  end if;

  -- `v_lanc_principal` e guardado no insert, e NAO reconsultado no fim: como
  -- guia e recibo compartilham `origem_id`, um `select ... limit 1` sem ordem
  -- poderia devolver a guia.
  update public.rh_ferias
     set status_recibo = 'aprovado', aprovado_por = v_uid, aprovado_em = now(),
         motivo_rejeicao = null, lancamento_id = v_lanc_principal,
         updated_at = now()
   where id = p_ferias;
end $$;

comment on function public.fn_aprovar_recibo_ferias(uuid) is
  'Aprova o recibo: conta a pagar no centro de custo do colaborador, competencia no mes de INICIO DO GOZO, e guia por grupo quando houver INSS/IRRF digitado. Sem vencimento escolhido, vence dois dias antes do gozo.';

create or replace function public.fn_desaprovar_recibo_ferias(p_ferias uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text; v_ids uuid[];
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'desaprovar') then
    raise exception 'Sem permissao para desaprovar o recibo';
  end if;

  if btrim(coalesce(p_motivo, ''), E' \t\r\n') = '' then
    raise exception 'Informe o motivo da desaprovacao';
  end if;

  select status_recibo into v_status from public.rh_ferias
   where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;
  if v_status <> 'aprovado' then
    raise exception 'O recibo esta em "%": so da para desaprovar o que esta aprovado.', v_status;
  end if;

  -- Recibo e guia saem juntos: as duas origens apontam para a mesma linha de
  -- rh_ferias, entao um array so cobre os dois.
  select array_agg(id) into v_ids from public.lancamentos
   where origem in ('ferias', 'ferias_guia') and origem_id = p_ferias;

  if exists (
    select 1 from public.lancamento_parcelas lp
     where lp.lancamento_id = any(coalesce(v_ids, '{}')) and lp.status = 'pago'
  ) then
    raise exception 'Ha parcela ja paga neste recibo. Nao da para desaprovar.';
  end if;

  -- SOLTA a referencia ANTES do delete: a FK rh_ferias.lancamento_id e simples,
  -- sem `on delete set null`, e inverter a ordem estoura no meio da
  -- desaprovacao, com metade dos lancamentos ja apagados.
  update public.rh_ferias set lancamento_id = null where id = p_ferias;

  if v_ids is not null then
    delete from public.lancamento_rateios where lancamento_id = any(v_ids);
    delete from public.parcela_eventos where parcela_id in
      (select id from public.lancamento_parcelas where lancamento_id = any(v_ids));
    delete from public.lancamento_parcelas where lancamento_id = any(v_ids);
    delete from public.lancamentos where id = any(v_ids);
  end if;

  update public.rh_ferias
     set status_recibo = 'rascunho', aprovado_por = null, aprovado_em = null,
         motivo_rejeicao = p_motivo, updated_at = now()
   where id = p_ferias;
end $$;

comment on function public.fn_desaprovar_recibo_ferias(uuid, text) is
  'Desaprova o recibo: apaga a conta a pagar e a guia, devolve para rascunho com motivo. Recusa se alguma parcela ja foi paga.';

-- Funcao nasce com EXECUTE para PUBLIC, e PUBLIC inclui o anon.
-- Revoke e grant na mesma transacao: separados, existe um instante em que quem
-- esta logado perde a funcao.
revoke execute on function public.fn_aprovar_recibo_ferias(uuid) from public, anon;
revoke execute on function public.fn_desaprovar_recibo_ferias(uuid, text) from public, anon;
grant execute on function public.fn_aprovar_recibo_ferias(uuid) to authenticated;
grant execute on function public.fn_desaprovar_recibo_ferias(uuid, text) to authenticated;
