-- =============================================================
-- Juros e multa na parcela
--
-- POR QUE AGORA. A carga do historico trouxe R$ 788,71 de juros em 3 parcelas
-- que nao tinham onde entrar, e o ERP ficou mostrando R$ 788,71 menos de saida
-- de caixa que o maiscontrole. Pior que a diferenca: sem o campo, TODO juros
-- futuro entraria como zero em silencio, e a tela de posicao bancaria mentiria
-- um pouco mais a cada boleto pago com atraso.
--
-- valor_liquido PASSA A SER `valor - desconto + juros`.
--
-- Isso nao e uma escolha de conveniencia: `valor_liquido` ja era, por
-- definicao e pelo comentario dentro de fn_pagar_parcela, "o que de fato sai do
-- caixa". Enquanto juros nao existia, valor - desconto era a resposta certa
-- para essa pergunta; com juros, deixou de ser. As 8 funcoes que leem
-- valor_liquido (posicao bancaria, fluxo de caixa, conciliacao, resumo de
-- gestao, folha, importacao do lote 09) passam a estar corretas sem mudar uma
-- linha, porque todas querem exatamente isso.
--
-- Coluna GERADA nao aceita ALTER da expressao, entao sai e volta. Nao ha indice
-- nem view sobre ela (conferido), e as funcoes resolvem o nome em tempo de
-- execucao, entao nada quebra. Em transacao, e atomico.
--
-- A CONCILIACAO melhora de graca: ela casa extrato com parcela por valor, e o
-- extrato traz o que saiu com juros. Antes, boleto pago com multa nunca casava.
-- =============================================================

alter table public.lancamento_parcelas
  add column if not exists juros numeric(14,2) not null default 0;

alter table public.lancamento_parcelas
  drop constraint if exists lancamento_parcelas_juros_valido;
alter table public.lancamento_parcelas
  add constraint lancamento_parcelas_juros_valido check (juros >= 0);

comment on column public.lancamento_parcelas.juros is
  'Juros e multa pagos junto com a parcela, em reais. Entram no valor_liquido (o que sai do caixa) e nao mexem no valor devido da parcela.';

-- Redefine valor_liquido para incluir juros.
alter table public.lancamento_parcelas drop column valor_liquido;
alter table public.lancamento_parcelas
  add column valor_liquido numeric(14,2)
  generated always as (valor - desconto + juros) stored;

comment on column public.lancamento_parcelas.valor_liquido is
  'O que de fato sai (ou entra) na conta bancaria: valor - desconto + juros. E este numero que bate com o extrato, e nao o valor devido da parcela.';

-- Os 3 juros do historico, vindos do export em nivel de parcela do
-- maiscontrole. Casados por fornecedor + vencimento + valor, como os descontos.
with j(forn, venc, valor, juros) as (values
('VIBRA ENERGIA S.A','2025-09-06'::date,28589.50::numeric,762.40::numeric),
('INSTITUTO SANTA TERESINHA','2026-02-10',1075.00,26.30),
('MEGA AUTO PECAS','2025-09-02',2333.33,0.01)
),
alvo as (
  select p.id, j.juros
  from j
  join public.fornecedores f
    on public.fn_chave_nome(f.razao_social) = public.fn_chave_nome(j.forn)
    or public.fn_chave_nome(coalesce(f.nome_fantasia,'')) = public.fn_chave_nome(j.forn)
  join public.lancamentos l on l.fornecedor_id = f.id
  join public.lancamento_parcelas p
    on p.lancamento_id = l.id and p.data_vencimento = j.venc and p.valor = j.valor
)
update public.lancamento_parcelas p
set juros = a.juros
from alvo a
where p.id = a.id;

-- fn_pagar_parcela aceita juros. A versao de 4 argumentos sai de cena: mantida,
-- o app poderia seguir chamando ela e o juros ficaria zero calado, que e
-- exatamente o defeito que esta migration existe para fechar.
drop function if exists public.fn_pagar_parcela(uuid, uuid, date, numeric);

