-- A rescisão não pode depender de `folha_parametros` ter linha.
--
-- Encontrado EXECUTANDO a RPC, minutos depois de a migration anterior voltar
-- `success`: `folha_parametros` estava VAZIA — zero linhas, nunca salva desde
-- que a tela existe (julho/2026). O `select ... into` não atribuiu nada, as
-- quatro variáveis ficaram null, e `v_dias_aviso || ' dias'` com null virou
-- null. Toda verba saiu com valor nulo e o insert estourou no not-null.
--
-- O sintoma foi barulhento por sorte. Se `valor` fosse nullable, a rescisão
-- teria sido gravada inteira com valores em branco, somando R$ 0,00 e com cara
-- de documento pronto — e ninguém confere um documento que parece pronto.
--
-- É a lição de 28/08/2026 se repetindo: plpgsql só valida as queries do corpo
-- na primeira EXECUÇÃO. Migration com `success` e advisor limpo não dizem que
-- a função roda.
--
-- Duas correções, e as duas são necessárias:
--   1. A linha padrão passa a existir. Só as quatro colunas da rescisão são
--      preenchidas (pelos DEFAULTs); as da folha continuam nulas, exatamente
--      como a ausência da linha as deixava — `fn_aprovar_folha` lê os mesmos
--      nulls de hoje, e nada muda para ela.
--   2. A função deixa de depender disso. `coalesce` DENTRO do select cobre
--      "linha existe com coluna nula"; a atribuição DEPOIS cobre "não existe
--      linha nenhuma", que é um caso que o coalesce de dentro não alcança
--      porque aí o select simplesmente não atribui.

insert into public.folha_parametros (id) values (1) on conflict (id) do nothing;

do $patch$
declare
  v_oid oid;
  v_def text;
  a_par text := '  select aviso_previo_dias_base, aviso_previo_dias_por_ano, aviso_previo_dias_teto, multa_fgts_percentual
    into v_dias_base, v_dias_ano, v_dias_teto, v_multa_pct
  from public.folha_parametros where id = 1;';
  n_par text := '  select coalesce(aviso_previo_dias_base, 30), coalesce(aviso_previo_dias_por_ano, 3),
         coalesce(aviso_previo_dias_teto, 90), coalesce(multa_fgts_percentual, 40)
    into v_dias_base, v_dias_ano, v_dias_teto, v_multa_pct
  from public.folha_parametros where id = 1;

  -- Sem NENHUMA linha em folha_parametros o select acima nao atribui nada e as
  -- quatro ficam null: o coalesce de dentro do select nao alcanca esse caso.
  -- Medido em 29/08/2026 -- a tabela estava vazia e toda verba saiu nula.
  v_dias_base := coalesce(v_dias_base, 30);
  v_dias_ano  := coalesce(v_dias_ano, 3);
  v_dias_teto := coalesce(v_dias_teto, 90);
  v_multa_pct := coalesce(v_multa_pct, 40);';
begin
  select p.oid into strict v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_rescisao';

  v_def := pg_get_functiondef(v_oid);
  if position(a_par in v_def) = 0 then
    raise exception 'Ancora da leitura dos parametros nao encontrada em fn_gerar_rescisao';
  end if;

  execute replace(v_def, a_par, n_par);

  if position('v_multa_pct := coalesce(v_multa_pct, 40);' in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'A blindagem dos parametros nao entrou em fn_gerar_rescisao';
  end if;
end $patch$;
