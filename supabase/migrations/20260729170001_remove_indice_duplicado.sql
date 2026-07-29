-- Corrige um erro da 20260729160001: o indice de centro de custo em
-- lancamento_rateios ja existia como idx_lancamento_rateios_cc, e eu criei um
-- identico. O advisor de performance apontou (duplicate_index). Indice
-- duplicado custa escrita e espaco sem ganhar leitura nenhuma.
drop index if exists public.idx_lancamento_rateios_centro_custo;
