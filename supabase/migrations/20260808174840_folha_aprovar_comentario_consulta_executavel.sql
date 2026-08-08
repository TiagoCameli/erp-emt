-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808174840 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Fix round 2 da Task 4 do Bloco 8a: SÓ COMENTÁRIO, nenhuma linha do corpo muda.
--
-- A consulta de diagnóstico que a 20260808173430 gravou no obj_description não
-- rodava verbatim: usava `:folha`, que não é sintaxe SQL. Colada no MCP
-- execute_sql ou no editor do Supabase dá `ERROR: 42601: syntax error at or
-- near ":"`. A lógica estava certa (o re-reviewer conferiu com encargo sem grupo
-- de R$ 80 e item de −R$ 50), o problema era prontidão para rodar: quem tem uma
-- diferença na mão não pode ter que descobrir que `:folha` vira outra coisa.
--
-- Duas correções no texto:
--
-- 1. A consulta agora resolve a folha pela COMPETÊNCIA, com literal de data, e
--    roda copy-paste-and-run. Trocar uma data (que o contador sabe) é mais
--    simples que achar um uuid. Testada verbatim contra o banco: com as DUAS
--    causas ao mesmo tempo (encargo sem grupo 999,90 e líquido −275,00) devolveu
--    residuo −724,90 e a coluna `explicado` em 0.00; e contra competência
--    inexistente devolve zero linha, sem erro.
--
-- 2. O sinal da diferença estava ambíguo. O texto dizia
--    `diferenca = soma(encargos sem grupo) + soma(valor_liquido <= 0)` sem dizer
--    em que direção, e a prova do Step 11 define `diferenca` como
--    `soma - custo_total`, que é o sinal oposto. Agora o nome `residuo` está
--    definido por extenso e a identidade é escrita numa forma que fecha em zero
--    somando, sem ninguém ter que raciocinar sinal: a coluna `explicado` da
--    consulta faz a conta e tem que dar 0,00 sempre.
comment on function public.fn_aprovar_folha(uuid) is
$c$Aprova a folha e gera as contas a pagar: um a_pagar por colaborador com o valor liquido (origem 'folha', origem_id = folha_itens.id) e um a_pagar por grupo de recolhimento com a guia (origem 'folha_guia', origem_id = folha_guias.id).

CONFERENCIA (para quem bate custo_total contra o contas a pagar):

  soma(liquidos) + soma(guias) + soma(adiantamentos) = folhas.custo_total

Essa igualdade fecha no centavo QUANDO, e somente quando, as duas condicoes valem:
  1. todo encargo ativo tem grupo_recolhimento preenchido; e
  2. todo item da folha tem valor_liquido > 0.

Quando uma das duas nao vale, a diferenca NAO e arredondamento: ela e explicada no centavo pelas duas causas. Chamando

  residuo = soma(liquidos) + soma(guias) + soma(adiantamentos) - folhas.custo_total

vale sempre, em folha aprovada:

  residuo + soma(encargos sem grupo) + soma(valor_liquido <= 0) = 0

A segunda soma e negativa (sao liquidos negativos), por isso entra somando. Nao precisa raciocinar sinal: a consulta abaixo devolve os dois lados e ja faz essa conta na coluna "explicado", que tem que dar 0.00 sempre. Se "explicado" NAO der 0.00, ai sim e bug e deve ser reportado.

As duas causas sao comportamento desejado, nao erro:

  - Encargo ativo sem grupo_recolhimento e PROVISAO: entra no custo do empregador (folhas.custo_total) e de proposito nao gera guia, porque nao existe para onde recolher. E o desenho que 13o e ferias usam.
  - Item com valor_liquido <= 0 nao gera lancamento: o adiantamento do mes ja consumiu o salario, e lancamento de R$ 0 ou negativo e impossivel (lancamentos tem check valor >= 0). O colaborador segue na folha, com o liquido negativo visivel no item.

