-- =============================================================
-- Folha: editar o item inteiro, e nao so o salario
-- =============================================================
-- PEDIDO DO TIAGO (29/08/2026): "nessa pagina quero poder editar qualquer coisa
-- nos itens da folha, eu quero clicar na linha do funcionario". Perguntado
-- quais colunas, ele escolheu OS CAMPOS DE ENTRADA.
--
-- A tabela da folha mostra 14 colunas, e elas nao sao a mesma coisa:
--
--   ENTRADA (o que alguem decide) ...... centro de custo, salario base,
--                                        gratificacao, horas normais, horas
--                                        extras, valor de extras, desconto
--   DERIVADO (o que sai de conta) ...... INSS, IRRF, encargos, provisao,
--                                        custo total, liquido
--   DO CADASTRO ........................ vinculo, funcao
--   COM CASCATA PROPRIA ................ adiantamentos
--
-- Editavel = so a primeira lista. Derivado nao vira campo porque campo de
-- derivado e um numero que para de bater com as parcelas dele no primeiro
-- salvamento, e ninguem descobre por qual delas. Vinculo e funcao nao viram
-- campo porque o Regerar devolveria o valor do cadastro por cima, calado.
-- Adiantamento fica de fora pelo motivo que ja estava escrito na funcao: a
-- cascata dele atravessa competencias, e mexer aqui moveria dinheiro de OUTROS
-- meses.
--
-- ============================================================
-- O QUE ENTRA DE NOVO
-- ============================================================
--   centro_custo_id .... e o que destrava a aprovacao. Hoje um item da folha de
--                        08/2026 esta com centro nulo e a aprovacao morre em
--                        "Escolha o centro de custo". Nao havia tela para
--                        resolver: so mexendo no cadastro e regerando.
--                        OBRIGATORIO aqui -- regra de ouro do projeto, nenhum
--                        custo existe sem centro de custo.
--   horas_normais ...... vinham so de apontamento aprovado, e apontamento nao
--   horas_extras ....... existe para terceiro nem para diarista.
--   valor_extras ....... nascia SEMPRE 0 na geracao ("salario fechado nao paga
--                        extra"). Sem campo, nao havia como pagar um extra sem
--                        embutir no salario base e mentir na base de encargo.
--
-- ============================================================
-- O REGERAR TEM DE PRESERVAR TUDO ISSO
-- ============================================================
-- `fn_gerar_folha` apaga os itens e recria. Ela ja guardava um snapshot do que
-- foi editado a mao, mas so de TRES campos: salario_base, gratificacao,
-- descontos. Campo editavel que nao esta no snapshot e uma armadilha: a pessoa
-- edita, clica em Regerar por outro motivo, e o valor volta ao do cadastro sem
-- nada avisar -- a unica pista seria o total do rodape ter mudado.
--
-- Entao o snapshot passa a levar os quatro novos MAIS o `desconto_horas`, que
-- ja era editavel e ja se perdia no Regerar desde que existe (o valor do
-- desconto sobrevivia, o motivo em horas nao). Bug antigo, corrigido de carona
-- porque e a mesma linha de codigo.
--
-- A reaplicacao do centro, das horas e do extra vem num segundo bloco, DEPOIS
-- do calculo de apontamento e da escolha do centro por diaria: reaplicar junto
-- com o salario (que e antes) seria sobrescrito pelo proprio laco logo em
-- seguida.

-- ---------------------------------------------------------------
-- fn_editar_item_folha: assinatura nova
-- ---------------------------------------------------------------
-- DROP + CREATE, e nao CREATE OR REPLACE: `replace` nao muda assinatura, ele
-- cria uma SEGUNDA funcao sobrecarregada, e o PostgREST passaria a escolher
-- entre as duas por nome de argumento -- as chamadas antigas continuariam indo
-- para a versao velha, que nao grava centro de custo, sem erro nenhum.
drop function if exists public.fn_editar_item_folha(uuid, numeric, numeric, numeric, numeric);

create function public.fn_editar_item_folha(
  p_item uuid,
  p_salario_base numeric,
  p_gratificacao numeric,
  p_centro_custo uuid,
  p_horas_normais numeric,
  p_horas_extras numeric,
  p_valor_extras numeric,
  p_desconto numeric default 0,
  p_desconto_horas numeric default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_folha uuid; v_status text; v_comp date;
  v_colab uuid; v_vinculo text; v_nome text;
  v_extras numeric; v_adiant numeric;
  v_inss numeric; v_irrf numeric;
  v_desconto numeric;
  v_hn numeric; v_he numeric;
  v_encargos numeric; v_provisoes numeric;
  v_disponivel numeric; v_liquido numeric;
  v_sobra numeric;
  -- Teto fisico das horas do mes: 31 dias de 24 horas. Nao e jornada, e
  -- impossibilidade -- serve so para pegar dedo escorregado (2000 no lugar de
  -- 200), nao para julgar escala de trabalho.
  v_horas_max constant numeric := 744;
begin
  if not public.tem_permissao('rh.folha', 'editar') then
    raise exception 'Sem permissao para editar a folha';
  end if;

  -- Faixas dos parametros, antes de qualquer leitura: mensagem de entrada ruim
  -- e mais util que constraint violation.
  if p_salario_base is null or p_salario_base < 0 then
    raise exception 'O salario base nao pode ser negativo';
  end if;
  if p_gratificacao is null or p_gratificacao < 0 then
    raise exception 'A gratificacao nao pode ser negativa';
  end if;

  -- Centro de custo OBRIGATORIO: regra de ouro do projeto, nenhum custo existe
  -- sem centro de custo. Item sem centro chega ate a aprovacao e morre la, no
  -- trigger que exige centro no lancamento -- longe daqui, onde daria para
  -- resolver.
  if p_centro_custo is null then
    raise exception 'Escolha o centro de custo desta linha: nenhum custo da folha existe sem centro de custo.';
  end if;
  -- `ativo` junto com a existencia: centro inativado continua na tabela, e
  -- deixar a folha apontar para ele empurraria o problema para a aprovacao.
  if not exists (
    select 1 from public.centros_custo cc
    where cc.id = p_centro_custo and cc.ativo
  ) then
    raise exception 'Centro de custo invalido ou inativo';
  end if;

  -- Horas sao informativas (nao entram em conta nenhuma), mas numero absurdo
  -- gravado vira relatorio absurdo depois.
  if p_horas_normais is null or p_horas_normais < 0 or p_horas_normais > v_horas_max then
    raise exception 'As horas normais precisam estar entre 0 e % (o mes inteiro, 24h por dia).', v_horas_max;
  end if;
  if p_horas_extras is null or p_horas_extras < 0 or p_horas_extras > v_horas_max then
    raise exception 'As horas extras precisam estar entre 0 e % (o mes inteiro, 24h por dia).', v_horas_max;
  end if;

  -- O valor de extras ENTRA no custo e no liquido. Vem por parametro agora, e
  -- nao mais lido da linha: era sempre 0 porque a geracao nao paga extra, e sem
  -- campo o unico jeito de pagar um extra era inflar o salario base -- o que
  -- muda a base do encargo e da provisao e erra o custo da empresa.
  if p_valor_extras is null or p_valor_extras < 0 then
    raise exception 'O valor de extras nao pode ser negativo';
  end if;
  v_extras := p_valor_extras;
  v_hn := p_horas_normais;
  v_he := p_horas_extras;

  -- Nulo vale zero: o campo vazio na tela e "sem desconto", e sem desconto e
  -- R$ 0,00. Nao ha mais dois jeitos de dizer a mesma coisa.
  v_desconto := coalesce(p_desconto, 0);
  if v_desconto < 0 then
    raise exception 'O desconto nao pode ser negativo';
  end if;
  -- As horas nao trabalhadas: 200 e o mes inteiro (a mesma constante da tela).
  -- Nulo e legitimo e significa "o desconto nao foi informado por horas".
  if p_desconto_horas is not null
     and (p_desconto_horas < 0 or p_desconto_horas > 200) then
    raise exception 'As horas nao trabalhadas precisam estar entre 0 e 200 (o mes inteiro)';
  end if;

  -- Descobre a folha sem lock, trava a folha, e so depois trava o item. Nesta
  -- ordem porque a fn_aprovar_folha tambem trava folhas primeiro: inverter aqui
  -- criaria deadlock entre editar e aprovar.
  select folha_id into v_folha from public.folha_itens where id = p_item;
  if v_folha is null then raise exception 'Item da folha nao encontrado'; end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = v_folha for update;

  if v_status <> 'rascunho' then
    raise exception 'A folha de %/% esta em "%": só da para alterar valores em rascunho. Rejeite ou desaprove antes de editar.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;

  select fi.colaborador_id, fi.adiantamentos, c.vinculo, c.nome
  into v_colab, v_adiant, v_vinculo, v_nome
  from public.folha_itens fi
  join public.colaboradores c on c.id = fi.colaborador_id
  where fi.id = p_item
  for update of fi;

  if v_colab is null then raise exception 'Item da folha nao encontrado'; end if;

  if p_salario_base = 0 and p_gratificacao = 0 then
    raise exception 'Salario base e gratificacao nao podem ser os dois zero: uma linha de R$ 0,00 nao tem por que existir na folha. Se % nao entra nesta folha, tire o valor do cadastro e regere.', v_nome;
  end if;

  -- Descontos legais so para CLT, mesma regra da geracao, e pelas MESMAS
  -- funcoes. Base = salario base + gratificacao.
  if v_vinculo = 'clt' then
    v_inss := public.fn_folha_inss(p_salario_base + p_gratificacao);
    v_irrf := public.fn_folha_irrf(p_salario_base + p_gratificacao, v_inss, v_colab);
  else
    v_inss := 0;
    v_irrf := 0;
  end if;

  -- A TRAVA QUE O PERCENTUAL DAVA DE GRACA. Entre 0 e 100 por cento, o desconto
  -- nunca passava do salario. Em reais nao ha limite implicito: R$ 12.100,00
  -- digitado no lugar de R$ 121,00 zeraria o liquido pelo greatest() la embaixo e
  -- a folha aprovaria com a pessoa recebendo nada, sem erro nenhum. A fronteira
  -- e a mesma de antes, dita em reais: o desconto nao pode comer mais do que
  -- sobra do bruto depois dos descontos legais.
  v_sobra := p_salario_base + p_gratificacao + v_extras - v_inss - v_irrf;
  if v_desconto > v_sobra then
    raise exception 'O desconto de R$ % passa do que sobra do salario de %: bruto R$ % menos INSS R$ % e IRRF R$ % deixa R$ %. Liquido negativo nao existe.',
      to_char(v_desconto, 'FM999999999990.00'), v_nome,
      to_char(p_salario_base + p_gratificacao + v_extras, 'FM999999999990.00'),
      to_char(v_inss, 'FM999999999990.00'), to_char(v_irrf, 'FM999999999990.00'),
      to_char(v_sobra, 'FM999999999990.00');
  end if;

  -- O adiantamento NAO e recalculado aqui, de proposito. A cascata de desconto
  -- atravessa competencias (o que nao cabe no mes vira parcela nova na proxima
  -- folha, marcada com a folha que a empurrou), e refazer isso a cada edicao de
  -- linha moveria dinheiro de OUTROS meses sem que ninguem tenha pedido.
  -- Quando o valor novo nao cobre o que ESTA folha ja descontou, a edicao para
  -- e manda regerar — o Regerar e quem sabe refazer a cascata inteira, com as
  -- travas dele. Alternativa recusada: cortar o adiantamento para caber, que
  -- cobraria do colaborador menos do que o plano diz sem registrar em lugar
  -- nenhum que o plano mudou.
  --
  -- O DESCONTO ENTRA NESTA CONTA. Sem ele, um desconto alto passaria a trava e
  -- o liquido sairia negativo: o colaborador "devendo" para a folha, que e
  -- estado impossivel e ninguem cobraria.
  v_disponivel := greatest(v_sobra - v_desconto, 0);
  if v_disponivel < v_adiant then
    raise exception 'Nao da para deixar % com esse valor: o adiantamento ja descontado dele nesta folha e % e o valor novo deixa so % disponivel, o que daria liquido negativo. Regere a folha para recalcular o adiantamento.',
      v_nome, v_adiant, v_disponivel;
  end if;
  v_liquido := v_disponivel - v_adiant;

  -- Reescreve as linhas de encargo e de provisao ANTES do update final, para
  -- que o custo total seja fechado numa unica escrita no item. A base e o
  -- SALARIO BASE: a gratificacao nao entra em encargo nem em provisao, e o
  -- extra tambem nao.
  --
  -- Passa NULL como percentual de encargo: o encargo patronal vem so da
  -- configuracao (folha_encargos) agora, porque o percentual que a tela oferecia
  -- deixou de ser encargo, virou desconto, e agora nem percentual e mais.
  perform public.fn_folha_aplicar_encargos_e_provisoes(
    p_item, p_salario_base, null);

  select encargos, provisoes into v_encargos, v_provisoes
  from public.folha_itens where id = p_item;

  update public.folha_itens
     set salario_base = p_salario_base,
         gratificacao = p_gratificacao,
         centro_custo_id = p_centro_custo,
         horas_normais = v_hn,
         horas_extras = v_he,
         valor_extras = v_extras,
         descontos = v_desconto,
         -- As horas do desconto. Nulo quando o valor foi digitado direto: a
         -- coluna guarda o MOTIVO, e "sem motivo declarado" e um estado legitimo.
         desconto_horas = p_desconto_horas,
         encargos_percentual = null,
         inss = v_inss,
         irrf = v_irrf,
         valor_liquido = v_liquido,
         -- Custo da empresa: o desconto NAO entra. O dinheiro sai da conta
         -- igual; o desconto so muda quem fica com ele.
         custo_total = p_salario_base + p_gratificacao + v_extras
                       + v_encargos + v_provisoes,
         editado_manualmente = true
   where id = p_item;

  perform public.fn_folha_recalcular_totais(v_folha);
end;
$function$;

comment on function public.fn_editar_item_folha(uuid, numeric, numeric, uuid, numeric, numeric, numeric, numeric, numeric) is
$doc$Altera uma linha da folha em rascunho: centro de custo, salario base, gratificacao, horas normais, horas extras, valor de extras e desconto (valor + motivo em horas).

Derivado nao entra: INSS, IRRF, encargos, provisao, custo total e liquido sao recalculados a partir do que foi informado.

Centro de custo e obrigatorio e tem de estar ativo. Marca editado_manualmente = true, e o Regerar preserva TODOS estes campos.

Recusa quando o valor novo nao cobre o adiantamento ja descontado nesta folha — a cascata de adiantamento so e refeita pelo Regerar.$doc$;

-- Funcao nova nasce com EXECUTE para PUBLIC. O revoke vem antes do grant.
revoke all on function public.fn_editar_item_folha(uuid, numeric, numeric, uuid, numeric, numeric, numeric, numeric, numeric)
  from public, anon;
grant execute on function public.fn_editar_item_folha(uuid, numeric, numeric, uuid, numeric, numeric, numeric, numeric, numeric)
  to authenticated;

-- ---------------------------------------------------------------
-- fn_gerar_folha: o Regerar preserva o que foi editado a mao
-- ---------------------------------------------------------------
-- Editada por ANCORA a partir da definicao viva: varias frentes mexem nesta
-- funcao e `create or replace` sobrescreve sem dar conflito.
do $gerar$
declare
  v_def text; v_novo text; v_n int;
  a_val text;  r_val text;
  a_snap text; r_snap text;
  a_cc text;   r_cc text;
  a_ins text;  r_ins text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';
  if v_def is null then
    raise exception 'fn_gerar_folha nao existe.';
  end if;

  -- (1) o snapshot passa a levar tudo que a edicao de item grava.
  a_snap := $a$    select coalesce(jsonb_object_agg(colaborador_id::text, jsonb_build_object(
             'salario_base', salario_base,
             'gratificacao', gratificacao,
             'descontos', descontos)), '{}'::jsonb)
    into v_manuais
    from public.folha_itens
    where folha_id = v_folha and editado_manualmente;$a$;
  r_snap := $r$    -- TODOS os campos que a fn_editar_item_folha grava, e nao so os tres de
    -- dinheiro. Campo editavel fora deste objeto e armadilha: a pessoa edita,
    -- clica em Regerar por outro motivo, e o valor volta ao do cadastro em
    -- silencio. `desconto_horas` entrou junto em 29/08/2026 — ele ja era
    -- editavel e ja se perdia aqui desde sempre (o valor do desconto
    -- sobrevivia, o motivo em horas nao).
    select coalesce(jsonb_object_agg(colaborador_id::text, jsonb_build_object(
             'salario_base', salario_base,
             'gratificacao', gratificacao,
             'descontos', descontos,
             'desconto_horas', desconto_horas,
             'centro_custo_id', centro_custo_id,
             'horas_normais', horas_normais,
             'horas_extras', horas_extras,
             'valor_extras', valor_extras)), '{}'::jsonb)
    into v_manuais
    from public.folha_itens
    where folha_id = v_folha and editado_manualmente;$r$;

  -- (2) reaplicacao do centro, das horas e do extra. Vem DEPOIS da escolha do
  --     centro por diaria e do calculo de apontamento: reaplicar junto com o
  --     salario (que e antes no laco) seria sobrescrito logo em seguida.
  a_cc := $a$    if v_cc is null then v_cc := v_colab.centro_custo_id; end if;$a$;
  r_cc := $r$    if v_cc is null then v_cc := v_colab.centro_custo_id; end if;

    -- Segunda metade da reaplicacao manual. A primeira (salario, gratificacao,
    -- desconto) fica la em cima porque precisa valer ANTES do `continue` que
    -- descarta linha zerada. Estes quatro so existem depois do apontamento e da
    -- escolha do centro, entao so aqui da para sobrepo-los.
    if v_man is not null then
      -- `?` e nao `->>`: folha editada ANTES de 29/08/2026 tem snapshot com tres
      -- chaves so, e ali `->>` devolveria null e apagaria o centro de custo de
      -- quem nunca pediu isso.
      if v_man ? 'centro_custo_id' and v_man ->> 'centro_custo_id' is not null then
        v_cc := (v_man ->> 'centro_custo_id')::uuid;
      end if;
      if v_man ? 'horas_normais' then v_hn := (v_man ->> 'horas_normais')::numeric; end if;
      if v_man ? 'horas_extras' then v_he := (v_man ->> 'horas_extras')::numeric; end if;
      if v_man ? 'valor_extras' then v_extras := (v_man ->> 'valor_extras')::numeric; end if;
    end if;$r$;

  -- (3) o insert grava o motivo em horas do desconto, que ele nunca gravou.
  a_ins := $a$      (folha_id, colaborador_id, centro_custo_id, salario_base, gratificacao,
       horas_normais, horas_extras, valor_extras, encargos, encargos_percentual,
       descontos,
       inss, irrf, adiantamentos, custo_total, valor_liquido, editado_manualmente)$a$;
  r_ins := $r$      (folha_id, colaborador_id, centro_custo_id, salario_base, gratificacao,
       horas_normais, horas_extras, valor_extras, encargos, encargos_percentual,
       descontos, desconto_horas,
       inss, irrf, adiantamentos, custo_total, valor_liquido, editado_manualmente)$r$;

  v_n := (length(v_def) - length(replace(v_def, a_snap, ''))) / length(a_snap);
  if v_n <> 1 then raise exception 'Ancora do snapshot aparece % vez(es), esperava 1.', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, a_cc, ''))) / length(a_cc);
  if v_n <> 1 then raise exception 'Ancora do centro de custo aparece % vez(es), esperava 1.', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, a_ins, ''))) / length(a_ins);
  if v_n <> 1 then raise exception 'Ancora do insert aparece % vez(es), esperava 1.', v_n; end if;

  v_novo := replace(v_def, a_snap, r_snap);
  v_novo := replace(v_novo, a_cc, r_cc);
  v_novo := replace(v_novo, a_ins, r_ins);

  -- O valor do desconto_horas no VALUES, na mesma posicao em que a coluna
  -- entrou. Feito por ancora separada porque a lista de valores nao e vizinha
  -- da lista de colunas no texto.
  a_val := $a$       v_desconto,
       v_inss, v_irrf, v_adiant, v_base + v_grat, v_liquido, v_manual)$a$;
  r_val := $r$       v_desconto,
       case when v_man ? 'desconto_horas' then (v_man ->> 'desconto_horas')::numeric end,
       v_inss, v_irrf, v_adiant, v_base + v_grat, v_liquido, v_manual)$r$;
  v_n := (length(v_novo) - length(replace(v_novo, a_val, ''))) / length(a_val);
  if v_n <> 1 then raise exception 'Ancora dos valores do insert aparece % vez(es), esperava 1.', v_n; end if;
  v_novo := replace(v_novo, a_val, r_val);

  execute v_novo;
