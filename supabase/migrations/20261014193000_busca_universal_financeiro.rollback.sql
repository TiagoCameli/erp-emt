-- ROLLBACK da busca universal de Financeiro, OS, Insumos e Medição
-- (20261014193000, 20261014194500, 20261014195500, 20261014203000).
-- Rodar só depois de voltar o frontend, que filtra pela coluna computada `busca`.
-- Deixa Compras (20261014180000..184500) funcionando: depois disto, reaplicar
-- `fn_busca_indexar` e `trg_busca_indice_cadastro` como estavam em 20261014183000.

drop function if exists public.busca(public.lancamentos);
drop function if exists public.busca(public.lancamento_parcelas);
drop function if exists public.busca(public.ordens_servico);
drop function if exists public.busca(public.insumos);
drop function if exists public.busca(public.mc_v_lancamentos);

drop trigger if exists trg_busca_indice on public.lancamentos;
drop trigger if exists trg_busca_indice on public.lancamento_parcelas;
drop trigger if exists trg_busca_indice_pai on public.lancamento_parcelas;
drop trigger if exists trg_busca_indice on public.lancamento_rateios;
drop trigger if exists trg_busca_indice on public.lancamento_formas;
drop trigger if exists trg_busca_indice on public.clientes;
drop trigger if exists trg_busca_indice on public.colaboradores;
drop trigger if exists trg_busca_indice on public.contas_bancarias;
drop trigger if exists trg_busca_indice on public.ordens_servico;
drop trigger if exists trg_busca_indice on public.os_pecas;
drop trigger if exists trg_busca_indice_proprio on public.insumos;
drop trigger if exists trg_busca_indice on public.insumo_grupos;
drop trigger if exists trg_busca_indice on public.unidades_medida;
drop trigger if exists trg_busca_indice on public.equipamentos;

drop function if exists public.fn_busca_texto_lancamento_base(uuid);
drop function if exists public.fn_busca_texto_parcela(uuid);
drop function if exists public.fn_busca_texto_ordem_servico(uuid);
drop function if exists public.fn_busca_texto_insumo(uuid);

delete from public.busca_indice
 where tabela in ('lancamentos', 'lancamentos_base', 'lancamento_parcelas', 'ordens_servico', 'insumos');

notify pgrst, 'reload schema';
