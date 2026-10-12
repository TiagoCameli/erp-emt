-- Dividas: correcoes da revisao do PR 5 (12/10/2026).
-- 1. Ordem explicita das linhas do cronograma (dois eventos no mesmo dia).
-- 2. Evento nao pode reescrever parcela ja paga nem passar por parcela vencida
--    sem pagamento (o saldo do evento e o de Creditos ficam iguais).
-- 3. Juros da quitacao e encargos da renegociacao entram no DRE; encargo
--    capitalizado nao conta como juros pago em Creditos.
-- 4. Categorias achadas por nome e tipo; um lancamento so liga a um contrato
--    ou a uma cota; contrato quitado nao troca cronograma; termos do contrato
--    mudam o cronograma junto (ou recusam com parcela paga).
-- 5. Validacao de duas casas e vencimento repetido nas linhas digitadas.

alter table public.contrato_divida_cronograma add column ordem int not null default 0;


create or replace function public.fn_contrato_saldo_devedor(p_contrato uuid, p_data date)
returns numeric language sql stable set search_path to '' as $function$
  select coalesce(
    (select c.saldo_apos from public.contrato_divida_cronograma c
      where c.contrato_id = p_contrato and c.substituida_em is null and c.vencimento <= p_data
      order by c.ordem desc limit 1),
    (select d.valor_liberado from public.contratos_divida d where d.id = p_contrato));
$function$;

create or replace function public.fn_contrato_gravar_versao(p_contrato uuid, p_linhas jsonb)
returns int language plpgsql security definer set search_path to '' as $function$
declare v_versao int;
begin
  select coalesce(max(c.versao), 0) + 1 into v_versao from public.contrato_divida_cronograma c where c.contrato_id = p_contrato;
  update public.contrato_divida_cronograma set substituida_em = now()
   where contrato_id = p_contrato and substituida_em is null;
  insert into public.contrato_divida_cronograma (contrato_id, versao, ordem, tipo, numero, vencimento, principal, juros, encargos, saldo_apos)
  select p_contrato, v_versao, o::int, coalesce(l->>'tipo', 'parcela'), (l->>'numero')::smallint, (l->>'vencimento')::date,
         (l->>'principal')::numeric, coalesce((l->>'juros')::numeric, 0), coalesce((l->>'encargos')::numeric, 0),
         (l->>'saldoApos')::numeric
  from jsonb_array_elements(p_linhas) with ordinality as e(l, o);
  return v_versao;
end;
$function$;

-- Linhas digitadas (cronograma do banco, parcelas depois de evento): data,
-- valores nao negativos com ate duas casas, sem vencimento repetido.
create or replace function public.fn_contrato_validar_linhas(p_linhas jsonb)
returns void language plpgsql immutable set search_path to '' as $function$
begin
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'Informe as parcelas do cronograma'; end if;
  if exists (select 1 from jsonb_array_elements(p_linhas) l
              where (l->>'vencimento') is null or coalesce((l->>'principal')::numeric, -1) < 0
                 or coalesce((l->>'juros')::numeric, 0) < 0 or coalesce((l->>'encargos')::numeric, 0) < 0
                 or round((l->>'principal')::numeric, 2) <> (l->>'principal')::numeric
                 or round(coalesce((l->>'juros')::numeric, 0), 2) <> coalesce((l->>'juros')::numeric, 0)
                 or round(coalesce((l->>'encargos')::numeric, 0), 2) <> coalesce((l->>'encargos')::numeric, 0)) then
    raise exception 'Parcela do cronograma sem vencimento, com valor negativo ou mais de duas casas';
  end if;
  if (select count(distinct (l->>'vencimento')::date) from jsonb_array_elements(p_linhas) l) <> jsonb_array_length(p_linhas) then
    raise exception 'Duas parcelas com o mesmo vencimento';
  end if;
end;
$function$;

