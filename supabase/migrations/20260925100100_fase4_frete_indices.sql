-- Advisor de performance depois da 20260925100000: as chaves que as telas do Frete filtram e
-- juntam (origem e destino do frete, pedreira da localidade, obra do movimento).
create index if not exists idx_fretes_origem_localidade on public.fretes (origem_localidade_id);
create index if not exists idx_fretes_destino_localidade on public.fretes (destino_localidade_id);
create index if not exists idx_localidades_fornecedor on public.localidades (fornecedor_id);
create index if not exists idx_transp_mov_centro on public.transportadora_movimentos (centro_custo_id);
create index if not exists idx_frete_ajustes_centro on public.frete_ajustes (centro_custo_id);
