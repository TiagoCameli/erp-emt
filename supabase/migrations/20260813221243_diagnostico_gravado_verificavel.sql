-- Aplicada em produção pelo MCP (apply_migration). NÃO rode `supabase db push` neste projeto.
--
-- A checagem permanente das consultas de diagnóstico gravadas em `obj_description`.
--
-- POR QUE ELA EXISTE (medido na Task 4 desta frente, não é hipótese): a consulta de
-- diagnóstico gravada no `obj_description` da `fn_aprovar_folha` lia
-- `rh_adiantamentos.folha_id`, coluna que a migration `20260812215337` dropou. A
-- ferramenta que o dono do sistema usaria para separar "bug" de "configuração
-- faltando" ficou QUEBRADA EM SILÊNCIO por várias tarefas, falhando com
-- `42703 column "folha_id" does not exist`, e nada acusou: consulta gravada em
-- comentário não é compilada, não é testada e não aparece em nenhum portão. A prova
-- de "extrair e executar" só vale no instante em que roda.
--
-- Três peças, nenhuma delas tocando corpo de função:
--   1. uma MARCA fixa (a linha literal com dois traços e `DIAGNOSTICO EXECUTAVEL v1`)
--      dentro do texto de todo comentário que carregue consulta executável;
--   2. `public.fn_verificar_diagnosticos_gravados()`, que varre `pg_proc` /
--      `obj_description` procurando a marca, extrai cada consulta e roda `explain`
--      em cada uma. `explain` não precisa de dado nenhum: ele já falha com
--      `42703 column does not exist`, que é exatamente o modo de falha real;
--   3. a consulta da INVARIANTE DO PLANO acrescentada ao comentário da
--      `fn_gerar_folha`, que até aqui só tinha a invariante em prosa. Passa a ser
--      executável, marcada e verificada como a da `fn_aprovar_folha`.
--
-- A partir daqui, toda migration que faça `drop column`, `rename column` ou
-- `drop table` chama esta função no fim e falha se ela devolver linha, e o script
-- `supabase/provas/diagnosticos_gravados_executaveis.sql` roda a mesma varredura no
-- portão de qualquer task que toque schema.
--
-- O CORPO DAS DUAS FUNÇÕES DE DINHEIRO NÃO MUDA. O bloco de trava abaixo recusa a
-- migration se `md5(prosrc)` de qualquer uma tiver mudado, e o bloco final confere
-- de novo depois de mexer nos comentários.

-- ############################################################################
-- 1. Trava de entrada: os dois corpos, byte a byte
-- ############################################################################
do $trava$
declare
  v_aprovar text;
  v_gerar text;
begin
  select md5(p.prosrc) into v_aprovar
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_folha';

  select md5(p.prosrc) into v_gerar
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  if v_aprovar is distinct from 'a1261a1ccbff886980f0991da47a2446' then
    raise exception 'fn_aprovar_folha mudou de corpo (md5 %). Esta migration so mexe em comentario: pare e confira.', coalesce(v_aprovar, 'ausente');
  end if;
  if v_gerar is distinct from '29c33b2d43a50af321f0ee2f7b7e5728' then
    raise exception 'fn_gerar_folha mudou de corpo (md5 %). Esta migration so mexe em comentario: pare e confira.', coalesce(v_gerar, 'ausente');
  end if;
end $trava$;

-- ############################################################################
-- 2. A marca no comentário da fn_aprovar_folha (que já tem consulta)
--
-- Inserção cirúrgica por âncora, em vez de reescrever os 9.291 caracteres do
-- comentário na mão: retipar o texto inteiro é a forma mais fácil de mudar sem
-- querer a consulta que esta migration existe para proteger. A âncora é conferida
-- (tem que aparecer exatamente 1 vez) e o bloco é idempotente.
-- ############################################################################
do $marca$
declare
  v_marca constant text := '-- DIAGNOSTICO EXECUTAVEL v1';
  v_ancora constant text := '  with f as (';
  v_com text;
  v_novo text;
  v_ocorrencias integer;
