-- Mes de referencia editavel a qualquer momento.
--
-- Antes, fn_alterar_mes_competencia recusava quando alguma parcela estava
-- aprovada ou paga ("Estorne o pagamento antes de mudar o mes de
-- referencia"). O Tiago pediu (12/10/2026) para poder mudar sempre: o mes de
-- referencia so diz em que mes o custo entra nos relatorios, nao mexe no
-- pagamento. Recriada a partir da pg_get_functiondef de producao, tirando so
-- esse bloco. Ficam as guardas de origem (folha, adiantamento) e a de mes
-- fechado (fn_exigir_competencia_aberta nos dois lados).

CREATE OR REPLACE FUNCTION public.fn_alterar_mes_competencia(p_entidade text, p_id uuid, p_mes date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lanc_id uuid;
  v_oc_id uuid;
  v_mes date;
  v_mes_atual date;
  v_origem text;
begin
  if p_entidade not in ('ordem_compra', 'lancamento') then
    raise exception 'Documento invalido para alterar mes de referencia';
  end if;
  if p_mes is null then
    raise exception 'Informe o mes de referencia';
  end if;
  v_mes := date_trunc('month', p_mes)::date;

  if p_entidade = 'ordem_compra' then
    if not public.tem_permissao('compras.ordens', 'editar') then
      raise exception 'Sem permissao para editar ordens de compra';
    end if;
    v_oc_id := p_id;
    select mes_competencia into v_mes_atual from public.ordens_compra where id = v_oc_id;
    if v_mes_atual is null then
      raise exception 'Ordem de compra nao encontrada';
    end if;
    select id into v_lanc_id
    from public.lancamentos
    where origem = 'oc' and origem_id = v_oc_id and status <> 'cancelado'
    order by created_at desc
    limit 1;
  else
    if not public.tem_permissao('financeiro.lancamentos', 'editar') then
      raise exception 'Sem permissao para editar lancamentos';
    end if;
    v_lanc_id := p_id;
    select mes_competencia, origem into v_mes_atual, v_origem from public.lancamentos where id = v_lanc_id;
    if v_mes_atual is null then
      raise exception 'Lancamento nao encontrado';
    end if;

    -- Guarda de origem: mesmo criterio e mesma forma de mensagem da
    -- fn_excluir_lancamento. A competencia de um lancamento do RH e a da folha
    -- ou a do adiantamento, nao um campo do contas a pagar. Sem esta guarda
    -- dava para mover o salario de 2026-11 para 2027-03 com folhas.competencia
    -- parada em 2026-11, e a identidade de conferencia NAO acusava, porque ela
    -- agrupa por folha_id e nao por mes.
    if v_origem in ('folha', 'folha_guia') then
      raise exception 'Nao da para mudar o mes de referencia aqui: este lancamento veio da folha. A competencia e a da folha: desaprove a folha, regere na competencia certa e reaprove';
    end if;

    if v_origem = 'adiantamento' then
      raise exception 'Nao da para mudar o mes de referencia aqui: este lancamento veio de um adiantamento. Exclua e recrie o adiantamento na competencia certa';
    end if;
    select origem_id into v_oc_id
    from public.lancamentos
    where id = v_lanc_id and origem = 'oc';
  end if;

  -- Sem trava por pagamento: o mes de referencia e so a competencia do custo
  -- (DRE, custo por obra). O pagamento vive na parcela, pela data de
  -- pagamento, e nao muda com isso. Continua valendo o mes fechado.
  perform public.fn_exigir_competencia_aberta(v_mes_atual, p_entidade, p_id);
  perform public.fn_exigir_competencia_aberta(v_mes, p_entidade, p_id);

  if v_oc_id is not null then
    update public.ordens_compra set mes_competencia = v_mes where id = v_oc_id;
  end if;
  if v_lanc_id is not null then
    update public.lancamentos set mes_competencia = v_mes where id = v_lanc_id;
  end if;
end;
$function$;