create or replace function public.fn_contrato_exigir_troca_livre(p_contrato uuid, p_motivo text)
returns int language plpgsql stable set search_path to '' as $function$
declare v_atual int := public.fn_contrato_versao_atual(p_contrato);
begin
  if (select d.status from public.contratos_divida d where d.id = p_contrato) = 'quitado' then
    raise exception 'Contrato quitado: o cronograma nao muda';
  end if;
  if v_atual is not null then
    if nullif(btrim(p_motivo), '') is null then raise exception 'Informe o motivo para trocar o cronograma'; end if;
    -- Linha de evento (amortizacao, quitacao, renegociacao) tambem trava: a
    -- troca livre apagaria o evento.
    if public.fn_contrato_parcelas_pagas(p_contrato) > 0
       or exists (select 1 from public.contrato_divida_cronograma c
                   where c.contrato_id = p_contrato and c.substituida_em is null and c.tipo <> 'parcela') then
      raise exception 'O contrato ja tem parcela paga: troque o cronograma por amortizacao ou renegociacao';
    end if;
  end if;
  return v_atual;
end;
$function$;

create or replace function public.fn_salvar_cronograma_contrato(p_contrato uuid, p_linhas jsonb, p_motivo text default null)
returns int language plpgsql security definer set search_path to '' as $function$
declare d public.contratos_divida; v_ant int; v_nova int; v_soma numeric; v_n int; v_linhas jsonb;
begin
  if not public.tem_permissao('financeiro.dividas', 'editar') then raise exception 'Sem permissao para editar contratos de divida'; end if;
  select * into d from public.contratos_divida where id = p_contrato for update;
  if d.id is null then raise exception 'Contrato nao encontrado'; end if;
  perform public.fn_contrato_validar_linhas(p_linhas);
  v_ant := public.fn_contrato_exigir_troca_livre(p_contrato, p_motivo);

  select count(*), sum((l->>'principal')::numeric) into v_n, v_soma from jsonb_array_elements(p_linhas) l;
  if v_soma <> d.valor_liberado then
    raise exception 'O principal das parcelas soma R$ % e o valor liberado e R$ %',
      public.fn_conciliacao_brl(v_soma), public.fn_conciliacao_brl(d.valor_liberado);
  end if;
  select jsonb_agg(jsonb_build_object('numero', x.n, 'vencimento', x.venc, 'principal', x.principal, 'juros', x.juros,
                   'encargos', x.encargos, 'saldoApos', d.valor_liberado - x.acum) order by x.n)
    into v_linhas
  from (
    select row_number() over w as n, (l->>'vencimento')::date as venc, (l->>'principal')::numeric as principal,
           coalesce((l->>'juros')::numeric, 0) as juros, coalesce((l->>'encargos')::numeric, 0) as encargos,
           sum((l->>'principal')::numeric) over (w rows unbounded preceding) as acum
    from jsonb_array_elements(p_linhas) l
    window w as (order by (l->>'vencimento')::date)
  ) x;
  v_nova := public.fn_contrato_gravar_versao(p_contrato, v_linhas);
  insert into public.contrato_divida_eventos (contrato_id, tipo, data, motivo, versao_anterior, versao_nova)
  values (p_contrato, 'cronograma', (now() at time zone 'America/Rio_Branco')::date,
          coalesce(nullif(btrim(p_motivo), ''), 'Cronograma do banco digitado'), v_ant, v_nova);
  return v_nova;
end;
$function$;

