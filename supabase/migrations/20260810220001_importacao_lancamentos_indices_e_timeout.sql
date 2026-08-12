-- =============================================================
-- Importacao de lancamentos: indices de chave de nome e timeout
--
-- A carga de 7.253 linhas morria com "canceling statement due to
-- statement timeout". Nao era volume de escrita, era busca:
--
-- Cada linha resolve fornecedor, categoria, centro de custo, forma e
-- conta por fn_chave_nome(nome). Sem indice, cada uma dessas e uma
-- varredura completa da tabela chamando a funcao em cada linha. Com
-- 931 fornecedores e 7.253 linhas, so o fornecedor dava ~6,7 milhoes
-- de chamadas, e a validacao roda o mesmo trabalho duas vezes (uma
-- para validar tudo, outra para gravar).
--
-- 1. INDICES DE EXPRESSAO. fn_chave_nome e IMMUTABLE, entao da para
--    indexar a expressao. Cada busca vira um seek em vez de uma
--    varredura. Servem tambem para as outras importacoes que casam
--    por chave de nome (centros de custo, insumos, BR-364).
--
-- 2. TIMEOUT PROPRIO DA FUNCAO. Mesmo rapida, carga em lote nao cabe
--    no statement_timeout curto que protege consulta de tela. O ALTER
--    FUNCTION ... SET aplica o timeout SO nesta funcao, na entrada, e
--    restaura na saida. Nao afeta nenhuma outra consulta do app, que
--    e o motivo de nao mexer no timeout do papel authenticated.
-- =============================================================

create index if not exists idx_fornecedores_chave_razao
  on public.fornecedores (public.fn_chave_nome(razao_social));
create index if not exists idx_fornecedores_chave_fantasia
  on public.fornecedores (public.fn_chave_nome(coalesce(nome_fantasia, '')));
create index if not exists idx_fornecedores_doc_digitos
  on public.fornecedores (regexp_replace(coalesce(cnpj_cpf, ''), '\D', '', 'g'));

create index if not exists idx_categorias_financeiras_chave
  on public.categorias_financeiras (public.fn_chave_nome(nome));
create index if not exists idx_centros_custo_chave
  on public.centros_custo (public.fn_chave_nome(nome));
create index if not exists idx_formas_pagamento_chave
  on public.formas_pagamento (public.fn_chave_nome(nome));
create index if not exists idx_contas_bancarias_chave
  on public.contas_bancarias (public.fn_chave_nome(nome));

-- Carga em lote precisa de mais tempo que consulta de tela. Escopo:
-- apenas esta funcao.
alter function public.fn_importar_lancamentos(jsonb) set statement_timeout = '10min';

analyze public.fornecedores;
analyze public.categorias_financeiras;
analyze public.centros_custo;
