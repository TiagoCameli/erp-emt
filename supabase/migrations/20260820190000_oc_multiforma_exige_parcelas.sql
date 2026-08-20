-- Bloco 2, parte D: divisao por forma na OC passa a exigir parcelas.
--
-- O buraco que isto fecha: uma ordem com duas formas e ZERO parcelas era aceita
-- (parcela e opcional na OC), virava lancamento com dois blocos e nenhuma
-- parcela, e ai nao havia mais caminho -- lancamento de origem 'oc' so edita
-- parcelas pelo dialogo, e o dialogo recusa lancamento de varias formas. A
-- divisao ficava declarada e nao pagavel.
--
-- Com UMA forma nada muda: parcela continua opcional, e o lancamento define
-- depois, como sempre fez (o dialogo aceita um bloco).
--
-- As duas funcoes vem inteiras porque migration e historico: quem ler esta so
-- ela ve a funcao que passou a valer, sem montar o corpo de tres arquivos.

create or replace function public.fn_salvar_parcelas_oc(
  p_oc_id uuid, p_parcelas jsonb, p_formas jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_total numeric(14, 2);
  v_compra date;
  v_soma numeric(14, 2);
  v_qtd int;
  v_qtd_formas int;
  v_soma_formas numeric(14, 2);
  v_falta text;
begin
  if not (
    public.tem_permissao('compras.ordens', 'editar')
    or public.tem_permissao('compras.ordens', 'criar')
  ) then
    raise exception 'Sem permissao para definir parcelas da ordem de compra';
  end if;

  select status, valor_total, data_compra
  into v_status, v_total, v_compra
  from public.ordens_compra
  where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status not in ('rascunho', 'pendente_aprovacao') then
    raise exception 'So da para mexer nas parcelas de uma ordem em rascunho ou pendente de aprovacao. Depois de aprovada, edite as parcelas no lancamento.';
  end if;

  v_qtd := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));
  v_qtd_formas := jsonb_array_length(coalesce(p_formas, '[]'::jsonb));

  -- ---- as formas -------------------------------------------------------
  if v_qtd_formas > 0 then
    if exists (
      select 1 from jsonb_array_elements(p_formas) x
      where coalesce(round((x->>'valor')::numeric, 2), 0) <= 0
    ) then
      raise exception 'Toda forma de pagamento precisa de um valor maior que zero';
    end if;

    select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_formas
    from jsonb_array_elements(p_formas) x;
    if v_soma_formas <> round(v_total, 2) then
      raise exception 'A soma das formas de pagamento (R$ %) precisa fechar com o total da ordem (R$ %)',
        v_soma_formas, round(v_total, 2);
    end if;

    if (
      select count(distinct x->>'forma_pagamento_id')
      from jsonb_array_elements(p_formas) x
    ) <> v_qtd_formas then
      raise exception 'A mesma forma de pagamento aparece duas vezes: some os valores numa linha so';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_formas) x
      where not exists (
        select 1 from public.formas_pagamento f
        where f.id = nullif(x->>'forma_pagamento_id','')::uuid and f.ativo
      )
    ) then
      raise exception 'Forma de pagamento inativa ou inexistente';
    end if;

    -- Com DUAS ou mais formas, parcela deixa de ser opcional. Quem paga e a
    -- PARCELA: sem ela a metade em boleto nao tem vencimento para entrar na fila
    -- e a metade em dinheiro nao tem o que baixar. E depois de aprovada, o
    -- lancamento de OC so edita parcelas pelo dialogo, que recusa lancamento de
    -- varias formas -- entao a ordem sairia daqui para um beco sem saida.
    if v_qtd_formas > 1 and v_qtd = 0 then
      raise exception 'Ordem paga por % formas precisa de parcelas: diga quando e por qual forma cada parte sai', v_qtd_formas;
    end if;
  end if;

  -- Parcelas antes das formas: apagar a forma leva a parcela em cascata, e
  -- depender dessa ordem por acidente e o tipo de coisa que quebra na proxima
  -- vez que alguem reordena o corpo da funcao.
  delete from public.oc_parcelas where ordem_compra_id = p_oc_id;
  delete from public.oc_formas where ordem_compra_id = p_oc_id;

  insert into public.oc_formas (ordem_compra_id, forma_pagamento_id, valor, created_by)
  select p_oc_id, nullif(x->>'forma_pagamento_id','')::uuid,
         round((x->>'valor')::numeric, 2), (select auth.uid())
  from jsonb_array_elements(coalesce(p_formas,'[]'::jsonb)) x;

  -- Com UMA forma o cabecalho guarda ela; com DUAS ou mais vai NULO, porque nao
  -- existe "a forma" desta ordem. Sem formas, o cabecalho fica como o app
  -- deixou. Quem manda aqui e esta funcao, que roda DEPOIS do update do
  -- cabecalho e sabe quantas formas existem.
  if v_qtd_formas = 1 then
    update public.ordens_compra
    set forma_pagamento_id = nullif(p_formas->0->>'forma_pagamento_id','')::uuid
    where id = p_oc_id;
  elsif v_qtd_formas > 1 then
    update public.ordens_compra set forma_pagamento_id = null where id = p_oc_id;
  end if;

  if v_qtd = 0 then
    return;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_parcelas) x
    where coalesce((x->>'valor')::numeric, 0) <= 0
  ) then
    raise exception 'Toda parcela precisa de um valor maior que zero';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_parcelas) x
    where nullif(x->>'data_vencimento', '') is null
  ) then
    raise exception 'Toda parcela precisa de uma data de vencimento';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_parcelas) x
    where (x->>'data_vencimento')::date < v_compra
  ) then
    raise exception 'Nenhuma parcela pode vencer antes da data da compra (%)', v_compra;
  end if;

  select round(coalesce(sum((x->>'valor')::numeric), 0), 2)
  into v_soma
  from jsonb_array_elements(p_parcelas) x;

  if v_soma <> round(v_total, 2) then
    raise exception 'A soma das parcelas (R$ %) precisa fechar com o total da ordem (R$ %)', v_soma, round(v_total, 2);
  end if;

  if v_qtd_formas > 0 then
    -- Toda parcela diz de qual forma e...
    if exists (
      select 1 from jsonb_array_elements(p_parcelas) x
      where nullif(x->>'forma_pagamento_id','') is null
         or not exists (
           select 1 from jsonb_array_elements(p_formas) fx
           where fx->>'forma_pagamento_id' = x->>'forma_pagamento_id'
         )
    ) then
      raise exception 'Toda parcela precisa dizer por qual forma de pagamento ela sai';
    end if;

    -- ...e as parcelas de CADA forma fecham com o valor dela.
    select string_agg(
             f.nome||' (parcelas R$ '||to_char(t.soma,'FM999999999990.00')||
             ' contra R$ '||to_char(t.valor_forma,'FM999999999990.00')||')', '; ')
    into v_falta
    from (
      select nullif(fx->>'forma_pagamento_id','')::uuid as forma,
             round((fx->>'valor')::numeric, 2) as valor_forma,
             coalesce((
               select sum(round((px->>'valor')::numeric, 2))
               from jsonb_array_elements(p_parcelas) px
               where px->>'forma_pagamento_id' = fx->>'forma_pagamento_id'
             ), 0) as soma
      from jsonb_array_elements(p_formas) fx
    ) t
    join public.formas_pagamento f on f.id = t.forma
    where t.soma <> t.valor_forma;

    if v_falta is not null then
      raise exception 'As parcelas de cada forma tem que fechar com o valor dela: %', v_falta;
    end if;
  end if;

  -- A numeracao sai do VENCIMENTO, nao da ordem digitada, e vale para a ordem
  -- INTEIRA (nao reinicia por forma): "parcela 2 de 4" ja significa isso em toda
  -- tela e em todo espelho.
  insert into public.oc_parcelas (
    ordem_compra_id, numero_parcela, data_vencimento, valor, oc_forma_id, created_by
  )
  select
    p_oc_id,
    row_number() over (
      order by (x->>'data_vencimento')::date, x->>'valor'
    )::smallint,
    (x->>'data_vencimento')::date,
    round((x->>'valor')::numeric, 2),
    f.id,
    (select auth.uid())
  from jsonb_array_elements(p_parcelas) x
  left join public.oc_formas f
    on f.ordem_compra_id = p_oc_id
   and f.forma_pagamento_id = nullif(x->>'forma_pagamento_id','')::uuid;
