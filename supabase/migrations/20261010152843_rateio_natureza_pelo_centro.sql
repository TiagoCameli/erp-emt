-- Rateio nasce com a natureza do centro (Tiago, 10/10/2026: "devem nascer como
-- distribuicao e mutuo").
--
-- Centro de socio (James, Tiago, Casa James): todo gasto e distribuicao, porque
-- nao ha pro-labore formal e despesa pessoal da familia e retirada (D3).
-- Centro de empresa ligada (Amazonia, Jurua FM): o que a EMT paga e mutuo
-- concedido, o que volta e devolucao de mutuo (D4).
--
-- Vale para QUALQUER origem (folha, 13o, ferias, OC, combustivel, manual), na
-- insercao e quando o rateio muda de centro ou de categoria: a folha do caseiro
-- e o diesel da Amazonia param de sujar o DRE sem depender de quem lanca.
-- Fica como esta: natureza ja propria (distribuicao, mutuo), movimentacao
-- (emprestimo, como o BASA) e investimento (bem comprado). A receber em centro
-- de socio tambem fica (nao ha categoria de devolucao de socio).

create or replace function public.fn_rateio_natureza_pelo_centro()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_raiz_tipo text;
  v_tipo_lanc text;
  v_cat_lanc uuid;
  v_natureza text;
  v_nova uuid;
begin
  with recursive subindo as (
    select c.id, c.pai_id, c.tipo from public.centros_custo c where c.id = new.centro_custo_id
    union all
    select p.id, p.pai_id, p.tipo from public.centros_custo p join subindo s on p.id = s.pai_id
  )
  select tipo into v_raiz_tipo from subindo where pai_id is null;

  if v_raiz_tipo is null or v_raiz_tipo not in ('socio', 'empresa_ligada') then
    return new;
  end if;

  select l.tipo, l.categoria_id into v_tipo_lanc, v_cat_lanc
    from public.lancamentos l where l.id = new.lancamento_id;
  select c.natureza into v_natureza
    from public.categorias_financeiras c where c.id = coalesce(new.categoria_id, v_cat_lanc);

  if coalesce(v_natureza, 'operacional') not in ('operacional', 'financeira') then
    return new;
  end if;

  if v_raiz_tipo = 'socio' and v_tipo_lanc = 'a_pagar' then
    select id into v_nova from public.categorias_financeiras where nome = 'Distribuição a sócio' and tipo = 'despesa';
  elsif v_raiz_tipo = 'empresa_ligada' and v_tipo_lanc = 'a_pagar' then
    select id into v_nova from public.categorias_financeiras where nome = 'Mútuo concedido a empresa ligada' and tipo = 'despesa';
  elsif v_raiz_tipo = 'empresa_ligada' and v_tipo_lanc = 'a_receber' then
    select id into v_nova from public.categorias_financeiras where nome = 'Devolução de mútuo' and tipo = 'receita';
  end if;

  if v_nova is not null then
    new.categoria_id := v_nova;
  end if;
  return new;
end;
$function$;

revoke execute on function public.fn_rateio_natureza_pelo_centro() from public, anon, authenticated;

drop trigger if exists trg_rateio_natureza_pelo_centro on public.lancamento_rateios;
create trigger trg_rateio_natureza_pelo_centro
  before insert or update of centro_custo_id, categoria_id on public.lancamento_rateios
  for each row execute function public.fn_rateio_natureza_pelo_centro();
