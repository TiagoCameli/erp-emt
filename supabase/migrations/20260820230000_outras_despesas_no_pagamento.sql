-- =============================================================
-- Outras despesas no pagamento, e o estorno que apagava metade
--
-- POR QUE AGORA. Quem paga um boleto atrasado paga tres coisas alem do valor:
-- juros, multa e o que o banco cobra por fora (tarifa, cartorio, protesto). O
-- campo `juros` (11/08) cobriu as duas primeiras. A terceira nao tinha onde
-- entrar, e sem campo ela entrava como zero em silencio -- o mesmo defeito que
-- a migration do juros existiu para fechar, uma casa adiante.
--
-- valor_liquido PASSA A SER `valor - desconto + juros + outras_despesas`.
--
-- Mesma justificativa da vez anterior, e nao conveniencia: `valor_liquido` e,
-- por definicao, "o que de fato sai do caixa". Tarifa paga junto com o boleto
-- sai do caixa. As funcoes que leem valor_liquido (posicao bancaria, fluxo de
-- caixa, conciliacao, resumo de gestao, folha) passam a estar corretas sem
-- mudar uma linha, porque todas querem exatamente isso.
--
-- Coluna GERADA nao aceita ALTER da expressao, entao sai e volta. Conferido em
-- 20/08/2026: nenhum indice e nenhuma view dependem de valor_liquido, desconto
-- ou juros (pg_index + pg_depend/pg_rewrite sobre lancamento_parcelas), e as
-- funcoes resolvem o nome em tempo de execucao. Em transacao, e atomico.
--
-- SEM RECALIBRAR saldo_inicial, ao contrario da migration do juros: lá havia
-- R$ 788,71 de juros historico entrando na formula no mesmo passo. Aqui a
-- coluna nova nasce zerada em TODAS as linhas, entao nenhum valor_liquido muda
-- de numero e nenhum saldo se move. Mexer em saldo_inicial sem numero mudando
-- seria inventar movimento.
--
-- DE BRINDE, um defeito pre-existente: `fn_estornar_pagamento` zerava
-- `desconto` e NAO zerava `juros`. Parcela estornada voltava para a fila
-- carregando os juros do pagamento desfeito, e o valor_liquido dela seguia
-- inflado pelo dinheiro de um pagamento que nao existe mais. Passa a zerar os
-- tres, que e o que "desfazer o pagamento" sempre quis dizer.
-- =============================================================

alter table public.lancamento_parcelas
  add column if not exists outras_despesas numeric(14,2) not null default 0;

alter table public.lancamento_parcelas
  drop constraint if exists lancamento_parcelas_outras_despesas_valido;
alter table public.lancamento_parcelas
  add constraint lancamento_parcelas_outras_despesas_valido
  check (outras_despesas >= 0);

comment on column public.lancamento_parcelas.outras_despesas is
  'Despesas pagas junto com a parcela que nao sao juros nem multa (tarifa bancaria, cartorio, protesto), em reais. Entram no valor_liquido (o que sai do caixa) e nao mexem no valor devido da parcela.';

-- Redefine valor_liquido para incluir outras despesas.
alter table public.lancamento_parcelas drop column valor_liquido;
alter table public.lancamento_parcelas
  add column valor_liquido numeric(14,2)
  generated always as (valor - desconto + juros + outras_despesas) stored;

comment on column public.lancamento_parcelas.valor_liquido is
  'O que de fato sai (ou entra) na conta bancaria: valor - desconto + juros + outras_despesas. E este numero que bate com o extrato, e nao o valor devido da parcela.';

-- fn_pagar_parcela aceita outras despesas. A versao de 6 argumentos SAI DE
-- CENA: mantida como sobrecarga, o app poderia seguir chamando ela e a despesa
-- ficaria zero calada, que e exatamente o defeito que esta migration fecha.
drop function if exists public.fn_pagar_parcela(uuid, uuid, date, numeric, numeric, text);

