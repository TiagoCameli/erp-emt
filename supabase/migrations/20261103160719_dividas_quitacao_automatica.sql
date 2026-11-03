-- Dividas: o contrato quita sozinho quando o lancamento ligado fica todo pago.
--
-- Pedido do Tiago: "por que eu preciso registrar a quitacao se ja foi feito o
-- pagamento no financeiro". O BB 023.409.504 foi quitado em 22/10/2026 pela
-- parcela 42 do LAN-2026-6867 (o financeiro editou a parcela para o valor da
-- quitacao e apagou as 43 a 49) e o contrato ficou ativo com o saldo das
-- linhas que nao tem mais parcela.
--
-- Regra (fn_contrato_sincronizar_lancamento, chamada por gatilho no fim da
-- transacao que paga, estorna ou apaga parcela):
--   * Quitacao automatica quando o lancamento ligado nao esta cancelado, tem
--     parcela e todas pagas, e o cronograma ainda tem linha sem parcela paga.
--     Data = o ultimo pagamento. Valor = o que foi pago nas parcelas que nao
--     sao de linha que vence ate essa data (a parcela da quitacao).
--     So grava se o valor fica entre o saldo devedor na data e o saldo mais
--     os juros que faltavam: abaixo do saldo nao e quitacao (o resto foi para
--     outro lugar), acima de pagar tudo ate o fim nao faz sentido. Fora disso,
--     ou se o evento recusar, o contrato fica ativo e a quitacao e pela tela;
--     o pagamento nunca e bloqueado por causa do contrato.
--   * Estorno desfaz: contrato quitado pela automatica, cuja quitacao ainda e
--     o ultimo evento, volta para o cronograma de antes (versao nova, copia da
--     anterior) e para ativo quando o lancamento volta a ter parcela em aberto.
--     Quitacao feita pela tela nao e desfeita por aqui. Se desfazer falhar, o
--     estorno falha junto: contrato quitado com parcela em aberto no
--     financeiro e numero errado de divida.
--
-- O corpo de fn_registrar_evento_contrato vira fn_contrato_registrar_evento
-- (sem a checagem de permissao, fechada para todos): quem paga a parcela pode
-- nao ter financeiro.dividas/editar, e a quitacao automatica e consequencia
-- do pagamento, nao uma edicao do contrato. A RPC da tela continua checando e
-- chama a interna.

alter table public.contrato_divida_eventos add column automatico boolean not null default false;
comment on column public.contrato_divida_eventos.automatico is
  'Gravado pelo sistema a partir do lancamento ligado (quitacao automatica e o desfazer dela), nao pela tela.';

create or replace function public.fn_contrato_registrar_evento(
  p_contrato uuid, p_tipo text, p_data date, p_valor numeric, p_motivo text, p_linhas jsonb, p_automatico boolean)
returns int language plpgsql security definer set search_path to '' as $function$
declare
  d public.contratos_divida; v_ant int; v_nova int; v_saldo numeric; v_novo numeric;
  v_mantidas jsonb; v_evento jsonb; v_resto jsonb := '[]'::jsonb; v_prox int; v_faltam int; v_venc date;
  v_soma numeric;
