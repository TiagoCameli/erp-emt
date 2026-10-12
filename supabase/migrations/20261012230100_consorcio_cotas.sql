-- Dividas: cotas de consorcio com cronograma (fundo comum, taxa de
-- administracao, fundo de reserva) e contemplacao. PR 5 do controle total
-- (12/10/2026, frente F, D9). Ativo ate contemplar: fundo comum e
-- investimento ("Consorcio a contemplar"); taxa e reserva sao despesa.
-- Como no contrato de divida, a cota aponta para o UM lancamento com as
-- parcelas e a linha do cronograma casa com a parcela pelo numero.

create table public.consorcio_cotas (
  id uuid primary key default gen_random_uuid(),
  administradora text not null check (btrim(administradora) <> ''),
  grupo text not null check (btrim(grupo) <> ''),
  cota text not null check (btrim(cota) <> ''),
  bem text not null check (btrim(bem) <> ''),
  centro_custo_id uuid references public.centros_custo(id),
  lancamento_id uuid references public.lancamentos(id),
  valor_credito numeric(14, 2) not null check (valor_credito > 0),
  prazo smallint not null check (prazo > 0),
  taxa_adm_pct numeric(7, 4) not null check (taxa_adm_pct >= 0),
  fundo_reserva_pct numeric(7, 4) not null default 0 check (fundo_reserva_pct >= 0),
  primeiro_vencimento date not null,
  status text not null default 'ativa' check (status in ('ativa', 'contemplada', 'quitada')),
  contemplacao_data date,
  contemplacao_forma text check (contemplacao_forma in ('sorteio', 'lance')),
  valor_lance numeric(14, 2) check (valor_lance >= 0),
  valor_carta numeric(14, 2) check (valor_carta > 0),
  bem_centro_id uuid references public.centros_custo(id),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (administradora, grupo, cota),
  check ((status = 'ativa') = (contemplacao_data is null) or status = 'quitada')
);
create unique index consorcio_cotas_lancamento_uq on public.consorcio_cotas (lancamento_id) where lancamento_id is not null;

create table public.consorcio_cota_cronograma (
  id uuid primary key default gen_random_uuid(),
  cota_id uuid not null references public.consorcio_cotas(id) on delete cascade,
  numero smallint not null check (numero > 0),
  vencimento date not null,
  fundo_comum numeric(14, 2) not null check (fundo_comum >= 0),
  taxa_adm numeric(14, 2) not null default 0 check (taxa_adm >= 0),
  fundo_reserva numeric(14, 2) not null default 0 check (fundo_reserva >= 0),
  unique (cota_id, numero)
);

alter table public.consorcio_cotas enable row level security;
alter table public.consorcio_cota_cronograma enable row level security;
create policy consorcio_cotas_select on public.consorcio_cotas
  for select to authenticated using ((select public.tem_permissao('financeiro.dividas', 'ver')));
create policy consorcio_cota_cronograma_select on public.consorcio_cota_cronograma
  for select to authenticated using ((select public.tem_permissao('financeiro.dividas', 'ver')));
revoke all on table public.consorcio_cotas, public.consorcio_cota_cronograma from anon, authenticated;
grant select on table public.consorcio_cotas, public.consorcio_cota_cronograma to authenticated;
create trigger trg_audit_consorcio_cotas after insert or update or delete on public.consorcio_cotas
  for each row execute function public.fn_audit();
create trigger trg_audit_consorcio_cota_cronograma after insert or update or delete on public.consorcio_cota_cronograma
  for each row execute function public.fn_audit();
create trigger trg_consorcio_cotas_updated_at before update on public.consorcio_cotas
  for each row execute function public.fn_set_updated_at();
create trigger trg_consorcio_cotas_created_by before insert on public.consorcio_cotas
  for each row execute function public.fn_set_created_by();

create or replace function public.fn_consorcio_parcelas_pagas(p_cota uuid)
returns int language sql stable set search_path to '' as $function$
  select count(*)::int from public.consorcio_cotas c
  join public.lancamento_parcelas p on p.lancamento_id = c.lancamento_id and p.status = 'pago'
  where c.id = p_cota;
$function$;

-- Gera o cronograma: cada parte dividida pelo prazo, a ultima parcela fecha o
-- total ao centavo. So sem parcela paga (o reajuste das parcelas pela
-- administradora entra pelo cronograma digitado).
create or replace function public.fn_consorcio_gerar_cronograma(p_cota uuid)
returns void language plpgsql security definer set search_path to '' as $function$
declare c public.consorcio_cotas; v_fc numeric; v_tx numeric; v_fr numeric;
begin
  select * into c from public.consorcio_cotas where id = p_cota;
  if public.fn_consorcio_parcelas_pagas(p_cota) > 0 and exists (select 1 from public.consorcio_cota_cronograma where cota_id = p_cota) then
    raise exception 'A cota ja tem parcela paga: digite o cronograma da administradora';
  end if;
  v_fc := c.valor_credito;
  v_tx := round(c.valor_credito * c.taxa_adm_pct / 100, 2);
  v_fr := round(c.valor_credito * c.fundo_reserva_pct / 100, 2);
  delete from public.consorcio_cota_cronograma where cota_id = p_cota;
  insert into public.consorcio_cota_cronograma (cota_id, numero, vencimento, fundo_comum, taxa_adm, fundo_reserva)
  select p_cota, n, (c.primeiro_vencimento + make_interval(months => n - 1))::date,
    case when n < c.prazo then round(v_fc / c.prazo, 2) else v_fc - round(v_fc / c.prazo, 2) * (c.prazo - 1) end,
    case when n < c.prazo then round(v_tx / c.prazo, 2) else v_tx - round(v_tx / c.prazo, 2) * (c.prazo - 1) end,
    case when n < c.prazo then round(v_fr / c.prazo, 2) else v_fr - round(v_fr / c.prazo, 2) * (c.prazo - 1) end
  from generate_series(1, c.prazo) n;
