-- Dividas: quitacao antecipada paga pelo lancamento.
--
-- Caso real (BB 023.409.504): o banco cobrou o saldo em 22/10/2026 e o
-- financeiro editou a parcela 42 do lancamento (vencia 05/11) para o valor
-- da quitacao, pagou, e apagou as parcelas 43 a 49. O contrato ficou ativo
-- com o saldo das linhas 43 a 49, e registrar a Quitacao em 22/10 recusava
-- com "Ha parcela paga depois de 22/10": a trava olhava o vencimento da
-- LINHA do cronograma (05/11), nao a data em que a parcela foi paga.
--
-- Muda so essa trava, e so na quitacao: parcela paga ate a data do evento e
-- o pagamento da quitacao. O resto da funcao e o mesmo de
-- 20261012180641_dividas_correcoes_revisao.sql. create or replace mantem os
-- grants.

create or replace function public.fn_registrar_evento_contrato(
  p_contrato uuid, p_tipo text, p_data date, p_valor numeric, p_motivo text, p_linhas jsonb default null)
returns int language plpgsql security definer set search_path to '' as $function$
declare
  d public.contratos_divida; v_ant int; v_nova int; v_saldo numeric; v_novo numeric;
  v_mantidas jsonb; v_evento jsonb; v_resto jsonb := '[]'::jsonb; v_prox int; v_faltam int; v_venc date;
  v_soma numeric;
begin
  if not public.tem_permissao('financeiro.dividas', 'editar') then raise exception 'Sem permissao para editar contratos de divida'; end if;
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
  insert into public.contrato_divida_eventos (contrato_id, tipo, data, valor, motivo, versao_anterior, versao_nova)
  values (p_contrato, p_tipo, p_data, p_valor, btrim(p_motivo), v_ant, v_nova);
  if v_novo = 0 then
    update public.contratos_divida set status = 'quitado' where id = p_contrato;
  end if;
  return v_nova;
end;
$function$;
