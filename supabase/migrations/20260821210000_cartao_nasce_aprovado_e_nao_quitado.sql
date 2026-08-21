-- =============================================================
-- Cartao de credito passa a ser PAGO EXPLICITAMENTE, e nao quitado na compra
--
-- REGRA DO TIAGO (21/08/2026). A pergunta foi: cartao deve continuar nascendo
-- quitado na data da compra, ou passar a ser pago com botao, como um boleto que
-- nao precisa de aprovacao? Ele escolheu o segundo.
--
-- POR QUE FAZ SENTIDO. Uma compra em 12x no cartao nao sai do caixa na data da
-- compra: cai na fatura, parcela por parcela, em 12 datas. Quitar tudo na compra
-- fazia o ERP afirmar que R$ 10.783,56 sairam em 06/07, quando na verdade saem
-- R$ 898,63 por mes ate 03/2027. Pagando parcela a parcela, a data de pagamento
-- passa a ser a data real, e o extrato tem chance de conciliar.
--
-- O QUE MUDA em fn_aplicar_regra_pagamento: o ramo do cartao para de escrever
-- status 'pago' e passa a fazer o MESMO que o ramo do dinheiro -- nasce
-- 'aprovado', com a data autorizada vindo do vencimento da parcela. Os dois
-- ramos viram um: e literalmente a mesma regra ("nao passa pela fila, ja pode
-- ser pago"), e mante-los separados era o convite para divergirem.
--
-- CONSEQUENCIA DESEJADA: a parcela de cartao ganha botao de pagar em Pagamentos
-- sem nunca aparecer na fila de aprovacao (`podePagarParcela` libera 'aprovado',
-- e a fila filtra por forma desde o #155). E o pagamento passa pela
-- fn_pagar_parcela, ou seja, ganha conta bancaria, data real, desconto, juros,
-- outras despesas, anexo de comprovante e trilha -- nada disso existia no
-- atalho que quitava calado.
--
-- SAI A PROPAGACAO DE ANEXOS DAQUI. Ela existia porque o cartao virava 'pago'
-- neste mesmo instante, e "pagamento" e a entidade que recebe anexo. Agora o
-- pagamento acontece depois, e a `fn_pagar_parcela` ja propaga os anexos no
-- momento certo. Propagar aqui vincularia papelada a um pagamento que ainda nao
-- aconteceu.
--
-- NAO MEXE em fn_pagar_parcela, de proposito: outra frente esta com ela agora
-- (a guarda de saldo passou a usar fn_saldo_conta em 21/08). Esta migration nao
-- precisa dela para nada.
--
-- CONSERTO DE DADO, no mesmo passo: as 8 parcelas de cartao que estao 'pendente'
-- (LAN-2026-5026, R$ 7.189,04) ficaram presas por um curto-circuito desta
-- funcao -- "ja ha decisao tomada em alguma parcela: nao mexe em nada". As
-- parcelas 1 a 4 vieram 'pago' na carga de 11/08, entao a regra abortou e nunca
-- tocou nas 5 a 12. Rodar a funcao de novo nao resolveria: ela abortaria pelo
-- mesmo motivo. Por isso o UPDATE direto, no MESMO escopo que a funcao usaria.
--
-- As parcelas de cartao que JA estao 'pago' ficam como estao. Sao historico
-- liquidado; reabrir pagamento consumado para "aplicar a regra nova" seria
-- mexer em dinheiro fechado sem ninguem ter pedido.
-- =============================================================

create or replace function public.fn_aplicar_regra_pagamento(p_lanc_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tipo_lanc text; v_status text; v_valor numeric(14, 2);
  v_qtd int; v_soma numeric(14, 2); v_bloco record;
begin
  select l.tipo, l.status, l.valor
  into v_tipo_lanc, v_status, v_valor
  from public.lancamentos l
  where l.id = p_lanc_id;

  if v_tipo_lanc is null then return; end if;
  if v_tipo_lanc <> 'a_pagar' then return; end if;
  if v_status = 'cancelado' then return; end if;

  -- Ja ha decisao tomada em alguma parcela: nao mexe em nada.
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
  -- nenhum atalho se aplica.
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
    -- vale para todas as parcelas (todas com lancamento_forma_id nulo).
    select null::uuid, coalesce(f.tipo, 'bancario')
    from public.lancamentos l
    left join public.formas_pagamento f on f.id = l.forma_pagamento_id
    where l.id = p_lanc_id
      and not exists (
        select 1 from public.lancamento_formas x where x.lancamento_id = l.id
      )
  loop
    -- A conta bancaria e o portao do atalho, POR BLOCO: enquanto faltar conta em
    -- alguma parcela deste bloco, ele nao pula a fila. Sem o recorte por bloco,
    -- uma parcela de boleto sem conta travaria o atalho da parte em dinheiro,
    -- que nao tem nada a ver com ela.
    if exists (
      select 1 from public.lancamento_parcelas
      where lancamento_id = p_lanc_id
        and lancamento_forma_id is not distinct from v_bloco.bloco
        and status = 'pendente'
        and conta_bancaria_id is null
    ) then
      continue;
    end if;

    -- DINHEIRO E CARTAO, o mesmo ramo: nenhum dos dois passa pela fila de
    -- aprovacao, e os dois nascem 'aprovado' -- ou seja, pagaveis JA em
    -- Pagamentos, com a data autorizada vindo do vencimento.
    --
    -- O cartao deixou de nascer 'pago' em 21/08/2026: compra em 12x nao sai do
    -- caixa na data da compra, sai na fatura, parcela por parcela. Quitar tudo
    -- na compra dava data de pagamento errada em 11 das 12 parcelas.
    if v_bloco.tipo in ('dinheiro', 'cartao_credito') then
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
    end if;
    -- bancario e cheque: nada a fazer. A parcela fica pendente e e isso que a
    -- faz aparecer na fila de aprovacao.
  end loop;

  -- O status do lancamento e DERIVADO: com formas de tipos diferentes ele pode
  -- ter parte aprovada e parte esperando ao mesmo tempo, e so a contagem das
  -- parcelas sabe dizer o que ele e.
  perform public.fn_recalcular_status_lancamento(p_lanc_id);
end;
$function$;

revoke all on function public.fn_aplicar_regra_pagamento(uuid) from public, anon;
grant execute on function public.fn_aplicar_regra_pagamento(uuid) to authenticated;

-- -------------------------------------------------------------
-- Conserto das parcelas presas em 'pendente' por causa do curto-circuito.
--
-- Mesmo escopo que a funcao usaria: cartao, pendente, com conta bancaria
-- escolhida, lancamento a_pagar nao cancelado. `aprovado_por` fica nulo de
-- proposito: ninguem aprovou estas parcelas, foi a regra -- inventar um
-- aprovador seria mentir na auditoria. `data_programada` vem do vencimento, que
-- e o mesmo que a regra faz, e satisfaz o check
-- lancamento_parcelas_programada_quando_aprovada.
-- -------------------------------------------------------------
update public.lancamento_parcelas p
set status = 'aprovado',
    aprovado_em = now(),
    data_programada = coalesce(
      p.data_vencimento, (now() at time zone 'America/Rio_Branco')::date
    ),
    data_programada_origem = 'vencimento'
from public.lancamentos l,
     public.lancamento_formas lf,
     public.formas_pagamento f
where l.id = p.lancamento_id
  and lf.id = p.lancamento_forma_id
  and f.id = lf.forma_pagamento_id
  and f.tipo = 'cartao_credito'
  and p.status = 'pendente'
  and p.conta_bancaria_id is not null
  and l.tipo = 'a_pagar'
  and l.status <> 'cancelado';
