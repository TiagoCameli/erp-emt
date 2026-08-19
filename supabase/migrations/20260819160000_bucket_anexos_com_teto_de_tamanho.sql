-- Bucket de anexos ganha teto de tamanho: 25 MB por arquivo.
--
-- Vem junto do upload direto (o binário passa a ir do navegador para o Storage
-- por URL assinada, sem atravessar a server action). Enquanto o arquivo subia
-- pela action, quem recusava era o Next e depois a Vercel; agora que os bytes
-- não passam mais por lá, o bucket é o ÚNICO ponto do caminho que pode dizer
-- não — e ele estava com `file_size_limit` nulo, ou seja, sem limite nenhum
-- além do global do projeto.
--
-- 25 MB é o número que a tela anuncia (`ANEXO_TAMANHO_MAXIMO_MB` em
-- src/lib/anexos-limite.ts). Os dois têm que andar juntos: limite anunciado na
-- tela que ninguém aplica do lado do servidor é promessa, não limite — foi
-- exatamente o defeito que trouxe esta obra (a tela dizia 25 MB e o corte real
-- era 1 MB, do parser de server action).
--
-- Não mexe em `allowed_mime_types`: a lista de extensões e MIMEs barrados vive
-- em `validarArquivo` (src/lib/arquivos.ts), que roda no preparo E na
-- confirmação do envio, e ela recusa por extensão também — coisa que o filtro
-- de MIME do bucket não faz.

update storage.buckets
set file_size_limit = 25 * 1024 * 1024
where id = 'anexos';
