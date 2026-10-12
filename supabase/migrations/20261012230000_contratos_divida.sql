-- Dividas: contratos de divida com cronograma (Price, SAC ou o do banco) e
-- eventos (amortizacao antecipada, quitacao, renegociacao). PR 5 do controle
-- total (12/10/2026, frente F). So estrutura: os dados vem dos PDFs (PR 6).
--
-- Cada contrato e UM lancamento com todas as parcelas (ex.: LAN-2026-6722, 60
-- parcelas). O lancamento fica como esta; a linha do cronograma do tipo
-- 'parcela' casa com a parcela do lancamento pelo numero. O DRE pega os juros
-- do cronograma no mes do vencimento (migration seguinte).

-- ---------- 1. tabelas ----------
create table public.contratos_divida (
  id uuid primary key default gen_random_uuid(),
  credor text not null check (btrim(credor) <> ''),
  numero text not null check (btrim(numero) <> ''),
  tipo text not null check (tipo in ('emprestimo', 'capital_giro', 'finame', 'cdc', 'leasing', 'financiamento_equipamento')),
  centro_custo_id uuid not null unique references public.centros_custo(id),
  lancamento_id uuid references public.lancamentos(id),
  lancamento_liberacao_id uuid references public.lancamentos(id),
  valor_contratado numeric(14, 2) not null check (valor_contratado > 0),
  valor_liberado numeric(14, 2) not null check (valor_liberado > 0),
  data_liberacao date not null,
  taxa_am numeric(9, 6) not null check (taxa_am >= 0),
  indexador text not null default 'pre' check (indexador in ('pre', 'cdi', 'tjlp', 'ipca', 'outro')),
  sistema text not null check (sistema in ('price', 'sac', 'banco')),
  carencia_meses smallint not null default 0 check (carencia_meses >= 0),
  parcelas smallint not null check (parcelas > 0),
  primeiro_vencimento date not null,
  garantia text,
  status text not null default 'ativo' check (status in ('ativo', 'quitado', 'renegociado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  check (carencia_meses < parcelas),
  check (primeiro_vencimento > data_liberacao)
);
create unique index contratos_divida_lancamento_uq on public.contratos_divida (lancamento_id) where lancamento_id is not null;

-- Versao: cada troca de cronograma (gerar de novo, digitar o do banco, evento)
-- grava uma versao nova e marca a anterior como substituida (historico fica).
create table public.contrato_divida_cronograma (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos_divida(id) on delete cascade,
  versao int not null check (versao > 0),
  tipo text not null default 'parcela' check (tipo in ('parcela', 'amortizacao', 'quitacao', 'renegociacao')),
  numero smallint check (numero > 0),
  vencimento date not null,
  principal numeric(14, 2) not null check (principal >= 0),
  juros numeric(14, 2) not null default 0 check (juros >= 0),
  encargos numeric(14, 2) not null default 0 check (encargos >= 0),
  saldo_apos numeric(14, 2) not null check (saldo_apos >= 0),
  substituida_em timestamptz,
  created_at timestamptz not null default now(),
  check ((tipo = 'parcela') = (numero is not null))
);
create unique index contrato_divida_cronograma_numero_uq
  on public.contrato_divida_cronograma (contrato_id, versao, numero) where numero is not null;
create index contrato_divida_cronograma_atual_ix
  on public.contrato_divida_cronograma (contrato_id, vencimento) where substituida_em is null;

create table public.contrato_divida_eventos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos_divida(id) on delete cascade,
  tipo text not null check (tipo in ('cronograma', 'amortizacao', 'quitacao', 'renegociacao')),
  data date not null,
  valor numeric(14, 2),
  motivo text not null check (btrim(motivo) <> ''),
  versao_anterior int,
  versao_nova int not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

-- ---------- 2. RLS, grants, auditoria ----------
alter table public.contratos_divida enable row level security;
alter table public.contrato_divida_cronograma enable row level security;
alter table public.contrato_divida_eventos enable row level security;
create policy contratos_divida_select on public.contratos_divida
  for select to authenticated using ((select public.tem_permissao('financeiro.dividas', 'ver')));
create policy contrato_divida_cronograma_select on public.contrato_divida_cronograma
  for select to authenticated using ((select public.tem_permissao('financeiro.dividas', 'ver')));
create policy contrato_divida_eventos_select on public.contrato_divida_eventos
  for select to authenticated using ((select public.tem_permissao('financeiro.dividas', 'ver')));
revoke all on table public.contratos_divida, public.contrato_divida_cronograma, public.contrato_divida_eventos from anon, authenticated;
grant select on table public.contratos_divida, public.contrato_divida_cronograma, public.contrato_divida_eventos to authenticated;

create trigger trg_audit_contratos_divida after insert or update or delete on public.contratos_divida
  for each row execute function public.fn_audit();
create trigger trg_audit_contrato_divida_cronograma after insert or update or delete on public.contrato_divida_cronograma
  for each row execute function public.fn_audit();
create trigger trg_audit_contrato_divida_eventos after insert or update or delete on public.contrato_divida_eventos
  for each row execute function public.fn_audit();
create trigger trg_contratos_divida_updated_at before update on public.contratos_divida
  for each row execute function public.fn_set_updated_at();
create trigger trg_contratos_divida_created_by before insert on public.contratos_divida
  for each row execute function public.fn_set_created_by();
create trigger trg_contrato_divida_eventos_created_by before insert on public.contrato_divida_eventos
  for each row execute function public.fn_set_created_by();

-- ---------- 3. calculo puro: Price e SAC em centavos ----------
-- p_parcelas conta a carencia (so juros nos primeiros p_carencia meses). A
-- ultima parcela fecha o saldo ao centavo. Taxa em % ao mes.
create or replace function public.fn_calcular_cronograma(
  p_valor numeric, p_taxa_am numeric, p_parcelas int, p_carencia int, p_sistema text, p_primeiro_vencimento date)
returns table (numero int, vencimento date, principal numeric, juros numeric, saldo_apos numeric)
language plpgsql
immutable
set search_path to ''
as $function$
declare
  i numeric := p_taxa_am / 100;
  k int := p_parcelas - coalesce(p_carencia, 0);
  v_saldo numeric := round(p_valor, 2);
  v_pmt numeric; v_sac numeric; v_j numeric; v_p numeric;
begin
  if p_sistema not in ('price', 'sac') then raise exception 'Sistema % nao se calcula: digite o cronograma do banco', p_sistema; end if;
  if p_valor is null or p_valor <= 0 or p_parcelas is null or p_parcelas <= 0 or k <= 0 or p_taxa_am is null or p_taxa_am < 0 then
    raise exception 'Valor, taxa, parcelas e carencia invalidos para o cronograma';
  end if;
  v_pmt := case when i = 0 then round(v_saldo / k, 2) else round(v_saldo * i / (1 - power(1 + i, -k)), 2) end;
  v_sac := round(v_saldo / k, 2);
  for n in 1 .. p_parcelas loop
    v_j := round(v_saldo * i, 2);
    if n <= coalesce(p_carencia, 0) then
      v_p := 0;
    elsif n = p_parcelas then
      v_p := v_saldo;
    elsif p_sistema = 'price' then
      v_p := least(greatest(v_pmt - v_j, 0), v_saldo);
    else
      v_p := least(v_sac, v_saldo);
    end if;
    v_saldo := v_saldo - v_p;
    numero := n;
    vencimento := (p_primeiro_vencimento + make_interval(months => n - 1))::date;
    principal := v_p; juros := v_j; saldo_apos := v_saldo;
    return next;
  end loop;
end;
$function$;
grant execute on function public.fn_calcular_cronograma(numeric, numeric, int, int, text, date) to authenticated;

-- ---------- 4. utilitarios ----------
create or replace function public.fn_contrato_versao_atual(p_contrato uuid)
returns int language sql stable set search_path to '' as $function$
  select max(c.versao) from public.contrato_divida_cronograma c
  where c.contrato_id = p_contrato and c.substituida_em is null;
$function$;

-- Saldo devedor de principal numa data: o saldo depois da ultima linha vencida
-- ate la na versao atual (sem linha vencida: o valor liberado).
create or replace function public.fn_contrato_saldo_devedor(p_contrato uuid, p_data date)
returns numeric language sql stable set search_path to '' as $function$
  select coalesce(
    (select c.saldo_apos from public.contrato_divida_cronograma c
      where c.contrato_id = p_contrato and c.substituida_em is null and c.vencimento <= p_data
      order by c.vencimento desc, c.numero desc nulls first limit 1),
    (select d.valor_liberado from public.contratos_divida d where d.id = p_contrato));
$function$;

-- Parcela paga no lancamento do contrato (pelo numero).
create or replace function public.fn_contrato_parcelas_pagas(p_contrato uuid)
returns int language sql stable set search_path to '' as $function$
  select count(*)::int from public.contratos_divida d
  join public.lancamento_parcelas p on p.lancamento_id = d.lancamento_id and p.status = 'pago'
  where d.id = p_contrato;
$function$;

-- Grava uma versao nova a partir de linhas jsonb ja validadas e marca a
-- anterior como substituida. Linhas: tipo, numero, vencimento, principal,
-- juros, encargos, saldoApos. Devolve a versao nova.
create or replace function public.fn_contrato_gravar_versao(p_contrato uuid, p_linhas jsonb)
returns int language plpgsql security definer set search_path to '' as $function$
declare v_versao int;
begin
  select coalesce(max(c.versao), 0) + 1 into v_versao from public.contrato_divida_cronograma c where c.contrato_id = p_contrato;
  update public.contrato_divida_cronograma set substituida_em = now()
   where contrato_id = p_contrato and substituida_em is null;
  insert into public.contrato_divida_cronograma (contrato_id, versao, tipo, numero, vencimento, principal, juros, encargos, saldo_apos)
  select p_contrato, v_versao, coalesce(l->>'tipo', 'parcela'), (l->>'numero')::smallint, (l->>'vencimento')::date,
         (l->>'principal')::numeric, coalesce((l->>'juros')::numeric, 0), coalesce((l->>'encargos')::numeric, 0),
         (l->>'saldoApos')::numeric
  from jsonb_array_elements(p_linhas) l;
  return v_versao;
end;
$function$;
revoke all on function public.fn_contrato_gravar_versao(uuid, jsonb) from public, anon, authenticated;

-- ---------- 5. salvar o contrato ----------
create or replace function public.fn_salvar_contrato_divida(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare
  v_id uuid := p_id; v_centro uuid := (p_dados->>'centroCustoId')::uuid;
  v_lanc uuid := nullif(p_dados->>'lancamentoId', '')::uuid;
  v_lib uuid := nullif(p_dados->>'lancamentoLiberacaoId', '')::uuid;
  v_raiz text;
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
    if not found then raise exception 'Contrato nao encontrado'; end if;
  end if;
  return v_id;
end;
$function$;

-- ---------- 6. cronograma: gerar (Price/SAC) ou digitar o do banco ----------
-- Trocar um cronograma que ja tem parcela paga so por evento (amortizacao ou
-- renegociacao): a troca reescreveria o principal ja pago.
create or replace function public.fn_contrato_exigir_troca_livre(p_contrato uuid, p_motivo text)
returns int language plpgsql stable set search_path to '' as $function$
declare v_atual int := public.fn_contrato_versao_atual(p_contrato);
begin
  if v_atual is not null then
    if nullif(btrim(p_motivo), '') is null then raise exception 'Informe o motivo para trocar o cronograma'; end if;
    if public.fn_contrato_parcelas_pagas(p_contrato) > 0 then
      raise exception 'O contrato ja tem parcela paga: troque o cronograma por amortizacao ou renegociacao';
    end if;
  end if;
  return v_atual;
end;
$function$;

create or replace function public.fn_gerar_cronograma_contrato(p_contrato uuid, p_motivo text default null)
returns int language plpgsql security definer set search_path to '' as $function$
declare d public.contratos_divida; v_ant int; v_nova int;
begin
  if not public.tem_permissao('financeiro.dividas', 'editar') then raise exception 'Sem permissao para editar contratos de divida'; end if;
  select * into d from public.contratos_divida where id = p_contrato for update;
  if d.id is null then raise exception 'Contrato nao encontrado'; end if;
  v_ant := public.fn_contrato_exigir_troca_livre(p_contrato, p_motivo);
  v_nova := public.fn_contrato_gravar_versao(p_contrato, (
    select jsonb_agg(jsonb_build_object('numero', c.numero, 'vencimento', c.vencimento, 'principal', c.principal,
                                        'juros', c.juros, 'saldoApos', c.saldo_apos) order by c.numero)
    from public.fn_calcular_cronograma(d.valor_liberado, d.taxa_am, d.parcelas, d.carencia_meses, d.sistema, d.primeiro_vencimento) c));
  insert into public.contrato_divida_eventos (contrato_id, tipo, data, motivo, versao_anterior, versao_nova)
  values (p_contrato, 'cronograma', (now() at time zone 'America/Rio_Branco')::date,
          coalesce(nullif(btrim(p_motivo), ''), 'Cronograma ' || upper(d.sistema) || ' gerado'), v_ant, v_nova);
  return v_nova;
end;
$function$;

-- Cronograma do banco (pos-fixado, FINAME...): parcelas 1..n em ordem de
-- vencimento; a soma do principal fecha o valor liberado ao centavo; o saldo
-- depois de cada parcela e calculado aqui.
create or replace function public.fn_salvar_cronograma_contrato(p_contrato uuid, p_linhas jsonb, p_motivo text default null)
returns int language plpgsql security definer set search_path to '' as $function$
declare d public.contratos_divida; v_ant int; v_nova int; v_soma numeric; v_n int; v_linhas jsonb;
begin
  if not public.tem_permissao('financeiro.dividas', 'editar') then raise exception 'Sem permissao para editar contratos de divida'; end if;
  select * into d from public.contratos_divida where id = p_contrato for update;
  if d.id is null then raise exception 'Contrato nao encontrado'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'Informe as parcelas do cronograma'; end if;
  v_ant := public.fn_contrato_exigir_troca_livre(p_contrato, p_motivo);

  if exists (select 1 from jsonb_array_elements(p_linhas) l
              where (l->>'vencimento') is null or coalesce((l->>'principal')::numeric, -1) < 0
                 or coalesce((l->>'juros')::numeric, 0) < 0 or coalesce((l->>'encargos')::numeric, 0) < 0
                 or round((l->>'principal')::numeric, 2) <> (l->>'principal')::numeric
                 or round(coalesce((l->>'juros')::numeric, 0), 2) <> coalesce((l->>'juros')::numeric, 0)
                 or round(coalesce((l->>'encargos')::numeric, 0), 2) <> coalesce((l->>'encargos')::numeric, 0)) then
    raise exception 'Parcela do cronograma sem vencimento, com valor negativo ou mais de duas casas';
  end if;
  select count(*), sum((l->>'principal')::numeric) into v_n, v_soma from jsonb_array_elements(p_linhas) l;
  if v_soma <> d.valor_liberado then
    raise exception 'O principal das parcelas soma R$ % e o valor liberado e R$ %',
      public.fn_conciliacao_brl(v_soma), public.fn_conciliacao_brl(d.valor_liberado);
  end if;
  if (select count(distinct (l->>'vencimento')::date) from jsonb_array_elements(p_linhas) l) <> v_n then
    raise exception 'Duas parcelas com o mesmo vencimento';
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

-- ---------- 7. eventos ----------
-- Todo evento grava uma versao nova: as linhas ate a data ficam como estavam,
-- entra a linha do evento e, depois dela, o resto do cronograma.
--   amortizacao: p_valor abate o principal; o resto vem de p_linhas ou, em
--     Price/SAC, e recalculado no mesmo numero de parcelas que faltavam.
--   quitacao: p_valor e o que foi pago; o que passar do saldo e juros; zera.
--   renegociacao: p_valor e o saldo novo (padrao: o saldo na data); p_linhas
--     (obrigatorio) e o cronograma novo, que soma o saldo novo de principal.
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
           order by c.vencimento, c.numero nulls last), '[]'::jsonb),
         coalesce(max(c.numero), 0) + 1
    into v_mantidas, v_prox
  from public.contrato_divida_cronograma c
  where c.contrato_id = p_contrato and c.substituida_em is null and c.vencimento <= p_data;
  select count(*), min(c.vencimento) into v_faltam, v_venc from public.contrato_divida_cronograma c
   where c.contrato_id = p_contrato and c.substituida_em is null and c.vencimento > p_data and c.tipo = 'parcela';

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
      if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0
         or exists (select 1 from jsonb_array_elements(p_linhas) l
                     where (l->>'vencimento')::date is null or (l->>'vencimento')::date <= p_data
                        or coalesce((l->>'principal')::numeric, -1) < 0 or coalesce((l->>'juros')::numeric, 0) < 0
                        or coalesce((l->>'encargos')::numeric, 0) < 0) then
        raise exception 'Parcelas novas precisam vencer depois do evento, sem valor negativo';
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

revoke all on function public.fn_salvar_contrato_divida(uuid, jsonb), public.fn_gerar_cronograma_contrato(uuid, text),
  public.fn_salvar_cronograma_contrato(uuid, jsonb, text), public.fn_registrar_evento_contrato(uuid, text, date, numeric, text, jsonb)
  from public, anon;
grant execute on function public.fn_salvar_contrato_divida(uuid, jsonb), public.fn_gerar_cronograma_contrato(uuid, text),
  public.fn_salvar_cronograma_contrato(uuid, jsonb, text), public.fn_registrar_evento_contrato(uuid, text, date, numeric, text, jsonb)
  to authenticated;

-- ---------- 8. permissao ----------
with acoes(recurso, acao) as (values ('financeiro.dividas', 'ver'), ('financeiro.dividas', 'editar'))
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao from public.perfis p cross join acoes a where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (values ('financeiro.dividas', 'ver'), ('financeiro.dividas', 'editar'))
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select u.id, a.recurso, a.acao
from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin' cross join acoes a
where u.ativo and u.excluido_em is null
on conflict (usuario_id, recurso, acao) do nothing;

do $confere$
declare v_admins int; v_linhas int;
begin
  select count(*) into v_admins from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
   where u.ativo and u.excluido_em is null;
  select count(*) into v_linhas from public.usuario_permissoes where recurso = 'financeiro.dividas';
  if v_admins = 0 or v_linhas <> v_admins * 2 then
    raise exception 'Permissao financeiro.dividas: % admins, % linhas', v_admins, v_linhas;
  end if;
end $confere$;

-- ---------- 9. anexos (PDF do contrato e da cota) ----------
CREATE OR REPLACE FUNCTION public.fn_recurso_da_entidade(p_tipo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_tipo
    when 'cotacao'        then 'compras.cotacoes'
    when 'ordem_compra'   then 'compras.ordens'
    when 'lancamento'     then 'financeiro.lancamentos'
    when 'pagamento'      then 'financeiro.pagamentos'
    when 'rh_documento'   then 'rh.documentos'
    when 'rh_epi'         then 'rh.epis'
    when 'rh_ocorrencia'  then 'rh.ocorrencias'
    when 'equipamento_documento' then 'cadastros.equipamentos'
    when 'frete'          then 'frete.fretes'
    when 'frete_chegada'  then 'frete.fretes'
    when 'frete_pagamento' then 'frete.pagamentos'
    when 'pedido_material' then 'frete.pedidos-material'
    when 'combustivel_entrada' then 'combustivel.entradas'
    when 'combustivel_saida' then 'combustivel.saidas'
    when 'combustivel_transferencia' then 'combustivel.transferencias'
    when 'manutencao_os'  then 'manutencao.servicos'
    when 'aplicacao_posicao' then 'financeiro.aplicacoes'
    when 'mc_contrato'    then 'medicao.contratos'
    when 'mc_aditivo'     then 'medicao.contratos'
    when 'mc_planilha_versao' then 'medicao.planilha'
    when 'mc_lancamento'  then 'medicao.lancamentos'
    when 'mc_reajuste'    then 'medicao.reajuste' -- mc: Fase 6
    when 'contrato_divida' then 'financeiro.dividas'
    when 'consorcio_cota' then 'financeiro.dividas'
    else null
  end;
$function$;
