-- Achado da revisao do PR #363: a data escolhida pode virar o vencimento da
-- folha e nao passava pela trava da fn_definir_vencimento_folha (data antes do
-- mes da competencia).

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
  v_comp date;
begin
  -- Data antes do mes da competencia e digitacao errada (2025 no lugar de
  -- 2026): mesma trava da fn_definir_vencimento_folha, aqui porque a data
  -- escolhida pode virar o vencimento da folha logo abaixo.
  if p_data_programada is not null then
    select f.competencia into v_comp from public.folhas f where f.id = p_folha;
    if v_comp is not null and p_data_programada < date_trunc('month', v_comp)::date then
      raise exception 'A data escolhida (%) e anterior ao mes da competencia (%/%).',
        to_char(p_data_programada, 'DD/MM/YYYY'), to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY');
    end if;
  end if;

  -- Folha sem data e sem dia de pagamento nos Parametros: a fn_aprovar_folha
  -- recusa ("sem data de vencimento"). Se quem aprova escolheu a data, ela
  -- vira o vencimento, porque nao ha outro. Com data ou dia ja definidos nada
  -- muda aqui: a escolhida entra so como data programada, la embaixo.
  if p_data_programada is not null then
    update public.folhas f
       set data_vencimento = p_data_programada
     where f.id = p_folha
       and f.status = 'pendente_aprovacao'
       and f.data_vencimento is null
       and (select fp.dia_pagamento_salario from public.folha_parametros fp where fp.id = 1) is null;
  end if;

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
