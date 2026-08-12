-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-12, versão
-- 20260812214251 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 3 do adiantamento parcelado, parte 2 de 3: a folha passa a descontar a
-- PARCELA do adiantamento, limitada ao líquido disponível, e empurra a sobra
-- para o fim do plano daquele adiantamento.
--
-- A função foi recriada a partir da própria `pg_get_functiondef` da versão viva
-- (md5(prosrc) = d039ab9d0e8364af07a9b0b96d8f2e62, 8886 chars), com `replace()`
-- cirúrgico em cinco pontos e nada mais:
--   1. declare: + v_disponivel, v_par, v_desc_par;
--   2. regeneração: `update rh_adiantamentos set folha_id = null` virou
--      `delete` das parcelas geradas por esta folha + reset das que ela marcou;
--   3. saiu o `select sum(valor) into v_adiant from rh_adiantamentos`;
--   4. entrou a cascata por parcela, e o líquido virou `v_disponivel - v_adiant`;
--   5. saiu o `update rh_adiantamentos set folha_id = v_folha` do fim do loop.
-- md5(prosrc) resultante: 352da56059609bf02d19e0d7a53af117 (11114 chars).
-- Intactos: INSS progressivo com `lag`, IRRF completo/simplificado com `least`,
-- loop de encargos, custo_total = salário + encargos, snapshot do grupo de
-- recolhimento e a guarda de status.

create or replace function public.fn_gerar_folha(p_competencia date, p_encargos_pct numeric default 0)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_folha uuid; v_status text; v_ini date; v_fim date;
  v_colab record; v_hn numeric; v_he numeric; v_valor_hora numeric; v_extras numeric;
  v_encargos numeric; v_adiant numeric; v_custo numeric; v_liquido numeric; v_cc uuid;
  v_item_id uuid; v_enc record; v_valor numeric; v_pct_total numeric;
  -- Bloco 7 / Task 4: descontos legais por colaborador.
  v_inss numeric; v_irrf numeric; v_qtd_dep integer;
  v_deducao_dep numeric; v_desconto_simpl numeric; v_has_irrf boolean;
  v_base_c numeric; v_base_s numeric; v_irrf_completo numeric; v_irrf_simplificado numeric;
  v_aliq numeric; v_parc numeric;
  -- Bloco 8b / Task 3: adiantamento descontado por parcela, com cascata.
  v_disponivel numeric; v_par record; v_desc_par numeric;