begin
  select obj_description(p.oid, 'pg_proc') into v_com
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_folha';

  if v_com is null then
    raise exception 'fn_aprovar_folha sem comentario: nada a marcar, e isso e um achado';
  end if;

  if strpos(v_com, v_marca) > 0 then
    raise notice 'fn_aprovar_folha ja tem a marca; nada a fazer';
    return;
  end if;

  v_ocorrencias := (length(v_com) - length(replace(v_com, v_ancora, ''))) / length(v_ancora);
  if v_ocorrencias <> 1 then
    raise exception 'ancora da consulta aparece % vezes no comentario da fn_aprovar_folha (esperado 1)', v_ocorrencias;
  end if;

  v_novo := replace(
    v_com,
    v_ancora,
    '  -- a linha abaixo e lida por public.fn_verificar_diagnosticos_gravados(): nao remova' || E'\n'
    || '  ' || v_marca || E'\n'
    || v_ancora
  );

  execute format('comment on function public.fn_aprovar_folha(uuid) is %L', v_novo);
end $marca$;

-- ############################################################################
-- 3. A invariante do plano vira consulta executável no comentário da fn_gerar_folha
--
-- O ponto 1 do comentário já dizia a forma correta em prosa (descontado + previsto
-- das ABERTAS) e avisava que somar `valor_previsto` de todas superconta. Em prosa
-- ninguém roda: aqui ela vira consulta, com a forma errada ao lado, na última
-- coluna, para quem confere ver a diferença em vez de ler sobre ela.
-- ############################################################################
do $marca$
declare
  v_marca constant text := '-- DIAGNOSTICO EXECUTAVEL v1';
  v_com text;
  v_novo text;
begin
  select obj_description(p.oid, 'pg_proc') into v_com
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  if v_com is null then
    raise exception 'fn_gerar_folha sem comentario: pare e confira';
  end if;

  if strpos(v_com, v_marca) > 0 then
    raise notice 'fn_gerar_folha ja tem a marca; nada a fazer';
    return;
  end if;

  v_novo := v_com || E'\n\n' || $txt$DIAGNOSTICO EXECUTAVEL DA INVARIANTE DO PLANO (o ponto 1 acima), copy-paste-and-run no MCP execute_sql ou no editor SQL do Supabase. Zero linha na resposta = a invariante vale para TODOS os adiantamentos. Cada linha devolvida e um adiantamento cujo plano nao fecha com o valor concedido, e a coluna "diferenca" diz de quanto.

A ultima coluna, "previsto_de_todas_nao_use", e a forma ERRADA da invariante, trazida de proposito para comparacao: somar valor_previsto de TODAS as parcelas superconta sempre que uma folha descontou parcela pela metade, porque a parcela fechada guarda o previsto inteiro e a sobra nasce com a diferenca. Medido: 1.150,00 contra 1.000,00 concedidos com uma parcela descontada pela metade, e 6.400,00 contra 5.200,00 numa cadeia de tres meses. Ela nao e a invariante, e nao serve para decidir se ha dinheiro a mais no plano.

LEMBRETE de leitura, do ponto 1: a invariante vale em todo estado ESTAVEL. Entre regerar um mes do meio da cadeia e regerar o mes seguinte ela fica quebrada de proposito, porque apagar a sobra daquele mes deixa orfa a sobra que a folha seguinte derivou dela. Se esta consulta devolver linha logo depois de alguem regerar mes anterior, regere o mes seguinte antes de concluir que e bug.