end $gerar$;

-- ---------------------------------------------------------------
-- PROVAS ESTATICAS
-- ---------------------------------------------------------------
do $estatico$
declare v_ger text; v_n int; v_args text;
begin
  -- (a) Existe UMA fn_editar_item_folha, com a assinatura nova. Duas seria o
  --     desastre silencioso do drop: o PostgREST escolheria por nome de
  --     argumento e a chamada antiga continuaria gravando sem centro de custo.
  select count(*), string_agg(pg_get_function_identity_arguments(p.oid), ' | ')
  into v_n, v_args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_editar_item_folha';
  if v_n <> 1 then
    raise exception 'Existem % versoes de fn_editar_item_folha: %', v_n, v_args;
  end if;
  if position('p_centro_custo uuid' in v_args) = 0
     or position('p_valor_extras numeric' in v_args) = 0 then
    raise exception 'A assinatura nova nao tem os parametros esperados: %', v_args;
  end if;

  -- (b) O drop levou junto os privilegios; sem o grant de volta, o botao Salvar
  --     da tela morre em "permission denied" para todo mundo.
  if not has_function_privilege('authenticated',
      'public.fn_editar_item_folha(uuid, numeric, numeric, uuid, numeric, numeric, numeric, numeric, numeric)', 'EXECUTE') then
    raise exception 'authenticated perdeu o EXECUTE de fn_editar_item_folha.';
  end if;
  if has_function_privilege('anon',
      'public.fn_editar_item_folha(uuid, numeric, numeric, uuid, numeric, numeric, numeric, numeric, numeric)', 'EXECUTE') then
    raise exception 'anon ganhou o EXECUTE de fn_editar_item_folha.';
  end if;

  select pg_get_functiondef(p.oid) into v_ger
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  -- (c) O snapshot do Regerar leva os OITO campos. Contar um a um: se faltar
  --     qualquer um, aquele campo vira armadilha (edita, regera, some).
  foreach v_args in array array['salario_base', 'gratificacao', 'descontos',
                                'desconto_horas', 'centro_custo_id',
                                'horas_normais', 'horas_extras', 'valor_extras']
  loop
    if position('''' || v_args || ''', ' || v_args in v_ger) = 0 then
      raise exception 'O snapshot do Regerar nao guarda %.', v_args;
    end if;
  end loop;

  -- (d) A reaplicacao usa `?` e nao `->>` no centro de custo. Folha editada
  --     ANTES de hoje tem snapshot de tres chaves: com `->>` puro o centro
  --     viraria null no Regerar, e a folha inteira pararia de aprovar.
  if position('v_man ? ''centro_custo_id''' in v_ger) = 0 then
    raise exception 'A reaplicacao do centro de custo nao checa a presenca da chave.';
  end if;

  -- (e) O insert grava desconto_horas, que ele nunca gravou.
  if position('descontos, desconto_horas,' in v_ger) = 0 then
    raise exception 'O insert do Regerar nao grava desconto_horas.';
  end if;

  -- (f) A ancora nao levou junto o resto: estas sao de pernas diferentes da
  --     funcao (diaria, apontamento, encargo, adiantamento).
  if position('rh_apontamentos' in v_ger) = 0
     or position('fn_folha_aplicar_encargos_e_provisoes' in v_ger) = 0
     or position('gerada_por_folha_id' in v_ger) = 0 then
    raise exception 'A ancora levou junto outra parte da fn_gerar_folha.';
  end if;

  raise notice 'Provas estaticas ok.';
end $estatico$;

-- ---------------------------------------------------------------
-- PROVA COMPORTAMENTAL: edita, regera, e confere que sobreviveu
-- ---------------------------------------------------------------
-- O ponto inteiro desta migration e "o campo novo nao pode sumir no Regerar".
-- Isso nao se prova lendo texto de funcao: prova-se editando de verdade,
-- regerando de verdade, e olhando o que ficou. Tudo dentro de sub-bloco
-- terminado em `raise`, entao nada fica.
--
-- A LINHA DE CONTROLE E O CADASTRO. O ensaio escolhe valores DIFERENTES do que
-- o cadastro do colaborador tem, e exige que sejam diferentes antes de
-- comparar: se o Regerar tivesse voltado ao cadastro, os numeros bateriam com o
-- cadastro e nao com o que foi editado.
do $ensaio$
declare
  v_folha uuid; v_comp date; v_item uuid; v_colab uuid;
  v_editor uuid;
  v_cc_novo uuid; v_cc_cadastro uuid;
  v_base_novo numeric := 4321.11; v_base_cadastro numeric;
  v_extras_novo numeric := 777.77;
  v_hn_novo numeric := 191; v_he_novo numeric := 13;
  v_recusou_sem_centro boolean := false;
  v_erro text;
  -- Depois do Regerar
  v_cc_fim uuid; v_base_fim numeric; v_extras_fim numeric;
  v_hn_fim numeric; v_he_fim numeric; v_dh_fim numeric;
begin
  select id, competencia into v_folha, v_comp
  from public.folhas where status <> 'aprovado' order by competencia limit 1;

  -- Precisa das DUAS permissoes: editar a linha e regerar a folha (o Regerar
  -- exige rh.folha:criar). Com so uma delas o ensaio morreria no meio e a
  -- mensagem culparia a migration por um problema de matriz de permissao.
  select up.usuario_id into v_editor
  from public.usuario_permissoes up
  where up.recurso = 'rh.folha' and up.acao = 'editar'
    and exists (select 1 from public.usuario_permissoes u2
                where u2.usuario_id = up.usuario_id
                  and u2.recurso = 'rh.folha' and u2.acao = 'criar')
  limit 1;

  if v_folha is null or v_editor is null then
    raise warning 'ENSAIO NAO RODOU: folha mexivel=%, usuario que edita e regera=%', v_folha, v_editor;
    return;
  end if;

  -- Um item de CLT ou terceiro (nao diarista: o salario do diarista e a soma
  -- das diarias e o Regerar recalcula por outro caminho).
  select fi.id, fi.colaborador_id, fi.centro_custo_id, c.salario
  into v_item, v_colab, v_cc_cadastro, v_base_cadastro
  from public.folha_itens fi
  join public.colaboradores c on c.id = fi.colaborador_id
  where fi.folha_id = v_folha and c.vinculo <> 'diarista'
    and c.centro_custo_id is not null
  order by c.nome limit 1;

  if v_item is null then
    raise warning 'ENSAIO NAO RODOU: nenhum item nao-diarista com centro no cadastro.';
    return;
  end if;

  -- Um centro ativo DIFERENTE do que o cadastro daria.
  select cc.id into v_cc_novo
  from public.centros_custo cc
  where cc.ativo and cc.id is distinct from v_cc_cadastro
  order by cc.nome limit 1;

  if v_cc_novo is null or v_cc_novo = v_cc_cadastro then
    raise exception 'Nao achei centro ativo diferente do cadastro: a prova nao distinguiria nada.';
  end if;
  if coalesce(v_base_cadastro, 0) = v_base_novo then
    raise exception 'O salario do ensaio ficou igual ao do cadastro: a prova nao distinguiria nada.';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);

  begin
    update public.folhas set status = 'rascunho' where id = v_folha;

    -- ---- controle: sem centro de custo a funcao recusa ----
    begin
      perform public.fn_editar_item_folha(
        v_item, v_base_novo, 0, null, v_hn_novo, v_he_novo, v_extras_novo, 0, null);
      raise exception 'CONTROLE_PASSOU_E_NAO_DEVIA';
    exception when others then
      v_erro := sqlerrm;
      if v_erro = 'CONTROLE_PASSOU_E_NAO_DEVIA' then
        raise exception 'A funcao aceitou item sem centro de custo.';
      end if;
      v_recusou_sem_centro := position('Escolha o centro de custo' in v_erro) > 0;
    end;
    if not v_recusou_sem_centro then
      raise exception 'O controle do centro falhou por outro motivo: %', v_erro;
    end if;

    -- ---- edita de verdade ----
    perform public.fn_editar_item_folha(
      v_item, v_base_novo, 0, v_cc_novo, v_hn_novo, v_he_novo, v_extras_novo, 0, 7);

    -- ---- e REGERA, que e onde o valor sumia ----
    -- p_encargos_pct e legado e ignorado pela funcao, mas o argumento existe.
    perform public.fn_gerar_folha(v_comp, null);

    -- O item foi apagado e recriado: acha pelo colaborador, nao pelo id velho.
    select fi.centro_custo_id, fi.salario_base, fi.valor_extras,
           fi.horas_normais, fi.horas_extras, fi.desconto_horas
    into v_cc_fim, v_base_fim, v_extras_fim, v_hn_fim, v_he_fim, v_dh_fim
    from public.folha_itens fi
    where fi.folha_id = v_folha and fi.colaborador_id = v_colab;

    raise exception 'DESFAZER';
  exception when others then
    v_erro := sqlerrm;
    if v_erro <> 'DESFAZER' then
      raise exception 'Ensaio da edicao + Regerar falhou: %', v_erro;
    end if;
  end;

  perform set_config('request.jwt.claims', '', true);

  if v_cc_fim is null then
    raise exception 'Depois do Regerar o item sumiu: a prova nao mede nada.';
  end if;
  if v_cc_fim <> v_cc_novo then
    raise exception 'O centro de custo voltou para % (o do cadastro e %), e eu tinha posto %.',
      v_cc_fim, v_cc_cadastro, v_cc_novo;
  end if;
  if v_base_fim <> v_base_novo then
    raise exception 'O salario base voltou para % (cadastro %), e eu tinha posto %.',
      v_base_fim, v_base_cadastro, v_base_novo;
  end if;
  if v_extras_fim <> v_extras_novo then
    raise exception 'O valor de extras voltou para % (a geracao zera), e eu tinha posto %.',
      v_extras_fim, v_extras_novo;
  end if;
  if v_hn_fim <> v_hn_novo or v_he_fim <> v_he_novo then
    raise exception 'As horas voltaram para %/% (apontamento), e eu tinha posto %/%.',
      v_hn_fim, v_he_fim, v_hn_novo, v_he_novo;
  end if;
  if coalesce(v_dh_fim, -1) <> 7 then
    raise exception 'O motivo em horas do desconto voltou para %, e eu tinha posto 7.', v_dh_fim;
  end if;

  raise notice 'Ensaio ok: centro, salario, extras, horas e motivo do desconto sobreviveram ao Regerar.';
end $ensaio$;
