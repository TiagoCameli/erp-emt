-- Desligamento do colaborador com data e motivo, e a folha passando a pagar
-- proporcional aos dias trabalhados no mês.
--
-- Esta é a PRIMEIRA metade do pedido "gerar rescisão e desligar o funcionário".
-- Ela não cria rescisão nenhuma: cria o DADO sem o qual nenhuma verba de
-- rescisão existe, e conserta o efeito colateral que o desligamento causaria na
-- folha.
--
-- =====================================================================
-- POR QUE `data_demissao` E NÃO SÓ O CHECKBOX `ativo`
-- =====================================================================
--
-- Hoje "desligar alguém" é desmarcar `ativo` no cadastro. O sistema esquece
-- QUANDO e POR QUÊ, e as duas informações são exatamente as que a rescisão
-- precisa: sem a data não há dias trabalhados, não há avos de 13º nem de
-- férias, não há aviso proporcional, e não há como decidir se a pessoa entra na
-- folha deste mês. `ativo` responde "está aqui agora?"; a rescisão pergunta
-- "até quando esteve?".
--
-- As duas colunas são independentes de propósito. Aviso prévio TRABALHADO tem
-- data de desligamento no futuro e a pessoa continua ativa até lá; um cadastro
-- pode ser desativado por engano de digitação e nunca ter tido demissão. Um
-- CHECK amarrando as duas transformaria os dois casos legítimos em erro de
-- banco na cara de quem está só corrigindo um cadastro.
--
-- =====================================================================
-- POR QUE A FOLHA PASSA A SER PROPORCIONAL — E POR QUE ISSO MUDA PARA TODOS
-- =====================================================================
--
-- Decisão do Tiago em 29/08/2026, escolhendo entre três desenhos: quem sai dia
-- 15 recebe 15/30 do salário NA FOLHA daquele mês, e a rescisão paga só as
-- verbas legais, sem repetir saldo de salário. Um valor, um lugar.
--
-- A consequência atravessa quem nunca vai ser demitido: `fn_gerar_folha` hoje
-- não olha `data_admissao`, então quem é ADMITIDO dia 20 também recebe o mês
-- cheio. Corrigir a demissão sem corrigir a admissão deixaria a folha
-- proporcional só na metade em que ela tira dinheiro de alguém, o que é a pior
-- metade para se estar sozinho. As duas pontas entram juntas.
--
-- Quem não tem NENHUMA das duas datas continua recebendo o mês cheio, byte por
-- byte como hoje. Isso não é detalhe: 38 dos 59 colaboradores ativos estão sem
-- `data_admissao`, e uma proporcionalidade que tratasse "não sei" como "não
-- trabalhou" zeraria a folha de dois terços da empresa.
--
-- =====================================================================
-- POR QUE 30 AVOS, E NÃO OS DIAS DO CALENDÁRIO
-- =====================================================================
--
-- Salário mensal se divide por 30 no Brasil, em qualquer mês. Dividir pelos
-- dias reais faria o mesmo dia de trabalho valer menos em janeiro (1/31) do que
-- em fevereiro (1/28), e o mês inteiro de fevereiro pagaria 28/28 = cheio pelo
-- mesmo caminho que janeiro pagaria 31/31 — dois avos diferentes para o mesmo
-- salário. Por isso `fn_folha_avos_do_mes` devolve 30 para o mês inteiro
-- (independente de ter 28, 30 ou 31 dias) e o número de dias, teto 30, para o
-- mês parcial.

-- =====================================================================
-- 1. As colunas do desligamento
-- =====================================================================

alter table public.colaboradores
  add column if not exists data_demissao date,
  add column if not exists motivo_desligamento text,
  add column if not exists tipo_rescisao text;

comment on column public.colaboradores.data_demissao is
  'Último dia do contrato. Independente de `ativo`: aviso prévio trabalhado tem data no futuro com a pessoa ainda ativa.';
comment on column public.colaboradores.motivo_desligamento is
  'Texto livre escrito por quem desligou. A auditoria reconstrói quem e quando; o porquê é a única parte que só existe se alguém escrever.';
comment on column public.colaboradores.tipo_rescisao is
  'Tipo declarado pelo Tiago em 29/08/2026: sem_justa_causa, pedido_demissao, termino_experiencia, justa_causa.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'colaboradores_tipo_rescisao_check') then
    alter table public.colaboradores
      add constraint colaboradores_tipo_rescisao_check
      check (tipo_rescisao is null or tipo_rescisao in
        ('sem_justa_causa', 'pedido_demissao', 'termino_experiencia', 'justa_causa'));
  end if;

  -- Demissão antes da admissão é digitação trocada, não caso de negócio. Os
  -- dois lados aceitam null porque a admissão falta em 38 cadastros e exigir
  -- ela aqui travaria o desligamento de quem já trabalha na empresa.
  if not exists (select 1 from pg_constraint where conname = 'colaboradores_demissao_depois_da_admissao') then
    alter table public.colaboradores
      add constraint colaboradores_demissao_depois_da_admissao
      check (data_demissao is null or data_admissao is null or data_demissao >= data_admissao);
  end if;