end;
$function$;
revoke all on function public.fn_consorcio_gerar_cronograma(uuid) from public, anon, authenticated;

create or replace function public.fn_salvar_consorcio_cota(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare
  v_id uuid := p_id; v_lanc uuid := nullif(p_dados->>'lancamentoId', '')::uuid; v_antes public.consorcio_cotas;
begin
  if not public.tem_permissao('financeiro.dividas', 'editar') then raise exception 'Sem permissao para editar consorcios'; end if;
  if v_lanc is not null and not exists (select 1 from public.lancamentos l where l.id = v_lanc and l.tipo = 'a_pagar' and l.status <> 'cancelado') then
    raise exception 'O lancamento das parcelas precisa ser a pagar e nao cancelado';
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

-- Cronograma da administradora (parcelas reajustadas): numeros 1..n pela
-- ordem de vencimento; o fundo comum soma o credito (o reajuste muda a carta,
-- grave o credito novo antes).
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
  select sum((l->>'fundoComum')::numeric) into v_soma from jsonb_array_elements(p_linhas) l;
  if v_soma <> c.valor_credito then
    raise exception 'O fundo comum soma R$ % e o credito e R$ %', public.fn_conciliacao_brl(v_soma), public.fn_conciliacao_brl(c.valor_credito);
  end if;
  delete from public.consorcio_cota_cronograma where cota_id = p_cota;
  insert into public.consorcio_cota_cronograma (cota_id, numero, vencimento, fundo_comum, taxa_adm, fundo_reserva)
  select p_cota, row_number() over (order by (l->>'vencimento')::date), (l->>'vencimento')::date, (l->>'fundoComum')::numeric,
         coalesce((l->>'taxaAdm')::numeric, 0), coalesce((l->>'fundoReserva')::numeric, 0)
  from jsonb_array_elements(p_linhas) l;
end;
$function$;

create or replace function public.fn_contemplar_consorcio(
  p_cota uuid, p_data date, p_forma text, p_valor_carta numeric, p_valor_lance numeric default null,
  p_bem_centro_id uuid default null, p_motivo text default null)
returns void language plpgsql security definer set search_path to '' as $function$
declare c public.consorcio_cotas;
begin
  if not public.tem_permissao('financeiro.dividas', 'editar') then raise exception 'Sem permissao para editar consorcios'; end if;
  select * into c from public.consorcio_cotas where id = p_cota for update;
  if c.id is null then raise exception 'Cota nao encontrada'; end if;
  if c.status <> 'ativa' then raise exception 'A cota ja foi contemplada'; end if;
  if p_data is null or p_forma not in ('sorteio', 'lance') or p_valor_carta is null or p_valor_carta <= 0 then
    raise exception 'Informe a data, a forma (sorteio ou lance) e o valor da carta';
  end if;
  if p_forma = 'lance' and coalesce(p_valor_lance, 0) <= 0 then raise exception 'Informe o valor do lance'; end if;
  if p_bem_centro_id is not null and not exists (
       select 1 from public.centros_custo e join public.centros_custo r on r.id = coalesce(e.pai_id, e.id)
        where e.id = p_bem_centro_id and r.tipo = 'imobilizado') then
    raise exception 'O bem da carta fica num centro de imobilizado';
  end if;
  update public.consorcio_cotas set status = 'contemplada', contemplacao_data = p_data, contemplacao_forma = p_forma,
    valor_carta = p_valor_carta, valor_lance = case when p_forma = 'lance' then p_valor_lance end, bem_centro_id = p_bem_centro_id,
    observacoes = concat_ws(E'\n', nullif(btrim(p_motivo), ''), observacoes)
  where id = p_cota;
end;
$function$;

revoke all on function public.fn_salvar_consorcio_cota(uuid, jsonb), public.fn_salvar_cronograma_consorcio(uuid, jsonb),
  public.fn_contemplar_consorcio(uuid, date, text, numeric, numeric, uuid, text) from public, anon;
grant execute on function public.fn_salvar_consorcio_cota(uuid, jsonb), public.fn_salvar_cronograma_consorcio(uuid, jsonb),
  public.fn_contemplar_consorcio(uuid, date, text, numeric, numeric, uuid, text) to authenticated;
