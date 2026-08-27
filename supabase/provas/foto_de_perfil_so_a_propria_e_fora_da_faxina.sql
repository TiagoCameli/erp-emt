-- Prova de aceite da foto de perfil. Duas coisas, e as duas são silenciosas
-- quando dão errado:
--
--   1. a linha de um usuário só pode apontar para a foto DELE. Se pudesse
--      apontar para outra, a tela mostraria o rosto errado, sem erro nenhum.
--   2. a faxina de binários órfãos NÃO alcança o bucket `avatares`. Se
--      alcançasse, toda foto sumiria 24 horas depois de subir e a tela voltaria
--      às iniciais sem ninguém saber por quê.
--
-- Tudo dentro de DO que termina em `raise`: nada é gravado.

-- =====================================================================
-- Parte 1: só a própria linha, e o CHECK é quem garante
-- =====================================================================

do $prova$
declare
  v_andreia uuid := '7d0194c2-fd7e-41d1-b6c4-f05c0a652229';
  v_dora    uuid := '3767e529-eae7-4178-852c-2dd2782efaaf';
  a_path text;
  b_dora text := '(nao lido)';
  c_erro text := 'PASSOU (NAO DEVIA)';
  d_erro text := 'PASSOU (NAO DEVIA)';
  e_removido text;
  e_depois text := '(nao lido)';
  g_bucket record;
begin
  -- A: Andreia grava a PRÓPRIA foto pela RPC, como authenticated. A função não
  -- recebe caminho: ele é derivado de auth.uid() lá dentro.
  perform set_config('request.jwt.claims', json_build_object('sub', v_andreia, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  a_path := public.fn_salvar_minha_foto();
  select coalesce(foto_path,'(null)') into b_dora from public.usuarios where id = v_dora;

  -- E: remover devolve o caminho que estava lá (é com ele que a action apaga o
  -- binário) e a coluna volta a null.
  e_removido := public.fn_remover_minha_foto();
  select coalesce(foto_path,'(null)') into e_depois from public.usuarios where id = v_andreia;
  reset role;

  -- C CONTROLE: apontar a linha da Andreia para a foto da DORA.
  -- Roda como OWNER de propósito: sem RLS no caminho, quem TEM que recusar é o
  -- CHECK. É a diferença entre `check (foto_path ~ '^avatares/')`, que aceitaria
  -- isto, e `check (foto_path = 'avatares/' || id || '.jpg')`, que não aceita.
  begin
    update public.usuarios set foto_path = 'avatares/' || v_dora::text || '.jpg' where id = v_andreia;
  exception when others then c_erro := sqlerrm;
  end;

  -- D CONTROLE: caminho fora do padrão (outro bucket, outra extensão).
  begin
    update public.usuarios set foto_path = 'anexos/qualquer.png' where id = v_andreia;
  exception when others then d_erro := sqlerrm;
  end;

  select public, file_size_limit, allowed_mime_types::text as mimes
    into g_bucket from storage.buckets where id = 'avatares';

  raise exception E'PROVA DA FOTO (desfeita, nada gravado)\n  A) Andreia salvou: %\n  B) CONTROLE foto da Dora depois: %\n  C) CONTROLE apontar para a foto da Dora -> %\n  D) CONTROLE caminho fora do padrao -> %\n  E) remover devolveu % e a coluna ficou %\n  G) bucket: public=% limite=% mimes=%',
    a_path, b_dora, c_erro, d_erro, e_removido, e_depois,
    g_bucket.public, g_bucket.file_size_limit, g_bucket.mimes;
end $prova$;

-- Resultado em 27/08/2026:
--
--   A) Andreia salvou: avatares/7d0194c2-fd7e-41d1-b6c4-f05c0a652229.jpg
--   B) CONTROLE foto da Dora depois: <NULL>
--   C) CONTROLE apontar para a foto da Dora ->
--        new row for relation "usuarios" violates check constraint
--        "usuarios_foto_path_check"
--   D) CONTROLE caminho fora do padrao -> mesma violação
--   E) remover devolveu avatares/7d0194c2-....jpg e a coluna ficou (null)
--   G) bucket: public=f limite=2097152 mimes={image/jpeg}
--
-- O caminho gravado é o id da PRÓPRIA Andreia, e os dois controles foram
-- recusados pelo CHECK — não pela RLS, que nem estava no caminho (owner).