create or replace function public.fn_salvar_contrato_divida(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare
  v_id uuid := p_id; v_centro uuid := (p_dados->>'centroCustoId')::uuid;
  v_lanc uuid := nullif(p_dados->>'lancamentoId', '')::uuid;
  v_lib uuid := nullif(p_dados->>'lancamentoLiberacaoId', '')::uuid;
  v_raiz text; v_antes public.contratos_divida; v_termos boolean;
begin
  if not public.tem_permissao('financeiro.dividas', 'editar') then
    raise exception 'Sem permissao para editar contratos de divida';
  end if;
  select r.tipo into v_raiz from public.centros_custo e join public.centros_custo r on r.id = e.pai_id
   where e.id = v_centro and e.nivel = 2 and e.ativo;
  if v_raiz is null or v_raiz not in ('financeiro', 'imobilizado') then
    raise exception 'A etapa do contrato precisa ser ativa e ficar em Emprestimos ou num centro de imobilizado';
  end if;
  if v_lanc is not null and not exists (select 1 from public.lancamentos l where l.id = v_lanc and l.tipo = 'a_pagar' and l.status <> 'cancelado') then
    raise exception 'O lancamento das prestacoes precisa ser a pagar e nao cancelado';
  end if;
  if v_lanc is not null and exists (select 1 from public.consorcio_cotas q where q.lancamento_id = v_lanc) then
    raise exception 'Esse lancamento ja e de uma cota de consorcio';
  end if;
  if v_lib is not null and not exists (select 1 from public.lancamentos l where l.id = v_lib and l.tipo = 'a_receber' and l.status <> 'cancelado') then
    raise exception 'O lancamento da liberacao precisa ser a receber e nao cancelado';
  end if;

  if v_id is null then
    insert into public.contratos_divida (credor, numero, tipo, centro_custo_id, lancamento_id, lancamento_liberacao_id,
      valor_contratado, valor_liberado, data_liberacao, taxa_am, indexador, sistema, carencia_meses, parcelas,
      primeiro_vencimento, garantia, status, observacoes)
    values (btrim(p_dados->>'credor'), btrim(p_dados->>'numero'), p_dados->>'tipo', v_centro, v_lanc, v_lib,
      (p_dados->>'valorContratado')::numeric, (p_dados->>'valorLiberado')::numeric, (p_dados->>'dataLiberacao')::date,
      (p_dados->>'taxaAm')::numeric, coalesce(p_dados->>'indexador', 'pre'), p_dados->>'sistema',
      coalesce((p_dados->>'carenciaMeses')::smallint, 0), (p_dados->>'parcelas')::smallint,
      (p_dados->>'primeiroVencimento')::date, nullif(btrim(p_dados->>'garantia'), ''),
      coalesce(p_dados->>'status', 'ativo'), nullif(btrim(p_dados->>'observacoes'), ''))
    returning id into v_id;
  else
    select * into v_antes from public.contratos_divida where id = v_id for update;
    if v_antes.id is null then raise exception 'Contrato nao encontrado'; end if;
    v_termos := (v_antes.valor_liberado, v_antes.taxa_am, v_antes.sistema, v_antes.carencia_meses, v_antes.parcelas, v_antes.primeiro_vencimento)
      is distinct from ((p_dados->>'valorLiberado')::numeric, (p_dados->>'taxaAm')::numeric, p_dados->>'sistema',
        coalesce((p_dados->>'carenciaMeses')::smallint, 0), (p_dados->>'parcelas')::smallint, (p_dados->>'primeiroVencimento')::date);
    -- Termos mudaram com cronograma: Price/SAC gera de novo; cronograma do
    -- banco precisa ser digitado de novo. Com parcela paga, recusa.
    if v_termos and public.fn_contrato_versao_atual(v_id) is not null then
      perform public.fn_contrato_exigir_troca_livre(v_id, 'Termos do contrato alterados');
    end if;
    update public.contratos_divida set
      credor = btrim(p_dados->>'credor'), numero = btrim(p_dados->>'numero'), tipo = p_dados->>'tipo',
      centro_custo_id = v_centro, lancamento_id = v_lanc, lancamento_liberacao_id = v_lib,
      valor_contratado = (p_dados->>'valorContratado')::numeric, valor_liberado = (p_dados->>'valorLiberado')::numeric,
      data_liberacao = (p_dados->>'dataLiberacao')::date, taxa_am = (p_dados->>'taxaAm')::numeric,
      indexador = coalesce(p_dados->>'indexador', 'pre'), sistema = p_dados->>'sistema',
      carencia_meses = coalesce((p_dados->>'carenciaMeses')::smallint, 0), parcelas = (p_dados->>'parcelas')::smallint,
      primeiro_vencimento = (p_dados->>'primeiroVencimento')::date, garantia = nullif(btrim(p_dados->>'garantia'), ''),
      status = coalesce(p_dados->>'status', status), observacoes = nullif(btrim(p_dados->>'observacoes'), '')
    where id = v_id;
    if v_termos and public.fn_contrato_versao_atual(v_id) is not null then
      if p_dados->>'sistema' in ('price', 'sac') then
        perform public.fn_gerar_cronograma_contrato(v_id, 'Termos do contrato alterados');
      elsif (select sum(c.principal) from public.contrato_divida_cronograma c where c.contrato_id = v_id and c.substituida_em is null)
            <> (p_dados->>'valorLiberado')::numeric then
        raise exception 'O cronograma do banco nao fecha com o valor liberado novo: digite o cronograma de novo';
      end if;
    end if;
  end if;
  return v_id;
end;
$function$;

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
  if exists (select 1 from public.contrato_divida_cronograma c
              join public.lancamento_parcelas p on p.lancamento_id = d.lancamento_id and p.numero_parcela = c.numero and p.status = 'pago'
              where c.contrato_id = p_contrato and c.substituida_em is null and c.tipo = 'parcela' and c.vencimento > p_data) then
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

create or replace function public.fn_salvar_consorcio_cota(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare
  v_id uuid := p_id; v_lanc uuid := nullif(p_dados->>'lancamentoId', '')::uuid; v_antes public.consorcio_cotas;
begin
  if not public.tem_permissao('financeiro.dividas', 'editar') then raise exception 'Sem permissao para editar consorcios'; end if;
  if v_lanc is not null and not exists (select 1 from public.lancamentos l where l.id = v_lanc and l.tipo = 'a_pagar' and l.status <> 'cancelado') then
    raise exception 'O lancamento das parcelas precisa ser a pagar e nao cancelado';
  end if;
  if v_lanc is not null and exists (select 1 from public.contratos_divida d where d.lancamento_id = v_lanc) then
    raise exception 'Esse lancamento ja e de um contrato de divida';
  end if;
  if v_id is null then
    insert into public.consorcio_cotas (administradora, grupo, cota, bem, centro_custo_id, lancamento_id, valor_credito, prazo,
      taxa_adm_pct, fundo_reserva_pct, primeiro_vencimento, observacoes)
    values (btrim(p_dados->>'administradora'), btrim(p_dados->>'grupo'), btrim(p_dados->>'cota'), btrim(p_dados->>'bem'),
      nullif(p_dados->>'centroCustoId', '')::uuid, v_lanc, (p_dados->>'valorCredito')::numeric, (p_dados->>'prazo')::smallint,
      (p_dados->>'taxaAdmPct')::numeric, coalesce((p_dados->>'fundoReservaPct')::numeric, 0),
      (p_dados->>'primeiroVencimento')::date, nullif(btrim(p_dados->>'observacoes'), ''))
    returning id into v_id;
    perform public.fn_consorcio_gerar_cronograma(v_id);
  else
    select * into v_antes from public.consorcio_cotas where id = v_id for update;
    if v_antes.id is null then raise exception 'Cota nao encontrada'; end if;
    update public.consorcio_cotas set
      administradora = btrim(p_dados->>'administradora'), grupo = btrim(p_dados->>'grupo'), cota = btrim(p_dados->>'cota'),
      bem = btrim(p_dados->>'bem'), centro_custo_id = nullif(p_dados->>'centroCustoId', '')::uuid, lancamento_id = v_lanc,
      valor_credito = (p_dados->>'valorCredito')::numeric, prazo = (p_dados->>'prazo')::smallint,
      taxa_adm_pct = (p_dados->>'taxaAdmPct')::numeric, fundo_reserva_pct = coalesce((p_dados->>'fundoReservaPct')::numeric, 0),
      primeiro_vencimento = (p_dados->>'primeiroVencimento')::date, observacoes = nullif(btrim(p_dados->>'observacoes'), '')
    where id = v_id;
    -- Mudou a conta da parcela: gera de novo (recusa se ja tem parcela paga).
    if (v_antes.valor_credito, v_antes.prazo, v_antes.taxa_adm_pct, v_antes.fundo_reserva_pct, v_antes.primeiro_vencimento)
       is distinct from ((p_dados->>'valorCredito')::numeric, (p_dados->>'prazo')::smallint, (p_dados->>'taxaAdmPct')::numeric,
                         coalesce((p_dados->>'fundoReservaPct')::numeric, 0), (p_dados->>'primeiroVencimento')::date) then
      perform public.fn_consorcio_gerar_cronograma(v_id);
    end if;
  end if;
  return v_id;
end;
$function$;

create or replace function public.fn_salvar_cronograma_consorcio(p_cota uuid, p_linhas jsonb)
returns void language plpgsql security definer set search_path to '' as $function$
declare c public.consorcio_cotas; v_soma numeric;
begin
  if not public.tem_permissao('financeiro.dividas', 'editar') then raise exception 'Sem permissao para editar consorcios'; end if;
  select * into c from public.consorcio_cotas where id = p_cota for update;
  if c.id is null then raise exception 'Cota nao encontrada'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0
     or exists (select 1 from jsonb_array_elements(p_linhas) l where (l->>'vencimento') is null
                  or coalesce((l->>'fundoComum')::numeric, -1) < 0 or coalesce((l->>'taxaAdm')::numeric, 0) < 0
                  or coalesce((l->>'fundoReserva')::numeric, 0) < 0) then
    raise exception 'Parcelas do consorcio sem vencimento ou com valor negativo';
  end if;
  if exists (select 1 from jsonb_array_elements(p_linhas) l
              where round((l->>'fundoComum')::numeric, 2) <> (l->>'fundoComum')::numeric
                 or round(coalesce((l->>'taxaAdm')::numeric, 0), 2) <> coalesce((l->>'taxaAdm')::numeric, 0)
                 or round(coalesce((l->>'fundoReserva')::numeric, 0), 2) <> coalesce((l->>'fundoReserva')::numeric, 0))
     or (select count(distinct (l->>'vencimento')::date) from jsonb_array_elements(p_linhas) l) <> jsonb_array_length(p_linhas) then
    raise exception 'Parcelas do consorcio com mais de duas casas ou vencimento repetido';
  end if;
  select sum((l->>'fundoComum')::numeric) into v_soma from jsonb_array_elements(p_linhas) l;
  if v_soma <> c.valor_credito then
    raise exception 'O fundo comum soma R$ % e o credito e R$ %', public.fn_conciliacao_brl(v_soma), public.fn_conciliacao_brl(c.valor_credito);
  end if;
  -- Parcela ja paga nao muda (a taxa dela ja entrou no DRE daquele mes).
  if exists (
       select 1 from public.consorcio_cota_cronograma cr
       join public.lancamento_parcelas p on p.lancamento_id = c.lancamento_id and p.numero_parcela = cr.numero and p.status = 'pago'
       where cr.cota_id = p_cota and not exists (
         select 1 from (select row_number() over (order by (l->>'vencimento')::date) as n, l from jsonb_array_elements(p_linhas) l) x
          where x.n = cr.numero and (x.l->>'vencimento')::date = cr.vencimento and (x.l->>'fundoComum')::numeric = cr.fundo_comum
            and coalesce((x.l->>'taxaAdm')::numeric, 0) = cr.taxa_adm and coalesce((x.l->>'fundoReserva')::numeric, 0) = cr.fundo_reserva)) then
    raise exception 'Parcela ja paga nao pode mudar no cronograma do consorcio';
  end if;
  delete from public.consorcio_cota_cronograma where cota_id = p_cota;
  insert into public.consorcio_cota_cronograma (cota_id, numero, vencimento, fundo_comum, taxa_adm, fundo_reserva)
  select p_cota, row_number() over (order by (l->>'vencimento')::date), (l->>'vencimento')::date, (l->>'fundoComum')::numeric,
         coalesce((l->>'taxaAdm')::numeric, 0), coalesce((l->>'fundoReserva')::numeric, 0)
  from jsonb_array_elements(p_linhas) l;
end;
$function$;

create or replace function public.fn_dre_linhas_do_cronograma(p_inicio date, p_fim date)
returns table (categoria_id uuid, valor numeric)
language sql
stable
security definer
set search_path to ''
as $function$
  with base as (
    select (select cf.id from public.categorias_financeiras cf where cf.nome = 'Juros de empréstimos' and cf.tipo = 'despesa' limit 1) as cat_nova,
           coalesce((select r.categoria_id from public.lancamento_rateios r where r.lancamento_id = l.id order by r.valor desc limit 1),
                    l.categoria_id) as cat_lanc,
           cr.juros + cr.encargos as valor
    from public.contratos_divida d
    join public.lancamentos l on l.id = d.lancamento_id and l.status <> 'cancelado'
    join public.contrato_divida_cronograma cr on cr.contrato_id = d.id and cr.substituida_em is null and cr.tipo in ('parcela', 'quitacao', 'renegociacao')
    where cr.vencimento >= date_trunc('month', p_inicio)::date and cr.vencimento < p_fim
      and cr.juros + cr.encargos > 0
    union all
    select (select cf.id from public.categorias_financeiras cf where cf.nome = 'Taxa de administração de consórcio' and cf.tipo = 'despesa' limit 1),
           coalesce((select r.categoria_id from public.lancamento_rateios r where r.lancamento_id = l.id order by r.valor desc limit 1),
                    l.categoria_id),
           cr.taxa_adm + cr.fundo_reserva
    from public.consorcio_cotas q
    join public.lancamentos l on l.id = q.lancamento_id and l.status <> 'cancelado'
    join public.consorcio_cota_cronograma cr on cr.cota_id = q.id
    where cr.vencimento >= date_trunc('month', p_inicio)::date and cr.vencimento < p_fim
      and cr.taxa_adm + cr.fundo_reserva > 0
  )
  select x.categoria_id, sum(x.valor)
  from (
    select b.cat_nova as categoria_id, b.valor from base b where b.cat_lanc is not null and b.cat_nova is not null
    union all
    select b.cat_lanc, -b.valor from base b where b.cat_lanc is not null and b.cat_nova is not null
  ) x
  where public.tem_permissao('financeiro.relatorios', 'ver')
  group by x.categoria_id;
$function$;

create or replace function public.fn_rel_dividas_contratos(p_data date)
returns table (
  contrato_id uuid, credor text, numero text, tipo text, status text, centro_custo_id uuid, centro text,
  valor_liberado numeric, data_liberacao date, taxa_am numeric, sistema text, tem_cronograma boolean,
  principal_pago numeric, saldo_devedor numeric, juros_pagos numeric, juros_a_pagar numeric,
  proximas jsonb, fluxo jsonb)
language sql
stable
security definer
set search_path to ''
as $function$
  with linhas as (
    select cr.*, d.lancamento_id,
      case
        when cr.tipo <> 'parcela' then cr.vencimento <= p_data
        when d.lancamento_id is null then cr.vencimento <= p_data
        else exists (select 1 from public.lancamento_parcelas p
                      where p.lancamento_id = d.lancamento_id and p.numero_parcela = cr.numero and p.status = 'pago')
      end as pago
    from public.contrato_divida_cronograma cr
    join public.contratos_divida d on d.id = cr.contrato_id
    where cr.substituida_em is null
  )
  select d.id, d.credor, d.numero, d.tipo, d.status, d.centro_custo_id, cc.nome,
    d.valor_liberado, d.data_liberacao, d.taxa_am, d.sistema,
    exists (select 1 from linhas l where l.contrato_id = d.id),
    coalesce((select sum(l.principal) from linhas l where l.contrato_id = d.id and l.pago), 0),
    coalesce((select sum(l.principal) from linhas l where l.contrato_id = d.id and not l.pago),
             case when exists (select 1 from linhas l where l.contrato_id = d.id) then 0 else d.valor_liberado end),
    -- Encargo capitalizado na renegociacao vira principal: nao e juros pago.
    coalesce((select sum(l.juros + l.encargos) from linhas l where l.contrato_id = d.id and l.pago and l.tipo <> 'renegociacao'), 0),
    coalesce((select sum(l.juros + l.encargos) from linhas l where l.contrato_id = d.id and not l.pago and l.tipo <> 'renegociacao'), 0),
    coalesce((select jsonb_agg(jsonb_build_object('numero', x.numero, 'vencimento', x.vencimento, 'principal', x.principal,
                'juros', x.juros, 'encargos', x.encargos, 'total', x.principal + x.juros + x.encargos) order by x.vencimento)
              from (select * from linhas l where l.contrato_id = d.id and not l.pago order by l.vencimento limit 12) x), '[]'::jsonb),
    jsonb_build_array(jsonb_build_object('data', d.data_liberacao, 'valor', d.valor_liberado))
      || coalesce((select jsonb_agg(jsonb_build_object('data', l.vencimento, 'valor', -(l.principal + l.juros + l.encargos))
                     order by l.vencimento) from linhas l where l.contrato_id = d.id and l.tipo <> 'renegociacao'), '[]'::jsonb)
  from public.contratos_divida d
  left join public.centros_custo cc on cc.id = d.centro_custo_id
  where public.tem_permissao('financeiro.relatorios', 'ver') or public.tem_permissao('financeiro.dividas', 'ver')
  order by d.status, d.credor, d.numero;
$function$;
