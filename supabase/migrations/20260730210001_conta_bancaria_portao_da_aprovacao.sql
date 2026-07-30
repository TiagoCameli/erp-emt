-- Conta bancaria escolhida no lancamento e' o portao da aprovacao.
--
-- Regra do Tiago: cada lancamento tem que ser revisado antes de ir para a
-- aprovacao, e a revisao e' escolher a conta de onde o dinheiro sai. Parcela sem
-- conta nao entra na fila, e o banco recusa aprovar. Na aprovacao, conta e data
-- podem ser trocadas, as duas opcionais.
--
-- Conta obrigatoria para TODAS as formas (decisao dele): dinheiro escolhe a conta
-- do caixa e cartao a conta de onde a fatura sai. Consequencia importante:
-- dinheiro e cartao NAO nascem mais aprovado/pago automaticamente enquanto nao
-- houver conta. Ficam pendentes, e a tela mostra isso no contador "Aguardando
-- conta bancaria" em vez de o lancamento simplesmente nao andar.

create or replace function public.fn_definir_conta_lancamento(
  p_lanc_id uuid,
  p_conta_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_tipo text;
begin
  if not public.tem_permissao('financeiro.lancamentos', 'editar') then
    raise exception 'Sem permissao para editar lancamentos';
  end if;

  select tipo into v_tipo from public.lancamentos where id = p_lanc_id;
  if v_tipo is null then raise exception 'Lancamento nao encontrado'; end if;

  if p_conta_id is not null and not exists (
    select 1 from public.contas_bancarias c where c.id = p_conta_id and c.ativo
  ) then
    raise exception 'Conta bancaria invalida ou inativa';
  end if;

  update public.lancamento_parcelas
  set conta_bancaria_id = p_conta_id
  where lancamento_id = p_lanc_id and status <> 'pago';

  -- Escolher a conta pode ser justamente o que libera dinheiro/cartao a andar.
  perform public.fn_aplicar_regra_pagamento(p_lanc_id);
end;
$$;

revoke all on function public.fn_definir_conta_lancamento(uuid, uuid) from public;
grant execute on function public.fn_definir_conta_lancamento(uuid, uuid) to authenticated;

-- Assinatura muda (ganha p_conta_id), entao dropa antes: parametro novo com
-- default criaria uma SEGUNDA funcao e a chamada ficaria ambigua no PostgREST.
drop function if exists public.fn_aprovar_parcela(uuid, date);

create or replace function public.fn_aprovar_parcela(
  p_parcela_id uuid,
  p_data_programada date default null,
  p_conta_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text; v_status_lanc text; v_venc date; v_data date; v_origem text;
  v_conta uuid;
begin
  if not public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar') then
    raise exception 'Sem permissao para aprovar pagamentos';
  end if;

  select lp.status, l.status, lp.data_vencimento, lp.conta_bancaria_id
  into v_status, v_status_lanc, v_venc, v_conta
  from public.lancamento_parcelas lp
  join public.lancamentos l on l.id = lp.lancamento_id
  where lp.id = p_parcela_id;

  if v_status is null then
    raise exception 'Parcela nao encontrada';
  end if;
  if v_status = 'em_revisao' then
    raise exception 'Esta parcela esta em revisao: reenvie para aprovacao antes de aprovar';
  end if;
  if v_status <> 'pendente' then
    raise exception 'So da para aprovar uma parcela pendente';
  end if;
  if v_status_lanc = 'previsto' then
    raise exception 'Este lancamento esta incompleto: as parcelas precisam somar o valor do lancamento antes de aprovar o pagamento';
  end if;

  if p_conta_id is not null then
    if not exists (
      select 1 from public.contas_bancarias c where c.id = p_conta_id and c.ativo
    ) then
      raise exception 'Conta bancaria invalida ou inativa';
    end if;
    v_conta := p_conta_id;
  end if;

  if v_conta is null then
    raise exception 'Este lancamento esta sem conta bancaria: escolha a conta no lancamento antes de aprovar o pagamento';
  end if;

  v_data := coalesce(
    p_data_programada,
    v_venc,
    (now() at time zone 'America/Rio_Branco')::date
  );
  v_origem := case
    when p_data_programada is not null then 'aprovacao'
    else 'vencimento'
  end;

  update public.lancamento_parcelas
  set status = 'aprovado',
      aprovado_por = (select auth.uid()),
      aprovado_em = now(),
      conta_bancaria_id = v_conta,
      data_programada = v_data,
      data_programada_origem = v_origem
  where id = p_parcela_id;

  insert into public.parcela_eventos (parcela_id, tipo, data_para, created_by)
  values (p_parcela_id, 'aprovou', v_data, (select auth.uid()));
end;
$$;

revoke all on function public.fn_aprovar_parcela(uuid, date, uuid) from public;
grant execute on function public.fn_aprovar_parcela(uuid, date, uuid) to authenticated;

-- Dinheiro e cartao so nascem aprovado/pago quando ja existe conta.
create or replace function public.fn_aplicar_regra_pagamento(p_lanc_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tipo_lanc text; v_status text; v_valor numeric(14, 2); v_compra date;
  v_tipo_forma text; v_qtd int; v_soma numeric(14, 2); v_parcela record;
  v_sem_conta int;
begin
  select l.tipo, l.status, l.valor, l.data_compra, coalesce(f.tipo, 'bancario')
  into v_tipo_lanc, v_status, v_valor, v_compra, v_tipo_forma
  from public.lancamentos l
  left join public.formas_pagamento f on f.id = l.forma_pagamento_id
  where l.id = p_lanc_id;

  if v_tipo_lanc is null then return; end if;
  if v_tipo_lanc <> 'a_pagar' then return; end if;
  if v_status = 'cancelado' then return; end if;

  if exists (
    select 1 from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('aprovado', 'pago')
  ) then
    return;
  end if;

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd, v_soma
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao');

  if v_qtd = 0 or v_soma <> round(coalesce(v_valor, 0), 2) then
    update public.lancamentos
    set status = 'previsto'
    where id = p_lanc_id and status <> 'previsto';
    return;
  end if;

  select count(*) into v_sem_conta
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status = 'pendente'
    and conta_bancaria_id is null;

  if v_tipo_forma = 'dinheiro' then
    if v_sem_conta > 0 then
      update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;
      return;
    end if;

    update public.lancamento_parcelas
    set status = 'aprovado',
        aprovado_por = (select auth.uid()),
        aprovado_em = now(),
        data_programada = coalesce(
          data_vencimento, (now() at time zone 'America/Rio_Branco')::date
        ),
        data_programada_origem = 'vencimento'
    where lancamento_id = p_lanc_id and status = 'pendente';

    update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;

  elsif v_tipo_forma = 'cartao_credito' then
    if v_sem_conta > 0 then
      update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;
      return;
    end if;

    update public.lancamento_parcelas
    set status = 'pago',
        data_pagamento = coalesce(v_compra, (now() at time zone 'America/Rio_Branco')::date),
        pago_por = (select auth.uid()),
        pago_em = now()
    where lancamento_id = p_lanc_id and status = 'pendente';

    update public.lancamentos set status = 'pago' where id = p_lanc_id;

    for v_parcela in
      select id from public.lancamento_parcelas
      where lancamento_id = p_lanc_id and status = 'pago'
    loop
      perform public.fn_propagar_anexos(
        'lancamento', p_lanc_id, 'pagamento', v_parcela.id
      );
    end loop;

  else
    update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;
  end if;
end;
$$;

revoke all on function public.fn_aplicar_regra_pagamento(uuid) from public;
grant execute on function public.fn_aplicar_regra_pagamento(uuid) to authenticated;

notify pgrst, 'reload schema';
