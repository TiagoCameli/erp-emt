-- Aprovar folha, 13o e recibo de ferias escolhendo a conta bancaria e a data,
-- como na Aprovacao de pagamentos (pedido do Tiago, 02/10/2026).
--
-- As tres fn_aprovar_* do RH ficam como estao: elas geram os lancamentos com
-- a parcela sem conta e programada para o vencimento. As funcoes novas chamam a
-- original e, na MESMA transacao, gravam nas parcelas que acabaram de nascer a
-- conta e a data que quem aprovou escolheu. Reescrever as tres (centenas de
-- linhas cada, com diarista, guias e rateio) para acrescentar dois campos seria
-- trocar risco grande por nada.
--
-- "Acabaram de nascer" = created_at = now(): now() e o inicio da transacao, e a
-- original roda dentro dela, entao so as parcelas desta aprovacao batem. Isso
-- deixa de fora lancamento de ciclo anterior (aprovou, desaprovou, aprovou).
--
-- Regras, as mesmas da fn_aprovar_parcela:
--   * conta obrigatoria e ativa: vale para todo lancamento gerado (salario e
--     guias), porque o banco que paga e um so;
--   * data opcional: null = vencimento (o que a original ja grava); quando vem,
--     vale so para o pagamento principal (salario / 13o / ferias) que nasceu
--     aprovado, com origem 'aprovacao'. Guia tem vencimento legal e fica no dela;
--   * data so para quem aprova pagamento: sem financeiro.aprovacao-pagamentos,
--     a parcela nasce pendente e a data e escolhida depois, na fila do Financeiro.

create or replace function public.fn_rh_programar_pagamento_aprovado(
  p_lancamentos uuid[],
  p_principais uuid[],
  p_data_programada date,
  p_conta_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_conta_id is null then
    raise exception 'Escolha a conta bancaria que vai pagar antes de aprovar';
  end if;
  if not exists (
    select 1 from public.contas_bancarias c where c.id = p_conta_id and c.ativo
  ) then
    raise exception 'Conta bancaria invalida ou inativa';
  end if;
  if p_data_programada is not null
     and not public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar') then
    raise exception 'Sem permissao para programar a data do pagamento: o pagamento vai para a Aprovacao de pagamentos, e a data e escolhida la';
  end if;

  update public.lancamento_parcelas lp
     set conta_bancaria_id = p_conta_id
   where lp.lancamento_id = any(p_lancamentos)
     and lp.created_at = now();

  if p_data_programada is not null then
    update public.parcela_eventos e
       set data_para = p_data_programada
      from public.lancamento_parcelas lp
     where e.parcela_id = lp.id
       and e.tipo = 'aprovou'
       and e.created_at = now()
       and lp.lancamento_id = any(p_principais)
       and lp.created_at = now()
       and lp.status = 'aprovado';

    update public.lancamento_parcelas lp
       set data_programada = p_data_programada,
           data_programada_origem = 'aprovacao'
     where lp.lancamento_id = any(p_principais)
       and lp.created_at = now()
       and lp.status = 'aprovado';
  end if;
end;
$$;

-- Interna: so as fn_aprovar_*_com_pagamento chamam. Exposta, deixaria qualquer
-- um trocar a conta de qualquer parcela criada na propria transacao.
revoke all on function public.fn_rh_programar_pagamento_aprovado(uuid[], uuid[], date, uuid)
  from public, anon, authenticated;

-- ===== Folha =====
create or replace function public.fn_aprovar_folha_com_pagamento(
  p_folha uuid,
  p_data_programada date default null,
  p_conta_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_salarios uuid[]; v_guias uuid[];
begin
  perform public.fn_aprovar_folha(p_folha);

  select coalesce(array_agg(fi.lancamento_id), '{}') into v_salarios
    from public.folha_itens fi
   where fi.folha_id = p_folha and fi.lancamento_id is not null;
  select coalesce(array_agg(fg.lancamento_id), '{}') into v_guias
    from public.folha_guias fg
   where fg.folha_id = p_folha and fg.lancamento_id is not null;

  perform public.fn_rh_programar_pagamento_aprovado(
    v_salarios || v_guias, v_salarios, p_data_programada, p_conta_id);
end;
$$;

-- ===== 13o =====
create or replace function public.fn_aprovar_decimo_terceiro_com_pagamento(
  p_lote uuid,
  p_data_programada date default null,
  p_conta_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_itens uuid[]; v_guias uuid[];
begin
  perform public.fn_aprovar_decimo_terceiro(p_lote);

  select coalesce(array_agg(i.lancamento_id), '{}') into v_itens
    from public.rh_decimo_terceiro_itens i
   where i.decimo_terceiro_id = p_lote and i.lancamento_id is not null;
  select coalesce(array_agg(l.id), '{}') into v_guias
    from public.lancamentos l
   where l.origem = 'decimo_terceiro_guia' and l.origem_id = p_lote
     and l.created_at = now();

  perform public.fn_rh_programar_pagamento_aprovado(
    v_itens || v_guias, v_itens, p_data_programada, p_conta_id);
end;
$$;

-- ===== Recibo de ferias =====
create or replace function public.fn_aprovar_recibo_ferias_com_pagamento(
  p_ferias uuid,
  p_data_programada date default null,
  p_conta_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_principal uuid[]; v_guias uuid[];
begin
  perform public.fn_aprovar_recibo_ferias(p_ferias);

  select coalesce(array_agg(f.lancamento_id), '{}') into v_principal
    from public.rh_ferias f
   where f.id = p_ferias and f.lancamento_id is not null;
  select coalesce(array_agg(l.id), '{}') into v_guias
    from public.lancamentos l
   where l.origem = 'ferias_guia' and l.origem_id = p_ferias
     and l.created_at = now();

  perform public.fn_rh_programar_pagamento_aprovado(
    v_principal || v_guias, v_principal, p_data_programada, p_conta_id);
end;
$$;

revoke all on function public.fn_aprovar_folha_com_pagamento(uuid, date, uuid) from public, anon;
revoke all on function public.fn_aprovar_decimo_terceiro_com_pagamento(uuid, date, uuid) from public, anon;
revoke all on function public.fn_aprovar_recibo_ferias_com_pagamento(uuid, date, uuid) from public, anon;
grant execute on function public.fn_aprovar_folha_com_pagamento(uuid, date, uuid) to authenticated;
grant execute on function public.fn_aprovar_decimo_terceiro_com_pagamento(uuid, date, uuid) to authenticated;
grant execute on function public.fn_aprovar_recibo_ferias_com_pagamento(uuid, date, uuid) to authenticated;
