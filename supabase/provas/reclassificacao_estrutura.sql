-- Prova da estrutura da reclassificacao (PR 2 do controle total, 10/10/2026).
-- Rodar em begin/rollback depois da migration; termina com raise 'PROVA OK'.

do $prova$
declare v_n int;
begin
  -- Naturezas novas aceitas pelo CHECK.
  insert into public.categorias_financeiras (nome, tipo, natureza) values ('prova distribuicao', 'despesa', 'distribuicao');
  insert into public.categorias_financeiras (nome, tipo, natureza) values ('prova mutuo', 'despesa', 'mutuo');

  -- Categorias novas com a natureza certa.
  select count(*) into v_n from public.categorias_financeiras where (nome, tipo, natureza) in (
    ('Distribuição a sócio', 'despesa', 'distribuicao'),
    ('Mútuo concedido a empresa ligada', 'despesa', 'mutuo'),
    ('Devolução de mútuo', 'receita', 'mutuo'),
    ('Consórcio a contemplar', 'despesa', 'investimento'),
    ('Taxa de administração de consórcio', 'despesa', 'operacional'),
    ('Juros de empréstimos', 'despesa', 'financeira'));
  if v_n <> 6 then raise exception 'FALHOU 1: % de 6 categorias novas', v_n; end if;

  -- Centros com o tipo novo.
  select count(*) into v_n from public.centros_custo where nivel = 1 and (nome, tipo) in (
    ('Sócio James Castro Cameli', 'socio'),
    ('Sócio Tiago de Melo Cameli', 'socio'),
    ('Casa James', 'socio'),
    ('Amazônia Agroindústria', 'empresa_ligada'),
    ('Juruá FM', 'empresa_ligada'),
    ('Aquisição de Equipamentos', 'imobilizado'),
    ('Aquisição de Imóveis', 'imobilizado'));
  if v_n <> 7 then raise exception 'FALHOU 2: % de 7 centros com o tipo novo', v_n; end if;

  -- O centro antigo do James virou o do socio (mesmo id, rateios preservados).
  if exists (select 1 from public.centros_custo where nome = 'James Cameli Pessoa Fisica') then
    raise exception 'FALHOU 3: James Cameli Pessoa Fisica nao foi renomeado';
  end if;
  if (select tipo from public.centros_custo where id = 'e892aee6-fab2-4931-9582-640ce7be3967') <> 'socio' then
    raise exception 'FALHOU 4: id do James PF nao e o centro do socio';
  end if;

  -- A obra ligada ao centro do socio tambem muda de nome: editar a obra
  -- renomeia o centro (trg_obra_renomeia_centro_custo), e o nome velho voltaria.
  if (select nome from public.obras where id = '5f5b4791-260d-44bb-a837-1aca5f5006bc') <> 'Sócio James Castro Cameli' then
    raise exception 'FALHOU 5: obra do centro do socio com o nome antigo';
  end if;

  raise exception 'PROVA OK';
end
$prova$;
