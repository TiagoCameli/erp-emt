-- Categoria de custo no insumo.
--
-- A categoria do custo era digitada na Ordem de Compra, num select de 55 opções,
-- mesmo depois de a pessoa já ter escolhido os insumos — que sabem a que categoria
-- pertencem. Digitar duas vezes deixa divergir: nada impedia uma OC de Diesel S10
-- ser classificada como "Materiais de construção".
--
-- ## Por que a coluna fica no insumo, e não na categoria de insumo
--
-- Decisão do Tiago em 17/08/2026. Pela categoria seriam 27 elos e pronto, mas aí um
-- insumo específico nunca poderia fugir da regra do grupo dele. No insumo, cada um
-- dos 3.357 pode ser ajustado — e a semeadura abaixo evita as 3.357 decisões manuais.
--
-- ## A semeadura
--
-- Um mapa de 27 pares (categoria de insumo, grupo) -> categoria financeira. O mesmo
-- mapa vive em src/modules/cadastros/insumos/mapa-categoria-custo.ts, com teste que
-- garante que as 27 categorias têm destino. Mudou aqui, muda lá.
--
-- As três checagens no fim não são decoração: se um destino não existir, se uma
-- categoria de insumo ficar fora do mapa, ou se sobrar insumo sem categoria de custo,
-- a migration aborta em vez de deixar buraco silencioso.
--
-- A coluna nasce NULL para a semeadura poder rodar em seguida. A obrigatoriedade é
-- imposta na aplicação (Zod + formulário do insumo). NOT NULL no banco é passo
-- posterior, quando a cobertura estiver comprovadamente em 100% — e aí é barato.

alter table public.insumos
  add column categoria_financeira_id uuid references public.categorias_financeiras(id);

comment on column public.insumos.categoria_financeira_id is
  'Categoria de custo (DRE) do insumo. Desce para o rateio do lancamento gerado na aprovacao da OC.';

create index if not exists idx_insumos_categoria_financeira
  on public.insumos (categoria_financeira_id);

do $$
declare
  v_falta int;
begin
  create temp table _mapa (cat text, grupo text, destino text) on commit drop;
  insert into _mapa (cat, grupo, destino) values
    ('Combustível','Equipamentos','Combustível'),
    ('Lubrificantes e graxas','Equipamentos','Combustíveis e lubrificantes'),
    ('Filtros','Equipamentos','Manutenção de equipamentos'),
    ('Peças e componentes','Equipamentos','Manutenção de equipamentos'),
    ('Pneus e câmaras','Equipamentos','Manutenção de equipamentos'),
    ('Manutenção e serviços','Equipamentos','Manutenção de equipamentos'),
    ('Locação de equipamento','Equipamentos','Aluguel de Equipamento'),
    ('A classificar','Equipamentos','Manutenção de equipamentos'),
    ('Equipe própria','Mão de obra','Salário Mão de Obra'),
    ('Diaristas','Mão de obra','Mão de Obra Terceirizada'),
    ('Terceiros e empreitas','Mão de obra','Mão de Obra Terceirizada'),
    ('A classificar','Mão de obra','Mão de Obra Terceirizada'),
    ('Aço, ferragens e fixação','Material','Materiais de construção'),
    ('Asfalto e ligantes','Material','Materiais de construção'),
    ('Cimento, agregados e concreto','Material','Materiais de construção'),
    ('Elétrica','Material','Materiais de construção'),
    ('Hidráulica','Material','Materiais de construção'),
    ('Madeira e formas','Material','Materiais de construção'),
    ('Pintura e acabamento','Material','Materiais de construção'),
    ('EPI e sinalização','Material','EPI''S'),
    ('Ferramentas e consumíveis','Material','Materiais'),
    ('Limpeza e escritório','Material','Material de Escritório'),
    ('A classificar','Material','Materiais'),
    ('Fretes e transporte','Outros','Frete'),
    ('Taxas e administrativo','Outros','Impostos e taxas'),
    ('Rancho e alojamento','Outros','Hospedagem'),
    ('A classificar','Outros','Outras despesas');

  -- 1. todo destino do mapa tem que existir em categorias_financeiras
  select count(*) into v_falta
  from _mapa m
  where not exists (
    select 1 from public.categorias_financeiras c
    where c.nome = m.destino and c.tipo = 'despesa' and c.ativo);
  if v_falta > 0 then
    raise exception 'Categoria de custo do mapa nao existe em categorias_financeiras: % linha(s)', v_falta;
  end if;

  -- 2. toda categoria de insumo do banco tem que estar no mapa
  select count(*) into v_falta
  from public.categorias_insumo ci
  join public.insumo_grupos g on g.id = ci.grupo_id
  where not exists (select 1 from _mapa m where m.cat = ci.nome and m.grupo = g.nome);
  if v_falta > 0 then
    raise exception 'Categoria de insumo fora do mapa: % categoria(s)', v_falta;
  end if;

  update public.insumos i
  set categoria_financeira_id = c.id
  from public.categorias_insumo ci
  join public.insumo_grupos g on g.id = ci.grupo_id
  join _mapa m on m.cat = ci.nome and m.grupo = g.nome
  join public.categorias_financeiras c
    on c.nome = m.destino and c.tipo = 'despesa' and c.ativo
  where i.categoria_id = ci.id;

  -- 3. linha de controle: nenhum insumo pode sobrar sem categoria de custo
  select count(*) into v_falta from public.insumos where categoria_financeira_id is null;
  if v_falta > 0 then
    raise exception 'Sobraram % insumo(s) sem categoria de custo', v_falta;
  end if;
end $$;
