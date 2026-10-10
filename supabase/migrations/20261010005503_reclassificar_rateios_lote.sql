-- Lote de reclassificacao de rateios (PR 2 do controle total, 10/10/2026; D11).
--
-- Aplica a planilha de-para aprovada pelo Tiago: troca a categoria e/ou o
-- centro de custo de rateios existentes, sem mexer em valor. Mesmas regras de
-- fn_definir_rateio_lancamento (permissao, tipo de lancamento, aplicacao,
-- cancelado, competencia aberta, motivo, centro ativo) e mais duas do lote:
-- a categoria tem que ser do tipo do lancamento (despesa/receita) e o centro
-- novo nao pode repetir outro rateio do mesmo lancamento. Um rateio_eventos e
-- uma checagem de competencia por lancamento que mudou; quando os rateios ficam
-- todos na mesma categoria, o cabecalho acompanha. Tudo ou nada: um item
-- recusado desfaz o lote.

create or replace function public.fn_reclassificar_rateios_lote(p_itens jsonb, p_motivo text)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_item jsonb;
  v_r public.lancamento_rateios;
  v_l public.lancamentos;
  v_cat uuid; v_centro uuid; v_tipo_cat text;
  v_mudou int := 0;
  v_lanc uuid;
  v_antes jsonb;
  v_lancs uuid[] := '{}';
  v_antes_por_lanc jsonb := '{}'::jsonb;
begin
  if not public.tem_permissao('financeiro.lancamentos', 'editar') then
    raise exception 'Sem permissao para editar lancamentos';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da reclassificacao';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum rateio para reclassificar';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_r from public.lancamento_rateios where id = (v_item->>'rateioId')::uuid for update;
    if v_r.id is null then
      raise exception 'Rateio % nao encontrado', v_item->>'rateioId';
    end if;
    select * into v_l from public.lancamentos where id = v_r.lancamento_id;

    if v_l.origem = 'aplicacao' then
      raise exception 'Lancamento %: gerado pela posicao da aplicacao, nao se reclassifica aqui', v_l.numero;
    end if;
    if v_l.status = 'cancelado' then
      raise exception 'Lancamento %: cancelado nao se reclassifica', v_l.numero;
    end if;
    if not public.fn_pode_lancar_tipo(v_l.tipo, 'editar') then
      raise exception 'Lancamento %: sem permissao para editar lancamentos deste tipo', v_l.numero;
    end if;

    v_cat := coalesce(nullif(v_item->>'categoriaId', '')::uuid, v_r.categoria_id);
    v_centro := coalesce(nullif(v_item->>'centroCustoId', '')::uuid, v_r.centro_custo_id);

    if v_cat is not null then
      select tipo into v_tipo_cat from public.categorias_financeiras where id = v_cat;
      if v_tipo_cat is null then
        raise exception 'Lancamento %: categoria inexistente', v_l.numero;
      end if;
      if v_tipo_cat <> (case when v_l.tipo = 'a_receber' then 'receita' else 'despesa' end) then
        raise exception 'Lancamento %: a categoria e de outro tipo (% em lancamento %)', v_l.numero, v_tipo_cat, v_l.tipo;
      end if;
    end if;
    if v_centro <> v_r.centro_custo_id then
      if not exists (select 1 from public.centros_custo c where c.id = v_centro and c.ativo) then
        raise exception 'Lancamento %: centro de custo inexistente ou inativo', v_l.numero;
      end if;
      if exists (select 1 from public.lancamento_rateios x
                  where x.lancamento_id = v_l.id and x.id <> v_r.id and x.centro_custo_id = v_centro) then
        raise exception 'Lancamento %: ja tem rateio nesse centro; junte as linhas em Lancamentos', v_l.numero;
      end if;
    end if;

    if v_cat is not distinct from v_r.categoria_id and v_centro = v_r.centro_custo_id then
      continue;
    end if;

    if not (v_l.id = any(v_lancs)) then
      -- Uma checagem (e, para quem pode reabrir, uma excecao) por lancamento, e
      -- so quando algo muda de fato.
      perform public.fn_exigir_competencia_aberta(v_l.mes_competencia, 'lancamento', v_l.id);
      select coalesce(jsonb_agg(jsonb_build_object('centro_custo_id', centro_custo_id, 'categoria_id', categoria_id, 'valor', valor)
             order by valor desc, centro_custo_id), '[]'::jsonb)
        into v_antes from public.lancamento_rateios where lancamento_id = v_l.id;
      v_antes_por_lanc := v_antes_por_lanc || jsonb_build_object(v_l.id::text, v_antes);
      v_lancs := v_lancs || v_l.id;
    end if;

    update public.lancamento_rateios set categoria_id = v_cat, centro_custo_id = v_centro where id = v_r.id;
    v_mudou := v_mudou + 1;
  end loop;

  foreach v_lanc in array v_lancs loop
    -- Rateios todos na mesma categoria: o cabecalho acompanha. A lista de
    -- lancamentos filtra pela categoria do cabecalho, e o clique no DRE abriria
    -- vazio se so o rateio mudasse. Com categorias diferentes, o cabecalho fica.
    update public.lancamentos l
       set categoria_id = x.cat
      from (select min(categoria_id::text)::uuid as cat
              from public.lancamento_rateios where lancamento_id = v_lanc
            having count(distinct categoria_id) = 1 and count(*) = count(categoria_id)) x
     where l.id = v_lanc and l.categoria_id is distinct from x.cat;

    insert into public.rateio_eventos (lancamento_id, motivo, antes, depois, created_by)
    select v_lanc, btrim(p_motivo), v_antes_por_lanc->(v_lanc::text),
           coalesce(jsonb_agg(jsonb_build_object('centro_custo_id', centro_custo_id, 'categoria_id', categoria_id, 'valor', valor)
             order by valor desc, centro_custo_id), '[]'::jsonb),
           (select auth.uid())
      from public.lancamento_rateios where lancamento_id = v_lanc;
  end loop;

  return v_mudou;
end;
$function$;

revoke execute on function public.fn_reclassificar_rateios_lote(jsonb, text) from public, anon;
grant execute on function public.fn_reclassificar_rateios_lote(jsonb, text) to authenticated;
