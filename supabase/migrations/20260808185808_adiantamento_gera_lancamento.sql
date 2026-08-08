-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808185808 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 6 do Bloco 8a, parte 1 de 2.

alter table public.rh_adiantamentos
  add column if not exists lancamento_id uuid references public.lancamentos(id);

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
  return v_adiant;
end;
$function$;

comment on function public.fn_registrar_adiantamento(jsonb) is
  'Concede um adiantamento e gera, na mesma transacao, o lancamento a_pagar (origem adiantamento) no centro de custo do colaborador. Grava lancamento_id de volta no adiantamento. Espelha fn_fechar_diarias. Task 6 do Bloco 8a.';

revoke all on function public.fn_registrar_adiantamento(jsonb) from public;
grant execute on function public.fn_registrar_adiantamento(jsonb) to authenticated;
