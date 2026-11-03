-- Dividas: contrato pago ate o fim do prazo tambem vira quitado sozinho.
--
-- Pedido do Tiago (03/11/2026), depois da quitacao automatica
-- (20261103160719): o contrato que termina no prazo, parcela a parcela,
-- ficava ativo com saldo zero. Agora, quando o lancamento ligado fica todo
-- pago e toda linha do cronograma tem a parcela paga, o contrato fica
-- quitado com um evento de quitacao automatico na data do ultimo pagamento,
-- sem valor e sem versao nova (versao anterior = nova): o cronograma nao
-- muda, entao saldo, juros e DRE tambem nao.
--
-- O estorno desfaz igual a quitacao antecipada automatica, mas sem copiar
-- cronograma: so volta o status para ativo, com o evento `cronograma`.
--
-- So muda fn_contrato_sincronizar_lancamento; o resto e o de 20261103160719.
-- Em 03/11/2026 nenhum contrato esta nessa situacao: a carga do fim nao muda nada.

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
      select * into e from public.contrato_divida_eventos where contrato_id = d.id order by versao_nova desc, created_at desc limit 1;
      if e.id is null or e.tipo <> 'quitacao' or not e.automatico
         or e.versao_nova is distinct from public.fn_contrato_versao_atual(d.id) then
        continue;
      end if;
      -- Termino no prazo nao mexeu no cronograma (versao anterior = nova):
      -- so volta o status. A quitacao antecipada volta a versao de antes.
      if e.versao_anterior = e.versao_nova then
        v_nova := e.versao_nova;
      else
        select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'numero', c.numero, 'vencimento', c.vencimento,
                 'principal', c.principal, 'juros', c.juros, 'encargos', c.encargos, 'saldoApos', c.saldo_apos) order by c.ordem)
          into v_linhas
        from public.contrato_divida_cronograma c where c.contrato_id = d.id and c.versao = e.versao_anterior;
        v_nova := public.fn_contrato_gravar_versao(d.id, v_linhas);
      end if;
      insert into public.contrato_divida_eventos (contrato_id, tipo, data, valor, motivo, versao_anterior, versao_nova, automatico)
      values (d.id, 'cronograma', (now() at time zone 'America/Rio_Branco')::date, null,
              format('Quitacao automatica desfeita: o %s voltou a ter parcela em aberto', coalesce(v_lanc.numero, 'lancamento')),
              e.versao_nova, v_nova, true);
      update public.contratos_divida set status = 'ativo' where id = d.id;
      continue;
    end if;

    if v_lanc.id is null or v_lanc.status = 'cancelado' or v_n = 0 or v_abertas > 0 then continue; end if;
    if public.fn_contrato_versao_atual(d.id) is null then continue; end if;
    -- Pago ate o fim do prazo: toda linha tem a parcela paga. O cronograma ja
    -- conta a historia inteira; o evento so registra o fim e muda o status.
    if not exists (select 1 from public.contrato_divida_cronograma c
                    where c.contrato_id = d.id and c.substituida_em is null and c.tipo = 'parcela'
                      and not exists (select 1 from public.lancamento_parcelas p
                                       where p.lancamento_id = p_lancamento and p.numero_parcela = c.numero and p.status = 'pago')) then
      v_nova := public.fn_contrato_versao_atual(d.id);
      insert into public.contrato_divida_eventos (contrato_id, tipo, data, valor, motivo, versao_anterior, versao_nova, automatico)
      values (d.id, 'quitacao', v_data, null,
              format('Contrato pago ate o fim: %s todo pago, ultimo pagamento em %s', v_lanc.numero, to_char(v_data, 'DD/MM/YYYY')),
              v_nova, v_nova, true);
      update public.contratos_divida set status = 'quitado' where id = d.id;
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

select public.fn_contrato_sincronizar_lancamento(d.lancamento_id)
from public.contratos_divida d
where d.lancamento_id is not null and d.status <> 'quitado';
