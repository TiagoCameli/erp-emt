-- Classifica os insumos que nasceram sem categoria de custo (financeira).
--
-- Aplicado no banco em 20/08/2026.
--
-- ## O que estava errado
--
-- `fn_aprovar_ordem_compra` recusa a OC quando qualquer item aponta para um
-- insumo com `categoria_financeira_id` nulo:
--
--   'Ha item sem categoria de custo. Classifique o insumo antes de aprovar'
--
-- Faz sentido: e desse campo que sai a categoria do lancamento e a categoria de
-- cada rateio. Sem ele a compra entraria no DRE sem classificacao.
--
-- O problema e que NENHUMA tela do sistema escreve essa coluna. O drawer de
-- Insumos e o "Alterar categoria" em lote mexem em `categoria_id`, que e a
-- categoria de INSUMO (grupo/subcategoria, "Pecas e componentes"), outra coisa.
-- Quem preencheu `categoria_financeira_id` nos 3.355 insumos antigos foi a carga.
--
-- Resultado: todo insumo cadastrado pela tela nasce sem categoria de custo, e a
-- primeira OC que usa ele trava na aprovacao sem saida pela interface. Em 20/08
-- havia 11 insumos assim, travando a OC-2026-0038 (PODIUM AUTO CENTER,
-- R$ 1.780,00) e a OC-2026-0020 (Recol Veiculos Jurua, R$ 1.157,18).
--
-- A tela que fecha o buraco vem na mesma frente (campo no cadastro de Insumos +
-- aviso na OC dizendo qual item esta sem classificacao).
--
-- ## De onde saiu cada escolha
--
-- Nao e chute: cada insumo foi para a categoria em que os semelhantes ja estao.
--
--   * Pecas de veiculo/maquina (MUNHAO, CORREIA DO ALTERNADOR, BUCHA DA BARRA
--     ESTABILIZADORA) -> Manutencao de equipamentos. As ~40 "BUCHA ..." ja
--     cadastradas estao todas ali.
--   * Servico de manutencao de veiculo (ALINHAMENTO E BALANCEAMENTO, LAVAGEM
--     TRADICIONAL CARRO G) -> Manutencao de equipamentos, junto de "SERVICOS DE
--     SUSPENSAO E REVISAO ALINHAMENTO BALANCEAMENTO CAMBAGEM TROCA DE PNEUS".
--   * Conexoes de mangueira hidraulica de maquina (ENGATE HIDRAULICO ISO 7241,
--     M.FIXO, F.GIR., Capa Hidr.) -> Manutencao de equipamentos, decidido pelo
--     Tiago. A categoria de insumo delas e "Hidraulica", que no cadastro antigo
--     puxa para Materiais de construcao -- mas ali "Hidraulica" quer dizer
--     encanamento de obra (engate/rabicho de pia), nao mangueira de equipamento.
--     Os "ENGATE RAPIDO" de maquina ja estao em Manutencao de equipamentos.
--   * Oleo do Motor 5W40 -> Combustiveis e lubrificantes, onde estao todos os
--     "OLEO ... MOTOR".
--   * "Auguel de Caminhao" (o cadastro esta com o nome errado) -> Aluguel de
--     Equipamento.
--
-- ## Travas
--
-- O update so toca em linha com `categoria_financeira_id is null`. Se alguem
-- classificar um desses insumos entre a escrita e a aplicacao deste arquivo, a
-- escolha da pessoa fica de pe -- este arquivo nao sobrescreve ninguem.
--
-- O bloco confere no fim que sobrou zero insumo sem categoria de custo e que as
-- duas OCs travadas tem todos os itens classificados. Se nao bater, levanta
-- excecao e nada e gravado.

begin;

with destino(insumo_id, categoria_financeira_id) as (
  values
    -- Manutencao de equipamentos
    ('522bb4a1-a73b-4ac8-8578-00f18c1c9434'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid), -- LAVAGEM TRADICIONAL CARRO G
    ('11082ae9-1d1d-4aff-b197-57b6cdfe20c0'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid), -- ALINHAMENTO E BALANCEAMENTO
    ('62ccb625-06db-43f7-9c96-3ac127606f74'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid), -- MUNHAO
    ('27eb7884-cea1-4303-9855-cea7688faa1e'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid), -- CORREIA DO ALTERNADOR
    ('e8e9d284-5efd-49d1-bd8a-dce1a3aafb78'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid), -- BUCHA DA BARRA ESTABILIZADORA
    ('b1577195-8bb3-462f-b482-2f545ab5b027'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid), -- ENGATE HIDRAULICO ISO 7241 TIPO A
    ('895ef181-c42e-40cc-b6f2-27934ad722db'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid), -- M.FIXO 1 NPTF 30 X 3/4
    ('3cc37cbf-95cb-4f9c-9297-11aaf86c9fa9'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid), -- F.GIR. 3/4 BSP 60 X 3/4
    ('6d2921d8-2e9f-4f55-86cb-7387271aadec'::uuid, '15ac7507-c642-4cfa-9af7-1061f6798080'::uuid), -- Capa Hidr. R1/R2AT-3310 3/4
    -- Combustiveis e lubrificantes
    ('273145e1-80dc-451f-8a81-d25af1b81350'::uuid, '5ea885cd-d43c-49b2-a456-90d910ca69f1'::uuid), -- Oleo do Motor 5W40
    -- Aluguel de Equipamento
    ('a32da1e9-f777-4965-b964-5e6581bffd5e'::uuid, '7df33042-76b6-88d8-b9e8-6ed9060faef2'::uuid)  -- Auguel de Caminhao
)
update public.insumos i
set categoria_financeira_id = d.categoria_financeira_id
from destino d
where i.id = d.insumo_id
  and i.categoria_financeira_id is null;

do $$
declare
  v_sem_categoria int;
  v_ocs_travadas int;
begin
  select count(*) into v_sem_categoria
  from public.insumos where categoria_financeira_id is null;

  if v_sem_categoria <> 0 then
    raise exception 'Ainda ha % insumo(s) sem categoria de custo', v_sem_categoria;
  end if;

  select count(distinct oi.ordem_compra_id) into v_ocs_travadas
  from public.oc_itens oi
  join public.insumos i on i.id = oi.insumo_id
  join public.ordens_compra oc on oc.id = oi.ordem_compra_id
  where i.categoria_financeira_id is null
    and oc.status in ('rascunho', 'pendente_aprovacao');

  if v_ocs_travadas <> 0 then
    raise exception '% OC(s) continuam travadas na aprovacao', v_ocs_travadas;
  end if;
end;
$$;

commit;
