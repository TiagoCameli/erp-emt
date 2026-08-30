-- Rollback do desligamento + folha proporcional (20260829200000).
--
-- ORDEM IMPORTA: a `fn_gerar_folha` volta ao comportamento antigo ANTES de as
-- colunas caírem. Invertida, a função ficaria referenciando `c.data_demissao`
-- e `fn_folha_avos_do_mes` já derrubados, e NENHUMA folha poderia ser gerada
-- até alguém perceber.
--
-- As colunas de `colaboradores` NÃO são derrubadas por padrão: se alguma
-- rescisão já foi aprovada, `data_demissao` é o registro de que a pessoa saiu,
-- e derrubar apagaria isso em silêncio. Derrube à mão, depois de conferir, com
-- o bloco comentado no fim.

do $patch$
declare
  v_oid oid;
  v_def text;
  v_novo_def text;

  n_select text := '           coalesce(c.gratificacao, 0) as gratificacao,
           c.desconto_valor';
  a_select text := '           coalesce(c.gratificacao, 0) as gratificacao,
           c.desconto_valor,
           c.data_admissao,
           c.data_demissao';
begin
  select p.oid into strict v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  v_def := pg_get_functiondef(v_oid);
  v_novo_def := v_def;

  -- Cada trecho volta pela MESMA técnica de âncora da ida: conferir antes,
  -- trocar, e conferir que saiu. Um `create or replace` com uma versão antiga
  -- guardada aqui apagaria tudo que outras frentes alteraram desde então.
  if position(a_select in v_novo_def) = 0 then
    raise exception 'Ancora (1) do select nao encontrada: a fn_gerar_folha nao esta na versao que este rollback desfaz';
  end if;
  v_novo_def := replace(v_novo_def, a_select, n_select);

  v_novo_def := regexp_replace(
    v_novo_def,
    '    from public\.colaboradores c\s*\n    where \(\s*\n.*?\n      and c\.vinculo in \(''clt'', ''terceiro'', ''diarista''\)',
    '    from public.colaboradores c' || E'\n' ||
    '    where c.ativo and c.vinculo in (''clt'', ''terceiro'', ''diarista'')',
    'ns');

  v_novo_def := regexp_replace(
    v_novo_def,
    '\n\n    -- ===== Proporcionalidade por dias trabalhados \(29/08/2026\) =====.*?\n    end if;\n',
    E'\n',
    'ns');

  v_novo_def := replace(v_novo_def,
    '       inss, irrf, adiantamentos, custo_total, valor_liquido, editado_manualmente,
       dias_trabalhados)',
    '       inss, irrf, adiantamentos, custo_total, valor_liquido, editado_manualmente)');
  v_novo_def := replace(v_novo_def,
    '       v_inss, v_irrf, v_adiant, v_base + v_grat, v_liquido, v_manual,
       v_avos)',
    '       v_inss, v_irrf, v_adiant, v_base + v_grat, v_liquido, v_manual)');
  v_novo_def := replace(v_novo_def,
    '  -- Avos de 30 trabalhados na competencia (29/08/2026). Null para diarista, que
  -- ja e proporcional por construcao.
  v_avos integer;
begin',
    'begin');

  execute v_novo_def;

  if position('fn_folha_avos_do_mes' in pg_get_functiondef(v_oid)) > 0 then
    raise exception 'A proporcionalidade nao saiu de fn_gerar_folha';
  end if;
  if position('c.data_demissao' in pg_get_functiondef(v_oid)) > 0 then
    raise exception 'O filtro do desligado nao saiu de fn_gerar_folha';
  end if;
  if position('v_avos' in pg_get_functiondef(v_oid)) > 0 then
    raise exception 'v_avos continua na funcao: ela nao compilaria sem a declaracao';
  end if;
end $patch$;

alter table public.folha_itens drop constraint if exists folha_itens_dias_trabalhados_check;
alter table public.folha_itens drop column if exists dias_trabalhados;

drop function if exists public.fn_folha_avos_do_mes(date, date, date);

-- Só depois de conferir que nenhuma pessoa desligada perde o registro:
--
--   alter table public.colaboradores
--     drop constraint if exists colaboradores_tipo_rescisao_check,
--     drop constraint if exists colaboradores_demissao_depois_da_admissao,
--     drop column if exists data_demissao,
--     drop column if exists motivo_desligamento,
--     drop column if exists tipo_rescisao;