begin
  if p_tipo not in ('amortizacao', 'quitacao', 'renegociacao') then raise exception 'Evento % desconhecido', p_tipo; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Informe o motivo do evento'; end if;
  if p_data is null then raise exception 'Informe a data do evento'; end if;
  select * into d from public.contratos_divida where id = p_contrato for update;
  if d.id is null then raise exception 'Contrato nao encontrado'; end if;
  if d.status = 'quitado' then raise exception 'Contrato ja quitado'; end if;
  v_ant := public.fn_contrato_versao_atual(p_contrato);
  if v_ant is null then raise exception 'Gere ou digite o cronograma antes de registrar evento'; end if;
  if p_data < d.data_liberacao then raise exception 'Evento antes da liberacao do contrato'; end if;
  if p_valor is not null and (p_valor < 0 or round(p_valor, 2) <> p_valor) then raise exception 'Valor do evento invalido'; end if;

  v_saldo := public.fn_contrato_saldo_devedor(p_contrato, p_data);
  select coalesce(jsonb_agg(jsonb_build_object('tipo', c.tipo, 'numero', c.numero, 'vencimento', c.vencimento,
           'principal', c.principal, 'juros', c.juros, 'encargos', c.encargos, 'saldoApos', c.saldo_apos)
           order by c.ordem), '[]'::jsonb),
         coalesce(max(c.numero), 0) + 1
    into v_mantidas, v_prox
  from public.contrato_divida_cronograma c
  where c.contrato_id = p_contrato and c.substituida_em is null and c.vencimento <= p_data;
  select count(*), min(c.vencimento) into v_faltam, v_venc from public.contrato_divida_cronograma c
   where c.contrato_id = p_contrato and c.substituida_em is null and c.vencimento > p_data and c.tipo = 'parcela';

  -- O evento precisa cair depois da ultima parcela paga e sem parcela vencida
  -- em aberto antes dele: so assim o saldo do cronograma e o devido de fato.
  -- Na quitacao, a parcela do lancamento paga ate a data do evento e o
  -- proprio pagamento da quitacao (o banco cobra o saldo numa parcela so e o
  -- financeiro edita a proxima parcela para esse valor): ela nao reescreve
  -- nada, porque depois da quitacao nao sobra linha. Amortizacao e
  -- renegociacao continuam recusando: elas renumeram o resto, e a parcela
  -- paga cairia numa linha nova que ninguem pagou.
  if exists (select 1 from public.contrato_divida_cronograma c
              join public.lancamento_parcelas p on p.lancamento_id = d.lancamento_id and p.numero_parcela = c.numero and p.status = 'pago'
              where c.contrato_id = p_contrato and c.substituida_em is null and c.tipo = 'parcela' and c.vencimento > p_data
                and not (p_tipo = 'quitacao' and coalesce(p.data_pagamento, p.data_vencimento) <= p_data)) then
    raise exception 'Ha parcela paga depois de % : o evento nao pode reescrever parcela paga', to_char(p_data, 'DD/MM/YYYY');
  end if;
  if d.lancamento_id is not null and exists (
       select 1 from public.contrato_divida_cronograma c
        where c.contrato_id = p_contrato and c.substituida_em is null and c.tipo = 'parcela' and c.vencimento <= p_data
          and not exists (select 1 from public.lancamento_parcelas p
                           where p.lancamento_id = d.lancamento_id and p.numero_parcela = c.numero and p.status = 'pago')) then
    raise exception 'Ha parcela vencida ate % sem pagamento no lancamento: baixe antes de registrar o evento', to_char(p_data, 'DD/MM/YYYY');
  end if;

  if p_tipo = 'quitacao' then
    if p_valor is null then raise exception 'Informe o valor pago na quitacao'; end if;
    v_novo := 0;
    v_evento := jsonb_build_object('tipo', 'quitacao', 'vencimento', p_data, 'principal', v_saldo,
                                   'juros', greatest(p_valor - v_saldo, 0), 'saldoApos', 0);
  elsif p_tipo = 'amortizacao' then
    if p_valor is null or p_valor <= 0 or p_valor > v_saldo then
      raise exception 'A amortizacao precisa ser maior que zero e ate o saldo devedor (R$ %)', public.fn_conciliacao_brl(v_saldo);
    end if;
    v_novo := v_saldo - p_valor;
    v_evento := jsonb_build_object('tipo', 'amortizacao', 'vencimento', p_data, 'principal', p_valor, 'saldoApos', v_novo);
  else
    v_novo := coalesce(p_valor, v_saldo);
    if p_linhas is null then raise exception 'Informe o cronograma renegociado'; end if;
    v_evento := jsonb_build_object('tipo', 'renegociacao', 'vencimento', p_data, 'principal', greatest(v_saldo - v_novo, 0),
                                   'encargos', greatest(v_novo - v_saldo, 0), 'saldoApos', v_novo);
  end if;

  -- O resto do cronograma depois do evento.
  if v_novo > 0 then
    if p_linhas is not null then
      perform public.fn_contrato_validar_linhas(p_linhas);
      if exists (select 1 from jsonb_array_elements(p_linhas) l where (l->>'vencimento')::date <= p_data) then
        raise exception 'Parcelas novas precisam vencer depois do evento';
      end if;
      select sum((l->>'principal')::numeric) into v_soma from jsonb_array_elements(p_linhas) l;
      if v_soma <> v_novo then
        raise exception 'O principal das parcelas novas soma R$ % e o saldo e R$ %', public.fn_conciliacao_brl(v_soma), public.fn_conciliacao_brl(v_novo);
      end if;
      select jsonb_agg(jsonb_build_object('numero', v_prox - 1 + x.n, 'vencimento', x.venc, 'principal', x.principal,
                       'juros', x.juros, 'encargos', x.encargos, 'saldoApos', v_novo - x.acum) order by x.n)
        into v_resto
      from (
        select row_number() over w as n, (l->>'vencimento')::date as venc, (l->>'principal')::numeric as principal,
               coalesce((l->>'juros')::numeric, 0) as juros, coalesce((l->>'encargos')::numeric, 0) as encargos,
               sum((l->>'principal')::numeric) over (w rows unbounded preceding) as acum
        from jsonb_array_elements(p_linhas) l
        window w as (order by (l->>'vencimento')::date)
      ) x;
    elsif d.sistema in ('price', 'sac') and v_faltam > 0 then
      select jsonb_agg(jsonb_build_object('numero', v_prox - 1 + c.numero, 'vencimento', c.vencimento, 'principal', c.principal,
                       'juros', c.juros, 'saldoApos', c.saldo_apos) order by c.numero)
        into v_resto
      from public.fn_calcular_cronograma(v_novo, d.taxa_am, v_faltam, 0, d.sistema, v_venc) c;
    else
      raise exception 'Informe as parcelas que ficam depois do evento';
    end if;
  end if;

  v_nova := public.fn_contrato_gravar_versao(p_contrato, v_mantidas || jsonb_build_array(v_evento) || v_resto);
  insert into public.contrato_divida_eventos (contrato_id, tipo, data, valor, motivo, versao_anterior, versao_nova, automatico)
  values (p_contrato, p_tipo, p_data, p_valor, btrim(p_motivo), v_ant, v_nova, coalesce(p_automatico, false));
  if v_novo = 0 then
    update public.contratos_divida set status = 'quitado' where id = p_contrato;
  end if;
  return v_nova;
