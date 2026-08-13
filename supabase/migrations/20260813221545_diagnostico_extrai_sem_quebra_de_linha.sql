-- Aplicada em produção pelo MCP (apply_migration). NÃO rode `supabase db push` neste projeto.
--
-- Correção de 2 chamadas em `fn_verificar_diagnosticos_gravados`, medida ao rodar o
-- controle negativo da prova `supabase/provas/diagnosticos_gravados_executaveis.sql`:
-- `btrim(x)` sem o segundo argumento remove **só espaço**, não quebra de linha. Como
-- a consulta gravada começa na linha seguinte à marca, a consulta extraída saía com
-- `\n` na frente. Duas consequências, as duas contra quem lê o resultado:
--
--   1. a coluna `consulta` do achado (que é o que o operador lê para saber QUAL
--      consulta quebrou) vinha com quebra de linha grudada no começo;
--   2. o ramo "marca sem consulta nenhuma depois dela", que o `comment on function`
--      promete, ficava inalcançável: um espaço em branco depois da marca não é `''`,
--      então em vez daquela mensagem vinha um erro de sintaxe.
--
-- Nenhuma mudança de comportamento na detecção: os três defeitos plantados no
-- controle negativo eram pegos antes e continuam sendo (`42703 column does not
-- exist`, `42P01 relation does not exist`, e consulta sem terminador).
--
-- Recriação cirúrgica a partir da definição viva, com `md5(prosrc)` fixado nos dois
-- lados (antes e depois), em vez de retipar as 90 linhas da função: 2 chamadas
-- mudam, e o md5 prova que só elas mudaram.

do $fix$
declare
  v_def text;
  v_novo text;
  v_antes text;
  v_depois text;
begin
  select pg_get_functiondef(p.oid), md5(p.prosrc) into v_def, v_antes
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_verificar_diagnosticos_gravados';

  if v_antes is distinct from '746dcc15a493d96c0cf4b43b7520fbbe' then
    raise exception 'fn_verificar_diagnosticos_gravados nao esta na versao esperada (md5 %)', coalesce(v_antes, 'ausente');
  end if;

  v_novo := replace(v_def, 'consulta := left(btrim(v_resto), 300);', 'consulta := left(btrim(v_resto, E'' \t\r\n''), 300);');
  v_novo := replace(v_novo, 'v_sql := btrim(left(v_resto, v_fim - 1));', 'v_sql := btrim(left(v_resto, v_fim - 1), E'' \t\r\n'');');
  if v_novo = v_def then
    raise exception 'nenhum dos dois replaces encontrou ancora: pare e confira';
  end if;

  execute v_novo;

  select md5(p.prosrc) into v_depois
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_verificar_diagnosticos_gravados';

  if v_depois is distinct from 'd5b7c5a463e258707b088e2a31573daa' then
    raise exception 'md5 resultante % diferente do medido em transacao revertida antes de aplicar', v_depois;
  end if;
end $fix$;

-- A varredura continua passando depois da recriação, e continua achando as duas
-- consultas marcadas.
do $conf$
declare
  v_falhas integer;
  v_detalhe text;
  v_marcadas integer;
begin
  select count(*) into v_marcadas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and strpos(coalesce(obj_description(p.oid, 'pg_proc'), ''), '-- DIAGNOSTICO EXECUTAVEL v1') > 0;
  if v_marcadas < 2 then
    raise exception 'esperava 2 comentarios marcados, achei %', v_marcadas;
  end if;

  select count(*), string_agg(objeto || ' #' || ordem || ': ' || erro, ' | ')
    into v_falhas, v_detalhe
  from public.fn_verificar_diagnosticos_gravados();
  if v_falhas > 0 then
    raise exception 'consulta gravada quebrada: %', v_detalhe;
  end if;
end $conf$;
