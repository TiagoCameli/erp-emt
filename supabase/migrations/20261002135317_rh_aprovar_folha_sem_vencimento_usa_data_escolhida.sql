-- Folha sem data de vencimento e sem dia de pagamento nos Parametros nao era
-- aprovavel (a fn_aprovar_folha recusa). Com a data escolhida no modal de
-- aprovacao, ela vira o vencimento quando nao ha nenhum outro. Achado testando
-- a folha 09/2026 (02/10/2026).

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
