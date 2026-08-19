-- =============================================================
-- Categorias que faltavam no plano de contas
--
-- Vieram da planilha de lancamentos da EMT (histórico de 2024-2026).
-- A fn_importar_lancamentos recusa criar cadastro sozinha, de
-- proposito: importacao que cria categoria silenciosamente
-- transforma erro de digitacao em plano de contas novo. Entao as
-- categorias legitimas entram aqui, explicitamente, e ficam
-- registradas nesta migration.
--
-- Todas sao despesa. Nenhuma receita nova apareceu na planilha.
--
-- Casa por chave sem acento para nao duplicar o que ja existe com
-- grafia diferente.
-- =============================================================

insert into public.categorias_financeiras (nome, tipo)
select v.nome, 'despesa'
from (values
  ('13º Salário Pessoal Administrativo'),
  ('Adiantamento Salarial Pessoal Administrativo'),
  ('Vale Alimentação Pessoal Administrativo'),
  ('Água e Esgoto'),
  ('Cartório'),
  ('Compra de Terreno'),
  ('E-SOCIAL'),
  ('FGTS'),
  ('INSS'),
  ('IPTU'),
  ('IPVA'),
  ('Internet'),
  ('Juros'),
  ('Limpeza'),
  ('Multas'),
  ('Tarifa Bancária'),
  ('Telefone Celular')
) as v(nome)
where not exists (
  select 1 from public.categorias_financeiras c
  where public.fn_chave_nome(c.nome) = public.fn_chave_nome(v.nome)
);
