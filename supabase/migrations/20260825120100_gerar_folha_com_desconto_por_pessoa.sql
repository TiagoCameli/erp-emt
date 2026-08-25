-- Segunda parte: a GERACAO da folha passa a conhecer o desconto por pessoa.
--
-- Tres pontos mudam, e nada mais foi tocado (o resto do corpo e o mesmo, letra
-- por letra -- CREATE OR REPLACE troca o corpo inteiro):
--
--   1. o snapshot do que foi editado a mao passa a guardar desconto_percentual,
--      senao um Regerar apagaria em silencio o desconto que ele acabou de
--      digitar (o mesmo motivo pelo qual o snapshot ja guardava a gratificacao);
--   2. folha nova herda o desconto do cadastro (colaboradores.desconto_percentual),
--      igual o encargo individual fazia;
--   3. o desconto entra no disponivel ANTES do adiantamento, para o liquido
--      nunca ficar negativo.
--
-- O encargo individual sai da geracao pelo mesmo motivo da edicao: o percentual
-- que a tela oferece agora e desconto. O encargo patronal continua vindo de
-- folha_encargos (vazia hoje = encargo 0 para todos).

create or replace function public.fn_gerar_folha(
  p_competencia date, p_encargos_pct numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_folha uuid; v_status text; v_ini date; v_fim date;
  v_colab record; v_hn numeric; v_he numeric; v_extras numeric;
  v_adiant numeric; v_custo numeric; v_liquido numeric; v_cc uuid;
  v_item_id uuid; v_pct_total numeric;
  v_encargos numeric; v_provisoes numeric;
  -- Base do mes, gratificacao e percentual de DESCONTO do item: dependem do
  -- vinculo, do cadastro e do que o Tiago editou a mao nesta folha.
  v_base numeric; v_grat numeric; v_desc_pct numeric; v_manual boolean;
  v_desconto numeric;
  v_man jsonb; v_manuais jsonb;
  -- Descontos legais por colaborador (Bloco 7 / Task 4), agora via helper.
  v_inss numeric; v_irrf numeric;
  -- Bloco 8b / Task 3: adiantamento descontado por parcela, com cascata.
  v_disponivel numeric; v_par record; v_desc_par numeric; v_trava date;
begin
  if not public.tem_permissao('rh.folha', 'criar') then raise exception 'Sem permissao para gerar folha'; end if;
  -- p_encargos_pct: LEGADO. Os encargos vem de public.folha_encargos (ativos).
  -- Mantido na assinatura so para nao quebrar o RPC/call existente; ignorado no
  -- calculo.
  v_ini := date_trunc('month', p_competencia)::date;
  v_fim := (v_ini + interval '1 month')::date;

  -- Soma dos percentuais ativos: valor informativo gravado em
  -- folhas.encargos_percentual.
  select coalesce(sum(percentual), 0) into v_pct_total from public.folha_encargos where ativo;

  -- Folha nova nao tem edicao manual nenhuma para preservar.
  v_manuais := '{}'::jsonb;

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
    -- silencio ou pela metade. A isencao vale SO para folha que esta em rascunho
    -- E e POSTERIOR a esta (por isso a trava abaixo tambem dispara quando
    -- f.competencia < v_ini): nada saiu de uma posterior em rascunho ainda, e
    -- travar seria indestravavel, porque regerar a posterior liberaria a parcela
    -- no inicio e a redescontaria no fim, para sempre.
    -- Esse argumento de indestravabilidade NAO vale para folha ANTERIOR, e por
    -- isso ela trava mesmo em rascunho: se algum codigo mover uma sobra para
    -- competencia anterior a folha que a criou (a Task 5 move parcelas entre
    -- competencias), regenerar esta folha apagaria uma parcela JA FECHADA, e o
    -- desconto dela viraria dinheiro cobrado do colaborador sem registro nenhum
    -- no plano. Medido sem esta condicao de ordem: adiantamento de 5200,00 com a
    -- sobra movida para o mes anterior, 1842,77 cobrados via liquido e
    -- INVISIVEIS no ledger, e a folha que cobra a mais aprovando sem atrito.
    -- Os dois status que travam tem volta documentada para rascunho:
    -- pendente_aprovacao pela rejeicao, aprovado pela desaprovacao.
    select f.competencia into v_trava
    from public.rh_adiantamento_parcelas pa
    join public.folhas f on f.id = pa.folha_id
    where pa.gerada_por_folha_id = v_folha
      and pa.folha_id <> v_folha
      and (f.status <> 'rascunho' or f.competencia < v_ini)
    order by f.competencia
    limit 1;
    if v_trava is not null then
      raise exception 'Nao da para regerar a folha de %/%: a sobra de adiantamento que ela empurrou ja foi descontada na folha de %/%. Se aquela folha e POSTERIOR a esta, desaprove ou rejeite ela antes de regerar esta. Se ela e ANTERIOR, o plano deste adiantamento esta fora de ordem (parcela de sobra empurrada para tras) e precisa ser corrigido antes.',
        to_char(v_ini, 'MM'), to_char(v_ini, 'YYYY'),
        to_char(v_trava, 'MM'), to_char(v_trava, 'YYYY');
    end if;

    -- Guarda o que o Tiago editou a mao ANTES de apagar os itens, e reaplica no
    -- loop. Sem este snapshot, um Regerar apagaria em silencio a gratificacao e
    -- o DESCONTO que ele acabou de digitar na tela, e a folha voltaria a mostrar
    -- o numero do cadastro sem avisar ninguem — o valor some e a unica pista e o
    -- total do rodape ter mudado.
    -- Chave: colaborador_id (nao o id do item, que morre no delete).
    select coalesce(jsonb_object_agg(colaborador_id::text, jsonb_build_object(
             'salario_base', salario_base,
             'gratificacao', gratificacao,
             'desconto_percentual', desconto_percentual)), '{}'::jsonb)
    into v_manuais
    from public.folha_itens
    where folha_id = v_folha and editado_manualmente;

    delete from public.rh_adiantamento_parcelas where gerada_por_folha_id = v_folha;
    update public.rh_adiantamento_parcelas
       set folha_id = null, valor_descontado = 0
     where folha_id = v_folha;
    -- delete cascateia para folha_item_encargos e folha_item_provisoes
    -- (as duas FKs sao ON DELETE CASCADE): regerar nao deixa linha orfa.
    delete from public.folha_itens where folha_id = v_folha;
    update public.folhas set encargos_percentual = v_pct_total where id = v_folha;
  end if;

  for v_colab in
    select c.id,
           coalesce(c.salario, 0) as salario,
           c.centro_custo_id,
           c.vinculo,
           coalesce(c.gratificacao, 0) as gratificacao,
           c.desconto_percentual
    from public.colaboradores c
    where c.ativo and c.vinculo in ('clt', 'terceiro', 'diarista')
  loop
    -- ===== Base do mes por vinculo =====
    -- Diarista nao tem salario: o mes dele e a soma das diarias. "Em aberto" e
    -- a MESMA definicao da fn_fechar_diarias (lancamento_id is null) mais o
    -- folha_id, que marca a diaria ja assumida por uma folha aprovada. As duas
    -- condicoes juntas sao o que impede a mesma diaria de ser paga duas vezes,
    -- uma pela folha e outra pelo fechamento em /rh/diaristas.
    if v_colab.vinculo = 'diarista' then
      select coalesce(sum(d.valor), 0) into v_base
      from public.rh_diarias d
      where d.colaborador_id = v_colab.id
        and d.competencia = v_ini
        and d.lancamento_id is null
        and d.folha_id is null;
    else
      v_base := v_colab.salario;
    end if;

    v_grat := v_colab.gratificacao;
    v_desc_pct := v_colab.desconto_percentual;
    v_manual := false;

    -- Reaplica a edicao manual desta folha, se existir. Sobrepoe TUDO que veio
    -- do cadastro e do calculo por vinculo: quem editou a linha decidiu o
    -- numero. `->>` num JSON null devolve SQL null, e null em
    -- desconto_percentual significa "sem desconto" — ou seja, a edicao consegue
    -- dizer as duas coisas.
    v_man := v_manuais -> v_colab.id::text;
    if v_man is not null then
      v_base := (v_man ->> 'salario_base')::numeric;
      v_grat := (v_man ->> 'gratificacao')::numeric;
      v_desc_pct := (v_man ->> 'desconto_percentual')::numeric;
      v_manual := true;
    end if;

    select coalesce(sum(a.horas_normais), 0), coalesce(sum(a.horas_extras), 0)
    into v_hn, v_he
    from public.rh_apontamentos a join public.rh_pontos pt on pt.id = a.ponto_id
    where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim;

    -- Nada a pagar e nada a registrar: linha de R$ 0,00 e sujeira na folha. E o
    -- que mantem fora o diarista que nao trabalhou no mes e o terceiro sem
    -- salario cadastrado.
    continue when v_base = 0 and v_grat = 0 and v_hn = 0 and v_he = 0;

    -- Salario fechado: nao paga extra. Horas extras seguem gravadas so como produtividade.
    v_extras := 0;

    -- ===== Descontos legais: SO CLT =====
    -- As faixas de INSS e IRRF da folha sao as do empregado com carteira.
    -- Terceiro e diarista entram na folha como CUSTO da empresa; a retencao
    -- deles, quando houver, e regra fiscal que o Tiago vai declarar.
    -- Base = salario base + gratificacao (gratificacao habitual integra a
    -- remuneracao). As formulas moram em fn_folha_inss / fn_folha_irrf, as
    -- MESMAS que a edicao de item usa.
    if v_colab.vinculo = 'clt' then
      v_inss := public.fn_folha_inss(v_base + v_grat);
      v_irrf := public.fn_folha_irrf(v_base + v_grat, v_inss, v_colab.id);
    else
      v_inss := 0;
      v_irrf := 0;
    end if;

    -- O desconto por pessoa, sobre o SALARIO BASE (a gratificacao fica fora,
    -- mesma base do encargo e da provisao). Mesma formula da
    -- fn_editar_item_folha: se mudar de base, muda nos DOIS lugares.
    v_desconto := case
      when v_desc_pct is null then 0
      else round(v_base * v_desc_pct / 100.0, 2)
    end;

    -- Adiantamento parcelado: desconta o que cabe no liquido disponivel, do
    -- adiantamento MAIS ANTIGO para o mais novo. Ordem da cascata, declarada e
    -- conferivel: rh_adiantamentos.data, depois rh_adiantamento_parcelas.numero.
    -- Com dois adiantamentos disputando o mesmo disponivel, o mais antigo leva o
    -- desconto e o mais novo gera a sobra. O que nao couber vira parcela nova
    -- DAQUELE adiantamento na PROXIMA competencia livre depois DESTA, marcada com
    -- esta folha em gerada_por_folha_id para a regeneracao poder desfazer.
    -- NAO e "no fim do plano": calcular a competencia a partir do max() das
    -- outras linhas fazia a sobra PULAR meses quando um mes anterior era
    -- regerado (o max ainda via a sobra que a cadeia criou mais adiante), e o mes
    -- pulado saia sem desconto nenhum, com liquido cheio. Medido: cadeia
    -- jul/ago/set de 5200 sobre salario 2000, regerar julho jogava a sobra em
    -- OUTUBRO e agosto saia com adiantamentos 0,00.
    -- Se ja houver parcela naquela competencia, as duas COEXISTEM: o loop abaixo
    -- itera sobre TODAS as parcelas abertas do mes e desconta em cascata, entao
    -- engrossar o mes seguinte e seguro. Nao existe unique (adiantamento_id,
    -- competencia); o unique e (adiantamento_id, numero), e o numero segue sendo
    -- max(numero) + 1.
    -- A gratificacao entra no disponivel: ela e dinheiro que o colaborador
    -- recebe, logo e dinheiro de onde o adiantamento pode ser descontado. O
    -- DESCONTO POR PESSOA sai antes, pelo mesmo motivo ao contrario: ele nao
    -- chega na mao do colaborador, entao nao esta disponivel para o
    -- adiantamento — e sem isso o liquido poderia fechar negativo.
    v_disponivel := greatest(v_base + v_grat - v_inss - v_irrf - v_desconto, 0);
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
               public.fn_proxima_competencia_desconto(v_ini),
               v_par.valor_previsto - v_desc_par,
               v_folha
        from public.rh_adiantamento_parcelas pa2
        where pa2.adiantamento_id = v_par.adiantamento_id;
      end if;
    end loop;

    -- Liquido: base do mes + gratificacao, menos descontos legais (INSS/IRRF), o
    -- desconto por pessoa e o adiantamento descontado. Sem extra.
    -- v_adiant <= v_disponivel por construcao (least/greatest acima), entao o
    -- liquido NUNCA fica negativo.
    v_liquido := v_disponivel - v_adiant;

    -- ===== Centro de custo =====
    v_cc := null;
    select co.id into v_cc
    from public.rh_apontamentos a
    join public.rh_pontos pt on pt.id = a.ponto_id
    join public.centros_custo co on co.obra_id = pt.obra_id and co.nivel = 1
    where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim
    group by co.id
    order by sum(a.horas_normais + a.horas_extras) desc
    limit 1;

    -- Diarista nao tem apontamento de ponto: a obra dele esta na propria
    -- diaria. Pega a obra que concentrou o maior VALOR de diaria no mes, e cai
    -- no centro do cadastro se as diarias vierem sem obra. Sem isto o custo do
    -- diarista iria todo para o centro do cadastro (tipicamente o Escritorio
    -- Central), e a obra onde ele efetivamente trabalhou nao veria o custo.
    if v_cc is null and v_colab.vinculo = 'diarista' then
      select co.id into v_cc
      from public.rh_diarias d
      join public.centros_custo co on co.obra_id = d.obra_id and co.nivel = 1
      where d.colaborador_id = v_colab.id
        and d.competencia = v_ini
        and d.lancamento_id is null
        and d.folha_id is null
      group by co.id
      order by sum(d.valor) desc
      limit 1;
    end if;

    if v_cc is null then v_cc := v_colab.centro_custo_id; end if;

    -- Insere o item com encargos/provisao provisorios (0); o helper discrimina
    -- em seguida e devolve os totais.
    insert into public.folha_itens
      (folha_id, colaborador_id, centro_custo_id, salario_base, gratificacao,
       horas_normais, horas_extras, valor_extras, encargos, encargos_percentual,
       desconto_percentual, descontos,
       inss, irrf, adiantamentos, custo_total, valor_liquido, editado_manualmente)
    values
      (v_folha, v_colab.id, v_cc, v_base, v_grat,
       v_hn, v_he, v_extras, 0, null,
       v_desc_pct, v_desconto,
       v_inss, v_irrf, v_adiant, v_base + v_grat, v_liquido, v_manual)
    returning id into v_item_id;

    -- Encargos e provisao discriminados. A BASE E O SALARIO BASE, sem
    -- gratificacao: e a regra do Tiago, e o unico lugar onde ela e aplicada.
    -- Percentual NULL: o encargo patronal vem so da configuracao, porque o
    -- percentual por pessoa agora e desconto.
    perform public.fn_folha_aplicar_encargos_e_provisoes(v_item_id, v_base, null);

    select encargos, provisoes into v_encargos, v_provisoes
    from public.folha_itens where id = v_item_id;

    -- Custo da empresa: base + gratificacao + extras + encargos + provisao.
    -- INSS/IRRF e o desconto por pessoa sao desconto do trabalhador: NAO entram
    -- no custo da empresa, porque o dinheiro sai da conta do mesmo jeito.
    v_custo := v_base + v_grat + v_extras + v_encargos + v_provisoes;
    update public.folha_itens set custo_total = v_custo where id = v_item_id;
  end loop;

  perform public.fn_folha_recalcular_totais(v_folha);

  return v_folha;
end $function$;