create or replace function public.fn_pagar_parcela(
  p_parcela_id uuid,
  p_conta_id uuid,
  p_data_pagamento date,
  p_desconto numeric default 0,
  p_juros numeric default 0
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

    if v_janela = 'a_partir' then
      if v_hoje < v_programada then
        raise exception 'Pagamento autorizado a partir de %.',
          to_char(v_programada, 'DD/MM/YYYY');
      end if;
    else
      if v_hoje < v_programada then
        raise exception 'Pagamento autorizado para %.',
          to_char(v_programada, 'DD/MM/YYYY');
      elsif v_hoje > v_programada then
        raise exception 'A data autorizada (%) passou: reprograme a data antes de pagar.',
          to_char(v_programada, 'DD/MM/YYYY');
      end if;
    end if;
  else
    if not public.tem_permissao('financeiro.contas-receber', 'editar') then
      raise exception 'Sem permissao para baixar recebimentos';
    end if;
    if v_status not in ('pendente', 'aprovado') then
      raise exception 'Parcela ja baixada ou cancelada';
    end if;
  end if;

  -- Desconto e juros do ato do pagamento. As duas recusas ficam DEPOIS do bloco
  -- de permissao de proposito: a segunda mensagem CITA O VALOR da parcela, e
  -- barreira que responde antes de checar quem chama nao e barreira (um token
  -- valido com zero permissao lia o valor de qualquer parcela, um id por vez).
  v_desconto := round(coalesce(p_desconto, 0), 2);
  v_juros := round(coalesce(p_juros, 0), 2);

  if v_desconto < 0 then
    raise exception 'O desconto nao pode ser negativo.';
  end if;

  if v_juros < 0 then
    raise exception 'Os juros nao podem ser negativos.';
  end if;

  if v_desconto > v_valor then
    raise exception 'O desconto (R$ %) nao pode ser maior que o valor da parcela (R$ %).',
      round(v_desconto, 2), round(v_valor, 2);
  end if;

  -- O que de fato sai do caixa. v_valor continua sendo a divida, que desconto e
  -- juros nao reescrevem.
  v_liquido := round(v_valor - v_desconto + v_juros, 2);

  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;

  if v_tipo = 'a_pagar' then
    -- Saldo derivado das parcelas JA pagas nesta conta, por valor_liquido: com
    -- valor cheio, parcela paga com desconto rebaixaria o saldo desta guarda a
    -- cada conferencia e recusaria pagamento que cabe na conta.
    select c.saldo_inicial
      + coalesce(sum(case when l.tipo = 'a_receber' then p.valor_liquido else -p.valor_liquido end), 0)
    into v_saldo
    from public.contas_bancarias c
    left join public.lancamento_parcelas p on p.conta_bancaria_id = c.id and p.status = 'pago'
    left join public.lancamentos l on l.id = p.lancamento_id
    where c.id = p_conta_id
    group by c.saldo_inicial;

    -- Compara com o liquido, que ja inclui os juros: e ele que sai da conta.
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
      pago_por = (select auth.uid()), pago_em = now()
  where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);

  perform public.fn_propagar_anexos('lancamento', v_lanc, 'pagamento', p_parcela_id);
end;
$function$;

revoke all on function public.fn_pagar_parcela(uuid, uuid, date, numeric, numeric) from public, anon;
grant execute on function public.fn_pagar_parcela(uuid, uuid, date, numeric, numeric) to authenticated;

-- O saldo deriva de valor_liquido, que acabou de mudar de formula.
update public.contas_bancarias c
set saldo_inicial = coalesce((
  select sum(case when l.tipo = 'a_receber' then -p.valor_liquido else p.valor_liquido end)
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.conta_bancaria_id = c.id and p.status = 'pago'
), 0);
