-- Cadastros: unifica os 92 pares de insumos com nome e unidade iguais que vieram da
-- carga de 26/06/2026 do Mais Controle (68 deles SINAPI importado duas vezes, SIN- e
-- MAI-SIN-), e trava o repetido no banco. Lista aprovada pelo Tiago em 01/10/2026
-- (planilha outputs/erp-emt-insumos-repetidos/insumos-repetidos-2026-10-01.xlsx).
--
-- 1. O item de THINNER cód. 375 da OC-2026-0100 passa para o THINNER cód. 6027 (mesma
--    subcategoria, mesmo preço: total e categorias da OC não mudam).
-- 2. Os 92 cadastros que sobram de cada par são desativados (somem dos seletores, nada
--    é apagado). Fica o de mais uso; no empate o de código MAI-*; no Kit de rodagem
--    fica o de Ferramentas e consumíveis, por decisão do Tiago.
-- 3. Índice único entre os ATIVOS em (nome sem caixa e com espaço único, unidade): nome
--    igual só vale com unidade diferente. Os desativados ficam fora para a história
--    continuar apontando para eles.
do $$
declare
  n int;
begin
  update public.oc_itens
     set insumo_id = '8e3a4e20-3e5c-4406-8289-ee770d9fddbc'
   where insumo_id = '910c84eb-fe1b-4cc2-8da6-ab187069dee9';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'esperava repontar 1 item de OC do THINNER 375, repontou %', n;
  end if;

  if exists (
    select 1 from unnest(array[
    'e9a607d4-20a2-44a1-9c1e-5adccf9b023f',
    '867711d5-3a9e-4fa9-bef5-425386f9606d',
    '0d63a913-8d80-47bb-ac3c-a390b1caea30',
    '597469f2-fc03-40c4-b855-130ec18a4534',
    'f480a3cf-3ee2-4acf-b731-984915730021',
    '6417a2e2-2839-4910-a80d-e98b0e8e706d',
    '55ff784f-4e54-493a-84b2-a0169eda63e4',
    '74dfacee-af11-4814-b991-e91be68e3fca',
    'f115cc36-a043-4192-8bd7-3db157529da5',
    'd513092a-8749-407b-9146-9c08379db40f',
    '2430f5f4-4c79-4dcb-a86c-60c59757d957',
    '071c3859-70fc-478c-8498-b096ff36664a',
    '183fb79c-b683-49c6-b866-f5f43ff48680',
    'fc661df5-069d-4c5e-a8f8-d5159c2148bc',
    '52768a00-ea53-4e93-b089-1193d5dd199e',
    '51d9dd33-7ee7-4349-9681-8782ceba3eb4',
    'b1bdada5-a373-4459-b35e-e9c63d387f1f',
    '372d366e-0026-4639-8ab4-4a7fbce7cdfc',
    '7c73025a-1b87-470c-b718-b7eb39aefb22',
    '84b3c0ce-20bf-4e12-8ca1-bf82d4185c2c',
    '375e9745-2a47-4691-8292-32bb617ae054',
    'bbaa26bc-85e9-401b-8530-646a5e0c9bd0',
    '18f7d01c-94d8-4997-ab9f-c21fbb8d2261',
    '72e3b2fb-747d-41fd-abf8-45ad6fafda60',
    '92f4a4bf-7b69-4f52-ab69-3f4d71815223',
    '7e1bc6d5-b48f-4836-a675-6a26e90eb777',
    'e1e27d82-15ac-4555-a95d-280fb21f1454',
    '1c44c11d-0c42-4f4e-a25e-9a73922d2554',
    '92013462-6e00-41dc-929d-afcd929ecfd8',
    '2661d0f3-712e-4cd8-8575-ae1bde1b47f7',
    'f90f799e-9bfc-4f90-8894-ef553adf6938',
    '127bd4f5-3a01-4e12-bcd9-8398c361a0ea',
    '59ee2253-8937-4eb0-bef6-250fc1f23347',
    '7d3ccd41-4b20-4fa4-9e7b-2df59b5a8d01',
    '0a92b1e1-891c-42cc-b100-4a25e767f8f9',
    '6a5083bf-9fce-4d2b-9f14-1a775017a5ba',
    'ec19c2b9-becb-4360-9b91-72ebdd0edeb6',
    '461b6748-707d-496d-be5f-0ad78b68638e',
    '05d8d2f3-ca1b-458a-a04b-7715e009016a',
    '8cafd3ed-4b29-485a-a707-a698547e7340',
    'da4ecbf6-b3bd-4666-8687-55c70f84a503',
    'c7b36c54-e38f-48f5-b251-9c7859cbf300',
    'd498b519-f908-45dc-98be-ee69ef78c9b8',
    '1b1579f4-3464-480f-8fc4-49445314be37',
    '890ecbad-9407-4747-abc5-211cea8d6ff8',
    '3997d3e9-0610-47fe-8b01-118facf06fdc',
    '903b80e5-fa25-4539-a191-117162a48360',
    '84d5ae72-d959-4136-9fdc-4e45eaea9441',
    '3ce19bac-3f29-4641-a574-1f25961d3ee4',
    '700572d0-05a7-46da-b183-86f1efbe0836',
    'd8447003-ba3e-49c3-a497-435c7308be52',
    'd4b5266c-608f-43ac-b18d-8e643f083458',
    '65a8d1cf-fa6b-4a9c-9d5f-186380eab35f',
    '77ca53f3-1abb-4a1f-9721-cd33057e8a49',
    '715d892b-6df8-46c1-80bb-b344aa7fb352',
    '5ad8576a-2509-4177-85b3-ec7506fdb0c8',
    '1d7f9d01-1760-454d-baa2-387047e50a14',
    'bfdaa9fb-b776-4ca1-b373-e291b8bf40cd',
    'b14964b9-453e-46a7-a742-5d9e5d56e537',
    '06e20279-75f8-478a-8a83-56ed1ed61416',
    'cf1e06a9-c40b-4292-b81b-59ebced85794',
    '705a7d31-e4e9-46c3-ad3e-349f6844ff28',
    '700fe041-a7c3-4a71-9ed8-9fa434733f4f',
    'c4c60b0d-cdf1-45b7-beff-d8b998b8f008',
    '2787a0b1-d1fa-4c6e-8c97-b4cb63d07fa9',
    'fc05dcc8-dc26-4090-9f54-95afe7b1af21',
    'e27eca4e-e9b8-4519-8ef1-0fb6da3d5bc2',
    '84d9883e-facf-46cc-be42-27573361ce3f',
    'b7ec172c-54f3-441c-9679-98040720355e',
    '3009639d-799a-4f58-a196-af6e4fee6cd5',
    '8c986841-5053-4591-9497-33f1b00eae25',
    '4eea134b-fc9b-4243-96b6-501e17be3420',
    'efe20022-a5bf-46ed-a409-07717093a530',
    'b53d646d-74e1-4384-ba47-4aab3c909542',
    'de4a7cd7-803e-49b0-af2c-77ee8a42865b',
    '5b711a72-f12f-4240-a584-6a3b4f58427b',
    '41acdaca-98e1-4094-88c5-32c52e4fac50',
    '0e576ab2-7af1-4458-9453-370f73063b18',
    'b31fcece-6563-44cb-93a4-5807da3e4232',
    '5d0ffa08-8a38-4286-b1d2-045eb35ac395',
    '8dab6a85-d21f-4726-a580-ac82409048e5',
    'bc1d0df7-949b-4d31-b4eb-1864d82e4dc8',
    '910c84eb-fe1b-4cc2-8da6-ab187069dee9',
    'f1d904ac-7c3d-4248-885e-36c607810f46',
    '0ae2306e-d916-4ab0-8589-f2c53fba04b4',
    '8c9ecdbb-3646-4562-a49f-794143a64837',
    'e9d17f2d-588b-4f83-91a6-74ac3dfd3072',
    'bd28852c-2c9e-4ee5-950b-d55128120f63',
    'b7ba681c-d168-4369-ac45-5aafe473537f',
    '6a784a37-a723-4867-b841-696c3a8b0500',
    '4d51aae2-9fc8-4517-8e59-0a52fde5cf9e',
    'd7f528e9-f057-475f-8db2-0b7d92294256'
    ]::uuid[]) s(id)
    where exists (select 1 from public.oc_itens x where x.insumo_id = s.id)
       or exists (select 1 from public.cotacao_itens x where x.insumo_id = s.id)
       or exists (select 1 from public.fretes x where x.insumo_id = s.id)
       or exists (select 1 from public.pedido_material_itens x where x.insumo_id = s.id)
       or exists (select 1 from public.combustivel_entradas x where x.insumo_id = s.id)
       or exists (select 1 from public.combustivel_saidas x where x.insumo_id = s.id)
       or exists (select 1 from public.combustivel_transferencias x where x.insumo_id = s.id)
       or exists (select 1 from public.tanques x where x.combustivel_atual_id = s.id)
       or exists (select 1 from public.almoxarifado_entradas x where x.insumo_id = s.id)
       or exists (select 1 from public.almoxarifado_itens x where x.insumo_id = s.id)
       or exists (select 1 from public.almoxarifado_saidas x where x.insumo_id = s.id)
       or exists (select 1 from public.almoxarifado_saldos x where x.insumo_id = s.id)
       or exists (select 1 from public.os_oleos x where x.insumo_id = s.id)
       or exists (select 1 from public.os_pecas x where x.insumo_id = s.id)
  ) then
    raise exception 'um dos insumos a desativar ganhou uso depois do levantamento';
  end if;

  update public.insumos
     set ativo = false
   where ativo
     and id in (
    'e9a607d4-20a2-44a1-9c1e-5adccf9b023f',
    '867711d5-3a9e-4fa9-bef5-425386f9606d',
    '0d63a913-8d80-47bb-ac3c-a390b1caea30',
    '597469f2-fc03-40c4-b855-130ec18a4534',
    'f480a3cf-3ee2-4acf-b731-984915730021',
    '6417a2e2-2839-4910-a80d-e98b0e8e706d',
    '55ff784f-4e54-493a-84b2-a0169eda63e4',
    '74dfacee-af11-4814-b991-e91be68e3fca',
    'f115cc36-a043-4192-8bd7-3db157529da5',
    'd513092a-8749-407b-9146-9c08379db40f',
    '2430f5f4-4c79-4dcb-a86c-60c59757d957',
    '071c3859-70fc-478c-8498-b096ff36664a',
    '183fb79c-b683-49c6-b866-f5f43ff48680',
    'fc661df5-069d-4c5e-a8f8-d5159c2148bc',
    '52768a00-ea53-4e93-b089-1193d5dd199e',
    '51d9dd33-7ee7-4349-9681-8782ceba3eb4',
    'b1bdada5-a373-4459-b35e-e9c63d387f1f',
    '372d366e-0026-4639-8ab4-4a7fbce7cdfc',
    '7c73025a-1b87-470c-b718-b7eb39aefb22',
    '84b3c0ce-20bf-4e12-8ca1-bf82d4185c2c',
    '375e9745-2a47-4691-8292-32bb617ae054',
    'bbaa26bc-85e9-401b-8530-646a5e0c9bd0',
    '18f7d01c-94d8-4997-ab9f-c21fbb8d2261',
    '72e3b2fb-747d-41fd-abf8-45ad6fafda60',
    '92f4a4bf-7b69-4f52-ab69-3f4d71815223',
    '7e1bc6d5-b48f-4836-a675-6a26e90eb777',
    'e1e27d82-15ac-4555-a95d-280fb21f1454',
    '1c44c11d-0c42-4f4e-a25e-9a73922d2554',
    '92013462-6e00-41dc-929d-afcd929ecfd8',
    '2661d0f3-712e-4cd8-8575-ae1bde1b47f7',
    'f90f799e-9bfc-4f90-8894-ef553adf6938',
    '127bd4f5-3a01-4e12-bcd9-8398c361a0ea',
    '59ee2253-8937-4eb0-bef6-250fc1f23347',
    '7d3ccd41-4b20-4fa4-9e7b-2df59b5a8d01',
    '0a92b1e1-891c-42cc-b100-4a25e767f8f9',
    '6a5083bf-9fce-4d2b-9f14-1a775017a5ba',
    'ec19c2b9-becb-4360-9b91-72ebdd0edeb6',
    '461b6748-707d-496d-be5f-0ad78b68638e',
    '05d8d2f3-ca1b-458a-a04b-7715e009016a',
    '8cafd3ed-4b29-485a-a707-a698547e7340',
    'da4ecbf6-b3bd-4666-8687-55c70f84a503',
    'c7b36c54-e38f-48f5-b251-9c7859cbf300',
    'd498b519-f908-45dc-98be-ee69ef78c9b8',
    '1b1579f4-3464-480f-8fc4-49445314be37',
    '890ecbad-9407-4747-abc5-211cea8d6ff8',
    '3997d3e9-0610-47fe-8b01-118facf06fdc',
    '903b80e5-fa25-4539-a191-117162a48360',
    '84d5ae72-d959-4136-9fdc-4e45eaea9441',
    '3ce19bac-3f29-4641-a574-1f25961d3ee4',
    '700572d0-05a7-46da-b183-86f1efbe0836',
    'd8447003-ba3e-49c3-a497-435c7308be52',
    'd4b5266c-608f-43ac-b18d-8e643f083458',
    '65a8d1cf-fa6b-4a9c-9d5f-186380eab35f',
    '77ca53f3-1abb-4a1f-9721-cd33057e8a49',
    '715d892b-6df8-46c1-80bb-b344aa7fb352',
    '5ad8576a-2509-4177-85b3-ec7506fdb0c8',
    '1d7f9d01-1760-454d-baa2-387047e50a14',
    'bfdaa9fb-b776-4ca1-b373-e291b8bf40cd',
    'b14964b9-453e-46a7-a742-5d9e5d56e537',
    '06e20279-75f8-478a-8a83-56ed1ed61416',
    'cf1e06a9-c40b-4292-b81b-59ebced85794',
    '705a7d31-e4e9-46c3-ad3e-349f6844ff28',
    '700fe041-a7c3-4a71-9ed8-9fa434733f4f',
    'c4c60b0d-cdf1-45b7-beff-d8b998b8f008',
    '2787a0b1-d1fa-4c6e-8c97-b4cb63d07fa9',
    'fc05dcc8-dc26-4090-9f54-95afe7b1af21',
    'e27eca4e-e9b8-4519-8ef1-0fb6da3d5bc2',
    '84d9883e-facf-46cc-be42-27573361ce3f',
    'b7ec172c-54f3-441c-9679-98040720355e',
    '3009639d-799a-4f58-a196-af6e4fee6cd5',
    '8c986841-5053-4591-9497-33f1b00eae25',
    '4eea134b-fc9b-4243-96b6-501e17be3420',
    'efe20022-a5bf-46ed-a409-07717093a530',
    'b53d646d-74e1-4384-ba47-4aab3c909542',
    'de4a7cd7-803e-49b0-af2c-77ee8a42865b',
    '5b711a72-f12f-4240-a584-6a3b4f58427b',
    '41acdaca-98e1-4094-88c5-32c52e4fac50',
    '0e576ab2-7af1-4458-9453-370f73063b18',
    'b31fcece-6563-44cb-93a4-5807da3e4232',
    '5d0ffa08-8a38-4286-b1d2-045eb35ac395',
    '8dab6a85-d21f-4726-a580-ac82409048e5',
    'bc1d0df7-949b-4d31-b4eb-1864d82e4dc8',
    '910c84eb-fe1b-4cc2-8da6-ab187069dee9',
    'f1d904ac-7c3d-4248-885e-36c607810f46',
    '0ae2306e-d916-4ab0-8589-f2c53fba04b4',
    '8c9ecdbb-3646-4562-a49f-794143a64837',
    'e9d17f2d-588b-4f83-91a6-74ac3dfd3072',
    'bd28852c-2c9e-4ee5-950b-d55128120f63',
    'b7ba681c-d168-4369-ac45-5aafe473537f',
    '6a784a37-a723-4867-b841-696c3a8b0500',
    '4d51aae2-9fc8-4517-8e59-0a52fde5cf9e',
    'd7f528e9-f057-475f-8db2-0b7d92294256'
    );
  get diagnostics n = row_count;
  if n <> 92 then
    raise exception 'esperava desativar 92 insumos, desativou %', n;
  end if;
end $$;

create unique index insumos_nome_unidade_ativos_key
  on public.insumos (lower(regexp_replace(btrim(nome), '\s+', ' ', 'g')), unidade_id)
  where ativo;

comment on index public.insumos_nome_unidade_ativos_key is
  'Nome igual só com unidade diferente (decisão de 30/09/2026). Só entre ativos.';