-- =====================================================================
-- Parte 2: a faxina de binários órfãos não vê o bucket `avatares`
-- =====================================================================
--
-- `fn_binarios_sem_registro` devolve objeto do bucket `anexos` sem linha em
-- `public.arquivos`, e o cron da Vercel apaga o que ela lista. Uma foto NUNCA
-- tem linha em `arquivos`, então se a função enxergasse o bucket novo, toda foto
-- sumiria depois da carência.
--
-- Contar zero num bucket VAZIO não prova nada: seria zero de qualquer forma. Por
-- isso esta prova PLANTA um objeto em cada bucket, com data antiga, e compara. O
-- `1` do anexos é a linha de controle: sem ele, um `0` no avatares poderia
-- significar "a função está quebrada e não devolve nada".

do $prova$
declare
  v_ve_avatares int;
  v_ve_anexos int;
begin
  insert into storage.objects (bucket_id, name, owner, created_at, updated_at, metadata)
  values ('avatares', 'avatares/00000000-0000-0000-0000-000000000000.jpg', null,
          now() - interval '30 days', now() - interval '30 days', '{}'::jsonb),
         ('anexos', 'arquivos/2026/01/00000000-0000-0000-0000-000000000000.pdf', null,
          now() - interval '30 days', now() - interval '30 days', '{}'::jsonb);

  select count(*) into v_ve_avatares
  from public.fn_binarios_sem_registro(24) x where x.path_storage like 'avatares/%';

  select count(*) into v_ve_anexos
  from public.fn_binarios_sem_registro(24) x
  where x.path_storage = 'arquivos/2026/01/00000000-0000-0000-0000-000000000000.pdf';

  raise exception E'PROVA DO ESCOPO DA FAXINA (desfeita)\n  objeto plantado em avatares: a faxina ve % (tem que ser 0)\n  objeto plantado em anexos:   a faxina ve % (tem que ser 1, senao a prova nao prova nada)',
    v_ve_avatares, v_ve_anexos;
end $prova$;

-- Resultado em 27/08/2026:
--   objeto plantado em avatares: a faxina ve 0 (tem que ser 0)
--   objeto plantado em anexos:   a faxina ve 1 (tem que ser 1, senao a prova nao prova nada)
--
-- O 0 é escopo de verdade (`bucket_id = 'anexos'` dentro da função), não bucket
-- vazio. E como este bucket fica FORA da faxina, o binário da foto antiga tem
-- que ser apagado na mão quando a pessoa remove a foto — é para isso que
-- `fn_remover_minha_foto` devolve o caminho.

-- =====================================================================
-- Parte 3 (HTTP): o encanamento do Storage
-- =====================================================================
--
-- Três promessas que o código faz e que SQL nenhum verifica: o upsert (sem ele,
-- a SEGUNDA troca de foto falha), o filtro de MIME do bucket e a leitura por URL
-- assinada. Rodado contra o projeto vivo, com a chave de serviço (a mesma que o
-- servidor usa), num caminho de uuid ZERO que não pertence a ninguém, e limpo no
-- fim.
--
--   1. assinar com `x-upsert: true` e subir o JPEG        -> PUT 200
--   2. assinar DE NOVO no mesmo caminho e subir           -> PUT 200
--      (o token vem com "upsert":true no payload)
--   3. CONTROLE: assinar SEM `x-upsert`, objeto existindo  -> 409 Duplicate
--      {"error":"Duplicate","message":"The resource already exists"}
--   4. CONTROLE: subir PNG                                 -> 415 InvalidMimeType
--      {"message":"mime type image/png is not supported"}
--   5. GET pela URL assinada de leitura                    -> 200
--   6. DELETE do objeto de teste                           -> 200
--
-- O CONTROLE 3 é o mais importante desta parte: ele mostra que o passo 2 só
-- funciona POR CAUSA do upsert, e não por sorte. Sem a opção, trocar a foto pela
-- segunda vez quebraria — e quebraria só na segunda vez, o tipo de defeito que
-- passa por todo teste feito com um upload só.
--
-- Nota de implementação descoberta aqui: o `{ upsert: true }` do supabase-js
-- viaja como HEADER `x-upsert`, não no corpo (storage-js, createSignedUploadUrl).
-- A primeira versão desta prova mandou no corpo, recebeu "upsert":false no token
-- e o 409 do controle — e por um momento pareceu defeito do código, quando era
-- defeito da prova.
