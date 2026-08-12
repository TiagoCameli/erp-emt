-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-12, versão
-- 20260812210237 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 2 do adiantamento parcelado, parte 2 de 2: a concessão passa a gravar o
-- plano de parcelas na mesma transação do lançamento. A assinatura não muda, e
-- sem a chave `parcelas` no payload o plano nasce com 1 parcela, que é o
-- adiantamento à vista de sempre.

create or replace function public.fn_registrar_adiantamento(p_dados jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_colab uuid := (p_dados->>'colaborador_id')::uuid;
  v_comp date := date_trunc('month', (p_dados->>'competencia')::date)::date;
  v_valor numeric(14,2) := (p_dados->>'valor')::numeric;
  v_data date := (p_dados->>'data')::date;
  v_desc text := nullif(btrim(coalesce(p_dados->>'descricao', '')), '');
  v_uid uuid := (select auth.uid());
  v_nome text; v_cc uuid; v_adiant uuid; v_lanc uuid;
  v_qtd integer; v_total_cent bigint; v_base_cent bigint; v_sobra_cent bigint;
begin
  if not public.tem_permissao('rh.adiantamentos', 'criar') then
    raise exception 'Sem permissao para criar adiantamentos';
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'O valor do adiantamento tem que ser maior que zero';
  end if;

  perform public.fn_exigir_competencia_aberta(v_comp, 'adiantamento', null);

  select nome, centro_custo_id into v_nome, v_cc
  from public.colaboradores where id = v_colab;
  if v_nome is null then raise exception 'Colaborador nao encontrado'; end if;

  insert into public.rh_adiantamentos
    (colaborador_id, competencia, valor, data, descricao, created_by)
  values (v_colab, v_comp, v_valor, v_data, v_desc, v_uid)
  returning id into v_adiant;

  insert into public.lancamentos
    (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
     data_compra, mes_competencia, data_vencimento, created_by)
  values
    ('a_pagar', 'adiantamento', v_adiant, v_cc,
     'Adiantamento ' || v_nome || ' ' || to_char(v_comp, 'MM/YYYY'),
     v_valor, 'a_pagar',
     (now() at time zone 'America/Rio_Branco')::date, v_comp, v_data, v_uid)
  returning id into v_lanc;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  values (v_lanc, 1, v_valor, v_data, 'pendente', v_uid);

  if v_cc is not null then
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_lanc, v_cc, v_valor, v_uid);
  end if;

  update public.rh_adiantamentos set lancamento_id = v_lanc where id = v_adiant;

  -- Plano de desconto. Parcelas iguais em centavos, sobra na primeira, a partir
  -- da competencia informada. Sem a chave 'parcelas' no payload, 1 parcela: e o
  -- adiantamento a vista de sempre, sem ramo especial. A conta e a mesma de
  -- dividirEmParcelas() em src/modules/rh/adiantamentos/parcelamento.ts, feita
  -- em centavos inteiros para as duas fecharem no mesmo centavo.
  v_qtd := coalesce((p_dados->>'parcelas')::integer, 1);
  if v_qtd < 1 or v_qtd > 60 then
    raise exception 'Parcelas fora do limite (1 a 60): %', v_qtd;
  end if;
  v_total_cent := round(v_valor * 100)::bigint;
  if v_qtd > v_total_cent then
    raise exception 'Parcelas demais para o valor: cada parcela ficaria em zero';
  end if;
  v_base_cent := v_total_cent / v_qtd;
  v_sobra_cent := v_total_cent - v_base_cent * v_qtd;

  insert into public.rh_adiantamento_parcelas
    (adiantamento_id, numero, competencia, valor_previsto)
  select v_adiant,
         n,
         (date_trunc('month', v_comp) + ((n - 1) || ' month')::interval)::date,
         ((v_base_cent + case when n = 1 then v_sobra_cent else 0 end)::numeric / 100)
  from generate_series(1, v_qtd) n;

  return v_adiant;
end;
$function$;
