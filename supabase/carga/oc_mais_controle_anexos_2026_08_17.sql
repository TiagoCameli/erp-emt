-- Anexos das 17 ordens de compra do Mais Controle (17/08/2026).
--
-- 45 arquivos em 16 ordens (a 2607 não tem anexo nenhum lá, conferido na tela);
-- 45 binários distintos, já no bucket privado 'anexos'. Este arquivo só cria as
-- LINHAS: 'arquivos' (uma por binário, com o sha-256) e 'anexo_vinculos' (uma
-- por anexo, apontando para a ordem).
--
-- ## De onde vieram os binários
--
-- Da própria tela do Mais Controle, lidos da pasta de arquivos de cada ordem
-- (`folder.files`), baixados pelo navegador e conferidos byte a byte contra o
-- `sizeInBytes` que o Mais Controle informa — os 45 bateram. O upload para o
-- bucket foi feito com a chave de serviço, que é o único caminho que o app tem
-- para o Storage.
--
-- ## Por que não usa as funções do app
--
-- `fn_registrar_arquivo` e `fn_vincular_arquivo` exigem `tem_permissao()`, que
-- depende de usuário logado, e carga não tem. No mesmo espírito, `service_role`
-- não tem grant nenhum em `arquivos`, `anexo_vinculos` nem `ordens_compra`: no
-- erp-emt esse papel só serve para o Storage, e todo dado passa por
-- `authenticated` com RLS. Isso é desenho, e a carga não o afrouxa — ela entra
-- por psql, como as outras.
--
-- ## Ordem das operações, e o que acontece se falhar
--
-- Binário primeiro, linha depois. Se este SQL abortar, sobra binário no bucket
-- sem linha em `arquivos`: isso é lixo, e a faxina de órfãos do app recolhe. O
-- inverso — linha sem binário — quebraria a tela do anexo, e nesta ordem não
-- pode acontecer.
--
-- A ordem de compra é achada pela observação 'Ordem de compra Mais Controle N'.
-- Se qualquer uma não existir, ou existir duas vezes, o bloco inteiro aborta.
--
-- A prova no fim compara, ordem a ordem, a contagem de anexos no erp-emt com a
-- do Mais Controle. Ela conta ANEXO e não binário, senão a 2592 (24 arquivos,
-- R$ 100.000,00 de brita) passaria com um só.

do $$
declare
  v_falta text;
  v_n int;