end;
$function$;

revoke all on function public.fn_salvar_parcelas_oc(uuid, jsonb, jsonb) from public;
grant execute on function public.fn_salvar_parcelas_oc(uuid, jsonb, jsonb) to authenticated;

create or replace function public.fn_aprovar_ordem_compra(p_oc_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_fornecedor uuid;
  v_total numeric(14, 2);
  v_numero text;
  v_forma uuid;
  v_compra date;
  v_mes date;
  v_lanc_id uuid;
  v_qtd_parcelas int;
  v_soma_parcelas numeric(14, 2);
  v_descricao text;
  v_categoria uuid;
  v_numero_documento text;
  v_qtd_formas int;
  v_soma_formas numeric(14, 2);
  v_falta text;
begin
  if not public.tem_permissao('compras.ordens', 'aprovar') then
    raise exception 'Sem permissao para aprovar ordens de compra';
  end if;

  select status, fornecedor_id, valor_total, numero, forma_pagamento_id,
         data_compra, mes_competencia, descricao, categoria_id, numero_documento
  into v_status, v_fornecedor, v_total, v_numero, v_forma, v_compra, v_mes,
       v_descricao, v_categoria, v_numero_documento
  from public.ordens_compra where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status <> 'pendente_aprovacao' then
    raise exception 'A ordem de compra precisa estar pendente de aprovacao';
  end if;

  if exists (
    select 1 from public.oc_itens oi
    join public.insumos i on i.id = oi.insumo_id
    where oi.ordem_compra_id = p_oc_id and i.categoria_financeira_id is null
  ) then
    raise exception 'Ha item sem categoria de custo. Classifique o insumo antes de aprovar';
  end if;

  perform public.fn_exigir_competencia_aberta(v_mes, 'ordem_compra', p_oc_id);

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd_parcelas, v_soma_parcelas
  from public.oc_parcelas
  where ordem_compra_id = p_oc_id;

  if v_qtd_parcelas > 0 and v_soma_parcelas <> round(v_total, 2) then
    raise exception 'A soma das parcelas da ordem (R$ %) nao fecha com o total (R$ %). Ajuste as parcelas antes de aprovar.',
      v_soma_parcelas, round(v_total, 2);
  end if;

  -- O portao das formas. Como a OC nao tem trava continua (o total vem dos
  -- itens), uma edicao de item depois de declarar as formas pode ter deixado a
  -- divisao torta -- e e aqui, antes de virar lancamento, que isso tem de
  -- aparecer. Sem esta conferencia, a trava do lancamento estouraria no meio da
  -- aprovacao com uma mensagem que fala de lancamento para quem aprovou uma OC.
  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd_formas, v_soma_formas
  from public.oc_formas
  where ordem_compra_id = p_oc_id;

  if v_qtd_formas > 0 then
    if v_soma_formas <> round(v_total, 2) then
      raise exception 'A soma das formas de pagamento (R$ %) nao fecha com o total da ordem (R$ %). Ajuste a divisao antes de aprovar.',
        v_soma_formas, round(v_total, 2);
    end if;

    -- Mesmo motivo do save: divisao por forma sem parcela nenhuma nasceria um
    -- lancamento que ninguem consegue parcelar depois.
    if v_qtd_formas > 1 and v_qtd_parcelas = 0 then
      raise exception 'Esta ordem e paga por % formas e nao tem parcelas. Defina as parcelas de cada forma antes de aprovar.', v_qtd_formas;
    end if;

    if v_qtd_parcelas > 0 then
      if exists (
        select 1 from public.oc_parcelas
        where ordem_compra_id = p_oc_id and oc_forma_id is null
      ) then
        raise exception 'Ha parcela da ordem sem forma de pagamento. Diga por qual forma cada parcela sai antes de aprovar.';
      end if;

      select string_agg(
               f.nome||' (parcelas R$ '||to_char(t.soma,'FM999999999990.00')||
               ' contra R$ '||to_char(t.valor,'FM999999999990.00')||')', '; ')
      into v_falta
      from (
        select ofo.id, ofo.forma_pagamento_id, ofo.valor,
               coalesce((
                 select sum(p.valor) from public.oc_parcelas p
                 where p.oc_forma_id = ofo.id
               ), 0) as soma
        from public.oc_formas ofo
        where ofo.ordem_compra_id = p_oc_id
      ) t
      join public.formas_pagamento f on f.id = t.forma_pagamento_id
      where round(t.soma, 2) <> round(t.valor, 2);

      if v_falta is not null then
        raise exception 'As parcelas de cada forma tem que fechar com o valor dela: %', v_falta;
      end if;
    end if;
  end if;

  select coalesce(
    (select i.categoria_financeira_id
     from public.oc_itens oi
     join public.insumos i on i.id = oi.insumo_id
     where oi.ordem_compra_id = p_oc_id and i.categoria_financeira_id is not null
     group by i.categoria_financeira_id
     order by sum(oi.quantidade * oi.preco_unitario) desc, i.categoria_financeira_id
     limit 1),
    v_categoria)
  into v_categoria;

  update public.ordens_compra
  set status = 'aprovado', aprovado_por = (select auth.uid()), aprovado_em = now(),
      categoria_id = v_categoria
  where id = p_oc_id;

  -- O cabecalho do lancamento herda o da OC: com uma forma so ele guarda ela,
  -- com varias a OC ja o deixou nulo (fn_salvar_parcelas_oc cuida disso), e o
  -- lancamento nasce nulo tambem. Nao existe "a forma" de um documento pago por
  -- duas.
  insert into public.lancamentos (
    tipo, origem, origem_id, fornecedor_id, forma_pagamento_id, descricao,
    categoria_id, valor, status, data_compra, mes_competencia,
    numero_documento, created_by
  )
  values (
    'a_pagar', 'oc', p_oc_id, v_fornecedor, v_forma,
    coalesce(
      nullif(btrim(coalesce(v_descricao, '')), ''),
      'Ordem de compra ' || coalesce(v_numero, '')
    ),
    v_categoria,
    v_total, 'previsto', v_compra, v_mes,
    v_numero_documento, (select auth.uid())
  )
  returning id into v_lanc_id;

  -- Os blocos descem da ordem. Quando a OC nao tem bloco (ordem antiga, ou sem
  -- forma declarada) mas tem forma no cabecalho, nasce um bloco com o total:
  -- e o que mantem a invariante "tem forma no cabecalho <=> tem bloco", da qual
  -- o filtro da aba de pagamentos diretos depende.
  if v_qtd_formas > 0 then
    insert into public.lancamento_formas
      (lancamento_id, forma_pagamento_id, valor, created_by)
    select v_lanc_id, ofo.forma_pagamento_id, ofo.valor, (select auth.uid())
    from public.oc_formas ofo
    where ofo.ordem_compra_id = p_oc_id;
  elsif v_forma is not null then
    insert into public.lancamento_formas
      (lancamento_id, forma_pagamento_id, valor, created_by)
    values (v_lanc_id, v_forma, v_total, (select auth.uid()));
  end if;

  if v_qtd_parcelas > 0 then
    -- A ligacao entre os dois lados e o forma_pagamento_id, nao o id do bloco:
    -- (lancamento_id, forma_pagamento_id) e unico, entao este join e exato.
    -- Parcela de ordem sem bloco cai no bloco unico do lancamento quando ele
    -- existe (caminho antigo), e em nenhum quando nao existe.
    insert into public.lancamento_parcelas (
      lancamento_id, numero_parcela, valor, data_vencimento, status,
      lancamento_forma_id, created_by
    )
    select v_lanc_id, p.numero_parcela, p.valor, p.data_vencimento, 'pendente',
           coalesce(
             lf_da_parcela.id,
             (select lf.id from public.lancamento_formas lf
              where lf.lancamento_id = v_lanc_id
              limit 1)
           ),
           (select auth.uid())
    from public.oc_parcelas p
    left join public.oc_formas ofo on ofo.id = p.oc_forma_id
    left join public.lancamento_formas lf_da_parcela
      on lf_da_parcela.lancamento_id = v_lanc_id
     and lf_da_parcela.forma_pagamento_id = ofo.forma_pagamento_id
    where p.ordem_compra_id = p_oc_id
    order by p.numero_parcela;

    update public.lancamentos
    set data_vencimento = (
      select min(p.data_vencimento) from public.oc_parcelas p
      where p.ordem_compra_id = p_oc_id
    )
    where id = v_lanc_id;
  end if;

  with fatia as (
    select oi.centro_custo_id,
           i.categoria_financeira_id as categoria_id,
           round(sum(oi.quantidade * oi.preco_unitario), 2) as bruto
    from public.oc_itens oi
    join public.insumos i on i.id = oi.insumo_id
    where oi.ordem_compra_id = p_oc_id
    group by oi.centro_custo_id, i.categoria_financeira_id
  ),
  base as (select coalesce(sum(bruto), 0) as total_itens from fatia),
  proporcional as (
    select f.centro_custo_id, f.categoria_id,
           case when b.total_itens = 0 then 0
                else round(f.bruto * v_total / b.total_itens, 2) end as valor,
           row_number() over (order by f.bruto desc, f.centro_custo_id) as ordem
    from fatia f cross join base b
  ),
  resto as (select v_total - coalesce(sum(valor), 0) as sobra from proporcional)
  insert into public.lancamento_rateios
    (lancamento_id, centro_custo_id, categoria_id, valor, created_by)
  select v_lanc_id, p.centro_custo_id, p.categoria_id,
         p.valor + case when p.ordem = 1 then (select sobra from resto) else 0 end,
         (select auth.uid())
  from proporcional p;

  perform public.fn_propagar_anexos('ordem_compra', p_oc_id, 'lancamento', v_lanc_id);

  perform public.fn_aplicar_regra_pagamento(v_lanc_id);
end;
$function$;