end;
$function$;

revoke all on function public.fn_contrato_registrar_evento(uuid, text, date, numeric, text, jsonb, boolean) from public, anon, authenticated;

-- A RPC da tela: a mesma de antes, agora so a porta com a permissao.
create or replace function public.fn_registrar_evento_contrato(
  p_contrato uuid, p_tipo text, p_data date, p_valor numeric, p_motivo text, p_linhas jsonb default null)
returns int language plpgsql security definer set search_path to '' as $function$
begin
  if not public.tem_permissao('financeiro.dividas', 'editar') then raise exception 'Sem permissao para editar contratos de divida'; end if;
  return public.fn_contrato_registrar_evento(p_contrato, p_tipo, p_data, p_valor, p_motivo, p_linhas, false);
end;
$function$;

create or replace function public.fn_contrato_sincronizar_lancamento(p_lancamento uuid)
returns void language plpgsql security definer set search_path to '' as $function$
declare
  d public.contratos_divida; e public.contrato_divida_eventos;
  v_lanc public.lancamentos; v_n int; v_abertas int; v_data date;
  v_saldo numeric; v_valor numeric; v_teto numeric; v_linhas jsonb; v_nova int;
begin
  if p_lancamento is null then return; end if;
  select * into v_lanc from public.lancamentos where id = p_lancamento;

  for d in select * from public.contratos_divida where lancamento_id = p_lancamento for update loop
    select count(*), count(*) filter (where p.status <> 'pago'),
           max(coalesce(p.data_pagamento, p.data_vencimento)) filter (where p.status = 'pago')
      into v_n, v_abertas, v_data
    from public.lancamento_parcelas p where p.lancamento_id = p_lancamento;

    if d.status = 'quitado' then
      -- Desfaz so a quitacao automatica que ainda e a ultima palavra do contrato.
      if v_lanc.id is not null and v_lanc.status <> 'cancelado' and v_n > 0 and v_abertas = 0 then continue; end if;
      select * into e from public.contrato_divida_eventos where contrato_id = d.id order by versao_nova desc limit 1;
      if e.id is null or e.tipo <> 'quitacao' or not e.automatico
         or e.versao_nova is distinct from public.fn_contrato_versao_atual(d.id) then
        continue;
      end if;
      select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'numero', c.numero, 'vencimento', c.vencimento,
               'principal', c.principal, 'juros', c.juros, 'encargos', c.encargos, 'saldoApos', c.saldo_apos) order by c.ordem)
        into v_linhas
      from public.contrato_divida_cronograma c where c.contrato_id = d.id and c.versao = e.versao_anterior;
      v_nova := public.fn_contrato_gravar_versao(d.id, v_linhas);
      insert into public.contrato_divida_eventos (contrato_id, tipo, data, valor, motivo, versao_anterior, versao_nova, automatico)
      values (d.id, 'cronograma', (now() at time zone 'America/Rio_Branco')::date, null,
              format('Quitacao automatica desfeita: o %s voltou a ter parcela em aberto', coalesce(v_lanc.numero, 'lancamento')),
              e.versao_nova, v_nova, true);
      update public.contratos_divida set status = 'ativo' where id = d.id;
      continue;
    end if;

    if v_lanc.id is null or v_lanc.status = 'cancelado' or v_n = 0 or v_abertas > 0 then continue; end if;
    if public.fn_contrato_versao_atual(d.id) is null then continue; end if;
    if not exists (select 1 from public.contrato_divida_cronograma c
                    where c.contrato_id = d.id and c.substituida_em is null and c.tipo = 'parcela'
                      and not exists (select 1 from public.lancamento_parcelas p
                                       where p.lancamento_id = p_lancamento and p.numero_parcela = c.numero and p.status = 'pago')) then
      continue;
    end if;

    v_saldo := public.fn_contrato_saldo_devedor(d.id, v_data);
    select coalesce(sum(p.valor_liquido), 0) into v_valor
    from public.lancamento_parcelas p
    where p.lancamento_id = p_lancamento and p.status = 'pago'
      and not exists (select 1 from public.contrato_divida_cronograma c
                       where c.contrato_id = d.id and c.substituida_em is null and c.tipo = 'parcela'
                         and c.numero = p.numero_parcela and c.vencimento <= v_data);
    select v_saldo + coalesce(sum(c.juros + c.encargos), 0) into v_teto
    from public.contrato_divida_cronograma c
    where c.contrato_id = d.id and c.substituida_em is null and c.vencimento > v_data;
    if v_valor < v_saldo or v_valor > v_teto then continue; end if;

    -- Recusa do evento (parcela vencida sem pagamento no cronograma, numeracao
    -- que nao casa) deixa o contrato ativo para a tela: nao derruba o pagamento.
    begin
      perform public.fn_contrato_registrar_evento(d.id, 'quitacao', v_data, v_valor,
        format('Quitacao automatica: %s todo pago, ultimo pagamento em %s', v_lanc.numero, to_char(v_data, 'DD/MM/YYYY')),
        null, true);
    exception when others then
      raise warning 'Quitacao automatica do contrato % nao gravada: %', d.numero, sqlerrm;
    end;
  end loop;
