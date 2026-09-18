-- Desfaz `carga/caixinha_amazonia_a_receber_2026_09_18.sql`: devolve os 331
-- rateios a receber da Amazonia Agroindustria aos centros onde estavam antes de
-- 18/09/2026 e apaga a etapa "Caixinha Amazonia".
--
-- NAO aplicar. Fica versionado para emergencia.
--
-- Cada linha volta para o centro EXATO de onde saiu. Nao da para deduzir o
-- centro de origem por descricao: 326 estavam no Escritorio Central, 3 no Galpao
-- Silo e 2 na BR-364, e os ids abaixo foram lidos do banco ANTES do UPDATE.
--
-- Ordem: devolve os 5 por id primeiro, depois o resto da etapa vai para o
-- Escritorio Central, e so entao a etapa cai. A etapa so e apagada se ficar
-- vazia -- se outra frente tiver lancado algo nela no meio tempo, o script para
-- e avisa, em vez de arrastar dinheiro alheio junto.

do $desfaz$
declare
  CAIXINHA   uuid := '0cba9e3e-34f7-452a-9374-17ba4fb6409f'; -- Caixinha Amazonia
  ESCRITORIO uuid := '0a327d7e-6e2d-40d9-a87b-cf9b4a76be2e'; -- Escritorio Central
  GALPAO     uuid := '8fdf5512-bf97-46c4-9384-d4e164237cbb'; -- 004 - Galpao Silo
  BR364      uuid := 'fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0'; -- 009 - BR-364 L09&10

  IDS_GALPAO uuid[] := array[
    '42bb2b1a-9b97-49cc-9847-f8638721ef4c',
    '4558803f-99a9-48ee-be91-8811a4bd983e',
    '86e2f651-1ef3-428a-86bd-61eda4064198']::uuid[];

  IDS_BR364 uuid[] := array[
    '0bfbf230-ce39-4c17-b6dc-b39b66dbc9fa',
    '4b2f6128-e3f4-4d63-81fd-4d9f08abdd98']::uuid[];

  v_escritorio int; v_galpao int; v_br364 int; v_sobra int;
begin
  update public.lancamento_rateios set centro_custo_id = GALPAO
   where id = any(IDS_GALPAO) and centro_custo_id = CAIXINHA;
  get diagnostics v_galpao = row_count;

  update public.lancamento_rateios set centro_custo_id = BR364
   where id = any(IDS_BR364) and centro_custo_id = CAIXINHA;
  get diagnostics v_br364 = row_count;

  -- O que sobrou na etapa e, por construcao, o que veio do Escritorio Central.
  -- O guard de 326 abaixo e quem prova isso.
  update public.lancamento_rateios set centro_custo_id = ESCRITORIO
   where centro_custo_id = CAIXINHA;
  get diagnostics v_escritorio = row_count;

  if v_galpao <> 3 then
    raise exception 'Esperava 3 rateios voltando para o Galpao Silo, voltaram %.', v_galpao;
  end if;
  if v_br364 <> 2 then
    raise exception 'Esperava 2 rateios voltando para a BR-364, voltaram %.', v_br364;
  end if;
  if v_escritorio <> 326 then
    raise exception 'Esperava 326 rateios voltando para o Escritorio Central, voltaram %. Conferir contra a lista de ids no rodape deste arquivo antes de seguir.', v_escritorio;
  end if;

  select count(*) into v_sobra
  from public.lancamento_rateios where centro_custo_id = CAIXINHA;
  if v_sobra > 0 then
    raise exception 'Sobraram % rateio(s) na Caixinha Amazonia; a etapa nao pode ser apagada.', v_sobra;
  end if;

  delete from public.centros_custo where id = CAIXINHA;

  raise notice 'OK: 326 para o Escritorio Central, 3 para o Galpao Silo, 2 para a BR-364. Etapa apagada.';
end $desfaz$;