begin
  if not public.tem_permissao('rh.folha', 'criar') then raise exception 'Sem permissao para gerar folha'; end if;
  -- p_encargos_pct: LEGADO. Os encargos agora vem discriminados de public.folha_encargos (ativos).
  -- Mantido na assinatura so para nao quebrar o RPC/call existente; ignorado no calculo.
  v_ini := date_trunc('month', p_competencia)::date;
  v_fim := (v_ini + interval '1 month')::date;

  -- Soma dos percentuais ativos: valor informativo gravado em folhas.encargos_percentual.
  select coalesce(sum(percentual), 0) into v_pct_total from public.folha_encargos where ativo;

  -- Parametros globais do IRRF (folha_parametros e linha unica id=1). Sem linha => 0 (sem desconto legal).
  select coalesce(irrf_deducao_por_dependente, 0), coalesce(irrf_desconto_simplificado, 0)
  into v_deducao_dep, v_desconto_simpl
  from public.folha_parametros where id = 1;
  v_deducao_dep := coalesce(v_deducao_dep, 0);
  v_desconto_simpl := coalesce(v_desconto_simpl, 0);

  -- Sem faixas de IRRF cadastradas => IRRF 0 (espelha calcularIRRF com faixas vazias).
  select exists (select 1 from public.folha_irrf_faixas) into v_has_irrf;

  select id, status into v_folha, v_status from public.folhas where competencia = v_ini;
  if v_status is not null and v_status <> 'rascunho' then
    raise exception 'A folha de %/% esta em "%": só da para gerar em rascunho. Rejeite ou desaprove antes de regerar.',
      to_char(v_ini, 'MM'), to_char(v_ini, 'YYYY'), v_status;
  end if;
  if v_folha is null then
    insert into public.folhas (competencia, encargos_percentual, created_by) values (v_ini, v_pct_total, (select auth.uid())) returning id into v_folha;
  else
    delete from public.rh_adiantamento_parcelas where gerada_por_folha_id = v_folha;
    update public.rh_adiantamento_parcelas
       set folha_id = null, valor_descontado = 0
     where folha_id = v_folha;
    -- delete cascateia para folha_item_encargos (FK ON DELETE CASCADE).
    delete from public.folha_itens where folha_id = v_folha;
    update public.folhas set encargos_percentual = v_pct_total where id = v_folha;
  end if;

  for v_colab in
    select id, coalesce(salario, 0) as salario, centro_custo_id from public.colaboradores
    where ativo and vinculo = 'clt'
  loop
    select coalesce(sum(a.horas_normais), 0), coalesce(sum(a.horas_extras), 0)
    into v_hn, v_he
    from public.rh_apontamentos a join public.rh_pontos pt on pt.id = a.ponto_id
    where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim;

    continue when v_colab.salario = 0 and v_hn = 0 and v_he = 0;

    v_valor_hora := case when v_colab.salario > 0 then v_colab.salario / 220.0 else 0 end;
    -- Salario fechado: nao paga extra. Horas extras seguem gravadas so como produtividade.
    v_extras := 0;

    -- ===== Bloco 7 / Task 4: INSS e IRRF (espelha calculo-imposto.ts) =====
    -- INSS progressivo (calcularINSS): para cada faixa (ordenada por limite_ate),
    -- aliquota SO sobre a porcao do salario entre o limite anterior e limite_ate;
    -- porcao negativa vira 0 (equivale ao break do TS) => trava no teto. round(,2) na soma.
    select coalesce(round(sum(t.porcao * t.aliquota / 100.0), 2), 0)
    into v_inss
    from (
      select greatest(
               least(v_colab.salario, f.limite_ate)
               - coalesce(lag(f.limite_ate) over (order by f.limite_ate), 0),
               0) as porcao,
             f.aliquota
      from public.folha_inss_faixas f
    ) t;

    -- Dependentes IRRF do colaborador (Bloco 2).
    select count(*) into v_qtd_dep
    from public.rh_dependentes
    where colaborador_id = v_colab.id and dependente_irrf;

    -- IRRF = min(completo, simplificado) (calcularIRRF). Sem faixas => 0.
    if v_has_irrf then
      -- completo: base = salario - inss - qtd_dep * deducao_por_dependente
      v_base_c := v_colab.salario - v_inss - v_qtd_dep * v_deducao_dep;
      -- simplificado: base = salario - desconto_simplificado
      v_base_s := v_colab.salario - v_desconto_simpl;

      -- impostoIrrf(base_c): faixa = 1a cujo limite_ate >= max(base,0); senao a ultima.
      -- imposto = max(0, max(base,0) * aliquota/100 - parcela), round(,2).
      select fx.aliquota, fx.parcela_deduzir into v_aliq, v_parc
      from public.folha_irrf_faixas fx
      where fx.id = coalesce(
        (select id from public.folha_irrf_faixas where limite_ate >= greatest(v_base_c, 0) order by limite_ate asc limit 1),
        (select id from public.folha_irrf_faixas order by limite_ate desc limit 1));
      v_irrf_completo := round(greatest(greatest(v_base_c, 0) * v_aliq / 100.0 - v_parc, 0), 2);

      -- impostoIrrf(base_s)
      select fx.aliquota, fx.parcela_deduzir into v_aliq, v_parc
      from public.folha_irrf_faixas fx
      where fx.id = coalesce(
        (select id from public.folha_irrf_faixas where limite_ate >= greatest(v_base_s, 0) order by limite_ate asc limit 1),
        (select id from public.folha_irrf_faixas order by limite_ate desc limit 1));
      v_irrf_simplificado := round(greatest(greatest(v_base_s, 0) * v_aliq / 100.0 - v_parc, 0), 2);

      v_irrf := least(v_irrf_completo, v_irrf_simplificado);
    else
      v_irrf := 0;
    end if;
    -- ===== fim INSS/IRRF =====

    -- Adiantamento parcelado: desconta o que cabe no liquido disponivel, do
    -- adiantamento MAIS ANTIGO para o mais novo. Ordem da cascata, declarada e
    -- conferivel: rh_adiantamentos.data, depois rh_adiantamento_parcelas.numero.
    -- Com dois adiantamentos disputando o mesmo disponivel, o mais antigo leva o
    -- desconto e o mais novo gera a sobra. O que nao couber vira parcela nova no
    -- fim do plano DAQUELE adiantamento, marcada com esta folha em
    -- gerada_por_folha_id, para a regeneracao poder desfazer.
    v_disponivel := greatest(v_colab.salario - v_inss - v_irrf, 0);
    v_adiant := 0;

    for v_par in
      select pa.id, pa.adiantamento_id, pa.valor_previsto
      from public.rh_adiantamento_parcelas pa
      join public.rh_adiantamentos a on a.id = pa.adiantamento_id
      where a.colaborador_id = v_colab.id
        and pa.competencia = v_ini
        and pa.folha_id is null
      order by a.data, pa.numero
    loop
      v_desc_par := least(v_par.valor_previsto, greatest(v_disponivel - v_adiant, 0));

      -- folha_id SO quando descontou algo: o check
      -- rh_adiant_parcelas_descontado_com_folha exige
      -- (valor_descontado > 0) = (folha_id is not null), entao a parcela que nao
      -- couber nada fica ABERTA (folha_id null, descontado 0) e a sobra dela e o
      -- valor inteiro. Marcar a folha aqui abortaria a geracao inteira no
      -- primeiro colaborador sem disponivel.
      update public.rh_adiantamento_parcelas
         set folha_id = case when v_desc_par > 0 then v_folha else null end,
             valor_descontado = v_desc_par
       where id = v_par.id;

      v_adiant := v_adiant + v_desc_par;

      if v_par.valor_previsto > v_desc_par then
        insert into public.rh_adiantamento_parcelas
          (adiantamento_id, numero, competencia, valor_previsto, gerada_por_folha_id)
        select v_par.adiantamento_id,
               max(pa2.numero) + 1,
               public.fn_proxima_competencia_desconto(max(pa2.competencia)),
               v_par.valor_previsto - v_desc_par,
               v_folha
        from public.rh_adiantamento_parcelas pa2
        where pa2.adiantamento_id = v_par.adiantamento_id;
      end if;
    end loop;

    -- Liquido: salario menos descontos legais (INSS/IRRF) e o adiantamento
    -- descontado. Sem extra. v_adiant <= v_disponivel por construcao
    -- (least/greatest acima), entao o liquido NUNCA fica negativo.
    v_liquido := v_disponivel - v_adiant;

    v_cc := null;
    select co.id into v_cc
    from public.rh_apontamentos a
    join public.rh_pontos pt on pt.id = a.ponto_id
    join public.centros_custo co on co.obra_id = pt.obra_id and co.nivel = 1
    where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim
    group by co.id
    order by sum(a.horas_normais + a.horas_extras) desc
    limit 1;
    if v_cc is null then v_cc := v_colab.centro_custo_id; end if;

    -- Insere o item com encargos provisorios (0) e custo = salario; captura o id para as linhas discriminadas.
    insert into public.folha_itens (folha_id, colaborador_id, centro_custo_id, salario_base, horas_normais, horas_extras, valor_extras, encargos, inss, irrf, adiantamentos, custo_total, valor_liquido)
    values (v_folha, v_colab.id, v_cc, v_colab.salario, v_hn, v_he, v_extras, 0, v_inss, v_irrf, v_adiant, v_colab.salario, v_liquido)
    returning id into v_item_id;

    -- Discrimina: uma linha por encargo ativo; valor = round(salario * aliquota / 100, 2).
    -- v_encargos e a SOMA das linhas (mesma e unica formula) => sum(linhas) == folha_itens.encargos.
    v_encargos := 0;
    for v_enc in
      select nome, percentual, grupo_recolhimento from public.folha_encargos where ativo order by nome
    loop
      v_valor := round(v_colab.salario * v_enc.percentual / 100.0, 2);
      insert into public.folha_item_encargos (folha_item_id, nome, percentual, valor, grupo_recolhimento)
      values (v_item_id, v_enc.nome, v_enc.percentual, v_valor, v_enc.grupo_recolhimento);
      v_encargos := v_encargos + v_valor;
    end loop;

    -- Fecha o item com o total discriminado e o custo da empresa (salario + encargos).
    -- INSS/IRRF sao desconto do trabalhador: NAO entram no custo da empresa.
    v_custo := v_colab.salario + v_encargos;
    update public.folha_itens set encargos = v_encargos, custo_total = v_custo where id = v_item_id;
  end loop;

  update public.folhas f set
    valor_bruto = coalesce((select sum(salario_base + valor_extras) from public.folha_itens where folha_id = v_folha), 0),
    valor_encargos = coalesce((select sum(encargos) from public.folha_itens where folha_id = v_folha), 0),
    valor_adiantamentos = coalesce((select sum(adiantamentos) from public.folha_itens where folha_id = v_folha), 0),
    valor_liquido = coalesce((select sum(valor_liquido) from public.folha_itens where folha_id = v_folha), 0),
    custo_total = coalesce((select sum(custo_total) from public.folha_itens where folha_id = v_folha), 0)
  where f.id = v_folha;

  return v_folha;
