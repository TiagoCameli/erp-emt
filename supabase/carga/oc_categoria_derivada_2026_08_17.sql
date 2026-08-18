-- Categoria de custo nas 17 ordens de compra carregadas do Mais Controle.
--
-- Elas entraram por SQL (supabase/carga/oc_mais_controle_2026_08_17.sql), contornando
-- o formulário — que exige o campo —, e ficaram com `categoria_id` nulo. Agora que o
-- insumo carrega a categoria de custo, a da ordem é derivável: a de maior valor entre
-- os itens, a mesma regra que `fn_aprovar_ordem_compra` aplica.
--
-- ## Três lugares, não um
--
-- A OC-2026-0008 (GOL LOG, R$ 375,17) foi aprovada e recebida por outra frente em
-- 18/08/2026, e já gerou lançamento — que nasceu sem categoria porque a ordem não
-- tinha. Então o backfill cobre a ordem, o lançamento gerado e o rateio dele.
--
-- Também preenche o LAN-2026-1899 (POSTO DE MOLAS JABA, R$ 520,13), da carga de julho,
-- que ficou sem categoria pelo mesmo motivo. Esse não vem de OC: a categoria sai do
-- rateio dele, que já foi preenchido pela migration 20260817190200.

do $$
declare
  v_falta int;
begin
  -- 1. a ordem recebe a categoria de maior valor entre os itens
  update public.ordens_compra o
  set categoria_id = escolhida.categoria_id,
      updated_at = now()
  from (
    select por_categoria.ordem_compra_id,
           (array_agg(por_categoria.categoria_id order by por_categoria.valor desc))[1]
             as categoria_id
    from (
      select oi.ordem_compra_id,
             i.categoria_financeira_id as categoria_id,
             round(sum(oi.quantidade * oi.preco_unitario), 2) as valor
      from public.oc_itens oi
      join public.insumos i on i.id = oi.insumo_id
      where i.categoria_financeira_id is not null
      group by oi.ordem_compra_id, i.categoria_financeira_id
    ) por_categoria
    group by por_categoria.ordem_compra_id
  ) escolhida
  where o.id = escolhida.ordem_compra_id and o.categoria_id is null;

  -- 2. o lancamento ja gerado por aprovacao herda a categoria da ordem
  update public.lancamentos l
  set categoria_id = o.categoria_id, updated_at = now()
  from public.ordens_compra o
  where l.origem = 'oc' and l.origem_id = o.id
    and l.categoria_id is null and o.categoria_id is not null;

  -- 3. o rateio desse lancamento tambem
  update public.lancamento_rateios r
  set categoria_id = l.categoria_id
  from public.lancamentos l
  where l.id = r.lancamento_id
    and r.categoria_id is null and l.categoria_id is not null;

  -- 4. lancamento sem OC que ficou sem categoria: pega a do proprio rateio
  update public.lancamentos l
  set categoria_id = (
        select r.categoria_id from public.lancamento_rateios r
        where r.lancamento_id = l.id and r.categoria_id is not null
        order by r.valor desc limit 1),
      updated_at = now()
  where l.categoria_id is null
    and exists (select 1 from public.lancamento_rateios r
                where r.lancamento_id = l.id and r.categoria_id is not null);

  -- linha de controle: nenhuma ordem pode sobrar sem categoria
  select count(*) into v_falta from public.ordens_compra where categoria_id is null;
  if v_falta > 0 then
    raise exception 'Sobraram % ordem(ns) de compra sem categoria', v_falta;
  end if;
end $$;

-- 5. O LAN-2026-1899 (POSTO DE MOLAS JABA, R$ 520,13, "compra de 01 balança para
--    carreta SQS 7E") não foi alcançado pelo passo 4: ele buscava a categoria no
--    próprio rateio, e o rateio dele também estava vazio. Sem OC e sem insumo, não há
--    de onde derivar — foi classificado como "Manutenção de equipamentos" (balança de
--    carreta é peça de equipamento), com a escolha registrada em `observacoes` para a
--    contabilidade rever se quiser.
update public.lancamentos l
set categoria_id = (select id from public.categorias_financeiras
                    where nome = 'Manutenção de equipamentos' and tipo = 'despesa' and ativo),
    updated_at = now()
where l.numero = 'LAN-2026-1899' and l.categoria_id is null
  and l.descricao ilike '%BALANCA PARA CARRETA%';

update public.lancamento_rateios r
set categoria_id = l.categoria_id
from public.lancamentos l
where l.id = r.lancamento_id and r.categoria_id is null and l.categoria_id is not null;
