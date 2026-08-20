-- ---------------------------------------------------------------------------
-- 3. Reparcelar respeita o bloco de forma
-- ---------------------------------------------------------------------------
-- O dialogo "Definir parcelas" nao tem onde dizer a forma de cada parcela nova.
-- Com UM bloco isso nao e problema (tudo e daquele bloco); com DOIS ou mais,
-- recusa e manda para o formulario, que e onde a divisao por forma se edita.
-- Recusa declarada e melhor que parcela nascendo sem bloco e a trava de soma
-- acusando depois com uma mensagem sobre valores.
--
-- So as tres partes que mexem com forma mudaram: a guarda no inicio, o
-- lancamento_forma_id no insert das parcelas novas e o acerto do valor do bloco
-- quando o valor do lancamento muda.

create or replace function public.fn_definir_parcelas_lancamento(
  p_lanc_id uuid, p_parcelas jsonb, p_motivo text default null::text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_valor numeric(14, 2);
  v_status text;
  v_origem text;
  v_soma_nova numeric(14, 2);
  v_soma_preservada numeric(14, 2);
  v_total numeric(14, 2);
  v_qtd int;
  v_preservadas int;
  v_abertas int;
  v_base smallint;
  v_falta text;
  v_antes jsonb;
  v_eventos int;
  v_qtd_blocos int;
  v_bloco uuid;
begin
  if not public.tem_permissao('financeiro.lancamentos', 'editar') then
    raise exception 'Sem permissao para editar lancamentos';
  end if;

  select valor, status, origem into v_valor, v_status, v_origem
  from public.lancamentos
  where id = p_lanc_id;

  if v_valor is null then
    raise exception 'Lancamento nao encontrado';
  end if;
  if v_status = 'cancelado' then
    raise exception 'Lancamento cancelado nao aceita parcelas';
  end if;

  if v_origem in ('folha', 'folha_guia') then
    raise exception 'Nao da para trocar as parcelas aqui: este lancamento veio da folha. Mude o dia de vencimento em Parametros da Folha, depois desaprove e reaprove a folha';
  end if;

  if v_origem = 'adiantamento' then
    raise exception 'Nao da para trocar as parcelas aqui: este lancamento veio de um adiantamento. Exclua e recrie o adiantamento pelo RH';
  end if;

  -- Duas consultas, e nao um `min(id)`: nao existe min(uuid) no Postgres, e o
  -- CREATE FUNCTION aceita a chamada sem reclamar -- quebra so na primeira
  -- execucao. O `select into` sem linha deixa v_bloco nulo, que e o caso de
  -- lancamento sem forma declarada (caminho antigo).
  select count(*) into v_qtd_blocos
  from public.lancamento_formas where lancamento_id = p_lanc_id;

  if v_qtd_blocos > 1 then
    raise exception 'Este lancamento e pago por % formas diferentes: mude as parcelas no formulario do lancamento, que e onde a divisao por forma se edita', v_qtd_blocos;
  end if;

  select id into v_bloco
  from public.lancamento_formas where lancamento_id = p_lanc_id;

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_preservadas, v_soma_preservada
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status in ('aprovado', 'pago');

  select count(*) into v_abertas
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao');

  if (v_preservadas + v_abertas) > 0 and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da alteracao das parcelas';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'valor', valor, 'venc', data_vencimento)), '[]'::jsonb)
  into v_antes
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao');

  v_qtd := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));

  if v_qtd = 0 and v_preservadas = 0 then
    raise exception 'Informe ao menos uma parcela';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_parcelas) x
    where coalesce((x->>'valor')::numeric, 0) <= 0
  ) then
    raise exception 'Toda parcela precisa de um valor maior que zero';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_parcelas) x
    where nullif(x->>'data_vencimento', '') is null
  ) then
    raise exception 'Toda parcela precisa de uma data de vencimento';
  end if;

  select string_agg(distinct p.numero_parcela::text, ', ' order by p.numero_parcela::text)
  into v_falta
  from public.lancamento_parcelas p
  join public.extrato_transacoes t on t.parcela_id = p.id
  where p.lancamento_id = p_lanc_id and p.status in ('pendente', 'em_revisao');

  if v_falta is not null then
    raise exception 'A parcela % esta conciliada com o extrato: desfaca a conciliacao antes de mexer nas parcelas', v_falta;
  end if;

  select round(coalesce(sum((x->>'valor')::numeric), 0), 2)
  into v_soma_nova
  from jsonb_array_elements(p_parcelas) x;

  v_total := round(v_soma_preservada + v_soma_nova, 2);
  if v_total <= 0 then
    raise exception 'O total das parcelas precisa ser maior que zero';
  end if;

  if v_origem <> 'manual' and v_total <> round(v_valor, 2) then
    raise exception 'A soma das parcelas (R$ %) precisa fechar com o valor do lancamento (R$ %)', v_total, round(v_valor, 2);
  end if;

  with abertas as (
    select id, numero_parcela, desconto,
           row_number() over (order by numero_parcela, id) as pos
    from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao')
  ),
  nova as (
    select ord::int as pos, round((x->>'valor')::numeric, 2) as valor
    from jsonb_array_elements(p_parcelas) with ordinality as t(x, ord)
  )
  select string_agg(a.numero_parcela::text, ', ' order by a.numero_parcela)
  into v_falta
  from abertas a
  join nova n on n.pos = a.pos
  where coalesce(a.desconto, 0) > n.valor;

  if v_falta is not null then
    raise exception 'A parcela % tem desconto maior que o valor novo: tire o desconto antes', v_falta;
  end if;

  with abertas as (
    select id, row_number() over (order by numero_parcela, id) as pos
    from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao')
  ),
  nova as (
    select ord::int as pos,
           round((x->>'valor')::numeric, 2) as valor,
           (x->>'data_vencimento')::date as venc
    from jsonb_array_elements(p_parcelas) with ordinality as t(x, ord)
  )
  update public.lancamento_parcelas p
  set valor = n.valor,
      data_vencimento = n.venc
  from abertas a
  join nova n on n.pos = a.pos
  where p.id = a.id;

  with abertas as (
    select id, row_number() over (order by numero_parcela, id) as pos
    from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao')
  )
  delete from public.lancamento_parcelas p
  using abertas a
  where p.id = a.id and a.pos > v_qtd;

  select coalesce(max(numero_parcela), 0) into v_base
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id;

  -- Parcela nova herda o bloco unico (v_bloco e nulo quando nao ha bloco, que e
  -- o caminho antigo). Com dois blocos a funcao ja recusou lá em cima.
  insert into public.lancamento_parcelas (
    lancamento_id, numero_parcela, valor, data_vencimento, status,
    lancamento_forma_id, created_by
  )
  select
    p_lanc_id,
    (v_base + row_number() over (order by t.ord))::smallint,
    round((t.x->>'valor')::numeric, 2),
    (t.x->>'data_vencimento')::date,
    'pendente',
    v_bloco,
    (select auth.uid())
  from jsonb_array_elements(p_parcelas) with ordinality as t(x, ord)
  where t.ord > v_abertas;

  with fixas as (
    select coalesce(max(numero_parcela), 0) as ate
    from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status not in ('pendente', 'em_revisao')
  ),
  ordem as (
    select id, row_number() over (order by data_vencimento, id) as pos
    from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao')
  )
  update public.lancamento_parcelas p
  set numero_parcela = (f.ate + o.pos)::smallint
  from ordem o, fixas f
  where p.id = o.id and p.numero_parcela <> (f.ate + o.pos)::smallint;

  select round(coalesce(sum(valor), 0), 2)
  into v_total
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status <> 'cancelado';

  if v_origem = 'manual' and round(v_valor, 2) <> v_total then
    update public.lancamentos
    set valor = v_total
    where id = p_lanc_id;

    -- O valor do lancamento mudou, e o bloco unico de forma vale o total: sem
    -- este acerto a trava da soma das formas recusaria o commit, porque o bloco
    -- ficaria com o valor velho.
    if v_bloco is not null then
      update public.lancamento_formas set valor = v_total where id = v_bloco;
    end if;

    if v_valor > 0 and exists (
      select 1 from public.lancamento_rateios where lancamento_id = p_lanc_id
    ) then
      with base as (
        select id, round(valor * v_total / v_valor, 2) as novo
        from public.lancamento_rateios
        where lancamento_id = p_lanc_id
      ),
      tot as (select coalesce(sum(novo), 0) as s from base),
      alvo as (select id from base order by novo desc, id limit 1)
      update public.lancamento_rateios r
      set valor = b.novo
        + case when r.id = (select id from alvo)
               then v_total - (select s from tot) else 0 end
      from base b
      where b.id = r.id and r.lancamento_id = p_lanc_id;
    end if;
  end if;

  update public.lancamentos
  set data_vencimento = (
    select min(lp.data_vencimento)
    from public.lancamento_parcelas lp
    where lp.lancamento_id = p_lanc_id
  )
  where id = p_lanc_id;

  with antes as (
    select (x->>'id')::uuid as id,
           round((x->>'valor')::numeric, 2) as valor,
           nullif(x->>'venc', '')::date as venc
    from jsonb_array_elements(v_antes) x
  ),
  agora as (
    select id, round(valor, 2) as valor, data_vencimento as venc
    from public.lancamento_parcelas
    where lancamento_id = p_lanc_id
  ),
  mudou as (
    select a.id, a.valor as valor_de, g.valor as valor_para,
           a.venc as venc_de, g.venc as venc_para
    from antes a join agora g on g.id = a.id
    where a.valor <> g.valor or coalesce(a.venc, '0001-01-01') <> coalesce(g.venc, '0001-01-01')
  )
  insert into public.parcela_eventos
    (parcela_id, tipo, motivo, valor_de, valor_para, data_de, data_para, created_by)
  select id, 'alterou', btrim(p_motivo), valor_de, valor_para, venc_de, venc_para,
         (select auth.uid())
  from mudou;

  get diagnostics v_eventos = row_count;

  perform public.fn_aplicar_regra_pagamento(p_lanc_id);
end;
$function$;
