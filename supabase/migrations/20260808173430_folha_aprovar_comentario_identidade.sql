-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808173430 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Fix round 1 da Task 4 do Bloco 8a: SÓ COMENTÁRIO, nenhuma linha do corpo muda.
--
-- O cabeçalho da 20260808165314 afirmava a identidade de conferência sem
-- condição nenhuma, e ela é condicional. Um encargo ativo com
-- grupo_recolhimento nulo entra em folhas.custo_total e nunca vira conta a
-- pagar (é provisão, o caminho que o Bloco 8b vai usar para 13o e férias):
-- medido pelo revisor, 678,94 de resíduo com 678,94 de encargo sem grupo.
-- O Step 12 testou com TODOS os grupos nulos (100% de buraco, lê como "config
-- vazia"), então o caso parcial, que é o que engana, ficou sem cobertura.
--
-- O texto vai para o comentário da função no banco (obj_description) porque é
-- lá que quem confere o número vai olhar, não no arquivo do repo.
comment on function public.fn_aprovar_folha(uuid) is
$c$Aprova a folha e gera as contas a pagar: um a_pagar por colaborador com o valor liquido (origem 'folha', origem_id = folha_itens.id) e um a_pagar por grupo de recolhimento com a guia (origem 'folha_guia', origem_id = folha_guias.id).

CONFERENCIA (para quem bate custo_total contra o contas a pagar):

  soma(liquidos) + soma(guias) + soma(adiantamentos) = folhas.custo_total

Essa igualdade fecha no centavo QUANDO, e somente quando, as duas condicoes valem:
  1. todo encargo ativo tem grupo_recolhimento preenchido; e
  2. todo item da folha tem valor_liquido > 0.

Quando uma das duas nao vale, a diferenca NAO e arredondamento. Ela e exatamente:

  diferenca = soma(encargos sem grupo de recolhimento) + soma(valor_liquido <= 0)

e as duas pontas sao comportamento desejado, nao erro:

  - Encargo ativo sem grupo_recolhimento e PROVISAO: entra no custo do empregador (folhas.custo_total) e de proposito nao gera guia, porque nao existe para onde recolher. E o desenho que 13o e ferias usam.
  - Item com valor_liquido <= 0 nao gera lancamento: o adiantamento do mes ja consumiu o salario, e lancamento de R$ 0 ou negativo e impossivel (lancamentos tem check valor >= 0). O colaborador segue na folha, com o liquido negativo visivel no item.

Para achar a diferenca de uma folha:
  select
    (select coalesce(sum(fie.valor), 0)
       from public.folha_item_encargos fie
       join public.folha_itens fi on fi.id = fie.folha_item_id
      where fi.folha_id = :folha and fie.grupo_recolhimento is null) as encargos_sem_grupo,
    (select coalesce(sum(valor_liquido), 0)
       from public.folha_itens
      where folha_id = :folha and valor_liquido <= 0)                as liquidos_nao_positivos;

RATEIO: o rateio da guia e exato, nao proporcional (cada centavo nasce ligado a um item, e o item tem centro de custo), mas item com centro_custo_id nulo fica de fora do rateio. Nesse caso soma(rateios) < valor do lancamento, espalhado por todas as guias, e o custo nao chega a centro de custo nenhum. Ver docs/decisoes.md, entrada de 2026-08-08.$c$;

do $$
begin
  if coalesce(length(obj_description('public.fn_aprovar_folha(uuid)'::regprocedure, 'pg_proc')), 0) = 0 then
    raise exception 'fn_aprovar_folha ficou sem comentario';
  end if;
  -- A condicao tem que estar escrita, senao o comentario nao serve para nada.
  if obj_description('public.fn_aprovar_folha(uuid)'::regprocedure, 'pg_proc')
     not like '%somente quando%' then
    raise exception 'o comentario da fn_aprovar_folha nao declara a condicao da identidade';
  end if;
  -- E o corpo nao pode ter mudado: md5 da versao aplicada na 20260808165314.
  if md5((select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_aprovar_folha'))
     <> 'a1261a1ccbff886980f0991da47a2446' then
    raise exception 'o corpo da fn_aprovar_folha mudou: esta migration e so de comentario';
  end if;
end $$;

-- Rollback:
--   comment on function public.fn_aprovar_folha(uuid) is null;
