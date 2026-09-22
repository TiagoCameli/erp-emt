-- Carga dos de-paras da Fase 1: cadastros do Gestão Obras → ERP.
-- GERADO por scripts/migracao-gestao-obras/gerar_carga_fase1.py a partir dos CSVs revisados.
-- Não editar à mão: mudar o CSV (ou APROVADOS_PELO_TIAGO no gerador) e gerar de novo.
--
-- O que faz:
--   1. schema `legado` (sem grant nenhum para o app) com as tabelas de de-para: id da
--      origem (texto) → id do ERP (uuid). Serve à carga das Fases 2 a 4 e à conferência.
--   2. cria os dois fornecedores que não existem: EMT TRANSPORTES e JOHN DEERE (o Tiago
--      confirmou em 22/09 que John Deere NÃO é a JD COMERCIO E IMPORTACAO).
--   3. marca transportadora e dono de tanque nos fornecedores do ERP (tabela 6.1). Areacre
--      e Areacre - Josias são um fornecedor só: as marcas somam.
--   4. cria o insumo ARLA 32 - LITRO (decisão 6: o tanque conta litro).
--   5. copia situação, medição inicial, série e datas dos equipamentos. Medição inicial 0
--      na origem é o padrão do campo, não uma leitura: vira nulo.
--
-- Não cria lançamento, parcela nem rateio. Não mexe em permissão.
-- ============================================================================
-- PENDÊNCIAS: enquanto houver, esta migration recusa aplicar.
-- ============================================================================
do $pendente$ begin raise exception E'Carga da Fase 1 com pendencias do Tiago:\nfornecedor CASA DAS MÁQUINAS (mrjfx4i9y8g98) -> Casa da máquina: confianca media, falta o ok do Tiago\nfornecedor E M T CONSTRUTORA LTDA (mrcb984g7ciwc) sem par no ERP\nfornecedor EMT (mrcb97s0buj3b) -> EMT: confianca media, falta o ok do Tiago'; end $pendente$;

create schema if not exists legado;
revoke all on schema legado from public, anon, authenticated;
comment on schema legado is 'De-para dos ids do Gestão Obras. Só para carga e conferência; apagar depois da Fase 5.';

create table if not exists legado.de_para_fornecedores (
  gestao_obras_id text primary key,
  nome_origem text not null,
  fornecedor_id uuid not null references public.fornecedores(id),
  metodo text not null,
  confianca text not null
);
create table if not exists legado.de_para_equipamentos (
  gestao_obras_id text primary key,
  equipamento_id uuid not null references public.equipamentos(id)
);
create table if not exists legado.de_para_obras (
  gestao_obras_id text primary key,
  nome_origem text not null,
  obra_id uuid references public.obras(id),
  centro_custo_id uuid not null references public.centros_custo(id)
);
create table if not exists legado.de_para_insumos (
  gestao_obras_id text primary key,
  nome_origem text not null,
  insumo_id uuid not null references public.insumos(id)
);
create table if not exists legado.de_para_usuarios (
  gestao_obras_id text primary key,
  nome_origem text not null,
  usuario_id uuid references public.usuarios(id),
  acao text not null check (acao in ('CASAR', 'CONVIDAR'))
);

do $rls$
declare t text;
begin
  foreach t in array array['de_para_fornecedores','de_para_equipamentos','de_para_obras','de_para_insumos','de_para_usuarios'] loop
    execute format('alter table legado.%I enable row level security', t);
    execute format('revoke all on legado.%I from public, anon, authenticated', t);
  end loop;
end $rls$;

-- 2. Fornecedores novos
insert into public.fornecedores (tipo, razao_social, cnpj_cpf, eh_transportadora, eh_dona_de_tanque, ativo)
select 'pj', 'EMT TRANSPORTES', null, true, false, true
where not exists (select 1 from public.fornecedores where public.fn_chave_nome(razao_social) = public.fn_chave_nome('EMT TRANSPORTES'));
insert into public.fornecedores (tipo, razao_social, cnpj_cpf, eh_transportadora, eh_dona_de_tanque, ativo)
select 'pj', 'JOHN DEERE', null, false, false, true
where not exists (select 1 from public.fornecedores where public.fn_chave_nome(razao_social) = public.fn_chave_nome('JOHN DEERE'));

