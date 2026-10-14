-- ROLLBACK da busca universal de Compras (20261014180000, 20261014183000, 20261014184500).
-- Rodar só depois de voltar o frontend, que filtra pela coluna computada `busca`.
drop function if exists public.busca(public.cotacoes);
drop function if exists public.busca(public.ordens_compra);

drop trigger if exists trg_busca_indice on public.ordens_compra;
drop trigger if exists trg_busca_indice on public.oc_itens;
drop trigger if exists trg_busca_indice on public.cotacoes;
drop trigger if exists trg_busca_indice on public.cotacao_fornecedores;
drop trigger if exists trg_busca_indice on public.cotacao_itens;
drop trigger if exists trg_busca_indice on public.fornecedores;
drop trigger if exists trg_busca_indice on public.insumos;
drop trigger if exists trg_busca_indice on public.categorias_insumo;
drop trigger if exists trg_busca_indice on public.centros_custo;
drop trigger if exists trg_busca_indice on public.categorias_financeiras;
drop trigger if exists trg_busca_indice on public.formas_pagamento;
drop trigger if exists trg_busca_indice on public.condicoes_pagamento;

drop function if exists public.trg_busca_indice_cadastro();
drop function if exists public.trg_busca_indice_filho();
drop function if exists public.trg_busca_indice_linha();
drop function if exists public.fn_busca_indexar_varios(text, uuid[]);
drop function if exists public.fn_busca_indexar(text, uuid);
drop function if exists public.fn_busca_texto_cotacao(uuid);
drop function if exists public.fn_busca_texto_ordem_compra(uuid);
drop table if exists public.busca_indice;

drop function if exists public.fn_busca_data(date);
drop function if exists public.fn_busca_mes(date);
drop function if exists public.fn_busca_valor(numeric);
drop function if exists public.fn_busca_norm(text);
notify pgrst, 'reload schema';
