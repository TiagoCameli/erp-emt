-- Prova da checagem permanente das consultas de diagnóstico gravadas em
-- `obj_description`. Roda contra o banco vivo; só o bloco B escreve, e ele
-- termina em `rollback`.
--
-- ESTE SCRIPT ENTRA NO PORTÃO DE QUALQUER TASK QUE TOQUE SCHEMA, junto com o
-- `tsc`, o lint, os testes e o build. Motivo, medido na Task 4 do adiantamento
-- parcelado: a consulta gravada no comentário da `fn_aprovar_folha` lia
-- `rh_adiantamentos.folha_id`, a migration `20260812215337` dropou a coluna, e a
-- consulta ficou QUEBRADA EM SILÊNCIO por várias tarefas. Nada acusou, porque
-- consulta gravada em comentário não é compilada nem testada por nada.
--
--   Bloco A  o estado real: quais comentários carregam consulta marcada, e a
--            varredura passando (zero linha)
--   Bloco B  CONTROLE NEGATIVO, o que faz esta prova valer algo: três defeitos
--            plantados, um deles a consulta velha de verdade (a que lia
--            `rh_adiantamentos.folha_id`), e a varredura tem que acusar os três
--
-- Leitura: no bloco A a coluna `falhas` tem que dar 0 e `comentarios_marcados`
-- tem que ser >= 2. No bloco B cada caso plantado tem que aparecer com o erro
-- esperado. Se o bloco A acusar linha, a consulta gravada NÃO roda mais: é
-- achado, não conserto silencioso, e o comentário é a única lugar onde a
-- intenção daquele número está escrita.

-- ############################################################################
-- BLOCO A: o estado real
-- ############################################################################

select n.nspname || '.' || p.proname as funcao_com_consulta_marcada,
       (length(obj_description(p.oid, 'pg_proc'))
        - length(replace(obj_description(p.oid, 'pg_proc'), '-- DIAGNOSTICO EXECUTAVEL v1', '')))
       / length('-- DIAGNOSTICO EXECUTAVEL v1') as consultas
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where strpos(coalesce(obj_description(p.oid, 'pg_proc'), ''), '-- DIAGNOSTICO EXECUTAVEL v1') > 0
order by 1;

select count(*) as falhas from public.fn_verificar_diagnosticos_gravados();

select objeto, ordem, erro, left(consulta, 120) as consulta
from public.fn_verificar_diagnosticos_gravados();

-- ############################################################################
-- BLOCO B: controle negativo (termina em rollback)
--
-- Uma varredura que só é rodada quando está passando não prova nada. Aqui os
-- três defeitos que ela existe para pegar são plantados de propósito:
--   B1  a consulta HISTÓRICA que quebrou de verdade (lê rh_adiantamentos.folha_id)
--   B2  marca com consulta sem ponto e virgula terminador
--   B3  tabela que não existe (o modo de falha de um `drop table`)
-- ############################################################################
begin;

create function public.fn_prova_diagnostico_quebrado_1() returns integer language sql as $$ select 1 $$;
create function public.fn_prova_diagnostico_quebrado_2() returns integer language sql as $$ select 1 $$;
create function public.fn_prova_diagnostico_quebrado_3() returns integer language sql as $$ select 1 $$;

-- B1: a consulta velha, palavra por palavra no ponto que importa: o vínculo do
-- adiantamento com a folha era `rh_adiantamentos.folha_id`, coluna dropada.
comment on function public.fn_prova_diagnostico_quebrado_1() is
'Controle negativo B1.

  -- DIAGNOSTICO EXECUTAVEL v1
  select coalesce(sum(a.valor), 0) as adiantamentos
    from public.rh_adiantamentos a
   where a.folha_id is not null;';

-- B2: marca sem terminador.
comment on function public.fn_prova_diagnostico_quebrado_2() is
'Controle negativo B2.

  -- DIAGNOSTICO EXECUTAVEL v1
  select 1 from public.folhas';

-- B3: tabela inexistente.
comment on function public.fn_prova_diagnostico_quebrado_3() is
'Controle negativo B3.

  -- DIAGNOSTICO EXECUTAVEL v1
  select * from public.tabela_que_nao_existe;';

select objeto, ordem, erro, left(consulta, 80) as consulta
from public.fn_verificar_diagnosticos_gravados()
order by objeto;

-- As duas consultas de verdade continuam passando no meio dos defeitos: a
-- varredura não desiste no primeiro erro.
select count(*) as falhas_plantadas,
       (select count(*) from public.fn_verificar_diagnosticos_gravados() f2
         where f2.objeto like '%fn_aprovar_folha%' or f2.objeto like '%fn_gerar_folha%') as falhas_reais
from public.fn_verificar_diagnosticos_gravados();

rollback;

-- Depois do rollback a varredura volta a zero.
select count(*) as falhas_depois_do_rollback from public.fn_verificar_diagnosticos_gravados();
