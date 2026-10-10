-- Reclassificacao, estrutura (PR 2 do controle total, 10/10/2026; D3, D4, D5).
--
-- Naturezas novas fora do resultado: distribuicao (retirada de socio, D3: nao
-- existe pro-labore formal, todo envio a socio e despesa pessoal da familia e
-- distribuicao) e mutuo (empresa ligada, D4: o que a EMT paga pela Amazonia e
-- pela Jurua FM e emprestimo a receber).
--
-- Tipos de centro novos, fora do custo das obras: socio, empresa_ligada e
-- imobilizado. Imobilizado (Aquisicao de Equipamentos e de Imoveis, D5) e um
-- tipo proprio e nao o 'investimento' das aplicacoes financeiras: varias RPCs
-- (transferencia, etapa de investimento, conciliacao) tratam centro
-- 'investimento' como CDB/fundo e aceitariam essas etapas como aplicacao.
--
-- Os dados (rateios) nao mudam aqui: so pela planilha de-para aprovada (D11).

alter table public.categorias_financeiras drop constraint categorias_financeiras_natureza_check;
alter table public.categorias_financeiras add constraint categorias_financeiras_natureza_check
  check (natureza = any (array['operacional', 'financeira', 'movimentacao', 'investimento', 'distribuicao', 'mutuo']));

alter table public.centros_custo drop constraint centros_custo_tipo_check;
alter table public.centros_custo add constraint centros_custo_tipo_check
  check (tipo = any (array['obra', 'escritorio', 'manutencao', 'financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado']));

insert into public.categorias_financeiras (nome, tipo, natureza)
select v.nome, v.tipo, v.natureza
  from (values
    ('Distribuição a sócio', 'despesa', 'distribuicao'),
    ('Mútuo concedido a empresa ligada', 'despesa', 'mutuo'),
    ('Devolução de mútuo', 'receita', 'mutuo'),
    ('Consórcio a contemplar', 'despesa', 'investimento'),
    ('Taxa de administração de consórcio', 'despesa', 'operacional'),
    ('Juros de empréstimos', 'despesa', 'financeira')
  ) as v(nome, tipo, natureza)
 where not exists (
   select 1 from public.categorias_financeiras c where c.nome = v.nome and c.tipo = v.tipo
 );

-- O centro da pessoa fisica do James vira o centro do socio: mesmo id, entao os
-- rateios que ja estao nele ficam onde estao.
update public.centros_custo
   set nome = 'Sócio James Castro Cameli', tipo = 'socio'
 where id = 'e892aee6-fab2-4931-9582-640ce7be3967';

update public.centros_custo set tipo = 'socio'
 where id = 'dd508720-2c7a-4e22-bebe-4b80947499cf';  -- Casa James (rateios vao para o socio pela planilha)

update public.centros_custo set tipo = 'empresa_ligada'
 where id in ('a6a1f57d-b8cb-4113-b694-58f34af7bdb4',   -- Amazonia Agroindustria
              '14ee28be-7932-420c-aee1-2f1eba5ad384');  -- Jurua FM

update public.centros_custo set tipo = 'imobilizado'
 where id in ('65d9a77a-b70b-42ed-a0f1-3e6ca5905da1',   -- Aquisicao de Equipamentos
              '4b19c3f2-f8ef-43f4-b1dd-d842def8fd55');  -- Aquisicao de Imoveis

insert into public.centros_custo (nome, nivel, tipo, ativo, sistema)
select 'Sócio Tiago de Melo Cameli', 1, 'socio', true, false
 where not exists (select 1 from public.centros_custo where nome = 'Sócio Tiago de Melo Cameli' and nivel = 1);
