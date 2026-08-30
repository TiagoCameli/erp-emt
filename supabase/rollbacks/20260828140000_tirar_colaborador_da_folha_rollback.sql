-- Rollback de 20260828140000_tirar_colaborador_da_folha.sql
--
-- ORDEM: primeiro tirar o filtro de dentro de `fn_gerar_folha`, depois derrubar
-- as funções e a tabela. Ao contrário, a geração ficaria referenciando uma
-- tabela que não existe mais e NENHUMA folha poderia ser gerada.
--
-- ATENÇÃO: derrubar a tabela apaga as exclusões. As folhas em rascunho que
-- tiverem alguém fora voltarão a incluir essa pessoa no próximo Regerar. Para
-- saber o que seria perdido:
--   select f.competencia, c.nome, x.motivo, x.created_at
--   from public.folha_exclusoes x
--   join public.folhas f on f.id = x.folha_id
--   join public.colaboradores c on c.id = x.colaborador_id
--   order by f.competencia desc, c.nome;

-- 1. `fn_gerar_folha` volta a não conhecer a exclusão, pela MESMA técnica de
--    âncora da migration: reverter com um `create or replace` da versão que eu
--    tinha em mãos apagaria o que outras frentes mudaram desde então.
do $$
declare
  v_oid oid;
  v_def text;
  v_atual text := '    from public.colaboradores c
    where c.ativo and c.vinculo in (''clt'', ''terceiro'', ''diarista'')
      -- Fora DESTA folha por decisao de quem esta montando ela. Por folha, nao
      -- por pessoa: na competencia seguinte (outra folha) ele entra por padrao.
      -- Ver public.folha_exclusoes e fn_tirar_da_folha.
      and not exists (
        select 1 from public.folha_exclusoes x
        where x.folha_id = v_folha and x.colaborador_id = c.id
      )
  loop';
  v_antigo text := '    from public.colaboradores c
    where c.ativo and c.vinculo in (''clt'', ''terceiro'', ''diarista'')
  loop';
begin
  select p.oid into strict v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  v_def := pg_get_functiondef(v_oid);

  -- Sem a âncora, a função seria recriada idêntica e o rollback terminaria com
  -- `success` deixando uma referência a `folha_exclusoes` que o passo 3 apaga —
  -- ou seja, geração de folha nenhuma funcionaria.
  if position(v_atual in v_def) = 0 then
    raise exception 'Filtro de exclusao nao encontrado em fn_gerar_folha: reverter na mao';
  end if;

  execute replace(v_def, v_atual, v_antigo);
end $$;

-- 2. As RPCs.
drop function if exists public.fn_tirar_da_folha(uuid, uuid, text);
drop function if exists public.fn_voltar_para_folha(uuid, uuid);

-- 3. A tabela (leva junto índice, policy, triggers e constraint).
drop table if exists public.folha_exclusoes;
