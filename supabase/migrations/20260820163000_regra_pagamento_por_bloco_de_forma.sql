-- Um lancamento pode ser pago por VARIAS formas.
-- Parte B: as regras. Aqui o comportamento muda.
--
-- Tres funcoes:
--   1. fn_aplicar_regra_pagamento -- o tipo passa a rotear POR BLOCO DE FORMA
--   2. fn_salvar_lancamento       -- recebe as formas (parametro novo: DROP+CREATE)
--   3. fn_definir_parcelas_lancamento -- reparcelar respeita o bloco
--
-- A decisao do dono: cada parte segue o tipo DELA. A parte em dinheiro pula a
-- fila, a parte no cartao nasce quitada, a parte em boleto vai para a aprovacao.
-- Consequencia aceita: um lancamento pode ter partes em tres estados ao mesmo
-- tempo, e o status dele passa a ser derivado (fn_recalcular_status_lancamento,
-- que ja sabia fazer isso para pagamento parcial).
--
-- COMPATIBILIDADE: lancamento SEM bloco de forma (878 manuais, 2 de OC, e tudo
-- o que o RH e o importador criam) continua roteando exatamente como antes, pelo
-- `lancamentos.forma_pagamento_id`. Isso nao e um segundo caminho de codigo: a
-- consulta de blocos devolve os blocos reais OU um pseudo-bloco do cabecalho
-- quando nao existe nenhum, e o predicado
-- `lancamento_forma_id is not distinct from bloco` serve os dois casos.

-- ---------------------------------------------------------------------------
-- 1. O tipo roteia por bloco de forma
-- ---------------------------------------------------------------------------

create or replace function public.fn_aplicar_regra_pagamento(p_lanc_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tipo_lanc text; v_status text; v_valor numeric(14, 2); v_compra date;
  v_qtd int; v_soma numeric(14, 2); v_bloco record; v_parcela record;
begin
  select l.tipo, l.status, l.valor, l.data_compra
  into v_tipo_lanc, v_status, v_valor, v_compra
  from public.lancamentos l
  where l.id = p_lanc_id;

  if v_tipo_lanc is null then return; end if;
  if v_tipo_lanc <> 'a_pagar' then return; end if;
  if v_status = 'cancelado' then return; end if;

  -- Ja ha decisao tomada em alguma parcela: nao mexe em nada. Igual a antes.
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

  -- Parcelamento que nao fecha com o valor: o lancamento e so previsao, e
  -- nenhum atalho se aplica. Identico a antes.
  if v_qtd = 0 or v_soma <> round(coalesce(v_valor, 0), 2) then
    update public.lancamentos
    set status = 'previsto'
    where id = p_lanc_id and status <> 'previsto';
    return;
  end if;

  for v_bloco in
    -- Os blocos declarados...
    select lf.id as bloco, coalesce(f.tipo, 'bancario') as tipo
    from public.lancamento_formas lf
    left join public.formas_pagamento f on f.id = lf.forma_pagamento_id
    where lf.lancamento_id = p_lanc_id
    union all
    -- ...ou, quando nao ha nenhum, UM pseudo-bloco com a forma do cabecalho, que
    -- vale para todas as parcelas (todas com lancamento_forma_id nulo). E o que
    -- mantem o comportamento antigo sem um segundo caminho de codigo.
    select null::uuid, coalesce(f.tipo, 'bancario')
    from public.lancamentos l
    left join public.formas_pagamento f on f.id = l.forma_pagamento_id
    where l.id = p_lanc_id
      and not exists (
        select 1 from public.lancamento_formas x where x.lancamento_id = l.id
      )
  loop
    -- A conta bancaria e o portao do atalho, POR BLOCO: enquanto faltar conta em
    -- alguma parcela deste bloco, ele nao pula nem quita. Sem o recorte por
    -- bloco, uma parcela de boleto sem conta travaria o atalho da parte em
    -- dinheiro, que nao tem nada a ver com ela.
    if exists (
      select 1 from public.lancamento_parcelas
      where lancamento_id = p_lanc_id
        and lancamento_forma_id is not distinct from v_bloco.bloco
        and status = 'pendente'
        and conta_bancaria_id is null
    ) then
      continue;
    end if;

    if v_bloco.tipo = 'dinheiro' then
      -- Dinheiro nao passa pela fila: nasce aprovado, com a data autorizada
      -- vindo do vencimento.
      update public.lancamento_parcelas
      set status = 'aprovado',
          aprovado_por = (select auth.uid()),
          aprovado_em = now(),
          data_programada = coalesce(
            data_vencimento, (now() at time zone 'America/Rio_Branco')::date
          ),
          data_programada_origem = 'vencimento'
      where lancamento_id = p_lanc_id
        and lancamento_forma_id is not distinct from v_bloco.bloco
        and status = 'pendente';

    elsif v_bloco.tipo = 'cartao_credito' then
      -- Cartao nasce quitado: a fatura do cartao nao e controlada aqui.
      update public.lancamento_parcelas
      set status = 'pago',
          data_pagamento = coalesce(v_compra, (now() at time zone 'America/Rio_Branco')::date),
          pago_por = (select auth.uid()),
          pago_em = now()
      where lancamento_id = p_lanc_id
        and lancamento_forma_id is not distinct from v_bloco.bloco
        and status = 'pendente';

      for v_parcela in
        select id from public.lancamento_parcelas
        where lancamento_id = p_lanc_id
          and lancamento_forma_id is not distinct from v_bloco.bloco
          and status = 'pago'
      loop
        perform public.fn_propagar_anexos(
          'lancamento', p_lanc_id, 'pagamento', v_parcela.id
        );
      end loop;
    end if;
    -- bancario e cheque: nada a fazer. A parcela fica pendente e e isso que a
    -- faz aparecer na fila de aprovacao.
  end loop;

  -- O status do lancamento agora e DERIVADO, e nao mais escrito em cada ramo:
  -- com formas de tipos diferentes ele pode ter parte quitada, parte aprovada e
  -- parte esperando ao mesmo tempo, e so a contagem das parcelas sabe dizer o
  -- que ele e. fn_recalcular_status_lancamento ja fazia essa conta para
  -- pagamento parcial (e tambem fecha a OC quando tudo foi pago).
  perform public.fn_recalcular_status_lancamento(p_lanc_id);
end;
$function$;

revoke all on function public.fn_aplicar_regra_pagamento(uuid) from public;

