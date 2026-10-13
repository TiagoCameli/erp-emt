-- =============================================================
-- Casa James fica vazia; Galpao Silo vira imobilizado
--
-- Pedido do Tiago (12/10/2026): "a etapa casa james, se tiver algum
-- lancamento coloque tudo para socio james castro cameli, e delete a etapa
-- casa james. o galpao silo foi a construcao de um imobilizado entao tem
-- que ser um imobilizado, adicione uma etapa chamada construcao de
-- imobilizados, e coloque o galpao do silo como um item."
--
-- Casa James: lancamentos e rateios ja tinham ido para o Socio James
-- (20261012185509). Sobravam 3 itens de OC, 8 de folha e 7 de 13o; vao
-- para o Socio James aqui.
--
-- Galpao Silo: nasce o centro "Construcao de Imobilizados" (tipo
-- imobilizado, irmao de Aquisicao de Equipamentos e de Imoveis) e o PROPRIO
-- no do Galpao Silo desce para baixo dele. Mesmo id: os 82 rateios, o item
-- de OC e os 4 itens de 13o continuam apontando para ele sem update, e os
-- relatorios passam a le-los como imobilizado porque o tipo vem da raiz.
--
-- As exclusoes (centro Casa James, agora vazio, e obra Galpao Silo,
-- concluida, inativa e sem centro) NAO estao aqui: delete pelo MCP pede uma
-- confirmacao que a sessao em segundo plano nao deu. A Casa James sai pelo
-- "Excluir" da arvore; a obra fica inativa ate sair pela lixeira.
-- =============================================================

do $dados$
declare
  v_casa constant uuid := 'dd508720-2c7a-4e22-bebe-4b80947499cf';
  v_silo constant uuid := '8fdf5512-bf97-46c4-9384-d4e164237cbb';
  v_obra_silo constant uuid := 'c9c5c16b-ff3a-43f9-8d0a-973b2e5ae862';
  v_james uuid;
  v_construcao uuid;
begin
  -- ---------- Casa James ----------
  select id into v_james from public.centros_custo
   where nome = 'Sócio James Castro Cameli' and nivel = 1 and tipo = 'socio';
  if v_james is null then
    raise exception 'Socio James Castro Cameli nao encontrado';
  end if;

  update public.oc_itens set centro_custo_id = v_james where centro_custo_id = v_casa;
  update public.folha_itens set centro_custo_id = v_james where centro_custo_id = v_casa;
  update public.rh_decimo_terceiro_itens set centro_custo_id = v_james where centro_custo_id = v_casa;
  update public.lancamento_rateios set centro_custo_id = v_james where centro_custo_id = v_casa;
  update public.lancamentos set centro_custo_id = v_james where centro_custo_id = v_casa;
  update public.colaboradores set centro_custo_id = v_james where centro_custo_id = v_casa;

  if public.fn_centro_custo_bloqueio(v_casa) is not null then
    raise exception 'Casa James ainda tem uso (%)', public.fn_centro_custo_bloqueio(v_casa);
  end if;


  -- ---------- Galpao Silo ----------
  select id into v_construcao from public.centros_custo
   where nome = 'Construção de Imobilizados' and nivel = 1;
  if v_construcao is null then
    insert into public.centros_custo (nome, nivel, tipo, ativo, sistema)
    values ('Construção de Imobilizados', 1, 'imobilizado', true, false)
    returning id into v_construcao;
  end if;

  update public.centros_custo
     set nivel = 2,
         pai_id = v_construcao,
         tipo = null,
         obra_id = null,
         papel_rateio = null,
         nome = 'Galpão Silo',
         ativo = true
   where id = v_silo;

  if exists (select 1 from public.centros_custo where obra_id = v_obra_silo) then
    raise exception 'Obra Galpao Silo ainda tem centro';
  end if;

end $dados$;