A linha abaixo e lida por public.fn_verificar_diagnosticos_gravados(): nao remova, e mantenha a consulta terminada em ponto e virgula.

  $txt$ || v_marca || E'\n' || $txt$  select a.id as adiantamento_id, a.colaborador_id, a.competencia, a.valor as concedido,
         coalesce(sum(pa.valor_descontado), 0)                                          as descontado,
         coalesce(sum(case when pa.folha_id is null then pa.valor_previsto else 0 end), 0) as previsto_aberto,
         coalesce(sum(pa.valor_descontado), 0)
           + coalesce(sum(case when pa.folha_id is null then pa.valor_previsto else 0 end), 0)
           - a.valor                                                                    as diferenca,
         coalesce(sum(pa.valor_previsto), 0)                                            as previsto_de_todas_nao_use
    from public.rh_adiantamentos a
    left join public.rh_adiantamento_parcelas pa on pa.adiantamento_id = a.id
   group by a.id, a.colaborador_id, a.competencia, a.valor
  having coalesce(sum(pa.valor_descontado), 0)
           + coalesce(sum(case when pa.folha_id is null then pa.valor_previsto else 0 end), 0)
         <> a.valor;$txt$;

  execute format('comment on function public.fn_gerar_folha(date, numeric) is %L', v_novo);
end $marca$;

-- ############################################################################
-- 4. A varredura
-- ############################################################################
create or replace function public.fn_verificar_diagnosticos_gravados()
returns table (objeto text, ordem integer, erro text, consulta text)
language plpgsql
set search_path = public, pg_catalog
as $fn$
declare
  v_marca constant text := '-- DIAGNOSTICO EXECUTAVEL v1';
  r record;
  v_resto text;
  v_sql text;
  v_pos integer;
  v_fim integer;
  v_i integer;
  v_achadas integer := 0;
begin
  for r in
    select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as nome,
           obj_description(p.oid, 'pg_proc') as com
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('pg_catalog', 'information_schema')
      and strpos(coalesce(obj_description(p.oid, 'pg_proc'), ''), v_marca) > 0
    order by 1
  loop
    v_resto := r.com;
    v_i := 0;
    loop
      v_pos := strpos(v_resto, v_marca);
      exit when v_pos = 0;
      v_i := v_i + 1;
      v_achadas := v_achadas + 1;
      v_resto := substr(v_resto, v_pos + length(v_marca));
      v_fim := strpos(v_resto, ';');

      if v_fim = 0 then
        objeto := r.nome;
        ordem := v_i;
        erro := 'consulta sem ponto e virgula terminador depois da marca';
        consulta := left(btrim(v_resto), 300);
        return next;
        exit;
      end if;

      v_sql := btrim(left(v_resto, v_fim - 1));
      v_resto := substr(v_resto, v_fim + 1);

      if v_sql = '' then
        objeto := r.nome;
        ordem := v_i;
        erro := 'marca sem consulta nenhuma depois dela';
        consulta := '';
        return next;
        continue;
      end if;

      begin
        execute 'explain ' || v_sql;
      exception when others then
        objeto := r.nome;
        ordem := v_i;
        erro := sqlstate || ' ' || sqlerrm;
        consulta := left(v_sql, 300);
        return next;
      end;
    end loop;
  end loop;

  -- Varredura que passa por NAO ACHAR NADA e a mesma cegueira que esta funcao
  -- existe para fechar. Zero marca no banco e achado, nao sucesso.
  if v_achadas = 0 then
    objeto := '(varredura)';
    ordem := 0;
    erro := 'nenhuma consulta marcada encontrada em pg_proc: a marca foi removida, ou algum comentario foi reescrito sem ela';
    consulta := v_marca;
    return next;
  end if;

  -- Marca em objeto que esta varredura nao cobre (tabela, coluna, view, tipo):
  -- reporta em vez de ignorar em silencio.
  for r in
    select d.classoid::regclass::text || ' oid ' || d.objoid::text as nome
    from pg_description d
    where d.classoid <> 'pg_proc'::regclass
      and strpos(coalesce(d.description, ''), v_marca) > 0
    order by 1
  loop
    objeto := 'marca fora de pg_proc: ' || r.nome;
    ordem := 0;
    erro := 'consulta marcada em objeto que a varredura de pg_proc nao cobre: estenda a funcao antes de confiar nela';
    consulta := '';
    return next;
  end loop;

  return;
end
$fn$;

