-- fn_centros_custo_em_uso (20261012230913) duplicava a fn_centros_custo_bloqueios,
-- que ja existia e ja devolve o codigo de cada centro pela mesma trava. A arvore
-- usa a bloqueios; esta sai.
drop function if exists public.fn_centros_custo_em_uso();