create or replace function public.fn_pagar_parcela(
  p_parcela_id uuid,
  p_conta_id uuid,
  p_data_pagamento date,
  p_desconto numeric default 0,
  p_juros numeric default 0,
  p_outras_despesas numeric default 0,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text; v_lanc uuid; v_tipo text; v_valor numeric; v_saldo numeric;
  v_programada date; v_janela text; v_data_informada date; v_status_lanc text;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_desconto numeric(14, 2);
  v_juros numeric(14, 2);
  v_outras numeric(14, 2);
  v_liquido numeric(14, 2);
begin
  select p.status, p.lancamento_id, l.tipo, p.valor, p.data_programada, l.status
  into v_status, v_lanc, v_tipo, v_valor, v_programada, v_status_lanc
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.id = p_parcela_id;

  if v_status is null then raise exception 'Parcela nao encontrada'; end if;

  if v_status_lanc = 'cancelado' then
    raise exception 'Este lancamento esta cancelado: nao da para pagar esta parcela';
  end if;

  v_data_informada := coalesce(p_data_pagamento, v_hoje);

  if v_data_informada > v_hoje then
    raise exception 'A data do pagamento nao pode ser no futuro (hoje e %).',
      to_char(v_hoje, 'DD/MM/YYYY');
  end if;

  if v_tipo = 'a_pagar' then
    if not public.tem_permissao('financeiro.pagamentos', 'criar') then
      raise exception 'Sem permissao para registrar pagamentos';
    end if;
    if v_status = 'em_revisao' then
      raise exception 'Esta parcela esta em revisao: ela precisa ser reenviada e aprovada antes de pagar';
    end if;
    if v_status <> 'aprovado' then
      raise exception 'A parcela precisa estar aprovada para pagamento';
    end if;

    if v_programada is null then
      raise exception 'Esta parcela esta aprovada sem data programada: reprograme a data antes de pagar';
    end if;

    v_janela := public.fn_janela_pagamento();

    if v_data_informada <> v_programada then
      if coalesce(btrim(p_motivo), '') = '' then
        raise exception 'Este pagamento esta fora da data autorizada (%): informe o motivo.',
          to_char(v_programada, 'DD/MM/YYYY');
      end if;
    end if;
  else
    if not public.tem_permissao('financeiro.recebimentos', 'editar') then
      raise exception 'Sem permissao para dar recebimento como recebido';
    end if;
    if v_status not in ('pendente', 'aprovado') then
      raise exception 'Recebimento ja baixado ou cancelado';
    end if;
  end if;

  -- Desconto, juros e outras despesas do ato do pagamento. As recusas ficam
  -- DEPOIS do bloco de permissao de proposito: a do desconto CITA O VALOR da
  -- parcela, e barreira que responde antes de checar quem chama nao e barreira.
  v_desconto := round(coalesce(p_desconto, 0), 2);
  v_juros := round(coalesce(p_juros, 0), 2);
  v_outras := round(coalesce(p_outras_despesas, 0), 2);

  if v_desconto < 0 then
    raise exception 'O desconto nao pode ser negativo.';
  end if;

  if v_juros < 0 then
    raise exception 'Os juros nao podem ser negativos.';
  end if;

  if v_outras < 0 then
    raise exception 'As outras despesas nao podem ser negativas.';
  end if;

  if v_desconto > v_valor then
    raise exception 'O desconto (R$ %) nao pode ser maior que o valor da parcela (R$ %).',
      round(v_desconto, 2), round(v_valor, 2);
  end if;

  -- O que de fato sai do caixa. v_valor continua sendo a divida, que desconto,
  -- juros e despesa nao reescrevem.
  v_liquido := round(v_valor - v_desconto + v_juros + v_outras, 2);

  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;

  if v_tipo = 'a_pagar' then
    -- Saldo derivado das parcelas JA pagas nesta conta, por valor_liquido.
    select c.saldo_inicial
      + coalesce(sum(case when l.tipo = 'a_receber' then p.valor_liquido else -p.valor_liquido end), 0)
    into v_saldo
    from public.contas_bancarias c
    left join public.lancamento_parcelas p on p.conta_bancaria_id = c.id and p.status = 'pago'
    left join public.lancamentos l on l.id = p.lancamento_id
    where c.id = p_conta_id
    group by c.saldo_inicial;

    -- Compara com o liquido, que ja inclui juros e despesa: e ele que sai.
    if coalesce(v_saldo, 0) - v_liquido < 0 then
      raise exception 'Saldo insuficiente na conta: saldo atual R$ %, pagamento de R$ %.',
        round(coalesce(v_saldo, 0), 2), round(v_liquido, 2);
    end if;
  end if;

  update public.lancamento_parcelas
  set status = 'pago', conta_bancaria_id = p_conta_id,
      data_pagamento = v_data_informada,
      desconto = v_desconto,
      juros = v_juros,
      outras_despesas = v_outras,
      pago_por = (select auth.uid()), pago_em = now()
  where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);

  if v_tipo = 'a_pagar' and v_data_informada <> v_programada then
    insert into public.parcela_eventos
      (parcela_id, tipo, motivo, data_de, data_para, created_by)
    values
      (p_parcela_id, 'pagou_fora_da_janela', btrim(p_motivo),
       v_programada, v_data_informada, (select auth.uid()));
  end if;

  perform public.fn_propagar_anexos('lancamento', v_lanc, 'pagamento', p_parcela_id);
end;
$function$;

-- Funcao nova ja nasce com EXECUTE para PUBLIC: sem o revoke, o anon entra.
revoke all on function public.fn_pagar_parcela(uuid, uuid, date, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.fn_pagar_parcela(uuid, uuid, date, numeric, numeric, numeric, text) to authenticated;

-- Estorno desfaz o pagamento INTEIRO: os tres ajustes do ato de pagar somem
-- junto com a data e a conta. Antes so o desconto sumia.
create or replace function public.fn_estornar_pagamento(p_parcela_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_status text; v_lanc uuid; v_tipo text;
begin
  if not public.tem_permissao('financeiro.pagamentos', 'excluir') then
    raise exception 'Sem permissao para estornar pagamentos';
  end if;
  select p.status, p.lancamento_id, l.tipo into v_status, v_lanc, v_tipo
    from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
    where p.id = p_parcela_id;
  if v_status is null then raise exception 'Parcela nao encontrada'; end if;
  if v_status <> 'pago' then raise exception 'Esta parcela nao esta paga'; end if;
  if exists (select 1 from public.extrato_transacoes t where t.parcela_id = p_parcela_id) then
    raise exception 'Nao da para estornar: este pagamento esta conciliado. Desfaca a conciliacao primeiro';
  end if;
  update public.lancamento_parcelas
    set status = case when v_tipo = 'a_pagar' then 'aprovado' else 'pendente' end,
        conta_bancaria_id = null, data_pagamento = null, pago_por = null, pago_em = null,
        desconto = 0, juros = 0, outras_despesas = 0
    where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);
end $function$;

revoke all on function public.fn_estornar_pagamento(uuid) from public, anon;
grant execute on function public.fn_estornar_pagamento(uuid) to authenticated;