-- Função de manutenção, não de aplicação: ninguém do app chama, e `authenticated`
-- não recebe nada. A execução default de função é para PUBLIC, então o revoke é
-- obrigatório, não decorativo.
revoke all on function public.fn_verificar_diagnosticos_gravados() from public;
revoke all on function public.fn_verificar_diagnosticos_gravados() from anon;
revoke all on function public.fn_verificar_diagnosticos_gravados() from authenticated;

comment on function public.fn_verificar_diagnosticos_gravados() is
'Varre os comentarios (obj_description) das funcoes procurando a marca de consulta executavel (a linha que comeca com dois tracos e diz DIAGNOSTICO EXECUTAVEL, versao v1), extrai cada consulta e roda EXPLAIN nela. Devolve UMA LINHA POR CONSULTA QUE FALHOU: zero linha = todas as consultas gravadas ainda resolvem contra o schema atual.

POR QUE EXPLAIN: nao precisa de dado nenhum (producao tem zero folha e zero adiantamento) e ja pega o modo de falha real, que e 42703 column does not exist depois de um drop column ou rename column em qualquer lugar do schema. Foi o que aconteceu com a consulta da fn_aprovar_folha entre 12/08 e 13/08/2026, sem nada acusar.

CONTRATO DA MARCA:
  - a marca e uma linha inteira, e a consulta comeca DEPOIS dela;
  - a consulta termina no primeiro ponto e virgula, e por isso nao pode ter ponto e virgula dentro de literal;
  - a consulta tem que qualificar o schema (public.algo), porque a varredura roda com search_path fixo;
  - mais de uma consulta marcada por comentario e suportada, na ordem em que aparecem.

TRES ESTADOS QUE ELA TAMBEM DENUNCIA, em vez de deixar passar calados:
  - marca sem consulta, ou consulta sem ponto e virgula terminador;
  - ZERO marca no banco inteiro (objeto "(varredura)"), que e o caso de alguem ter reescrito um comentario sem a marca: varredura que passa por nao achar nada e a cegueira que esta funcao existe para fechar;
  - marca em comentario de tabela, coluna ou view, que esta varredura nao le: ela reporta e pede para estender, em vez de ignorar.

ONDE ENTRA: toda migration que faca drop column, rename column ou drop table chama esta funcao no fim e falha se ela devolver linha; e supabase/provas/diagnosticos_gravados_executaveis.sql roda a mesma varredura, com controle negativo, no portao de qualquer task que toque schema. Nao tem grant para authenticated nem anon: e funcao de manutencao, rodada por quem aplica migration.';

-- ############################################################################
-- 5. Trava de saída: os corpos continuam iguais E a varredura passa
-- ############################################################################
do $conf$
declare
  v_aprovar text;
  v_gerar text;
  v_falhas integer;
  v_detalhe text;
  v_marcadas integer;
begin
  select md5(p.prosrc) into v_aprovar
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_folha';
  select md5(p.prosrc) into v_gerar
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  if v_aprovar <> 'a1261a1ccbff886980f0991da47a2446' or v_gerar <> '29c33b2d43a50af321f0ee2f7b7e5728' then
    raise exception 'corpo de funcao mudou nesta migration (aprovar %, gerar %)', v_aprovar, v_gerar;
  end if;

  select count(*) into v_marcadas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and strpos(coalesce(obj_description(p.oid, 'pg_proc'), ''), '-- DIAGNOSTICO EXECUTAVEL v1') > 0;
  if v_marcadas < 2 then
    raise exception 'esperava 2 comentarios marcados (fn_aprovar_folha e fn_gerar_folha), achei %', v_marcadas;
  end if;

  select count(*), string_agg(objeto || ' #' || ordem || ': ' || erro, ' | ')
    into v_falhas, v_detalhe
  from public.fn_verificar_diagnosticos_gravados();

  if v_falhas > 0 then
    raise exception 'consulta gravada quebrada: %', v_detalhe;
  end if;

  raise notice 'diagnosticos gravados: % comentarios marcados, 0 falha', v_marcadas;
end $conf$;