end $function$;

-- A ordem da cascata fica declarada aqui tambem, e nao so no corpo: e o que
-- permite conferir dois adiantamentos disputando o mesmo disponivel sem ler a
-- funcao inteira.
comment on function public.fn_gerar_folha(date, numeric) is
'Gera (ou regera) a folha da competencia em rascunho.

Adiantamento: desconta POR PARCELA (rh_adiantamento_parcelas com competencia =
mes da folha e folha_id nulo), nunca o valor integral. O desconto de cada
parcela e menor(valor_previsto, maior(disponivel restante, 0)), onde
disponivel = maior(salario - inss - irrf, 0). Logo valor_liquido >= 0 sempre:
liquido negativo e inalcancavel por construcao.

Ordem da cascata, declarada e conferivel: (rh_adiantamentos.data,
rh_adiantamento_parcelas.numero), do adiantamento MAIS ANTIGO para o mais novo.
Com dois adiantamentos no mesmo mes e disponivel insuficiente, o mais antigo
leva o desconto e o mais novo gera a sobra.

Sobra: o que nao couber vira parcela nova no fim do plano DAQUELE adiantamento,
na competencia devolvida por fn_proxima_competencia_desconto (primeiro mes sem
folha aprovada), marcada em gerada_por_folha_id com a folha que a criou.

Parcela que nao couber NADA fica ABERTA: valor_descontado 0 e folha_id nulo,
porque o check rh_adiant_parcelas_descontado_com_folha exige
(valor_descontado > 0) = (folha_id is not null). A sobra dela e o valor inteiro.

Idempotencia da regeneracao: apaga as parcelas com gerada_por_folha_id = esta
folha e zera folha_id/valor_descontado das que ela marcou, antes de recalcular.
Regerar N vezes da o mesmo resultado, sem parcela fantasma.';