-- Os 326 ids de rateio que estavam no Escritorio Central, para conferencia. O
-- UPDATE acima nao depende desta lista (ele pega o que sobrou na etapa); ela
-- existe para quem precisar conferir linha a linha se o guard de 326 falhar.
--
-- 0006f0ac-e6e2-4a89-ba3b-ac71e25f3f6b 00838ea3-d0a1-451f-9e82-a830c0a52744
-- 0092322b-8063-4e6b-869c-cd1fe26c9549 01cecc8a-b214-4de7-82c7-662df34807e8
-- 01ed5005-5d30-475e-bef3-a69732aff965 0272f576-8b16-4c3a-b18f-6524c49bb3f1
-- 03b0eee6-b022-4b16-8324-0611b935ca17 03f88ce9-7bb4-4121-a05f-03e2b922c016
-- 03fb8df0-8190-45fc-97fa-77e40a44aa10 0496a5d9-f539-4b44-9c4c-fe6986d71ef9
-- 04c5d025-6a7f-46c5-ad97-206e48478e3e 05704d5e-238c-44ac-b667-8bdbdf82f96e
-- 05b1f56f-00ac-4f16-964c-f64a7e3f0a73 062ddd08-f581-4486-a339-611e92919ed5
-- 06a5bd6d-9625-44dd-aa09-11b565484b2b 08691ae8-ccb0-43de-98bf-ba5c45473710
-- 0947c700-c36a-4340-9153-ad6c6c8c0bce 096fdc66-1166-4904-90fd-402461a441af
-- 09d3c3ee-2244-4b29-bc3c-f6217cbb9041 0a9b8e14-0963-4a80-a44c-6027108fab73
-- 0abe71f2-36a7-44b9-9ac8-600183b63b06 0b3de2f1-e658-463f-8813-dab00efd53ef
-- 0b62cab8-9806-4728-9c42-1d6fe8dd973d 0d0acf0f-c338-47ce-aa79-4eb268f67423
-- 0d2a6719-c25e-4b51-8042-a119303cdc20 0d7d2ecc-dc11-41f3-9fc6-2e60731f7dce
-- 0dcbbf25-1f3b-43bc-832d-67499ef1ad19 0e5b7069-5a59-4b2f-853a-3875ae27631f
-- 0f2ef859-fbc3-4355-a8c3-f3a7fdca492d 1020fc31-5184-47c4-b227-ac0129117d36
-- 1027705a-c474-4ea1-91e8-851d55d2850c 109488e4-6662-4e2f-9f29-0fa226d550e8
-- 10c71379-393e-4ee1-9928-e382c84c9ea7 16efb80b-85ae-42e1-b111-64ee0e80aafa
-- 18ff8009-9467-4255-b6a7-51f3dbe1dacd 192ba794-f01a-4895-98eb-5c5eb245ba12
-- 195e2132-9c6f-4d21-8302-ae8c8893d8a9 19f8e951-2ba4-437a-8a03-2a059da66e95
-- 1b74a05f-9343-492c-9a93-b5f3935498e0 1bea4f77-c037-4e1f-b550-1cc220bc529c
-- 1c449028-5b0e-4e37-8f3d-d041f46c29c1 1d40bc1b-21ee-42e1-9c89-7463058e04a4
-- 1e1c11a1-1202-4eb4-b1fb-fc8fdb79aa0c 1e212fdc-61ca-4d7d-b16a-05fb5a2e9fc0
-- 1e82e421-5bd2-4dca-aea2-a9dfa8d6b08a 2070f749-94a3-4586-a800-c029dfa84c8a
-- 234672bd-173b-4bcf-9183-ed2d1395687b 2404dc6a-db2a-420f-b2a1-375a2b171888
-- 240608f3-dd48-4575-b593-5d3bea37e667 24482b3d-1780-4a8f-90ce-71fc027dd788
-- 252848b4-2ee9-4ba5-b832-d5c5ba692341 25b75892-d77b-4989-b3e3-5d1c00e77e34
-- 25e8c5bf-fad0-4fe0-b68d-42d3668f645b 2690f0a4-ae5b-4823-b1ac-b0f3608e3308
-- 27868515-b6e3-4496-98e0-8935dd65b09b 2a930930-9076-48cf-95c1-a7136be1788b
-- 2c7516d6-69ed-48e5-939f-7f2756111899 2d2ec46b-5ebb-41a7-ade6-fe6383ed8b94
-- 2d5fa00c-1f4f-4b85-8167-34b330f9da8b 2e7a11a8-b3c5-48cf-bd40-8ff8da91f305
-- 2fb6c775-2393-4605-b169-a3e88d9e33e6 2fd4f26c-871a-48f2-8fd7-5db307aa0eeb
-- 2fe982f3-e92c-40fe-8bb6-475636938fd2 31ba7b1d-4974-422f-b369-fd1f7c9c96ad
-- 32d90b9c-3ec1-4d1e-99e6-e4493e32d4b1 32f30b24-98bd-43d6-a93d-df0dcbe00641
-- 33faca31-f43e-45e8-83e6-64a2edd90174 34060edf-47aa-4c38-9c42-8bb1f34e5fb4
-- 346a57e3-d7e7-458d-b512-5b2485637fe3 347acd49-830c-4aea-873c-293900f810e2
-- 35ff4dd2-7f2e-492a-b4f2-b297d6775b85 36395c29-a6e1-4dce-9b29-cf5ff6075583
-- 37c06bab-1de8-4bb9-861d-b1f81152de85 37c329f8-e9cd-430b-886b-a37b299f999c
-- 381526d7-e2ff-41f2-aa25-abf8c0d784e9 382fd0dd-9065-4352-887a-b1c54896e090
-- 393a0478-0325-48cc-9fb4-814184838fc0 395eb57e-841a-4f0f-bb13-4cc4276481c6
-- 39c1eff5-2138-42db-82a4-7b662cff53e2 3b45d97b-e198-46b0-b293-004a7ecd5de2
-- 3bed3aff-dd54-4824-b428-442dd9887f95 3d380304-dc67-4ee8-956e-961a0ac7522d
-- 3d39a9e3-d9ea-4044-a39f-750bbda6213c 3f11f689-b707-4ce8-a0ec-e0f9000adc27
-- 3fd57c0b-5f17-48fb-96cf-7440c9b36a7b 40bca543-4023-4164-a4aa-592df44b8bf1
-- 40fc34c7-167e-4395-bc66-c83fe1fd0a0c 41325050-32c6-447c-b412-a51a256128c0
-- 417292c1-1def-425e-a86e-e6808bca3d54 41b87555-77f3-4aeb-ad52-dc14a6648a01
-- 41e3a17b-564a-4f92-a1fb-969ad6fe0a0e 4357aec2-11b6-4821-9750-387ea96b6d7e
-- 4399d4cf-3d97-4ac6-91e8-b0dfe7c20001 43c18fc1-c2c0-4ba4-9b9f-efeb2f37ab21
-- 449c9ebc-0cc9-45a6-8acb-27f1158e4e64 45fe7b25-c5a1-4bf0-ae58-cabecfc47e1b
-- 4631eb36-fc29-49f7-b86b-9612dc8afaf6 4684d287-29b1-44c2-b764-18e2552aef88
-- 46b36d28-47af-410f-8a7f-aca41a43db79 4773401c-aed9-4c62-a25c-38b5721c638a
-- 47b8adf9-18ae-4055-8ff7-2424b6fe3825 47c6d56c-c1e0-4d4d-b962-6b1361f59947
-- 48028ee0-b28a-4749-9daa-214b63d99585 48967357-c168-45c4-8254-bb6c1150ecd1
-- 4b4bac4b-703b-41f9-afe0-6765e13b9370 4b7d0003-b2a1-4712-a1e1-9815829b6828
-- 4b90c735-921c-490a-befc-bd68a326a19a 4c3aa5c2-72a2-49a0-8a45-5ecb3455fbca
-- 4c93049c-3a00-4bc8-81ce-802dfeffe4db 4c9762a0-4f69-4cb3-ac23-53aba3653433
-- 4da35f2a-95de-4a4a-b54a-1e6974516418 4e9d5c94-4054-4e50-8b32-6e28c7dee4ec
-- 4f644fca-94eb-4487-8cc4-9f8ea41539ac 51acbb03-fda4-49b4-9f62-138ed830ec91
-- 51ddece2-3812-45a9-bc23-3756ad0b82c4 561edbc4-d761-4304-a9c3-f7aed37c9672
-- 563f9b51-fc37-47f6-bc7c-0a0685377fe2 57074ec9-2b74-4639-8d1d-31c393aad2a2
-- 575b9364-b013-45ab-b83f-28a30c07769d 57e42c11-21b8-451d-947b-203155a85b49
-- 59eae27a-dbbb-41af-8f78-e45bfa39b132 59ecc1ee-a469-4e5d-9f05-07681edd926a
-- 5a1ec9f0-4982-46e3-a140-5e0a1a5bc692 5aeb1e2d-03d2-4908-804f-dbbba02e40b5
-- 5b6c4c4d-079b-476b-a9e1-e802b75cea55 5b776ab4-0a02-489f-b6f0-8b4e68da6c0b
-- 5bb50a07-60d5-4863-a01d-5ae051223593 5bc84a35-5a6f-441e-81f8-3abddec3a5d9
-- 5c0278f4-d7f6-461e-8d95-0fd57aac5be8 5c3391d6-fb8a-4714-9787-6a3ef2c56999
-- 5d7f143f-04e8-4ccd-bfe5-64e6af82fe81 5dd1e39f-046c-4fe9-9a18-cb8e7ac98cb3
-- 5e8320b6-d12d-455c-8a3a-9e0438f20f01 5eb7e0b9-024a-4aea-a1e5-9bdab0c8b198
-- 5fa33a44-a255-402b-966a-c2e866e98a3c 60557882-4c93-49f5-85be-6fa25fabd9c1
-- 62d555a7-6ee2-496e-b326-845e6c72af40 63ca16e2-60a0-42ea-9d4f-97b58f385494
-- 63cfe78e-479a-418f-b2e9-45c4530ae937 648a6144-a121-42f1-8b5d-d82e7625522c
-- 649dada0-9bbf-4c4b-b694-f0e267ee101b 64dd7d7c-4b66-48cf-93e6-ac54137e56c2
-- 66386d73-fbdd-4fe1-9795-3fb7aaa2876d 67645bc3-8615-467a-897a-4fdf9a2b409e
-- 6788fb63-2be5-4469-be69-9aa49dc9428a 6863e52a-48b5-4dc6-91c4-2154c5442478
-- 69b95bc0-76f9-4736-87d2-d4f3e3b18430 69de27b9-6ecb-4d87-9ac9-855e0388cce3
-- 69f949c1-ca86-477a-8c67-e940d625b003 6d6bb11d-1e5c-403f-b871-2d378231736b
-- 6fb4e69e-8966-4387-a75f-3ac4865ecdcc 6fe743e5-c9ea-4efb-875b-bb698d0cd096
-- 70438fbe-4761-42e0-8304-6c7aafdf46f3 70d998ad-c1bc-4ef3-bfe5-0c577e554e22
-- 726a1c47-4bd4-44ce-9220-6422e51507a3 731cf936-7a7f-4b48-9789-dc4d70b2a86a
-- 732cac5d-030f-40d5-b909-882827e86e23 740a435f-2787-483b-bb6a-c2a8b512b3dd
-- 759da980-26d6-4973-b811-85a60a7bcb6c 75ca2b1e-838c-4231-898a-f16c1196ffbf
-- 7697c9d5-dc82-4912-a680-7f8ba4635c28 76b6b6d0-cca9-4f97-b053-95e7d678270a
-- 77e0d83e-e6ca-4ec0-8614-0833d3050d33 785e5d31-65dc-43aa-b78a-f995f70d3679
-- 7942bed3-0720-407e-9188-49370e555c30 79550792-dbb6-421e-8df5-8cb47cabdbd8
-- 79c9ac0a-9259-4145-a01f-36bce2d189e3 7a1d8307-2c5a-4740-afc7-d86c2fc547ff
-- 7ad8e3de-88a5-4b0f-9ee2-c02b196f6e6b 7b37a6b7-6a51-4251-baae-7618767b42ad
-- 7b73465f-64b6-4a8c-aed3-c12c428c4aac 7c77ca03-73c4-4839-9b1c-cd4eb7aee1ce
-- 7d09525e-1369-4636-bb87-729cb371390d 7d5099ab-3af4-43d8-88d6-ab0915e7128b
-- 7ff0912d-ec37-4d47-9a82-561235f2cf64 818c03c3-9cf3-47fe-8517-161df385d8d7
-- 834580c7-89db-4d14-93b8-a2ef0df69249 8418935c-dfed-4650-829b-46c2fc90eeb8
-- 84ad9380-85c2-4cea-9f0f-9ece9f608ab0 85d5cb1a-7d03-4548-ba87-5e96e044d6d0
-- 893e28d1-5e8d-4cb8-8c97-aac92781eccf 89db8cc3-4092-45e7-a76d-fc3b131db60e
-- 8a7027c8-db0b-411a-8ba7-d6706b949195 8b5d0580-30a6-414b-bb7e-c1ade0a5e332
-- 8c3d8cb5-6d98-4e1f-8942-c29d9e313966 8cdcfe12-a1c0-4033-a1aa-d6f344e4c54b
-- 8d3973f4-8e09-49a2-9efc-ff1f30613e8a 8e2f87f5-fec6-43cc-9404-666edbd1b6a3
-- 8e357763-3dc0-40c1-b1c9-795ccb98292b 8efb6520-3e7d-4100-8db9-de8547139db1
-- 8fe843b4-d520-472e-8d9f-9cf77f17b9e2 90ff3745-e37a-4869-963f-2401f574b75d
-- 96222537-032a-4628-9975-135ee042cd83 972f9625-7a40-49ae-8308-4e644a86b4c7
-- 97753649-9f50-46d7-808e-b9c5a3dcbc98 984fb8ff-2975-466f-9da9-081b8792b267
-- 996e9365-6058-47d3-a598-fd198082ba96 9a134fea-451d-4c38-8fe3-9fff7a9b1887
-- 9a5c1982-ccaf-42ca-8b9d-d484cb8f2cf9 9aeb62ff-26c6-40fe-8b9b-23c7f37cc9b9
-- 9b1afa37-eace-4776-95d9-1adf4e0839d6 9bac7e95-38cf-4dba-8940-20f4a55f3bf8
-- 9be0be77-dfb0-4206-b255-6697571d177c 9bedb106-8b9d-4c50-9a61-67dfd091f9b2
-- 9c1ddeee-fbbc-4e3c-95be-b8d063eb8d2e 9cb12088-8c79-4ece-b051-a80430614300
-- 9dc8acb6-4cd2-445d-b090-da669678072d 9e1b0ce3-b03f-4225-9c04-f0c19358ed71
-- 9eda375c-36bd-42eb-a0ef-365675521055 9f267793-a557-4078-9f93-7eee9ff3647f
-- a0f52a21-661b-4d2c-9b79-2601c61a8403 a101c2c1-e5f7-4b3d-9b8f-c5bf9497f36b
-- a2839241-7127-4c3d-affd-e57c42d9001b a308b513-5efe-4048-8f9b-afce31efda56
-- a357783c-1827-41c6-ae71-53df2de26983 a3852899-1377-4e18-a375-e0d3ba75cd6b
-- a4d3bcb1-de04-4440-b014-bccdca47d9c4 a56c6a30-c859-40bf-8e0e-a3bd3457e629
-- a5ec00dd-5861-4fb3-9ebe-88e895fb958a a67c016a-cdde-49b3-b9d9-5ef84706d358
-- a7a475cd-496e-4731-a8a5-a87fcf53fe00 a82eb411-1c35-47a8-884c-1a04a812ba92
-- a870eb96-f68d-4a03-aa55-89d203c9844f a89dcfc3-51ef-4946-96ba-24f0247aa6ae
-- a8bbc9d8-1cfb-4198-a925-91a537c32c47 a8daca1f-f5e1-436e-a5db-58291736ec0c
-- a921eecb-f57d-49f3-b513-3e2bde983dd4 a9471ce8-2645-4628-bf80-8fde9bf28aec
-- a9512d5c-de7d-45b0-9b47-c46a1beb12c4 a9be8857-d5ec-4051-a453-e814739b8f04
-- ab73963b-7902-4f1f-b739-e3e5a9686d62 acab381f-d8ac-4df7-951a-200b094b55f4
-- acac185c-b35d-4035-b5cc-bc9653c0bc9c af7e91ee-86d4-444f-b2fa-969488dd2be5
-- afc40a1b-0bde-453e-9187-b548d646ec91 b06a0dba-b3fc-4212-bc8c-111af4bc85b9
-- b19dc87c-1786-48a5-96c6-d432361ff860 b1e96518-1f2a-48b0-9048-28046c4c05ce
-- b20b69ac-def5-452d-825f-e4f215758cbc b4e7d8c5-44dc-49ff-855d-0172ad57039d
-- b6222a37-3540-4e5f-8a86-b65d089c549a b656b60e-a4c5-4258-baa7-9a1761dcd6f0
-- b6ca7ce9-0068-44be-83c0-96a1ec6d5b2c b6d0d730-6f0b-48ed-8640-c766d3a97684
-- b6f7a224-4d34-4b01-9ecc-ceea333a988f b8263221-0283-475a-8fdb-606449ed1d1d
-- b8c4e122-ffee-4676-a47e-e31d41ef81c3 b9d91b90-d9bd-44e5-91ee-39aa83677a79
-- ba36c49a-a0a6-43ca-b96d-c4d2589dfbdc ba3bbe4b-68a4-4c3b-9601-d25dda7b991f
-- ba6d6f9d-fc88-4484-9959-f7a8746fee26 bb91911c-6bee-4322-85b6-c7e3dde59305
-- bc4c701d-b007-4500-be4b-302a79adf799 be4ae2b8-37f2-4541-8b11-98764d61cdbf
-- bed22191-46da-4a2d-964a-86b0710d3ccc c00d3a68-d3a5-42ff-a48f-dd1e7475de84
-- c0e221a3-b610-478a-8e09-4e0acc29275c c1cf6b98-0fd2-4df6-b6ba-0289438c2d89
-- c2862d69-c615-4c20-80c4-5def88340200 c37698b7-8551-4dfc-8d78-e4ed5e8af0ce
-- c4493d62-847d-4192-bb4d-ca9a98d7edd0 c554e8dc-085b-4623-8495-55fecab3d034
-- c643290c-e251-40ec-a891-8eb0938658d4 c791f732-efdb-43ca-92e5-903c26fe60a9
-- c7e6c656-edc7-45ab-9561-9993c6639ec9 c7f6b193-9e44-45ef-95a6-7ca062152f4e
-- c81c85b9-66c6-40c7-87d1-71c416060f91 c8d27374-e30b-45f5-8af9-a61c3ed02ba7
-- c8d39f33-9c82-491b-ace2-794167d63894 c8e1ba3c-215d-4cbf-b695-3555bb9b1a9d
-- c934f12d-a1aa-4ca8-9801-8e0a0a6bf78a cb0daf2d-5d97-4a8a-bf22-75cfeeb9057f
-- ccbe6798-a9df-42ee-b651-be677d54cf57 cf0f9aff-0c2f-4bf2-9e0f-bcfcd6ded308
-- cf1518df-1a57-4090-ba19-1015c86177d4 cf375860-8604-48bb-b230-962bdf680867
-- cfac2a41-91af-447e-a3d8-074ff44cf2cb cfc559ba-2aa9-4336-8150-7a1319773da2
-- d06c5208-e15f-45e4-93e3-4989944dd28b d0d0d13d-962f-469c-8e97-726d93aec21b
-- d2acecf3-61b6-4faa-8902-9353b8b4f53f d3b09681-055f-4daa-ba55-c61f71708378
-- d3b5bd69-1131-4a73-9633-7fad9416c794 d3daf5ba-9125-4540-a867-7d205bd8c148
-- d49f8f18-ac75-4349-a4c2-4e11b522f402 d5eb5cf3-9bca-435d-a469-4a74ca446563
-- d66bb9f1-8274-4b92-8e16-93109cd68c24 d71bb1b3-41a9-4d39-b755-eee8dae0f22b
-- d7eec3a0-f3d5-4dcf-b6d7-3656cacc6f27 d84fe821-bc48-4685-a329-083496a27f2f
-- d8eddca3-a689-4d23-a86f-237fd81accf0 dcbeb748-34bf-4ddb-b8f6-1ba350cc46e5
-- de28b445-d538-4ae2-9445-50e52693c0f2 de62bdde-0541-41ac-b354-e0b126064313
-- deb37bbe-efbe-4d4e-bef4-aeb8e34eaeff df4c6483-d499-4f06-97f7-54f2a7960f90
-- e0073ff7-3c46-42c9-b300-2375512eaef5 e0435aca-582e-401e-b060-4dd27a5cce56
-- e183ecd8-94a4-4ba6-b9fa-e4fd23d01c20 e2fba368-4e11-40e6-91d7-f45e014b0c44
-- e318ee9a-252f-4f93-ac53-bcf26ac10f1c e484c975-1860-485c-be64-5d9604093f71
-- e549cdf0-032b-4c22-9027-31120101c4f6 e59e13e0-4598-4c6a-9283-2017817cadff
-- e5ad28f7-67f3-44f8-9af7-23fc335b4259 e8a4eb10-7b12-47b6-bbcf-8aded5765849
-- e8f6e033-17e6-4baa-9401-b1c76bf78440 ea45628a-4a98-4a76-ba4a-0726837c90d1
-- ea51aec9-6c6c-464d-b990-64104407315f eba7e87c-a916-4344-a7fc-e0156d8f0daf
-- ebb4a726-b6c7-4021-aa03-ad8fa258e978 ebe6f36b-cf41-41ae-ab57-e3437fc0d7f3
-- ebf6b3d1-cb15-4429-b90a-6514092794ad ed22f6f7-2629-4c81-8d4d-91fdb407bcb4
-- ee46bcdd-7227-421b-ade1-5d16a5e3688b ef8fbae5-0d7c-4381-9663-1e57ff0e63fe
-- ef9ff8ea-68b4-46e9-a65c-f8aa841f0ed9 f0001933-910b-4039-8e1c-a1b5612d425e
-- f15afebf-1e24-4caa-83c1-35d1b3c0e2c7 f1ba6363-7083-48eb-a91b-449532feff8d
-- f78e6a08-4ad7-43f1-98a8-3a5296516a8c f8d927df-d573-491c-afe0-0b67f09c30e1
-- f8eaf749-1659-4bfe-9934-f7f0069b05fd fceef41e-354a-49b1-88ca-ff72f8a08201
-- fdbbae4d-6bc7-477d-8c05-b93e32daec66 ffb57b59-3363-4365-a7d9-71d8bbee3cf7