end $$;

-- =====================================================================
-- 2. Os avos do mês
-- =====================================================================
--
-- Função própria, e não expressão inline no loop, por dois motivos: a
-- `fn_gerar_folha` é alterada por âncora (ela tem ~16 mil caracteres e várias
-- frentes mexem nela), então quanto menor o trecho trocado menor o risco; e a
-- regra passa a ter UM lugar, que a rescisão e os testes leem sem copiar.

create or replace function public.fn_folha_avos_do_mes(
  p_admissao date,
  p_demissao date,
  p_competencia date
) returns integer
language sql
immutable
set search_path to ''
as $$
  select case
    -- Mês inteiro é sempre 30 avos, tenha o mês 28, 30 ou 31 dias.
    when d.trabalhados >= d.no_mes then 30
    -- Mês parcial: os dias, com teto de 30 (mês de 31 dias trabalhado do dia 1
    -- ao 31 já caiu no ramo acima; o teto aqui protege qualquer aritmética que
    -- passe de 30 por data fora do mês).
    else greatest(least(d.trabalhados, 30), 0)
  end
  from (
    select
      (least(coalesce(p_demissao, m.ultimo), m.ultimo)
        - greatest(coalesce(p_admissao, m.primeiro), m.primeiro) + 1) as trabalhados,
      (m.ultimo - m.primeiro + 1) as no_mes
    from (
      select date_trunc('month', p_competencia)::date as primeiro,
             (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date as ultimo
    ) m
  ) d;
$$;

comment on function public.fn_folha_avos_do_mes(date, date, date) is
  'Avos de 30 que o colaborador trabalhou na competência. Sem admissão e sem demissão devolve 30 (mês cheio), que é o comportamento da folha antes de 29/08/2026.';

revoke all on function public.fn_folha_avos_do_mes(date, date, date) from public;
grant execute on function public.fn_folha_avos_do_mes(date, date, date) to authenticated;

-- =====================================================================
-- 3. A folha guarda quantos avos pagou
-- =====================================================================
--
-- Sem esta coluna a tela teria de recalcular os avos a partir das datas do
-- CADASTRO, e o dia em que alguém corrigisse a data de admissão a folha
-- APROVADA passaria a se explicar com um número diferente do que ela pagou. O
-- item guarda o próprio avo, como já guarda o próprio salário.

alter table public.folha_itens
  add column if not exists dias_trabalhados smallint;

comment on column public.folha_itens.dias_trabalhados is
  'Avos de 30 usados para proporcionalizar este item. Null = item gerado antes de 29/08/2026, quando a folha sempre pagava o mês cheio.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'folha_itens_dias_trabalhados_check') then
    alter table public.folha_itens
      add constraint folha_itens_dias_trabalhados_check
      check (dias_trabalhados is null or dias_trabalhados between 0 and 30);
  end if;
end $$;

-- =====================================================================
-- 4. `fn_gerar_folha` passa a proporcionalizar
-- =====================================================================
--
-- Alterada POR ÂNCORA, e não reescrita: ela tem ~16 mil caracteres e várias
-- frentes mexem nela (três migrations só em 29/08/2026). Um `create or replace`
-- com a versão que eu li apagaria em silêncio o trabalho de quem alterou entre
-- a minha leitura e o apply — sem conflito, sem erro, sem aviso.
--
-- As QUATRO trocas acontecem sobre a MESMA leitura e viram UM `create or
-- replace` só. Quatro execuções seguidas deixariam a função existir em estados
-- intermediários — por exemplo com `v_avos` usado no insert e ainda não
-- declarado — e um erro no meio pararia a folha da empresa numa versão que não
-- compila.

do $patch$
declare
  v_oid oid;
  v_def text;
  v_novo_def text;

  -- (1) O loop precisa das duas datas.
  a_select text := '           coalesce(c.gratificacao, 0) as gratificacao,
           c.desconto_valor';
  n_select text := '           coalesce(c.gratificacao, 0) as gratificacao,
           c.desconto_valor,
           c.data_admissao,
           c.data_demissao';

  -- (2) Desligado entra na folha do mês em que saiu.
  a_where text := '    from public.colaboradores c
    where c.ativo and c.vinculo in (''clt'', ''terceiro'', ''diarista'')';
  n_where text := '    from public.colaboradores c
    where (
            c.ativo
            -- Desligado continua entrando na folha da competencia em que saiu (e
            -- nas anteriores, se alguem regerar). Sem esta perna, `ativo = false`
            -- tiraria a pessoa da propria folha que tem de pagar os dias que ela
            -- trabalhou, e o desligamento viraria calote silencioso do ultimo mes.
            or (c.data_demissao is not null and c.data_demissao >= v_ini)
          )
      and c.vinculo in (''clt'', ''terceiro'', ''diarista'')';

  -- (3) A declaração de v_avos.
  a_decl text := '  v_disponivel numeric; v_par record; v_desc_par numeric; v_trava date;
begin';
  n_decl text := '  v_disponivel numeric; v_par record; v_desc_par numeric; v_trava date;
  -- Avos de 30 trabalhados na competencia (29/08/2026). Null para diarista, que
  -- ja e proporcional por construcao.
  v_avos integer;
begin';

  -- (4) A proporcionalidade, logo antes da reaplicação da edição manual.
  a_prop text := '    v_grat := v_colab.gratificacao;
    v_desc_val := v_colab.desconto_valor;
    v_manual := false;';
  n_prop text := '    v_grat := v_colab.gratificacao;
    v_desc_val := v_colab.desconto_valor;
    v_manual := false;

    -- ===== Proporcionalidade por dias trabalhados (29/08/2026) =====
    -- Quem entra ou sai no meio do mes recebe os avos que trabalhou. Decisao do
    -- Tiago: a folha do mes do desligamento paga os dias, e a rescisao NAO
    -- repete saldo de salario. Um valor, um lugar.
    -- Diarista fica de fora: o mes dele ja e a soma das diarias que ele fez, e
    -- aplicar avos ali cortaria o mesmo mes duas vezes.
    -- O `if` interno existe para que o cadastro SEM datas nao passe nem pelo
    -- round: 38 dos 59 colaboradores ativos estao sem data_admissao, e para eles
    -- nada muda. `fn_folha_avos_do_mes` devolveria 30 do mesmo jeito, mas a
    -- garantia fica explicita no codigo em vez de depender da funcao.
    v_avos := null;
    if v_colab.vinculo <> ''diarista'' then
      v_avos := 30;
      if v_colab.data_admissao is not null or v_colab.data_demissao is not null then
        v_avos := public.fn_folha_avos_do_mes(v_colab.data_admissao, v_colab.data_demissao, v_ini);
        v_base := round(v_base * v_avos / 30.0, 2);
        -- A gratificacao acompanha o salario. Ela e valor MENSAL fixo: quem
        -- trabalhou tres dias teria o salario cortado e o penduricalho inteiro.
        -- A edicao manual continua mandando, porque e reaplicada logo abaixo.
        v_grat := round(v_grat * v_avos / 30.0, 2);
      end if;
    end if;';

  -- (5) O item guarda os avos que pagou.
  a_ins_cols text := '       inss, irrf, adiantamentos, custo_total, valor_liquido, editado_manualmente)';
  n_ins_cols text := '       inss, irrf, adiantamentos, custo_total, valor_liquido, editado_manualmente,
       dias_trabalhados)';
  a_ins_vals text := '       v_inss, v_irrf, v_adiant, v_base + v_grat, v_liquido, v_manual)
    returning id into v_item_id;';
  n_ins_vals text := '       v_inss, v_irrf, v_adiant, v_base + v_grat, v_liquido, v_manual,
       v_avos)
    returning id into v_item_id;';
