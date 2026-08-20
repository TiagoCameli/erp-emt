-- Bloco 2, parte B: a OC grava formas e parcelas na MESMA chamada.
--
-- Por que numa chamada so: `oc_parcelas.oc_forma_id` referencia oc_formas com
-- ON DELETE CASCADE. Duas RPCs (uma para formas, outra para parcelas) fariam a
-- primeira apagar as formas, levar as parcelas em cascata, e um erro na segunda
-- deixaria a ordem SEM parcela nenhuma -- sem transacao entre chamadas do
-- supabase-js nao ha como desfazer. Uma funcao, uma transacao.
--
-- Parametro novo com DEFAULT e por DROP+CREATE, pelo mesmo motivo do lancamento:
-- a migration entra antes do deploy, e duas sobrecargas fariam o PostgREST
-- escolher uma em runtime com o build verde.
--
-- Aqui NAO ha constraint trigger de soma (ao contrario do lancamento): o
-- valor_total da OC e derivado dos itens, e uma trava continua estouraria ao
-- editar item. A soma e conferida ao SALVAR (aqui) e de novo na APROVACAO, que e
-- exatamente como as parcelas da OC ja se comportavam.

drop function if exists public.fn_salvar_parcelas_oc(uuid, jsonb);

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