DIAGNOSTICO, copy-paste-and-run no MCP execute_sql ou no editor SQL do Supabase. Troque SO a data da segunda linha pela competencia da folha (sempre o dia 1 do mes). Zero linha na resposta = nao existe folha nessa competencia:

  with f as (
    select id, custo_total from public.folhas where competencia = '2026-08-01'
  ), partes as (
    select
      f.custo_total,
      coalesce((select sum(l.valor) from public.lancamentos l
                  join public.folha_itens fi on fi.id = l.origem_id
                 where l.origem = 'folha' and fi.folha_id = f.id), 0)      as liquidos,
      coalesce((select sum(l.valor) from public.lancamentos l
                  join public.folha_guias g on g.id = l.origem_id
                 where l.origem = 'folha_guia' and g.folha_id = f.id), 0)  as guias,
      coalesce((select sum(valor) from public.rh_adiantamentos
                 where folha_id = f.id), 0)                               as adiantamentos,
      coalesce((select sum(fie.valor) from public.folha_item_encargos fie
                  join public.folha_itens fi on fi.id = fie.folha_item_id
                 where fi.folha_id = f.id and fie.grupo_recolhimento is null), 0) as encargos_sem_grupo,
      coalesce((select sum(valor_liquido) from public.folha_itens
                 where folha_id = f.id and valor_liquido <= 0), 0)         as liquidos_nao_positivos
    from f
  )
  select liquidos, guias, adiantamentos, custo_total,
         liquidos + guias + adiantamentos - custo_total                    as residuo,
         encargos_sem_grupo, liquidos_nao_positivos,
         (liquidos + guias + adiantamentos - custo_total)
           + encargos_sem_grupo + liquidos_nao_positivos                   as explicado
  from partes;

RATEIO: o rateio da guia e exato, nao proporcional (cada centavo nasce ligado a um item, e o item tem centro de custo), mas item com centro_custo_id nulo fica de fora do rateio. Nesse caso soma(rateios) < valor do lancamento, espalhado por todas as guias, e o custo nao chega a centro de custo nenhum. Ver docs/decisoes.md, entrada de 2026-08-08.$c$;

do $$
declare v_txt text;
begin
  v_txt := obj_description('public.fn_aprovar_folha(uuid)'::regprocedure, 'pg_proc');

  if coalesce(length(v_txt), 0) = 0 then
    raise exception 'fn_aprovar_folha ficou sem comentario';
  end if;
  if v_txt not like '%somente quando%' then
    raise exception 'o comentario da fn_aprovar_folha nao declara a condicao da identidade';
  end if;

  -- O bug deste round: nenhum placeholder estilo :nome pode sobrar, senao a
  -- consulta volta a nao rodar colada.
  if v_txt ~ ':[a-zA-Z_]' then
    raise exception 'o comentario ainda tem placeholder :nome, que nao e sintaxe SQL valida';
  end if;

  -- E a consulta tem que estar na forma executavel (CTE por competencia).
  if v_txt not like '%with f as (%' or v_txt not like '%as explicado%' then
    raise exception 'o comentario nao tem a consulta de diagnostico executavel';
  end if;

  -- O corpo nao pode ter mudado: md5 da versao aplicada na 20260808165314.
  if md5((select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_aprovar_folha'))
     <> 'a1261a1ccbff886980f0991da47a2446' then
    raise exception 'o corpo da fn_aprovar_folha mudou: esta migration e so de comentario';
  end if;
end $$;

-- Prova extra, rodada depois de aplicar: a consulta foi EXTRAIDA do proprio
-- obj_description e executada, em vez de redigitada, para garantir que o que
-- esta gravado roda (e nao só o que eu digitei aqui):
--
--   do $$
--   declare v_txt text; v_q text; v_n integer;
--   begin
--     v_txt := obj_description('public.fn_aprovar_folha(uuid)'::regprocedure, 'pg_proc');
--     v_q := substring(v_txt from 'with f as \(.*from partes;');
--     if v_q is null then raise exception 'nao achei a consulta no comentario'; end if;
--     v_q := rtrim(btrim(v_q), ';');
--     execute 'select count(*) from (' || v_q || ') x' into v_n;
--   end $$;
--
-- Rodou sem exceção.
--
-- Rollback: reaplicar o texto da 20260808173430 (com o defeito do `:folha`), ou
--   comment on function public.fn_aprovar_folha(uuid) is null;