begin
  select p.oid into strict v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  v_def := pg_get_functiondef(v_oid);
  v_novo_def := v_def;

  -- Conferir CADA âncora antes de trocar. Sem isto, uma mudança de indentação
  -- feita por outra frente faz o replace não casar, a função é recriada
  -- IDÊNTICA e a migration termina com `success` sem ter feito nada: a coluna
  -- `data_demissao` existiria e a folha continuaria pagando mês cheio.
  if position(a_select   in v_novo_def) = 0 then raise exception 'Ancora (1) select do loop de colaboradores nao encontrada em fn_gerar_folha'; end if;
  v_novo_def := replace(v_novo_def, a_select, n_select);

  if position(a_where    in v_novo_def) = 0 then raise exception 'Ancora (2) where do loop de colaboradores nao encontrada em fn_gerar_folha'; end if;
  v_novo_def := replace(v_novo_def, a_where, n_where);

  if position(a_decl     in v_novo_def) = 0 then raise exception 'Ancora (3) bloco declare nao encontrada em fn_gerar_folha'; end if;
  v_novo_def := replace(v_novo_def, a_decl, n_decl);

  if position(a_prop     in v_novo_def) = 0 then raise exception 'Ancora (4) atribuicao de gratificacao nao encontrada em fn_gerar_folha'; end if;
  v_novo_def := replace(v_novo_def, a_prop, n_prop);

  if position(a_ins_cols in v_novo_def) = 0 then raise exception 'Ancora (5a) colunas do insert de folha_itens nao encontrada em fn_gerar_folha'; end if;
  v_novo_def := replace(v_novo_def, a_ins_cols, n_ins_cols);

  if position(a_ins_vals in v_novo_def) = 0 then raise exception 'Ancora (5b) values do insert de folha_itens nao encontrada em fn_gerar_folha'; end if;
  v_novo_def := replace(v_novo_def, a_ins_vals, n_ins_vals);

  execute v_novo_def;

  -- E conferir DEPOIS que entrou: `execute` de um create or replace não reclama
  -- se o texto novo for igual ao antigo.
  if position('fn_folha_avos_do_mes' in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'A proporcionalidade nao entrou em fn_gerar_folha';
  end if;
  if position('c.data_demissao >= v_ini' in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'O filtro do desligado nao entrou em fn_gerar_folha';
  end if;
  if position('dias_trabalhados' in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'A gravacao dos avos nao entrou em fn_gerar_folha';
  end if;
end $patch$;
