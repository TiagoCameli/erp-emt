-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-12, versão
-- 20260812221350 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Fix round 1 da Task 3 do adiantamento parcelado. Duas correções, numa
-- migration só porque as duas mexem na `fn_gerar_folha` e aplicar a função duas
-- vezes deixaria um estado intermediário sem motivo.
--
-- 1 (Critical, dinheiro). A regra anterior ("parcela de desconto zero fica
--    aberta" + "a sobra nasce com o valor inteiro") fazia as duas coexistirem, e
--    o plano do adiantamento somava o DOBRO do valor concedido no caminho de
--    desconto zero: adiantamento de 500,00 ficava com plano de 1.000,00. O caixa
--    estava certo (a folha filtra `competencia = v_ini`, então a parcela velha
--    nunca era redescontada), mas o SALDO mentia, e é o saldo que a quitação
--    (Task 5) e as telas (Task 6) vão consumir: numa quitação, dinheiro cobrado
--    a mais do colaborador.
--
--    Correção: o check `rh_adiant_parcelas_descontado_com_folha` passa a admitir
--    `valor_descontado = 0` com `folha_id` preenchido (= "esta folha processou
--    esta parcela e não cabia nada", que é estado legítimo), e a função passa a
--    FECHAR a parcela de desconto zero em vez de deixá-la aberta. O sentido que
--    o check existe para barrar continua barrado: `valor_descontado > 0` com
--    `folha_id` nulo segue impossível.
--
-- 2 (Important). `delete ... where gerada_por_folha_id = v_folha` apagava sobra
--    que uma folha POSTERIOR já tinha descontado (janeiro empurra para
--    fevereiro, fevereiro aprova descontando, alguém desaprova e regera
--    janeiro). A `fn_proxima_competencia_desconto` impede CRIAR sobra em mês com
--    folha aprovada, mas não impedia APAGAR de um mês que aprovou depois.
--
--    Correção: a regeneração RECUSA, dizendo qual competência descontou a sobra
--    e que ela precisa ser desaprovada primeiro. Folha posterior em `rascunho`
--    não trava, e isso é deliberado: nada de dinheiro saiu dela, e travar seria
--    indestravável, porque regerar a folha posterior liberaria a parcela no
--    início e a redescontaria no fim, para sempre. Os dois status que travam
--    (`pendente_aprovacao` e `aprovado`) têm volta documentada para `rascunho`:
--    rejeição e desaprovação. `folhas_status_check` só permite esses três.
--
-- A `fn_gerar_folha` foi recriada a partir da definição viva
-- (md5(prosrc) = 352da56059609bf02d19e0d7a53af117, 11114 chars) com `replace()`
-- cirúrgico em três pontos e nada mais:
--   1. declare: + v_trava date;
--   2. regeneração: a trava antes do delete;
--   3. o `case when v_desc_par > 0 then v_folha else null end` vira `v_folha`.
-- md5(prosrc) resultante: 6918f7175806dcdd806480d2cf6ef17c (12690 chars).

-- ============================================================================
-- 1. O check relaxado num sentido só
-- ============================================================================
-- Antes: (valor_descontado > 0) = (folha_id is not null) — bicondicional, que
-- proibia o estado legítimo "processada, descontou zero".
-- Agora:  valor_descontado > 0  ->  folha_id is not null  (só a implicação).
-- Mesmo nome de propósito: "descontado com folha" descreve exatamente a
-- implicação que sobrou. Produção tem zero parcela, então não há linha para
-- revalidar.
alter table public.rh_adiantamento_parcelas
  drop constraint rh_adiant_parcelas_descontado_com_folha;

alter table public.rh_adiantamento_parcelas
  add constraint rh_adiant_parcelas_descontado_com_folha
  check (valor_descontado = 0 or folha_id is not null);

comment on constraint rh_adiant_parcelas_descontado_com_folha on public.rh_adiantamento_parcelas is
'Desconto exige folha: valor_descontado > 0 sem folha_id e impossivel (dinheiro descontado sem folha a que atribuir). O contrario e permitido de proposito: valor_descontado = 0 com folha_id preenchido significa "esta folha processou esta parcela e nao cabia nada no liquido disponivel", e e o que impede o plano do adiantamento de somar o dobro no caminho de desconto zero.';

-- ============================================================================
-- 2. fn_gerar_folha: fecha a parcela de desconto zero, e trava a regeração
-- ============================================================================
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
  v_disponivel numeric; v_par record; v_desc_par numeric; v_trava date;
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
    -- Regenerar apaga as sobras que ESTA folha empurrou. Mas uma folha
    -- POSTERIOR pode ja ter descontado uma dessas sobras: apagar ali deixaria o
    -- item daquela folha apontando para parcela que nao existe mais, com o
    -- dinheiro dela ja lancado no Financeiro. Recusar e melhor que apagar em
    -- silencio ou pela metade. Folha posterior em RASCUNHO nao trava: nada saiu
    -- dela ainda, e travar seria indestravavel (regerar a posterior liberaria a
    -- parcela no inicio e a redescontaria no fim, para sempre). Os dois status
    -- que travam tem volta documentada para rascunho: pendente_aprovacao pela
    -- rejeicao, aprovado pela desaprovacao.
    select f.competencia into v_trava
    from public.rh_adiantamento_parcelas pa
    join public.folhas f on f.id = pa.folha_id
    where pa.gerada_por_folha_id = v_folha
      and pa.folha_id <> v_folha
      and f.status <> 'rascunho'
    order by f.competencia
    limit 1;
    if v_trava is not null then
      raise exception 'Nao da para regerar a folha de %/%: a sobra de adiantamento que ela empurrou ja foi descontada na folha de %/%, que nao esta em rascunho. Desaprove (ou rejeite) a folha de %/% antes de regerar esta.',
        to_char(v_ini, 'MM'), to_char(v_ini, 'YYYY'),
        to_char(v_trava, 'MM'), to_char(v_trava, 'YYYY'),
        to_char(v_trava, 'MM'), to_char(v_trava, 'YYYY');
    end if;

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

      -- Fecha a parcela NESTA folha sempre, inclusive com desconto zero:
      -- "esta folha processou esta parcela e nao cabia nada" e estado legitimo, e
      -- o check rh_adiant_parcelas_descontado_com_folha passou a admitir
      -- (valor_descontado = 0 com folha_id preenchido). Deixar a parcela ABERTA
      -- aqui faria o plano do adiantamento somar DUAS VEZES o mesmo valor, porque
      -- a sobra abaixo nasce com o valor inteiro dela: o saldo devedor mentiria e
      -- a quitacao cobraria a mais. O sentido oposto segue impossivel pelo check:
      -- desconto maior que zero sem folha_id.
      update public.rh_adiantamento_parcelas
         set folha_id = v_folha,
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

Toda parcela processada FECHA nesta folha (folha_id preenchido), inclusive a que
nao couber nada, que fecha com valor_descontado = 0. O check
rh_adiant_parcelas_descontado_com_folha admite esse estado de proposito: se a
parcela de desconto zero ficasse aberta, ela e a sobra (que nasce com o valor
inteiro dela) somariam DUAS VEZES o mesmo valor e o saldo devedor do
adiantamento mentiria. Invariante que vale sempre: para cada adiantamento,
soma(valor_descontado) + soma(valor_previsto das parcelas abertas) = valor
concedido.

Idempotencia da regeneracao: apaga as parcelas com gerada_por_folha_id = esta
folha e zera folha_id/valor_descontado das que ela marcou, antes de recalcular.
Regerar N vezes da o mesmo resultado, sem parcela fantasma. A regeneracao RECUSA
se uma sobra que esta folha empurrou ja foi descontada por folha posterior que
nao esteja em rascunho: apagar ali deixaria o item daquela folha apontando para
parcela inexistente, com o dinheiro ja lancado.';