-- 1b. De-para de fornecedores (CRIAR resolve pelo nome do que acabou de ser criado)
insert into legado.de_para_fornecedores (gestao_obras_id, nome_origem, fornecedor_id, metodo, confianca) values
  ('mrcb7bplsl9wa', 'AGRO PARTS', '0e3d91b2-31d3-4d4d-a879-1badb7970584'::uuid, 'nome_normalizado', 'alta'),
  ('mn921nnyuvp1t', 'Andrade Transporte', 'db6b5154-5e4f-42cc-beae-8086a3ad8516'::uuid, 'tabela_6_1', 'alta'),
  ('mlppmxan37tev', 'Areacre', '783c2db2-c6bc-40a5-8a7a-eea9e2f17e84'::uuid, 'nome_normalizado', 'certa'),
  ('mrcb7pnjcwgrn', 'Areacre - Josias', '783c2db2-c6bc-40a5-8a7a-eea9e2f17e84'::uuid, 'tabela_6_1', 'certa'),
  ('mrtlvdhgimrk5', 'Argamassa AS/ Grafifort', 'ae0c04ca-c68f-f35c-c7b5-95d06c51845a'::uuid, 'cnpj', 'certa'),
  ('mrcb7t0cnnk9h', 'Atem Petroleo', 'b94e6399-c2eb-41ea-af36-6ee561f03bc5'::uuid, 'nome_normalizado', 'alta'),
  ('mpllm3usj6213', 'Atem Petroleo', 'b94e6399-c2eb-41ea-af36-6ee561f03bc5'::uuid, 'nome_normalizado', 'alta'),
  ('mrcb7u4otid05', 'AUTO ELETR. TEIXEIRA', 'dfb041b3-73bc-4707-b195-8b3ac021084f'::uuid, 'nome_normalizado', 'alta'),
  ('mlqw3xx5ruc6d', 'Britam', 'fd0a0138-163a-4ea5-9b00-039612981cde'::uuid, 'tabela_6_1', 'alta'),
  ('mrjfx4i9y8g98', 'CASA DAS MÁQUINAS', '7f089958-2f95-4d29-946c-ba2bd0961fcd'::uuid, 'tabela_6_1', 'media'),
  ('mrcb8ri6wla88', 'CRUZEIRO PEÇAS', '9d03142e-a001-480c-a69c-1f0022e5c886'::uuid, 'nome_normalizado', 'alta'),
  ('mrcb8run7qg7n', 'CS46-PEMAZA', 'af4feea8-b719-4280-bbf3-2ecb64490411'::uuid, 'nome_normalizado', 'alta'),
  ('mrcb97s0buj3b', 'EMT', 'c0500faa-e14a-4e22-afe9-91758a7d57db'::uuid, 'nome_normalizado', 'media'),
  ('mnx9g4currw6p', 'EMT TRANSPORTES', (select id from public.fornecedores where public.fn_chave_nome(razao_social) = public.fn_chave_nome('EMT TRANSPORTES')), 'CRIAR', 'certa'),
  ('mltn8gcw20fy8', 'ETAM Construtora', '0830bcaa-0b9d-49bf-9ec6-c37c45f3a86f'::uuid, 'tabela_6_1', 'alta'),
  ('mlqw42sq4lzm9', 'Formate', '2aea7dcb-9189-4e70-9abb-d290c7dbe9b6'::uuid, 'tabela_6_1', 'alta'),
  ('mrcb9zrfmliji', 'ICCAP IMPLEMENTOS RODOVIARIOS LTDA', '857e1cc7-ffa2-4744-84eb-157f74be3824'::uuid, 'nome_normalizado', 'alta'),
  ('mrcba4wro0io5', 'JAPURA PNEUS S/A', '9fcb627c-d55a-4f7e-9021-1ed84f265461'::uuid, 'nome_normalizado', 'alta'),
  ('mt08la2o1a1ge', 'JOHN DEERE', (select id from public.fornecedores where public.fn_chave_nome(razao_social) = public.fn_chave_nome('JOHN DEERE')), 'CRIAR', 'certa'),
  ('mrcbal4i86cf1', 'JURUA AUTO PECAS', 'c97eda72-12ca-4d37-95b7-0e27170b1921'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbalvecs4fz', 'JUSCELINO A SOARES', 'a091339a-d739-423e-8770-6d5c47c16671'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbam9ew1u7s', 'JUVENAL RODRIGUES DE OLIVEIRA', '4a86bae3-a121-4223-8c57-4c0690c3441b'::uuid, 'nome_normalizado', 'alta'),
  ('mlqm8sux861qf', 'LMC Transportadora', '72ac4842-b092-4e6f-a8ac-50667076e0c2'::uuid, 'tabela_6_1', 'alta'),
  ('mrcbatm3j9cdx', 'LUBRIFIC MULTIMARCAS AC', 'c94b363b-7eb3-4fa2-9156-251a242db155'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbbg9fd8f3f', 'M  M ACO PRONTO', '61b5409c-3bce-4eaf-ba1c-3f2a0eb33106'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbbeap6l6gb', 'MILENIUM LUBRIFICANTES', 'ba35fe96-a5fe-414a-8841-267358fa916b'::uuid, 'nome_normalizado', 'alta'),
  ('mst18q8tv2ng0', 'MS REVEST CUIABA', 'e8e16fec-8ea1-4901-a0e4-fb18c90cd126'::uuid, 'cnpj', 'certa'),
  ('mrcbbjbzd1qy5', 'MVA COMERCIO DE PECAS PARA EQUIPAMENTOS RODOVIARIOS LTDA', 'd14db98f-ea33-4965-ba06-e66d37564f97'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbblhb7882m', 'NISSEY CAMINHOES LTDA', '35653ce4-5bff-4205-8a92-898c57b1cde8'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbblw8i5pd6', 'NISSEY MAQUINAS AGRICOLA', '1abc3ed6-4929-4d90-9c07-4ec7df57af64'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbbn52larop', 'NOROESTE MAQUINAS E EQUIPAMENTOS LTDA', 'a8a2b55b-2d08-4a53-94b0-4294d46845a6'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbbnhonvook', 'NORTE - AUTO PEÇAS', '9114b412-be38-47fa-b54f-4207d60bb62c'::uuid, 'nome_normalizado', 'alta'),
  ('mrmmwa1wum89g', 'Petroleo Sabba', '210176d5-51b0-d2cb-c4a9-06a89b973d67'::uuid, 'nome_normalizado', 'alta'),
  ('mt3c7ptkvyj41', 'PODIUM AUTO CENTER', 'e1f1974b-04df-4c73-9633-6f150af2561e'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbc0vwggca9', 'POSTO DE MOLAS JABA', '5effb39c-9e40-48d2-abc5-f06258a038c6'::uuid, 'nome_normalizado', 'alta'),
  ('mrc6m0jfvca02', 'Posto Progresso', '3452d414-4671-4410-ba53-ca088d9b667a'::uuid, 'tabela_6_1', 'alta'),
  ('mrcbc4ar0ztpx', 'PRIMUS MATERIAL DE CONSTRUÇÃO', '4361f423-20ce-4198-ae15-2ff190c406ed'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbc8v2t1cps', 'RAVMAQ COMERCIO DE PEÇAS LTDA', 'd1474f58-ccb4-4dce-9131-7ee56dd9da18'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbc982zl9aa', 'RB TRATOR PECAS', '01f8f2ce-dcf3-4cb2-b266-d97c397553f9'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbcalpobzs4', 'REAL BOMBAS INJETORAS', 'b870bee1-168a-4cc9-909c-cc3f0df59cf9'::uuid, 'nome_normalizado', 'alta'),
  ('mt0kmzlc8v7n3', 'RECOL VEÍCULOS JURUÁ', '516d4cfb-f858-4cf9-b571-04ea4f0a2178'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbcevn8r151', 'REI DOS PNEUS - MATRIZ', '3907ef80-b821-4723-962c-908c9c388602'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbcltr374kh', 'RONDOBRAS', 'e0d63759-9d25-4630-b67b-318d9184d146'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbcqsmcnc6x', 'SAPECA AUTO PECAS LTDA', 'd7086fd0-eebc-4189-af30-3bcffb90965c'::uuid, 'nome_normalizado', 'alta'),
  ('mt0iack987u4o', 'SETRAC', 'd835f2d8-ae82-4174-9274-01cbcf334fe7'::uuid, 'cnpj', 'certa'),
  ('mrcbd39t17cny', 'Sotreq', 'dea010ce-722c-43d7-9eee-7226fb5965ec'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbd4mw5e89a', 'SulPeças Ltda', 'fdc6bc3e-a757-4f1f-a602-330dbc9692a8'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbd614yckpv', 'SUPER CENTRO AUTOMOTIVO', '29595f19-e397-477e-b2b8-8810362ef798'::uuid, 'nome_normalizado', 'alta'),
  ('mrcbd8tbh1voe', 'SUPORTE MÁQUINAS', 'ca8f6c5e-5e52-4f7c-a345-a6bd048c38e7'::uuid, 'nome_normalizado', 'alta'),
  ('mrgn4lwhgmiuo', 'Transportadora Soares', '7ad55bd7-4b56-45b7-8aff-3e9398aff8b0'::uuid, 'tabela_6_1', 'alta'),
  ('mrjlpqn9bd9zs', 'TRATOR PRIME', '6ccdf447-4f0f-43cb-954e-514fc7ab0670'::uuid, 'tabela_6_1', 'alta'),
  ('mrcbdk53kpmke', 'TRATORDICO PEÇAS', 'bc87722a-4f8e-4fe2-a85a-c17e7d8f1880'::uuid, 'nome_normalizado', 'alta'),
  ('mrc6gh9nrm1tq', 'Vale do Abunã', '6077a1cb-843e-4c27-bc68-8f8aa4fa05f1'::uuid, 'tabela_6_1', 'alta'),
  ('mlplpjfr87x0j', 'Vibra Energia S.A', '2f2b25ae-8f39-45a4-a44f-be743168095c'::uuid, 'cnpj', 'certa'),
  ('mrcbe3mwmi8j7', 'XAPURI MOTORS', 'd3f5314e-cd6d-4918-9b31-aa0d499dc140'::uuid, 'nome_normalizado', 'alta')
on conflict (gestao_obras_id) do nothing;

-- 3. Transportadora e dono de tanque (soma das marcas quando dois da origem viram um)
update public.fornecedores f set eh_transportadora = f.eh_transportadora or v.t, eh_dona_de_tanque = f.eh_dona_de_tanque or v.d
from (values
  ('0830bcaa-0b9d-49bf-9ec6-c37c45f3a86f'::uuid, true, false),
  ('3452d414-4671-4410-ba53-ca088d9b667a'::uuid, false, true),
  ('72ac4842-b092-4e6f-a8ac-50667076e0c2'::uuid, true, false),
  ('783c2db2-c6bc-40a5-8a7a-eea9e2f17e84'::uuid, true, true),
  ('7ad55bd7-4b56-45b7-8aff-3e9398aff8b0'::uuid, true, false),
  ('db6b5154-5e4f-42cc-beae-8086a3ad8516'::uuid, true, false)
) v(id, t, d) where f.id = v.id;

-- 4. Insumo Arla em litro, com as mesmas categorias do galão 1335M186
insert into public.insumos (nome, categoria_id, categoria_financeira_id, unidade_id, descricao, ativo)
select 'ARLA 32 - LITRO', g.categoria_id, g.categoria_financeira_id,
       (select id from public.unidades_medida where sigla = 'L'),
       'Arla a granel, em litro. O galão de 20 L (1335M186) converte na entrada do tanque.', true
from public.insumos g
where g.codigo = '1335M186'
  and not exists (select 1 from public.insumos where public.fn_chave_nome(nome) = public.fn_chave_nome('ARLA 32 - LITRO'));

-- 1c. De-para de insumos de combustível
insert into legado.de_para_insumos values
  ('mlplpomwf0uod', 'Diesel S10', '0d37c4aa-b2e4-417a-9e70-decd327d2631'::uuid),
  ('mlvjtpi8o1vmk', 'Diesel S500', '63e45165-9d8f-42ac-b9b1-4913e898bd07'::uuid),
  ('mmjsjiw2eywmb', 'Gasolina', 'd284ab64-679d-4ae1-a637-1bcb72f85dbb'::uuid),
  ('mlprklw2nm0up', 'Arla', (select id from public.insumos where public.fn_chave_nome(nome) = public.fn_chave_nome('ARLA 32 - LITRO')))
on conflict do nothing;

-- 1d. De-para de obras (009 e 010 → a obra única; Empresa EMT → Escritório Central)
insert into legado.de_para_obras values
  ('c5f6493a-5921-434c-93c5-f3a14cd2e428', '003 - Recuperação do Ramal do Gama', 'e10f0b56-094e-4eb0-8459-dc11faa857be'::uuid, 'ad8061a7-4b7b-4881-8b45-161c8c2881e8'::uuid),
  ('mthsfsk7aaqux', '007 - AC - 405 Lote 2', 'a03889e9-9731-4def-a1f1-6e8466ec498f'::uuid, 'b2607766-d4eb-4b5e-993a-442ae8de18a9'::uuid),
  ('99a8ba7d-1b26-4d19-a983-379d46ac86aa', '009 - Manutenção de Rodovia BR-364 (Lote - 09)', 'b4e8f851-8301-48e5-be82-653ddbffe725'::uuid, 'fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0'::uuid),
  ('5d61a510-ff22-485f-9a86-f447dbdf3911', '010 - Manutenção de Rodovia BR-364 (Lote - 10)', 'b4e8f851-8301-48e5-be82-653ddbffe725'::uuid, 'fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0'::uuid),
  ('mu7dsuxvcy3ae', '012 - Escola de Mancio Lima', '460d8d9b-c027-47a0-a45c-2e219bb9531f'::uuid, '76071813-e664-4383-aae6-1f863c6af137'::uuid),
  ('mm41xufthvpjm', 'Empresa AMZ', 'c3454530-a20e-41ac-986d-aaa44b232088'::uuid, 'a6a1f57d-b8cb-4113-b694-58f34af7bdb4'::uuid),
  ('mm41zeupkiyaq', 'Empresa EMT', null::uuid, '0a327d7e-6e2d-40d9-a87b-cf9b4a76be2e'::uuid)
on conflict do nothing;

-- 1e. De-para de usuários (CONVIDAR fica sem usuario_id até o convite ser aceito). Sem email:
-- o repositório é público, e o email do convite se lê da origem na hora de convidar.
insert into legado.de_para_usuarios values
  ('mlqtonq0rwdhy', 'Andreia Alencar Silva', '7d0194c2-fd7e-41d1-b6c4-f05c0a652229'::uuid, 'CASAR'),
  ('mohoe586bolhd', 'Brenda Ciacci', 'a7324fb8-8311-4986-b975-8a8141ec7efc'::uuid, 'CASAR'),
  ('mq9vuzhst8cmm', 'Bruno Souza', null::uuid, 'CONVIDAR'),
  ('mlpsse1i3t84s', 'Emanuel de Melo Cameli', 'd685726c-3776-44a1-b87c-a5712f1afec2'::uuid, 'CASAR'),
  ('mlpjsci4qbqg3', 'James Castro Cameli', 'fa3d729d-ad7d-43c7-8356-9436e4af3a92'::uuid, 'CASAR'),
  ('mlpg62qlekncc', 'Marvim Almeida', '9d4b8593-5d54-4b54-97c3-6d4df473e4fd'::uuid, 'CASAR'),
  ('mmnirr0uajkvl', 'Racenilton', null::uuid, 'CONVIDAR'),
  ('mlpfw6yysr635', 'Tiago de Melo Cameli', 'c66fca9f-5428-4fb9-855f-dcff548764df'::uuid, 'CASAR'),
  ('mqchin539fjqa', 'Yara Nylla', null::uuid, 'CONVIDAR')
on conflict do nothing;

-- 1f. De-para de equipamentos (equipamentos-de-para.csv, feito em 22/09)
insert into legado.de_para_equipamentos values
  ('moul187ez7xo7', '4476c940-0882-4faf-ad58-dee7ea1f572d'::uuid),
  ('mou6tiu2cl7xx', '49126781-641c-4412-b7f0-5127af169920'::uuid),
  ('mc-001', '9ed2a2a3-d12a-43da-a3cc-0cc0aa1823c1'::uuid),
  ('moul02cymgzg1', '2d871602-2ba9-4dc4-a971-5ce4282e0d06'::uuid),
  ('mrzeiiyn8vfdm', '28e94063-3bd0-4757-a324-b5cfb3551f1f'::uuid),
  ('mrzei84m0mv7b', 'b8d60032-4ba0-47e2-aac3-2fad8e964c36'::uuid),
  ('cbt-001', '0d4543ca-b944-40e0-924c-89b65b29fde4'::uuid),
  ('cb-001', 'ed1907ad-15b5-4967-82ba-3dced6ca28f2'::uuid),
  ('cb-002', '4bb6afa5-677a-475a-9868-73d46f9045b7'::uuid),
  ('cb-003', 'a15fff61-7fd6-445e-b43b-2de0a1bb3121'::uuid),
  ('cb-006', 'ad98869d-2662-42ed-8642-3013ab6306f2'::uuid),
  ('cb-005', '9d92fe87-5745-466e-9027-7524bbd15eb2'::uuid),
  ('cb-004', 'fa0a5077-d2c0-4087-a48a-57ed742e878d'::uuid),
  ('mq6w70ax6j0i7', '27902463-c18e-41b3-b4a6-51f55d6aa312'::uuid),
  ('mpwunvfl2vj3x', '8e60d91c-fdd6-4e56-8ef4-e0f5b1ac5275'::uuid),
  ('col-cb-02', '37852e9c-c020-4f8b-8ce3-50dd794e3d4f'::uuid),
  ('col-cb-04', 'af7094fb-54f5-4039-bac0-59152540049e'::uuid),
  ('col-cb-25', '80513914-e998-4893-92f6-8e07dd28cf6a'::uuid),
  ('col-cb-32', '5ab234cf-c44c-4a0b-8ae1-32e11c8cb035'::uuid),
  ('moukwzmxhg9eo', '3ce54b89-4c19-48e4-b670-620dc5617aba'::uuid),
  ('col-cb-37', 'e7b1c1c1-2b0d-495a-8fd2-3ef9b4b6522a'::uuid),
  ('col-cb-40', 'e249f13c-f42d-4dc8-b46b-621e0aa55d3d'::uuid),
  ('mp8hsjj6dezu9', '8e60d91c-fdd6-4e56-8ef4-e0f5b1ac5275'::uuid),
  ('cs-001', '205db27c-965a-4b4a-b132-eb0382317b42'::uuid),
  ('cs-002', 'a28fdbd8-e59f-4509-ab95-1683ac3a2036'::uuid),
  ('cs-003', 'eec315f0-f592-4c19-b393-7e4343411a14'::uuid),
  ('cs-004', 'dce20f61-8a84-4040-bc2a-5dc0709c8b04'::uuid),
  ('cs-005', '0084906e-2ecf-43f3-9518-0d8fbab4626c'::uuid),
  ('mt09v4odw0r5g', '9c65d10c-8a59-4a41-931f-f47c67b4795b'::uuid),
  ('col-cp-01', '5dec46f7-376a-44d3-9170-27f1c2d7de1a'::uuid),
  ('ce-001', 'a32c6df5-d206-47fd-bc1d-379f61050e97'::uuid),
  ('mrl0o1aji7vl6', 'bd3970ce-307e-4e3a-9971-86dd5e2ae012'::uuid),
  ('cm-001', '5ca3a3e3-0c06-4634-a6c5-e87df94e405a'::uuid),
  ('cp-001', '268ae9db-a636-41ca-9ce7-e3101e6a6356'::uuid),
  ('cp-002', 'd9eb9cfa-cfd8-4274-a846-70bdf789a90b'::uuid),
  ('mu1ri7w1mitto', '9a53fe7e-b0a1-4b36-9c23-77d5e8ea2ed2'::uuid),
  ('imp-003', 'a940bb02-f243-4572-a2f4-7318541929ac'::uuid),
  ('imp-002', '4878d361-332d-4166-bbe6-5a34ecf0aa22'::uuid),
  ('imp-001', '40e86548-40b8-4a29-8858-26b511a09276'::uuid),
  ('mpls24q61j97l', '741ff344-68d1-4b58-8a59-229180de51eb'::uuid),
  ('mpyl058omtnqu', 'ff1c6564-079d-4230-997c-37204e9bdc95'::uuid),
  ('mpls79bjy1fxo', '6c084941-67a9-427a-ad0b-4a6848821d21'::uuid),
  ('mpn5dq6ssuvoz', '90a5c22c-f184-4a75-8164-1a9c9fdbe4e2'::uuid),
  ('mpmtrnqf688jj', '8e95b944-7ef7-4fb2-98b8-2958063e5463'::uuid),
  ('mpq0zgskgia0z', 'b0b3d8cf-9818-4108-9a37-96bf61b20a08'::uuid),
  ('mpllvtnz4wswa', '8254b20b-eb92-4218-b417-63d54ba2a611'::uuid),
  ('desconhecido', '913ec755-86b6-42f8-b41a-b7dede86b752'::uuid),
  ('eh-004', '9c0bf879-32d7-4211-850b-ae58c2866aa7'::uuid),
  ('eh-001', 'e1bc0fd2-e6ca-4621-b26d-bc8558007432'::uuid),
  ('eh-002', 'c8ca8293-4605-48fb-bfee-c61022df057f'::uuid),
  ('eh-003', '63bb41e8-80eb-4d74-a906-1c509f799b5f'::uuid),
  ('eh-006', '6f4ce91c-956f-4275-8d02-67ddedf74ef5'::uuid),
  ('eh-005', '4251183e-457f-48d0-9f33-f6fa1ff1bb19'::uuid),
  ('col-esp-01', 'e30d285c-cfde-4b56-b7c0-6e6d8b76ca34'::uuid),
  ('mr5e6kd5s0deb', 'c5123e39-823d-4237-8cb3-5b34c8c97547'::uuid),
  ('vl-006', '4b40dd6b-901a-474e-ba59-546badc14a3a'::uuid),
  ('vl-005', '4d2a55d3-bcb3-43ce-9b5a-434fab19975a'::uuid),
  ('vl-004', '60ca3df0-1ca6-4acf-bc6e-30c7e4919dd8'::uuid),
  ('vl-001', '9aacefaf-878a-472e-bbc5-a55fea83f373'::uuid),
  ('col-vl-01', '040344ac-a1b7-4037-bc6d-d93a64ae14d2'::uuid),
  ('mp2n4nuz84jkt', 'ad497fe3-8829-48b0-a573-7fea24cb3fd7'::uuid),
  ('vl-007', '86d77985-fcfb-44ea-bdb2-0286ec575a4e'::uuid),
  ('lab-001', 'a6ea5f30-ace1-478e-bf37-f185abba4d3e'::uuid),
  ('te-001', '71510bc4-2c5b-43c5-ae0d-6e35a2d1ef2a'::uuid),
  ('mz-001', 'bf554339-af03-406f-acb8-21409d7c5e79'::uuid),
  ('col-mz-01', '72ce1d70-6e66-438b-a341-666c8fcf009a'::uuid),
  ('mn-001', '6f806492-255e-4845-abaa-6083e768ca7f'::uuid),
  ('mn-002', '731fe765-15bb-4f9c-915e-1b19d07c7bed'::uuid),
  ('col-mn-05', '70ccd26b-c606-4ff8-9795-ee976408bc0e'::uuid),
  ('col-mn-14', '9286af15-c829-4463-a30d-b7d084eb34a4'::uuid),
  ('mpls58zfwrczv', '913ec755-86b6-42f8-b41a-b7dede86b752'::uuid),
  ('pc-001', 'b3612027-5150-4b2f-abbb-f048fa7b30d1'::uuid),
  ('mr2misv08056r', '4a23a60f-e888-4ea7-982e-8de82bd441c7'::uuid),
  ('pc-002', '042bc1e5-15d8-42d4-91be-9caea0289421'::uuid),
  ('ms944o1eotv78', '96312003-bf91-4611-865f-f05f2b56b823'::uuid),
  ('mt0ames9ajv21', '57501dbc-247d-4287-80f7-ca729653f188'::uuid),
  ('mou6zgocifqfm', '04cb52d8-8fef-46e6-92f0-5651f072e004'::uuid),
  ('moyf6sv736rr5', 'fb836036-b43d-44bd-98d0-11932b7de950'::uuid),
  ('mpmtxe1c6u4qh', 'b7917add-0260-4734-ac75-8be7f87530b0'::uuid),
  ('mpmtutgwdxy6n', '932aeffc-595e-4125-b41e-58b851e7e78e'::uuid),
  ('mpmtw353ehybt', '7715617c-1965-4dc4-80aa-9bb8c0a857db'::uuid),
  ('mpmtwsbz1tzh8', '05a0f69c-82c3-4547-ab67-cb77ace7ee3b'::uuid),
  ('mtx0tmufis258', '92f1b1a5-b03c-40e4-a4d7-622105611841'::uuid),
  ('rt-001', '34e7ce33-d59e-4eaa-b949-c62ebc7bbe28'::uuid),
  ('rt-002', 'c9cc65d4-60b7-4f43-9647-82b5d4ea7112'::uuid),
  ('rc-001', '091a8845-f3ac-4d9b-a52c-a8c9b4e68f8c'::uuid),
  ('col-rc-cat', '30525f7d-bca1-482d-8205-15c66cc1be3c'::uuid),
  ('col-rc-mirla', 'f820d92b-7b12-4eae-865b-fd06f7fbdc94'::uuid),
  ('rpc-001', '5e0e1ce4-248a-4522-a453-abf3d4532191'::uuid),
  ('rp-001', '8721f05a-76c6-424f-9452-546175659494'::uuid),
  ('mrl1nc2v4advt', '0854e02b-1031-4a57-9b8c-ed2d101f7226'::uuid),
  ('rpc-003', 'a3019d55-6979-4aae-8434-f523da4b6497'::uuid),
  ('rpc-002', 'bbd48a44-b26a-4921-934b-2e16e5108c5d'::uuid),
  ('vl-008', 'b44c60b2-aee7-417e-b144-fa8803eb798d'::uuid),
  ('vl-009', '35a3a8f6-285e-4664-ba4b-5171929ae4c8'::uuid),
  ('vl-002', '6524c991-9ceb-4153-9ae8-5ae7f5f5ddb2'::uuid),
  ('mt0ael0zacog4', '2b77b122-87ae-4527-992a-94f1715bad5c'::uuid),
  ('vl-003', '850ae0ca-45f8-4111-aed1-1e429c17807f'::uuid),
  ('mqft4mrxy2yk8', 'f5d82bae-8113-472c-9042-4b165a710200'::uuid),
  ('tre-003', '33375921-bb65-40fb-991a-892b6d61cb6b'::uuid),
  ('tre-002', '66e00b85-4459-4782-aca9-d5182284e0f0'::uuid),
  ('tre-001', '40bb5380-6cff-4111-9802-896390cf1318'::uuid),
  ('mubipqamo0o9b', '13897258-b62b-4b99-984a-3b225d6bf800'::uuid),
  ('mrjqpxgfb3olq', 'aa6c0411-0e31-49f1-a95b-2b49ecb4a382'::uuid),
  ('mpofumpkb53pt', '89f6c676-7a71-4c6a-b638-44e1e7c114ed'::uuid),
  ('mu5iw178h0xkc', '4bda8bc1-4f31-4a62-a217-28c98c43d0c1'::uuid),
  ('col-usina-01', 'e61e809a-2040-428c-a526-5822f07d1b70'::uuid),
  ('vb-001', '4fcbf73c-7ce3-49d8-bfdc-fd573c5a9799'::uuid),
  ('col-vb-01', '74b680ba-ee52-4020-9827-6327f2ac90e6'::uuid)
on conflict do nothing;

-- 5. Dados de cadastro dos equipamentos, vindos da origem (só o que a origem tem; não apaga o que o ERP já tem)
update public.equipamentos e set status = v.status, medicao_inicial = coalesce(e.medicao_inicial, v.mi),
  numero_serie = coalesce(e.numero_serie, v.ns), data_aquisicao = coalesce(e.data_aquisicao, v.da),
  data_venda = coalesce(e.data_venda, v.dv)
from (values
  ('0084906e-2ecf-43f3-9518-0d8fbab4626c'::uuid, 'ativa', null::numeric, null, '2026-03-19'::date, null::date),
  ('040344ac-a1b7-4037-bc6d-d93a64ae14d2'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('042bc1e5-15d8-42d4-91be-9caea0289421'::uuid, 'ativa', null::numeric, 'N5AE00238', null::date, null::date),
  ('04cb52d8-8fef-46e6-92f0-5651f072e004'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('05a0f69c-82c3-4547-ab67-cb77ace7ee3b'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('0854e02b-1031-4a57-9b8c-ed2d101f7226'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('091a8845-f3ac-4d9b-a52c-a8c9b4e68f8c'::uuid, 'ativa', 833.7, 'CAT0CB10L5B400127', '2026-02-20'::date, null::date),
  ('0d4543ca-b944-40e0-924c-89b65b29fde4'::uuid, 'ativa', null::numeric, '9BFZ2UMT55BB49165', null::date, null::date),
  ('13897258-b62b-4b99-984a-3b225d6bf800'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('205db27c-965a-4b4a-b132-eb0382317b42'::uuid, 'ativa', null::numeric, '9BM9584517B538781', null::date, null::date),
  ('268ae9db-a636-41ca-9ce7-e3101e6a6356'::uuid, 'ativa', null::numeric, '9BFZTNY65BB50984', null::date, null::date),
  ('27902463-c18e-41b3-b4a6-51f55d6aa312'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('28e94063-3bd0-4757-a324-b5cfb3551f1f'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('2b77b122-87ae-4527-992a-94f1715bad5c'::uuid, 'ativa', null::numeric, '98PTSM370SB162151', null::date, null::date),
  ('2d871602-2ba9-4dc4-a971-5ce4282e0d06'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('30525f7d-bca1-482d-8205-15c66cc1be3c'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('33375921-bb65-40fb-991a-892b6d61cb6b'::uuid, 'fora_funcionamento', null::numeric, null, null::date, null::date),
  ('34e7ce33-d59e-4eaa-b949-c62ebc7bbe28'::uuid, 'ativa', null::numeric, 'CAT0416ETMFG09931', null::date, null::date),
  ('35a3a8f6-285e-4664-ba4b-5171929ae4c8'::uuid, 'ativa', null::numeric, '9BWKL45UXTP080282', '2026-03-19'::date, null::date),
  ('37852e9c-c020-4f8b-8ce3-50dd794e3d4f'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('3ce54b89-4c19-48e4-b670-620dc5617aba'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('40bb5380-6cff-4111-9802-896390cf1318'::uuid, 'ativa', null::numeric, 'CAT00D6NKLJR00910', null::date, null::date),
  ('40e86548-40b8-4a29-8858-26b511a09276'::uuid, 'ativa', null::numeric, '9EP181530F100206', null::date, null::date),
  ('4251183e-457f-48d0-9f33-f6fa1ff1bb19'::uuid, 'ativa', null::numeric, 'B60399', '2025-08-29'::date, null::date),
  ('4476c940-0882-4faf-ad58-dee7ea1f572d'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('4878d361-332d-4166-bbe6-5a34ecf0aa22'::uuid, 'ativa', null::numeric, '91VB0982RSC217165', null::date, null::date),
  ('49126781-641c-4412-b7f0-5127af169920'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('4a23a60f-e888-4ea7-982e-8de82bd441c7'::uuid, 'ativa', null::numeric, '84539', null::date, null::date),
  ('4b40dd6b-901a-474e-ba59-546badc14a3a'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('4bb6afa5-677a-475a-9868-73d46f9045b7'::uuid, 'ativa', null::numeric, '9BM6933867B535447', null::date, null::date),
  ('4bda8bc1-4f31-4a62-a217-28c98c43d0c1'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('4d2a55d3-bcb3-43ce-9b5a-434fab19975a'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('4fcbf73c-7ce3-49d8-bfdc-fd573c5a9799'::uuid, 'ativa', 455, 'CP450022', '2026-02-20'::date, null::date),
  ('57501dbc-247d-4287-80f7-ca729653f188'::uuid, 'ativa', null::numeric, 'SP7EN1076.ST00065', null::date, null::date),
  ('5ab234cf-c44c-4a0b-8ae1-32e11c8cb035'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('5ca3a3e3-0c06-4634-a6c5-e87df94e405a'::uuid, 'ativa', null::numeric, '9BM6953016B475719', null::date, null::date),
  ('5dec46f7-376a-44d3-9170-27f1c2d7de1a'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('5e0e1ce4-248a-4522-a453-abf3d4532191'::uuid, 'ativa', null::numeric, 'CAT0CP56JC5P00364', null::date, null::date),
  ('60ca3df0-1ca6-4acf-bc6e-30c7e4919dd8'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('63bb41e8-80eb-4d74-a906-1c509f799b5f'::uuid, 'ativa', null::numeric, 'CAT0320CJRAW01303', null::date, null::date),
  ('6524c991-9ceb-4153-9ae8-5ae7f5f5ddb2'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('66e00b85-4459-4782-aca9-d5182284e0f0'::uuid, 'fora_funcionamento', null::numeric, 'CAT00DLMP6LR00632', null::date, null::date),
  ('6c084941-67a9-427a-ad0b-4a6848821d21'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('6f4ce91c-956f-4275-8d02-67ddedf74ef5'::uuid, 'ativa', null::numeric, 'VCEEC55BE00038523', null::date, null::date),
  ('6f806492-255e-4845-abaa-6083e768ca7f'::uuid, 'ativa', null::numeric, 'CAT0012HK4ER01323', null::date, null::date),
  ('70ccd26b-c606-4ff8-9795-ee976408bc0e'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('71510bc4-2c5b-43c5-ae0d-6e35a2d1ef2a'::uuid, 'ativa', null::numeric, 'SOR5AFKNP02216098', null::date, null::date),
  ('72ce1d70-6e66-438b-a341-666c8fcf009a'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('731fe765-15bb-4f9c-915e-1b19d07c7bed'::uuid, 'ativa', null::numeric, 'CAT0012HV4ER01374', null::date, null::date),
  ('741ff344-68d1-4b58-8a59-229180de51eb'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('74b680ba-ee52-4020-9827-6327f2ac90e6'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('7715617c-1965-4dc4-80aa-9bb8c0a857db'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('80513914-e998-4893-92f6-8e07dd28cf6a'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('8254b20b-eb92-4218-b417-63d54ba2a611'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('850ae0ca-45f8-4111-aed1-1e429c17807f'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('86d77985-fcfb-44ea-bdb2-0286ec575a4e'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('8721f05a-76c6-424f-9452-546175659494'::uuid, 'ativa', 613.2, 'CAT0CW34A3G400232', '2026-02-20'::date, null::date),
  ('89f6c676-7a71-4c6a-b638-44e1e7c114ed'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('8e60d91c-fdd6-4e56-8ef4-e0f5b1ac5275'::uuid, 'ativa', null::numeric, 'NAA45-11', null::date, null::date),
  ('8e95b944-7ef7-4fb2-98b8-2958063e5463'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('90a5c22c-f184-4a75-8164-1a9c9fdbe4e2'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('913ec755-86b6-42f8-b41a-b7dede86b752'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('9286af15-c829-4463-a30d-b7d084eb34a4'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('92f1b1a5-b03c-40e4-a4d7-622105611841'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('932aeffc-595e-4125-b41e-58b851e7e78e'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('96312003-bf91-4611-865f-f05f2b56b823'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('9a53fe7e-b0a1-4b36-9c23-77d5e8ea2ed2'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('9aacefaf-878a-472e-bbc5-a55fea83f373'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('9c0bf879-32d7-4211-850b-ae58c2866aa7'::uuid, 'fora_funcionamento', null::numeric, '04YMOO395', null::date, null::date),
  ('9c65d10c-8a59-4a41-931f-f47c67b4795b'::uuid, 'ativa', null::numeric, 'CHASSI 98TEM327C5B162151 DAF CF FAT 310', null::date, null::date),
  ('9d92fe87-5745-466e-9027-7524bbd15eb2'::uuid, 'ativa', null::numeric, '9BM9580949B628215', null::date, null::date),
  ('9ed2a2a3-d12a-43da-a3cc-0cc0aa1823c1'::uuid, 'ativa', null::numeric, 'GEO110SSHB1640782', null::date, null::date),
  ('a15fff61-7fd6-445e-b43b-2de0a1bb3121'::uuid, 'ativa', null::numeric, '9BM6933867B536216', null::date, null::date),
  ('a28fdbd8-e59f-4509-ab95-1683ac3a2036'::uuid, 'ativa', null::numeric, '98PTTH430SB157038', '2024-10-01'::date, null::date),
  ('a3019d55-6979-4aae-8434-f523da4b6497'::uuid, 'ativa', null::numeric, '7832BR0029', null::date, null::date),
  ('a32c6df5-d206-47fd-bc1d-379f61050e97'::uuid, 'ativa', null::numeric, '9BM958156LB165609', '2026-02-20'::date, null::date),
  ('a6ea5f30-ace1-478e-bf37-f185abba4d3e'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('a940bb02-f243-4572-a2f4-7318541929ac'::uuid, 'ativa', null::numeric, '91VB0952RSC27164', null::date, null::date),
  ('aa6c0411-0e31-49f1-a95b-2b49ecb4a382'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('ad497fe3-8829-48b0-a573-7fea24cb3fd7'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('ad98869d-2662-42ed-8642-3013ab6306f2'::uuid, 'ativa', null::numeric, '9BM9580949B622547', null::date, null::date),
  ('af7094fb-54f5-4039-bac0-59152540049e'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('b0b3d8cf-9818-4108-9a37-96bf61b20a08'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('b3612027-5150-4b2f-abbb-f048fa7b30d1'::uuid, 'ativa', null::numeric, 'CAT0924KTKW400165', null::date, null::date),
  ('b44c60b2-aee7-417e-b144-fa8803eb798d'::uuid, 'ativa', null::numeric, '9BWKL45U2TP079725', '2026-03-19'::date, null::date),
  ('b7917add-0260-4734-ac75-8be7f87530b0'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('b8d60032-4ba0-47e2-aac3-2fad8e964c36'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('bbd48a44-b26a-4921-934b-2e16e5108c5d'::uuid, 'ativa', null::numeric, 'CAT0CP56AC5P00370', null::date, null::date),
  ('bd3970ce-307e-4e3a-9971-86dd5e2ae012'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('bf554339-af03-406f-acb8-21409d7c5e79'::uuid, 'ativa', null::numeric, '9BFXTNCF25B52014', null::date, null::date),
  ('c5123e39-823d-4237-8cb3-5b34c8c97547'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('c8ca8293-4605-48fb-bfee-c61022df057f'::uuid, 'ativa', null::numeric, 'CAT0320CKBER00495', null::date, null::date),
  ('c9cc65d4-60b7-4f43-9647-82b5d4ea7112'::uuid, 'ativa', null::numeric, 'CAT0416ELMFG02195', null::date, null::date),
  ('d9eb9cfa-cfd8-4274-a846-70bdf789a90b'::uuid, 'ativa', null::numeric, '9BM69940006B503601', null::date, null::date),
  ('dce20f61-8a84-4040-bc2a-5dc0709c8b04'::uuid, 'ativa', null::numeric, null, '2026-03-19'::date, null::date),
  ('e1bc0fd2-e6ca-4621-b26d-bc8558007432'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('e249f13c-f42d-4dc8-b46b-621e0aa55d3d'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('e30d285c-cfde-4b56-b7c0-6e6d8b76ca34'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('e61e809a-2040-428c-a526-5822f07d1b70'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('e7b1c1c1-2b0d-495a-8fd2-3ef9b4b6522a'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('ed1907ad-15b5-4967-82ba-3dced6ca28f2'::uuid, 'ativa', null::numeric, '9BM6933867B535751', null::date, null::date),
  ('eec315f0-f592-4c19-b393-7e4343411a14'::uuid, 'ativa', null::numeric, null, '2026-03-19'::date, null::date),
  ('f5d82bae-8113-472c-9042-4b165a710200'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('f820d92b-7b12-4eae-865b-fd06f7fbdc94'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('fa0a5077-d2c0-4087-a48a-57ed742e878d'::uuid, 'ativa', null::numeric, '9BM9580949B628205', null::date, null::date),
  ('fb836036-b43d-44bd-98d0-11932b7de950'::uuid, 'ativa', null::numeric, null, null::date, null::date),
  ('ff1c6564-079d-4230-997c-37204e9bdc95'::uuid, 'ativa', null::numeric, null, null::date, null::date)
) v(id, status, mi, ns, da, dv) where e.id = v.id;

-- Conferência: a carga só fica se os números fecharem.
do $confere$
declare v int;
begin
  select count(*) into v from legado.de_para_fornecedores;
  if v <> 55 then raise exception 'de_para_fornecedores: % linhas, esperado 55', v; end if;
  select count(*) into v from legado.de_para_equipamentos;
  if v <> 109 then raise exception 'de_para_equipamentos: % linhas, esperado 109', v; end if;
  select count(*) into v from legado.de_para_obras;
  if v <> 7 then raise exception 'de_para_obras: % linhas, esperado 7', v; end if;
  select count(*) into v from legado.de_para_insumos;
  if v <> 4 then raise exception 'de_para_insumos: % linhas, esperado 4', v; end if;
  select count(*) into v from legado.de_para_usuarios;
  if v <> 9 then raise exception 'de_para_usuarios: % linhas, esperado 9', v; end if;
  select count(*) into v from public.fornecedores where eh_transportadora;
  raise notice 'transportadoras no ERP: %', v;
end $confere$;
