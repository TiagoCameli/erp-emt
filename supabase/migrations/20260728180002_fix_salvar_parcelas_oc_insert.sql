-- Correção aplicada durante a prova no banco: o INSERT de oc_parcelas listava
-- created_by na lista de colunas mas não na lista de expressões, então a função
-- estourava com "INSERT has more target columns than expressions".
-- create or replace: rodar de novo é inofensivo.

create or replace function public.fn_salvar_parcelas_oc(
  p_oc_id uuid,
  p_parcelas jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_total numeric(14, 2);
  v_emissao date;
  v_soma numeric(14, 2);
  v_qtd int;
begin
  -- Quem cria a OC precisa poder definir as parcelas dela na mesma sessão,
  -- então 'criar' também abre a porta (a trava real é o status da OC).
  if not (
    public.tem_permissao('compras.ordens', 'editar')
    or public.tem_permissao('compras.ordens', 'criar')
  ) then
    raise exception 'Sem permissao para definir parcelas da ordem de compra';
  end if;

  select status, valor_total, data_emissao
  into v_status, v_total, v_emissao
  from public.ordens_compra
  where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status not in ('rascunho', 'pendente_aprovacao') then
    raise exception 'Só da para mexer nas parcelas de uma ordem em rascunho ou pendente de aprovacao. Depois de aprovada, edite as parcelas no lancamento.';
  end if;

  v_qtd := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));

  -- Lista vazia limpa as parcelas: a OC volta a ser "sem parcelas definidas".
  delete from public.oc_parcelas where ordem_compra_id = p_oc_id;
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
    where (x->>'data_vencimento')::date < v_emissao
  ) then
    raise exception 'Nenhuma parcela pode vencer antes da emissao da ordem (%)', v_emissao;
  end if;

  select round(coalesce(sum((x->>'valor')::numeric), 0), 2)
  into v_soma
  from jsonb_array_elements(p_parcelas) x;

  if v_soma <> round(v_total, 2) then
    raise exception 'A soma das parcelas (R$ %) precisa fechar com o total da ordem (R$ %)', v_soma, round(v_total, 2);
  end if;

  -- A numeração é dada aqui pela ordem de vencimento: nunca chega furada.
  insert into public.oc_parcelas (
    ordem_compra_id, numero_parcela, data_vencimento, valor, created_by
  )
  select
    p_oc_id,
    row_number() over (
      order by (x->>'data_vencimento')::date, x->>'valor'
    )::smallint,
    (x->>'data_vencimento')::date,
    round((x->>'valor')::numeric, 2),
    (select auth.uid())
  from jsonb_array_elements(p_parcelas) x;
end;
$function$;