end;
$function$;

revoke all on function public.fn_contrato_sincronizar_lancamento(uuid) from public, anon, authenticated;

create or replace function public.trg_contrato_sincronizar_lancamento()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  perform public.fn_contrato_sincronizar_lancamento(coalesce(new.lancamento_id, old.lancamento_id));
  return null;
end;
$function$;

revoke all on function public.trg_contrato_sincronizar_lancamento() from public, anon, authenticated;

-- Adiado para o fim da transacao: editar parcelas apaga e grava em varios
-- passos, e no meio deles o lancamento pode parecer todo pago.
create constraint trigger trg_contrato_quitacao_pelo_pagamento
  after update of status on public.lancamento_parcelas
  deferrable initially deferred
  for each row
  when (old.status is distinct from new.status and 'pago' in (old.status, new.status))
  execute function public.trg_contrato_sincronizar_lancamento();

create constraint trigger trg_contrato_quitacao_pela_exclusao
  after delete on public.lancamento_parcelas
  deferrable initially deferred
  for each row
  execute function public.trg_contrato_sincronizar_lancamento();

-- O que ja esta pago e ainda aparece em aberto (em 03/11/2026, so o BB 023.409.504).
select public.fn_contrato_sincronizar_lancamento(d.lancamento_id)
from public.contratos_divida d
where d.lancamento_id is not null and d.status <> 'quitado';