begin
  create temp table _bin (path text, nome text, mime text, tamanho bigint, hash text) on commit drop;
  insert into _bin (path, nome, mime, tamanho, hash) values
    ('arquivos/2026/08/22459a18-2494-40f2-bc12-5cae177aa899.pdf', '1cad9be6-b313-48a5-a54a-9b89e0b9a4f5-WhatsApp_Scan_2026-08-01_at_08.32.05.pdf', 'application/pdf', 763201, '2b6fc3d13f9a01f17fdbd935c371937b3d06cce175485c262f7b6ad36d608537'),
    ('arquivos/2026/08/352ffa00-d5c9-44a4-bb1d-ee35a2462500.pdf', 'BRITAM R$ 100.000.00 10.08.26.pdf', 'application/pdf', 6088, '219a054467a0a170d94ec14b1652a7019d9ae5d87a3e115a1ff5c69739869036'),
    ('arquivos/2026/08/8e9fa423-d078-44f3-94a1-4ef0c0fb88e0.pdf', 'Relatorio_Pagamento_Britam_10-08-2026.pdf', 'application/pdf', 127863, '42ea7763c70bf1a28660e1bc14b3c4c4b35120baad42919ca127a8f6bbed848d'),
    ('arquivos/2026/08/5ddd2b64-67ab-423c-90f2-6c14346fd54e.jpg', 'WhatsApp Image 2026-08-13 at 14.21.40.jpg', 'image/jpeg', 175123, 'f61c33ed084c59db5fc2ab722e58f02902f8d3645d82b8f50cad7bfda2a5793b'),
    ('arquivos/2026/08/a208f5e7-6918-49cd-b9d0-a10c5704d797.pdf', '11260814666956000131550010000577581000695812-danfe.pdf', 'application/pdf', 65061, '4ca43cc5bc5a74d2fb8be21d62fd4cc2dbfe4d11e777ba72e58dd07e9f8ccb97'),
    ('arquivos/2026/08/949dd699-e1a3-4dc6-b6c1-d92261022167.pdf', '11260814666956000131550010000577591002759254-danfe.pdf', 'application/pdf', 65545, '7011962a62b2139d6ab35f7f5f5c2e8c09db94fa6738ee4e4a4ffb78161108c8'),
    ('arquivos/2026/08/291e1ac0-f768-48d3-9f5d-6107f89d888e.pdf', '11260814666956000131550010000577601003283050-danfe.pdf', 'application/pdf', 65160, 'f970512d016ff8f5e0fd2bed10e7288f071be2aeebc0f12fc5e5d63a731035af'),
    ('arquivos/2026/08/1a1ed395-5d00-481e-9206-997eef411b5b.pdf', '11260814666956000131550010000577611001173530-danfe.pdf', 'application/pdf', 65271, '2bd9c020eda11264901c9fa7ffe52cbbf0a8950bbdba471565415e9958867f23'),
    ('arquivos/2026/08/eead90c3-6e28-4199-90f8-a66334e09560.pdf', '11260814666956000131550010000577701002291667-danfe.pdf', 'application/pdf', 65332, '55a3d16907ed13984d73f6ca5b164456edc3a7fb209acc82434146dd9c9d1cef'),
    ('arquivos/2026/08/e5f9afbb-194f-4ab2-b7e0-3a2ffe0b5483.pdf', '11260814666956000131550010000577811001526540-danfe.pdf', 'application/pdf', 65909, 'de051e7415acbd7741090f2d398db0ffdf8cb1cfe5ed86b5f5ffd07a1bc4bf4d'),
    ('arquivos/2026/08/577ce28d-b975-4977-83dc-7cee77e7c53f.pdf', '11260814666956000131550010000577941008257195-danfe-2.pdf', 'application/pdf', 65714, 'c776dfb70a96e1c24dfc715e534bc7d7ad0f0ec91d99052c170b0d449deed3ba'),
    ('arquivos/2026/08/5e2c343e-20d5-4ecc-82dd-4379cd4e746e.pdf', '11260814666956000131550010000577951003151485-danfe.pdf', 'application/pdf', 65478, 'e808226d2fe657a77b96ec5fc877c74d538ee2372f3b67b5cdcab640e72a03f9'),
    ('arquivos/2026/08/4f2b0213-f311-4956-a85c-e96f401d4982.pdf', '11260814666956000131550010000577991005480094-danfe.pdf', 'application/pdf', 65535, 'ca6964705c1619732fde6f93f4e1015dc7d9218a0a23962da797bd21258a4c37'),
    ('arquivos/2026/08/992d6486-9f7a-4af1-9784-e210055227d6.pdf', '11260814666956000131550010000578011002903318-danfe.pdf', 'application/pdf', 65963, '1800e6ccc8c12f9b3665e99dad2c3b459958c7695e5d575277e61a32ab2de623'),
    ('arquivos/2026/08/00686ff5-d45c-427c-b9c2-01caa10d51b5.pdf', '11260814666956000131550010000578031006412992-danfe.pdf', 'application/pdf', 66348, '42d254241eb4e38c56362a7d0acc04b1a27ca3ea97e18bb128fc3b8959d4c089'),
    ('arquivos/2026/08/9eed521e-4455-4d58-b6b0-b502c5710b7d.pdf', '11260814666956000131550010000578041004195479-danfe.pdf', 'application/pdf', 65527, '2d35beaa734785dad128322de985cec9131fd01178df2e88c6a0ec586e99b943'),
    ('arquivos/2026/08/fb5e7c38-a1e0-46d1-a69b-0d2bba88d2df.pdf', '11260814666956000131550010000578071009837047-danfe.pdf', 'application/pdf', 65870, '4e87b40aa6eba8c7981028fafdc247704a25cd5b1e6b7172fb04c2f531a892e6'),
    ('arquivos/2026/08/e155fe44-6cbf-4bc9-a7fd-7027a569da82.pdf', '11260814666956000131550010000578081001515943-danfe.pdf', 'application/pdf', 65865, '830f1c76a8d6f308f8dce96f515ce0a4cad82bd4afcae2f4bfbfb8518af23be2'),
    ('arquivos/2026/08/d952a500-7386-4ce2-a340-48349f4b8447.pdf', '11260814666956000131550010000578111008942354-danfe.pdf', 'application/pdf', 81896, '7220812b14fc18bedc119b49b046439ec027f58a3afc267a6a82128ccba59b6b'),
    ('arquivos/2026/08/60448127-6ff0-488a-a7f2-a2439a9fbe2f.pdf', '11260814666956000131550010000578391003884578-danfe.pdf', 'application/pdf', 82271, '7ad674be2f599bcd6f252b23d9416a935ba347b871a6434c398c363452fbd2c3'),
    ('arquivos/2026/08/6dc38ecd-4e31-455b-8792-d5f875fc595f.pdf', '11260814666956000131550010000578451008739018-danfe.pdf', 'application/pdf', 82131, '325a1c58c3944b4485c13c52ee43d738b285b7426bc339f3ec0aa9d98e866e5d'),
    ('arquivos/2026/08/a2e227e4-d046-47cf-ac87-5575b35d8280.pdf', '11260814666956000131550010000578481008221517-danfe.pdf', 'application/pdf', 82138, '9c5ae0100ba112debeb11091247cf4466a075a786d2b43a85d9b88d228455dae'),
    ('arquivos/2026/08/d6321d4e-6369-42ca-87c9-dc04f955b6c6.pdf', '11260814666956000131550010000578501003023430-danfe.pdf', 'application/pdf', 81797, 'b0de5f58c684f923a2e2ff4745c78260b75bf133810796a79a7939b7ff9b4376'),
    ('arquivos/2026/08/ea3ec35e-3453-4144-b6b5-27028e18d5a0.pdf', '11260814666956000131550010000578551004309864-danfe.pdf', 'application/pdf', 82296, '7685530f8b35a28e7837dc2d8da10f792fedcede4323de33cafd7fe14f62da4c'),
    ('arquivos/2026/08/d3896b6f-d24e-43d3-abd4-9bad0c7734e7.pdf', '11260814666956000131550010000578571004186163-danfe.pdf', 'application/pdf', 65536, '1dbe95501743559f0e9924b3d08afc218693db5ad6fc9730a9af9340f3d7dbf9'),
    ('arquivos/2026/08/5c5e6d57-f04f-4408-b455-bc2d71bc75af.pdf', 'Recibo 0066_2026 ? Amazônia Agroindústria.pdf', 'application/pdf', 135637, 'c876f6b440559179664c9c9f00e9f8498854c9bef024be8c00e7d6e7eec78e89'),
    ('arquivos/2026/08/f48652a3-28f3-4165-af1d-7fabd25f3cca.pdf', '403ac271-f819-4af9-b91e-5d56b3b30601-WhatsApp_Image_2026-07-31_at_11.40.19.pdf', 'application/pdf', 172883, 'e9698f0d790284125b1e7403d7bbd730c556d9bd3bae1519e26314ab2a6e52ce'),
    ('arquivos/2026/08/d8ee2354-e77d-494d-b991-616e9ab20658.pdf', 'Recibo 0067_2026 ? Amazônia Agroindústria.pdf', 'application/pdf', 135941, 'd204917af0a6ae83cf87f93b5a7f6381889e2c1a2d549d2c2f98197c56d9bfa4'),
    ('arquivos/2026/08/a9cda46b-accd-485a-b80e-fb510363eea1.pdf', '54bb6632-7f36-4d9c-8eb4-bedd5a1665be-WhatsApp_Scan_2026-08-01_at_08.32.17.pdf', 'application/pdf', 1043816, '0bf7811feafac92ed867f33f7678fbc50404cf3a5b72762333ecebca69ee16e7'),
    ('arquivos/2026/08/bc1f8537-2176-40c3-990f-b52eeac7880c.pdf', '5389db0b-c259-4c14-a516-a6d238a42180-WhatsApp_Scan_2026-08-01_at_11.58.40.pdf', 'application/pdf', 960513, '6444204905702b28f401f1e391a7b5de3f0912ff6fc3e699c5c00cf7bdc39d8b'),
    ('arquivos/2026/08/8c381a02-6a61-4579-8328-6fabd8d4926d.pdf', 'Recibo 0093_2026 ? Amazônia Agroindústria.pdf', 'application/pdf', 135546, '4ad50b83a42cdd647875e7aeafbf3d9201c4840fc7797ae740859f265e8afd00'),
    ('arquivos/2026/08/cc6b1161-9910-4f98-b0dc-091d79e6ffd7.pdf', 'Recibo 0094_2026 ? Amazônia Agroindústria.pdf', 'application/pdf', 136346, '423a3a37af7031398913d04dec2d9cb4b6039241c1bc7628d74e57b579e504b2'),
    ('arquivos/2026/08/f205d194-cbba-4e9d-acd1-3d9a3cf2e92a.pdf', 'ANDRE MENDES R$ 375,17 GOLLOG.pdf', 'application/pdf', 6088, 'fb350d06fb9195125de5269223677aa0dee15248f42bcc6393488a372a126c78'),
    ('arquivos/2026/08/220e790b-68e6-4569-ba35-7ca294845424.jpg', 'WhatsApp Image 2026-08-14 at 14.42.55.jpg', 'image/jpeg', 248136, 'ef8fec59fe9e004793fe874e86439f3cc4a842ed820a2a2f5de788630aa64de8'),
    ('arquivos/2026/08/b1d8fe8c-dd1f-48a7-9e0d-57197679e8e5.pdf', '12260822761584011780550010000858521126652428-nfe.pdf', 'application/pdf', 515253, '86efdd743535a847ff353b4f6f858e8dd6019578801ebf18fa115e537ff20011'),
    ('arquivos/2026/08/3a0b8a83-678f-4a40-9c04-ddf26f8217e7.pdf', 'PDFBoleto27273342-033.pdf', 'application/pdf', 24313, '9464862d38d382d7dca5772aca7b82ad0320b2ad8d1a6fdab26f6fd378c1809c'),
    ('arquivos/2026/08/9ba6fdbe-52ee-4b5e-b52a-20e0e7d7d28e.pdf', 'Nfe-1786641500617.pdf', 'application/pdf', 123756, '94ee36346f757d23c1e4276a765a15ee06bef90abec54ca9c2afb5ac238aad79'),
    ('arquivos/2026/08/357d98d2-9378-42bc-a26a-c6292f943721.pdf', 'WhatsApp Scan 2026-08-14 at 12.43.03.pdf', 'application/pdf', 1573320, '5d2bf45782939fecab6204251dfaaa1e070c71d3872439d0a38754d361f7210a'),
    ('arquivos/2026/08/19771281-cfd8-4447-8bae-2927e29e62ed.pdf', 'WhatsApp Scan 2026-08-14 at 12.42.42.pdf', 'application/pdf', 1603129, '4dbd105ebc54aabb4f90f2fbbf6f1e51cf785d9ef189c0abbf094aa0514172f8'),
    ('arquivos/2026/08/2fbff6f7-a96d-4b59-a96a-b4bcbc464dc1.pdf', 'NOTA FISCAL 15963 EMT CONSTRUTORA.pdf', 'application/pdf', 342397, 'd9e761df0590604c528a08a6163514b0abc1c7c8fd4e34113e0dc70efd66e6e7'),
    ('arquivos/2026/08/803e9cd4-0bb3-45e0-bfc9-a8af08dbf8e8.pdf', 'BOLETO EMT CONSTRUTORA 14.08.2026.pdf', 'application/pdf', 6329, 'f421dcf5bb328530c583795eeb8ce36bdae3d4f528988adc30e81eb1b736c808'),
    ('arquivos/2026/08/c47c1ac1-a641-451d-a4ca-c39b9e16ab08.pdf', 'BOLETO_NFe001170353.pdf', 'application/pdf', 31195, 'f9d91ed0b6e5ce2b5d18418d712f9a1b56366ba67df9dc4ff9ba5d1864c954ab'),
    ('arquivos/2026/08/7230a185-1028-4e6f-bd47-0d377babd3e3.pdf', 'DANFE_NFe001170353.pdf', 'application/pdf', 159270, 'd959a86fb9d76054f5165c6cbd06448fecb7a4525c10930e48dbc32b2306dbb0'),
    ('arquivos/2026/08/f2d37f5f-f777-4e2b-98b0-9d39abf387fb.pdf', 'DANFE_NFe001170352.pdf', 'application/pdf', 159346, '44f89e78f6be240273d1f2e1a171a57880de2df6ef1ed1ac10a180fe64503507'),
    ('arquivos/2026/08/82cae0ee-5263-4a5c-9378-90259f205316.pdf', 'BOLETO_NFe001170352.pdf', 'application/pdf', 31191, '1df8b81d2e2af5742d7855cd3c30175a4f8e2e5ffa93a300b5873e3666ab9ea0');

  create temp table _lig (oc text, hash text, tamanho bigint, nome text) on commit drop;
  insert into _lig (oc, hash, tamanho, nome) values
    ('2586', '2b6fc3d13f9a01f17fdbd935c371937b3d06cce175485c262f7b6ad36d608537', 763201, '1cad9be6-b313-48a5-a54a-9b89e0b9a4f5-WhatsApp_Scan_2026-08-01_at_08.32.05.pdf'),
    ('2592', '219a054467a0a170d94ec14b1652a7019d9ae5d87a3e115a1ff5c69739869036', 6088, 'BRITAM R$ 100.000.00 10.08.26.pdf'),
    ('2592', '42ea7763c70bf1a28660e1bc14b3c4c4b35120baad42919ca127a8f6bbed848d', 127863, 'Relatorio_Pagamento_Britam_10-08-2026.pdf'),
    ('2592', 'f61c33ed084c59db5fc2ab722e58f02902f8d3645d82b8f50cad7bfda2a5793b', 175123, 'WhatsApp Image 2026-08-13 at 14.21.40.jpg'),
    ('2592', '4ca43cc5bc5a74d2fb8be21d62fd4cc2dbfe4d11e777ba72e58dd07e9f8ccb97', 65061, '11260814666956000131550010000577581000695812-danfe.pdf'),
    ('2592', '7011962a62b2139d6ab35f7f5f5c2e8c09db94fa6738ee4e4a4ffb78161108c8', 65545, '11260814666956000131550010000577591002759254-danfe.pdf'),
    ('2592', 'f970512d016ff8f5e0fd2bed10e7288f071be2aeebc0f12fc5e5d63a731035af', 65160, '11260814666956000131550010000577601003283050-danfe.pdf'),
    ('2592', '2bd9c020eda11264901c9fa7ffe52cbbf0a8950bbdba471565415e9958867f23', 65271, '11260814666956000131550010000577611001173530-danfe.pdf'),
    ('2592', '55a3d16907ed13984d73f6ca5b164456edc3a7fb209acc82434146dd9c9d1cef', 65332, '11260814666956000131550010000577701002291667-danfe.pdf'),
    ('2592', 'de051e7415acbd7741090f2d398db0ffdf8cb1cfe5ed86b5f5ffd07a1bc4bf4d', 65909, '11260814666956000131550010000577811001526540-danfe.pdf'),
    ('2592', 'c776dfb70a96e1c24dfc715e534bc7d7ad0f0ec91d99052c170b0d449deed3ba', 65714, '11260814666956000131550010000577941008257195-danfe-2.pdf'),
    ('2592', 'e808226d2fe657a77b96ec5fc877c74d538ee2372f3b67b5cdcab640e72a03f9', 65478, '11260814666956000131550010000577951003151485-danfe.pdf'),
    ('2592', 'ca6964705c1619732fde6f93f4e1015dc7d9218a0a23962da797bd21258a4c37', 65535, '11260814666956000131550010000577991005480094-danfe.pdf'),
    ('2592', '1800e6ccc8c12f9b3665e99dad2c3b459958c7695e5d575277e61a32ab2de623', 65963, '11260814666956000131550010000578011002903318-danfe.pdf'),
    ('2592', '42d254241eb4e38c56362a7d0acc04b1a27ca3ea97e18bb128fc3b8959d4c089', 66348, '11260814666956000131550010000578031006412992-danfe.pdf'),
    ('2592', '2d35beaa734785dad128322de985cec9131fd01178df2e88c6a0ec586e99b943', 65527, '11260814666956000131550010000578041004195479-danfe.pdf'),
    ('2592', '4e87b40aa6eba8c7981028fafdc247704a25cd5b1e6b7172fb04c2f531a892e6', 65870, '11260814666956000131550010000578071009837047-danfe.pdf'),
    ('2592', '830f1c76a8d6f308f8dce96f515ce0a4cad82bd4afcae2f4bfbfb8518af23be2', 65865, '11260814666956000131550010000578081001515943-danfe.pdf'),
    ('2592', '7220812b14fc18bedc119b49b046439ec027f58a3afc267a6a82128ccba59b6b', 81896, '11260814666956000131550010000578111008942354-danfe.pdf'),
    ('2592', '7ad674be2f599bcd6f252b23d9416a935ba347b871a6434c398c363452fbd2c3', 82271, '11260814666956000131550010000578391003884578-danfe.pdf'),
    ('2592', '325a1c58c3944b4485c13c52ee43d738b285b7426bc339f3ec0aa9d98e866e5d', 82131, '11260814666956000131550010000578451008739018-danfe.pdf'),
    ('2592', '9c5ae0100ba112debeb11091247cf4466a075a786d2b43a85d9b88d228455dae', 82138, '11260814666956000131550010000578481008221517-danfe.pdf'),
    ('2592', 'b0de5f58c684f923a2e2ff4745c78260b75bf133810796a79a7939b7ff9b4376', 81797, '11260814666956000131550010000578501003023430-danfe.pdf'),
    ('2592', '7685530f8b35a28e7837dc2d8da10f792fedcede4323de33cafd7fe14f62da4c', 82296, '11260814666956000131550010000578551004309864-danfe.pdf'),
    ('2592', '1dbe95501743559f0e9924b3d08afc218693db5ad6fc9730a9af9340f3d7dbf9', 65536, '11260814666956000131550010000578571004186163-danfe.pdf'),
    ('2593', 'c876f6b440559179664c9c9f00e9f8498854c9bef024be8c00e7d6e7eec78e89', 135637, 'Recibo 0066_2026 ? Amazônia Agroindústria.pdf'),
    ('2594', 'e9698f0d790284125b1e7403d7bbd730c556d9bd3bae1519e26314ab2a6e52ce', 172883, '403ac271-f819-4af9-b91e-5d56b3b30601-WhatsApp_Image_2026-07-31_at_11.40.19.pdf'),
    ('2595', 'd204917af0a6ae83cf87f93b5a7f6381889e2c1a2d549d2c2f98197c56d9bfa4', 135941, 'Recibo 0067_2026 ? Amazônia Agroindústria.pdf'),
    ('2596', '0bf7811feafac92ed867f33f7678fbc50404cf3a5b72762333ecebca69ee16e7', 1043816, '54bb6632-7f36-4d9c-8eb4-bedd5a1665be-WhatsApp_Scan_2026-08-01_at_08.32.17.pdf'),
    ('2597', '6444204905702b28f401f1e391a7b5de3f0912ff6fc3e699c5c00cf7bdc39d8b', 960513, '5389db0b-c259-4c14-a516-a6d238a42180-WhatsApp_Scan_2026-08-01_at_11.58.40.pdf'),
    ('2598', '4ad50b83a42cdd647875e7aeafbf3d9201c4840fc7797ae740859f265e8afd00', 135546, 'Recibo 0093_2026 ? Amazônia Agroindústria.pdf'),
    ('2599', '423a3a37af7031398913d04dec2d9cb4b6039241c1bc7628d74e57b579e504b2', 136346, 'Recibo 0094_2026 ? Amazônia Agroindústria.pdf'),
    ('2600', 'fb350d06fb9195125de5269223677aa0dee15248f42bcc6393488a372a126c78', 6088, 'ANDRE MENDES R$ 375,17 GOLLOG.pdf'),
    ('2600', 'ef8fec59fe9e004793fe874e86439f3cc4a842ed820a2a2f5de788630aa64de8', 248136, 'WhatsApp Image 2026-08-14 at 14.42.55.jpg'),
    ('2601', '86efdd743535a847ff353b4f6f858e8dd6019578801ebf18fa115e537ff20011', 515253, '12260822761584011780550010000858521126652428-nfe.pdf'),
    ('2601', '9464862d38d382d7dca5772aca7b82ad0320b2ad8d1a6fdab26f6fd378c1809c', 24313, 'PDFBoleto27273342-033.pdf'),
    ('2602', '94ee36346f757d23c1e4276a765a15ee06bef90abec54ca9c2afb5ac238aad79', 123756, 'Nfe-1786641500617.pdf'),
    ('2603', '5d2bf45782939fecab6204251dfaaa1e070c71d3872439d0a38754d361f7210a', 1573320, 'WhatsApp Scan 2026-08-14 at 12.43.03.pdf'),
    ('2603', '4dbd105ebc54aabb4f90f2fbbf6f1e51cf785d9ef189c0abbf094aa0514172f8', 1603129, 'WhatsApp Scan 2026-08-14 at 12.42.42.pdf'),
    ('2604', 'd9e761df0590604c528a08a6163514b0abc1c7c8fd4e34113e0dc70efd66e6e7', 342397, 'NOTA FISCAL 15963 EMT CONSTRUTORA.pdf'),
    ('2604', 'f421dcf5bb328530c583795eeb8ce36bdae3d4f528988adc30e81eb1b736c808', 6329, 'BOLETO EMT CONSTRUTORA 14.08.2026.pdf'),
    ('2605', 'f9d91ed0b6e5ce2b5d18418d712f9a1b56366ba67df9dc4ff9ba5d1864c954ab', 31195, 'BOLETO_NFe001170353.pdf'),
    ('2605', 'd959a86fb9d76054f5165c6cbd06448fecb7a4525c10930e48dbc32b2306dbb0', 159270, 'DANFE_NFe001170353.pdf'),
    ('2606', '44f89e78f6be240273d1f2e1a171a57880de2df6ef1ed1ac10a180fe64503507', 159346, 'DANFE_NFe001170352.pdf'),
    ('2606', '1df8b81d2e2af5742d7855cd3c30175a4f8e2e5ffa93a300b5873e3666ab9ea0', 31191, 'BOLETO_NFe001170352.pdf');

  select count(*) into v_n from _bin;
  if v_n <> 45 then raise exception 'esperava 45 binarios, montou %', v_n; end if;
  select count(*) into v_n from _lig;
  if v_n <> 45 then raise exception 'esperava 45 anexos, montou %', v_n; end if;

  -- Toda ordem citada tem que existir, e uma so.
  select string_agg(distinct oc, ', ') into v_falta
    from _lig l
   where (select count(*) from public.ordens_compra o
           where o.observacoes like 'Ordem de compra Mais Controle ' || l.oc || '%') <> 1;
  if v_falta is not null then
    raise exception 'ordem de compra ausente ou repetida para: %', v_falta;
  end if;

  -- Todo vinculo tem que ter binario correspondente.
  select string_agg(distinct nome, ', ') into v_falta
    from _lig l where not exists (select 1 from _bin b where b.hash = l.hash and b.tamanho = l.tamanho);
  if v_falta is not null then raise exception 'anexo sem binario: %', v_falta; end if;

  insert into public.arquivos (path_storage, nome_original, tipo_mime, tamanho_bytes, hash_sha256)
  select b.path, b.nome, b.mime, b.tamanho, b.hash from _bin b
  on conflict (hash_sha256, tamanho_bytes) where hash_sha256 is not null do nothing;

  insert into public.anexo_vinculos (arquivo_id, entidade_tipo, entidade_id, origem, nome_exibicao)
  select a.id, 'ordem_compra',
         (select o.id from public.ordens_compra o
           where o.observacoes like 'Ordem de compra Mais Controle ' || l.oc || '%'),
         'upload_direto', l.nome
    from _lig l
    join public.arquivos a on a.hash_sha256 = l.hash and a.tamanho_bytes = l.tamanho
  on conflict (arquivo_id, entidade_tipo, entidade_id) do nothing;

  -- A prova: cada ordem tem que ficar com o numero de anexos que o Mais Controle
  -- mostra. Conta anexo, nao binario: a 2592 tem 24.
  select string_agg(x.oc || ' (erp ' || x.tem || ' vs mc ' || x.esperado || ')', '; ')
    into v_falta
  from (
    select l.oc,
           count(*) as esperado,
           (select count(*) from public.anexo_vinculos v
             join public.ordens_compra o on o.id = v.entidade_id
            where v.entidade_tipo = 'ordem_compra'
              and o.observacoes like 'Ordem de compra Mais Controle ' || l.oc || '%') as tem
      from _lig l group by l.oc
  ) x
  where x.tem <> x.esperado;

  if v_falta is not null then
    raise exception 'quantidade de anexos divergente em: %', v_falta;
  end if;

  raise notice 'anexos ok: 45 vinculos em 16 ordens, 45 binarios';
end $$;
