-- Centro de custo "Empréstimos", com uma etapa por contrato, e o tipo de centro
-- 'financeiro' que faltava para ele nao mentir na tela.
--
-- ## Por que um tipo novo
--
-- `centros_custo.tipo` so aceitava 'obra', 'escritorio' e 'manutencao', e esse
-- tipo nao e decorativo: vira o badge do nivel 1 no cadastro, vira uma opcao no
-- filtro do relatorio de custo por centro, e decide como o segundo campo se
-- chama na tela de lancamento (em manutencao ele se chama "Equipamento", nao
-- "Etapa").
--
-- Emprestimo nao e nenhum dos tres. Encaixa-lo em 'escritorio' faria a divida
-- da empresa somar junto com o custo do escritorio sempre que alguem filtrasse
-- por tipo; em 'obra' faria nascer uma Obra de mentira na lista de obras. Por
-- isso 'financeiro', com o nivel 2 chamando "Emprestimo".
--
-- ## O modelo, igual ao de manutencao
--
-- O Tiago pediu "parecido com manutencao de equipamentos": la a raiz e um
-- centro e cada EQUIPAMENTO e uma etapa. Aqui a raiz e "Emprestimos" e cada
-- CONTRATO e uma etapa. Como em manutencao, a raiz nao tem obra_id -- ela nao
-- nasce por trigger de Obra, e por isso e criada aqui.
--
-- ## Quais contratos viraram etapa, e por que so dois
--
-- Perguntado, o Tiago mandou trazer so o emprestimo de DINHEIRO:
--
--   Banco do Brasil - Capital de giro BR-364   R$ 2.052.271,00  21x, 3 pagas
--   Caixa Economica - Contrato 28102020        R$   753.193,90  10x, quitado
--
-- Os outros dez compromissos com banco (PACCAR x3, DAF, Noroeste, Guerra,
-- Randon x3, Komatsu, somando R$ 8,86 mi em financiamento e consorcio de
-- equipamento) FICAM onde estao, no centro "Aquisicao de Equipamentos": ali o
-- dinheiro virou maquina, e mover o custo tiraria R$ 5,37 mi de um centro que
-- ja e usado. Parcelamento de imposto (Prefeitura, SEFAZ) tambem fica fora:
-- nao e emprestimo.
--
-- Este arquivo NAO reclassifica lancamento nenhum. Ele cria a estrutura; quem
-- decide mover um lancamento para ca e a tela, um a um.

-- ---------------------------------------------------------------------------
-- 1. O tipo novo
-- ---------------------------------------------------------------------------

alter table public.centros_custo
  drop constraint if exists centros_custo_tipo_check;
alter table public.centros_custo
  add constraint centros_custo_tipo_check
  check (tipo = any (array['obra'::text, 'escritorio'::text, 'manutencao'::text, 'financeiro'::text]));

comment on column public.centros_custo.tipo is
  'Tipo do centro de NIVEL 1 (nulo em etapa e item): obra, escritorio, manutencao ou financeiro. Decide o badge no cadastro, a opcao no filtro do relatorio de custo e o nome do segundo campo na tela de lancamento.';

-- ---------------------------------------------------------------------------
-- 2. A raiz e as duas etapas
-- ---------------------------------------------------------------------------
-- Idempotente de proposito: se a migration rodar duas vezes (ou se alguem ja
-- tiver criado o centro pela mao), ela nao duplica.

do $$
declare
  v_raiz uuid;
begin
  select id into v_raiz from public.centros_custo
  where nivel = 1 and lower(nome) = lower('Empréstimos');

  if v_raiz is null then
    insert into public.centros_custo (nome, nivel, tipo)
    values ('Empréstimos', 1, 'financeiro')
    returning id into v_raiz;
  end if;

  insert into public.centros_custo (nome, nivel, pai_id)
  select v.nome, 2, v_raiz
  from (values
    ('Banco do Brasil - Capital de giro BR-364'),
    ('Caixa Econômica - Contrato 28102020')
  ) as v(nome)
  where not exists (
    select 1 from public.centros_custo e
    where e.pai_id = v_raiz and lower(e.nome) = lower(v.nome)
  );

  if (select count(*) from public.centros_custo where pai_id = v_raiz) <> 2 then
    raise exception 'Esperava 2 etapas em Emprestimos, encontrei %',
      (select count(*) from public.centros_custo where pai_id = v_raiz);
  end if;
end $$;
