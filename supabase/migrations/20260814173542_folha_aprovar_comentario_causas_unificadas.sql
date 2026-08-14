-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-14. Este arquivo é o
-- registro versionado do que foi aplicado; NÃO rode `supabase db push` neste
-- projeto (ver docs/decisoes.md).
--
-- Bloco 8b / Task 3, fix round 1: SÓ COMENTÁRIO, e só DOIS parágrafos dele.
-- Nenhuma linha de corpo de função muda, e a consulta de diagnóstico não muda
-- nenhum caractere.
--
-- O ACHADO (review da Task 3, Minor, e é de contradição interna, não de álgebra).
-- A migration `20260814165626` acertou a identidade de quatro termos, mas o
-- parágrafo NOVO que ela escreveu discordava do parágrafo HERDADO duas frases
-- abaixo, sobre a MESMA coisa:
--
--   novo (linha 9)  : "As causas de diferenca legitima continuam TRES ...
--                      (encargo sem grupo, retido sem grupo, liquido zero)"
--   herdado (l. 44) : "As duas causas de residuo sao comportamento desejado"
--   herdado (l. 49) : "E um comportamento que NAO e causa de residuo: ... item
--                      com valor_liquido = 0 ..."
--
-- Um contador lendo de cima para baixo vê "TRÊS causas" e, duas frases depois,
-- "DUAS causas" mais "isto não é causa" para o terceiro item. O risco não é
-- estético: com "TRÊS causas" na mão, alguém justifica `residuo != 0` por líquido
-- zero como normal, quando o próprio texto diz que aquele termo vale 0,00 por
-- construção e que qualquer coisa diferente É regressão do limite do desconto.
--
-- A formulação correta, e a que fica: DUAS CAUSAS de resíduo (encargo sem grupo,
-- retido sem grupo) mais UM DETECTOR de regressão (líquido não positivo, que não
-- é causa). São TRÊS termos na conta do `explicado` porque o detector entra nela
-- de propósito, não porque exista uma terceira causa.
--
-- DE QUEBRA, A PRÓPRIA ABERTURA DO PARÁGRAFO ERRAVA A CONTA. Ela dizia "PROVISAO
-- NAO E UMA QUARTA CAUSA DE RESIDUO", e "quarta" pressupõe três existentes, ou
-- seja o mesmo erro pelo lado de dentro. A frase virou "PROVISAO NAO E CAUSA DE
-- RESIDUO: nao e causa nova e nao e nenhuma das antigas", que é o que o Bloco 8b
-- precisa dizer e não depende de contagem nenhuma. O ponto que o brief exigia
-- continua explícito e agora está separado do outro por escrito: TERMO DA
-- IDENTIDADE E CAUSA DE RESIDUO SAO COISAS DIFERENTES.
--
-- SEGUNDO PARÁGRAFO TOCADO (mesma classe: afirmação que se lê errado). A
-- ARMADILHA HISTORICA dizia "entre 14/08/2026 e a correcao deste texto", e a
-- correção é do MESMO dia: a janela lia como vazia, o que desarma o aviso. Pior,
-- estava estreita demais. Qualquer cópia da consulta anterior a 14/08/2026 soma
-- só três termos, porque a consulta é de três termos desde 08/08/2026; ela só
-- passou a MENTIR quando a provisão entrou no custo. O texto agora diz "QUALQUER
-- copia anterior a 14/08/2026".
--
-- COMO ESTE ARQUIVO ALTERA O COMENTÁRIO. Por `replace()` cirúrgico de âncora
-- única sobre o `obj_description` VIVO, o mesmo padrão da `20260813221243`, e pelo
-- motivo que ela documentou: retipar os 13.214 caracteres do comentário à mão é a
-- forma mais fácil de mudar sem querer a consulta que este comentário existe para
-- proteger. Duas âncoras, cada uma conferida por CONTAGEM (tem que aparecer
-- exatamente 1 vez) antes de ser trocada, com as duas pontas fixadas por md5:
--
--   pré-estado  do comentário: 4f449adf4d6981691578c9e5db4b0da0  (13214 chars)
--   pós-estado  do comentário: 26647ceb8a012afedc002746f5ebc96f  (13666 chars)
--
-- O pós-estado é o md5 do texto conferido por diff FORA do banco antes de aplicar
-- (2 hunks, nenhum deles tocando a consulta). Se outra sessão tiver reescrito o
-- comentário, esta migration RECUSA em vez de sobrescrever.
--
-- E os dois corpos de função, que este texto descreve e não pode descrever errado:
--   fn_aprovar_folha  a1261a1ccbff886980f0991da47a2446
--   fn_gerar_folha    0705f9c753f84e16f411ef4e35ec9b9c  (md5 PÓS-PROVISÃO, o da
--                     Task 2 / 20260814160831; NÃO é o 29c33b2d... do plano)
--
-- RELIDO O TEXTO INTEIRO caçando outra contagem que discordasse de si mesma, que
-- foi o que gerou este achado. Todas as demais fecham, e ficam registradas aqui
-- para o próximo que mexer:
--   - identidade: 4 termos (líquidos, guias, adiantamento descontado, provisões);
--     "O QUARTO TERMO NASCEU" e "O TERCEIRO TERMO MUDOU DE DEFINICAO" (o
--     adiantamento é o 3º) são consistentes com essa ordem;
--   - pré-condições: 2 hoje, "ERAM TRES CONDICOES" com a que caiu explicada, e a
--     provisão não acrescenta nenhuma (dito no texto);
--   - conta do `explicado`: 3 termos = 2 causas + 1 detector;
--   - "ARMADILHA ... soma so TRES termos" fala da identidade ANTIGA;
--   - duplicidade do 13º: "DUAS VEZES" (folha_item_encargos e
--     folha_item_provisoes); caso parcial: "so UM dos dois grupos".
--
-- Rollback: reaplicar as duas âncoras na ordem inversa, ou seja
--   update: replace(obj_description, <novo1>, <antigo1>) e o mesmo para o 2,
-- o que devolve o comentário a 4f449adf4d6981691578c9e5db4b0da0.
do $mig$
declare
  v_txt text;
  v_novo text;
  v_ancora text[];
  v_troca text[];
  v_qtd integer;
  v_n integer;
  v_len integer;
  v_md5 text;
  v_marca constant text := '-- DIAGNOSTICO EXECUTAVEL v1';
  v_q text;
  v_falhas integer;
  v_primeira text;
  i integer;
begin
  -- ===== 1. Travas de entrada: os dois corpos e o comentario de partida =====
  if md5((select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_aprovar_folha'))
     <> 'a1261a1ccbff886980f0991da47a2446' then
    raise exception 'fn_aprovar_folha mudou de corpo. Esta migration so mexe em comentario: pare e confira.';
  end if;

  if md5((select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_gerar_folha'))
     <> '0705f9c753f84e16f411ef4e35ec9b9c' then
    raise exception 'fn_gerar_folha mudou de corpo (esperado o md5 pos-provisao 0705f9c753f84e16f411ef4e35ec9b9c): as garantias deste texto precisam ser reconferidas.';
  end if;

  v_txt := obj_description('public.fn_aprovar_folha(uuid)'::regprocedure, 'pg_proc');
  if coalesce(length(v_txt), 0) = 0 then
    raise exception 'fn_aprovar_folha sem comentario: nada a corrigir, e isso e um achado';
  end if;

  v_md5 := md5(v_txt);
  if v_md5 <> '4f449adf4d6981691578c9e5db4b0da0' then
    raise exception 'o comentario da fn_aprovar_folha nao esta na versao que este fix mediu (esperado 4f449adf4d6981691578c9e5db4b0da0, achado %, % chars). O replace() cirurgico e o diff foram conferidos contra aquela versao: PARE e recalcule a partir do texto vivo, em vez de sobrescrever alteracao de outra sessao.', v_md5, length(v_txt);
  end if;

  -- ===== 2. Os dois replace() de ancora unica =====
  v_ancora := array[
$a1$PROVISAO NAO E UMA QUARTA CAUSA DE RESIDUO. Ela e termo EXPLICITO da igualdade, igual ao liquido e a guia: somando os quatro termos, fecha no centavo. As causas de diferenca legitima continuam TRES, as mesmas de sempre (encargo sem grupo, retido sem grupo, liquido zero), e a conta do "explicado" mais abaixo continua com TRES termos explicativos, nao quatro. Se alguem contar a provisao duas vezes, uma como termo da identidade e outra como causa de residuo, o "explicado" volta a acusar bug em folha certa, agora com o sinal trocado.$a1$,
$a2$ARMADILHA HISTORICA, se voce estiver conferindo com uma copia velha da consulta: entre 14/08/2026 e a correcao deste texto a consulta gravada aqui somava so TRES termos, ignorava a provisao e devolvia explicado = -folhas.valor_provisoes em folha PERFEITA (medido: -749,98 numa folha com 749,98 de provisao). Se o seu "explicado" bater exatamente com -folhas.valor_provisoes, o defeito esta na consulta que voce colou, nao na folha: use a de baixo.$a2$
  ];

  v_troca := array[
$b1$PROVISAO NAO E CAUSA DE RESIDUO: nao e causa nova e nao e nenhuma das antigas. Ela e termo EXPLICITO da igualdade, igual ao liquido e a guia, e somando os quatro termos fecha no centavo. TERMO DA IDENTIDADE E CAUSA DE RESIDUO SAO COISAS DIFERENTES, e as duas contagens nao se misturam:

  - na IDENTIDADE os termos passaram de tres para QUATRO: liquidos, guias, adiantamento descontado e provisoes;
  - na EXPLICACAO do residuo nada mudou. Continuam as MESMAS DUAS CAUSAS de sempre (encargo sem grupo e retido sem grupo), mais UM DETECTOR de regressao (o liquido nao positivo, que vale 0.00 por construcao e NAO e causa de residuo). Sao tres termos na conta do "explicado" porque o detector entra nela de proposito, nao porque exista uma terceira causa. Os dois blocos mais abaixo dizem isso item por item, e nao contradizem esta linha.

Se alguem contar a provisao nos dois lados, uma vez como termo da identidade e outra como causa de residuo, o "explicado" volta a acusar bug em folha certa, agora com o sinal trocado.$b1$,
$b2$ARMADILHA HISTORICA, se voce estiver conferindo com uma copia velha da consulta: QUALQUER copia anterior a 14/08/2026 soma so TRES termos, ignora a provisao e devolve explicado = -folhas.valor_provisoes em folha PERFEITA (medido: -749,98 numa folha com 749,98 de provisao). Se o seu "explicado" bater exatamente com -folhas.valor_provisoes, o defeito esta na consulta que voce colou, nao na folha: use a de baixo.$b2$
  ];

  v_novo := v_txt;
  for i in 1 .. array_length(v_ancora, 1) loop
    v_qtd := (length(v_novo) - length(replace(v_novo, v_ancora[i], ''))) / length(v_ancora[i]);
    if v_qtd <> 1 then
      raise exception 'ancora % aparece % vezes no comentario da fn_aprovar_folha (esperado exatamente 1): edit cirurgico abortado. Primeiros 90 chars: %', i, v_qtd, left(v_ancora[i], 90);
    end if;
    v_novo := replace(v_novo, v_ancora[i], v_troca[i]);
  end loop;

  execute format('comment on function public.fn_aprovar_folha(uuid) is %L', v_novo);

  -- ===== 3. Trava de pos-estado: o texto gravado e o que foi conferido por diff =====
  v_txt := obj_description('public.fn_aprovar_folha(uuid)'::regprocedure, 'pg_proc');
  v_md5 := md5(v_txt);
  v_len := length(v_txt);
  if v_md5 <> '26647ceb8a012afedc002746f5ebc96f' or v_len <> 13666 then
    raise exception 'o comentario gravado (% chars, md5 %) nao bate com o texto conferido por diff fora do banco antes de aplicar (esperado 26647ceb8a012afedc002746f5ebc96f, 13666 chars).', v_len, v_md5;
  end if;

  -- ===== 4. A contradicao nao pode voltar, por nenhum dos dois lados =====
  if v_txt like '%QUARTA CAUSA%' then
    raise exception 'o comentario voltou a falar em "quarta causa de residuo": isso pressupoe tres causas, e sao duas mais um detector';
  end if;
  if v_txt like '%causas de diferenca legitima continuam TRES%' or v_txt like '%TRES termos explicativos%' then
    raise exception 'o comentario voltou a contar TRES causas de residuo, contradizendo o bloco "As duas causas de residuo" mais abaixo';
  end if;
  if v_txt not like '%PROVISAO NAO E CAUSA DE RESIDUO%' then
    raise exception 'o comentario nao diz que provisao NAO e causa de residuo';
  end if;
  if v_txt not like '%TERMO DA IDENTIDADE E CAUSA DE RESIDUO SAO COISAS DIFERENTES%' then
    raise exception 'o comentario nao separa termo da identidade de causa de residuo, que e o ponto do brief';
  end if;
  if v_txt not like '%MESMAS DUAS CAUSAS de sempre (encargo sem grupo e retido sem grupo)%' then
    raise exception 'o comentario nao declara as DUAS causas de residuo nomeadas';
  end if;
  if v_txt not like '%mais UM DETECTOR de regressao%' then
    raise exception 'o comentario nao declara o liquido nao positivo como DETECTOR, e nao como causa';
  end if;
  -- Os dois blocos herdados, com que a linha de cima tem que concordar.
  if v_txt not like '%As duas causas de residuo sao comportamento desejado, nao erro%' then
    raise exception 'o bloco herdado das duas causas desapareceu';
  end if;
  if v_txt not like '%E um comportamento que NAO e causa de residuo%' then
    raise exception 'o bloco herdado do liquido zero (que NAO e causa) desapareceu';
  end if;

  -- ===== 5. Tudo o que a 20260814165626 ja exigia continua valendo =====
  if v_txt not like '%+ soma(provisoes) = folhas.custo_total%' then
    raise exception 'a identidade gravada perdeu o quarto termo';
  end if;
  if v_txt like '%soma(adiantamento DESCONTADO nesta folha) = folhas.custo_total%' then
    raise exception 'a identidade gravada voltou a ter TRES termos';
  end if;
  if v_txt not like '%soma(descontado) + soma(provisoes) - folhas.custo_total%' then
    raise exception 'a formula do residuo nao inclui a provisao';
  end if;
  if v_txt like '%soma(descontado) - folhas.custo_total%' then
    raise exception 'a formula do residuo voltou a ignorar a provisao';
  end if;
  if v_txt not like '%salario + encargos + provisoes = custo_total%' then
    raise exception 'a algebra item por item nao fecha em salario + encargos + provisoes';
  end if;
  if v_txt not like '%PROVISAO E CUSTO SEM CAIXA%' then
    raise exception 'o comentario nao explica que provisao e custo sem caixa';
  end if;
  if v_txt not like '%residuo + soma(encargos sem grupo) + soma(valor_liquido <= 0) + soma(retidos sem grupo) = 0%' then
    raise exception 'a conta do explicado nao esta com os tres termos de sempre';
  end if;
  if v_txt like '%grupo_recolhimento e PROVISAO%' then
    raise exception 'o comentario voltou a descrever 13o/ferias como encargo ativo sem grupo_recolhimento: essa orientacao duplica custo';
  end if;
  if v_txt like '%E o desenho que 13o e ferias usam%' then
    raise exception 'o comentario voltou a mandar fazer 13o e ferias como encargo sem grupo';
  end if;
  if v_txt not like '%NAO USE ISSO PARA 13o E FERIAS%' then
    raise exception 'o comentario nao avisa que encargo sem grupo nao serve para 13o e ferias';
  end if;
  if v_txt not like '%folha_provisoes%' then
    raise exception 'o comentario nao aponta o cadastro proprio da provisao';
  end if;
  if v_txt not like '%somente quando%' or v_txt not like '%as duas condicoes valem%' then
    raise exception 'o comentario nao declara as DUAS pre-condicoes da identidade';
  end if;
  if v_txt like '%as tres condicoes valem%' then
    raise exception 'o comentario voltou a declarar TRES pre-condicoes';
  end if;
  if v_txt not like '%rh_adiantamento_parcelas.valor_descontado%' then
    raise exception 'o comentario nao define o termo do adiantamento como valor_descontado da parcela';
  end if;
  if v_txt not like '%adiantamentos_descontados%'
     or v_txt not like '%encargos_sem_grupo%'
     or v_txt not like '%retidos_sem_grupo%'
     or v_txt not like '%liquidos_nao_positivos%' then
    raise exception 'a consulta de diagnostico perdeu alguma coluna da conferencia';
  end if;
  if v_txt not like '%Liquido ZERO continua alcancavel%' then
    raise exception 'o comentario nao diz que liquido ZERO segue alcancavel';
  end if;
  if v_txt not like '%/rh/parametros-folha%' then
    raise exception 'o comentario nao diz onde configurar o grupo de recolhimento dos retidos';
  end if;

  -- ===== 6. A consulta roda COLADA, sem placeholder, e a marca esta la uma vez =====
  if v_txt ~ ':[a-zA-Z_]' then
    raise exception 'o comentario tem placeholder :nome, que nao e sintaxe SQL valida fora do psql';
  end if;
  if v_txt not like '%with f as (%' or v_txt not like '%as explicado%' then
    raise exception 'o comentario nao tem a consulta de diagnostico executavel';
  end if;
  v_n := (length(v_txt) - length(replace(v_txt, v_marca, ''))) / length(v_marca);
  if v_n <> 1 then
    raise exception 'a marca % aparece % vezes no comentario (esperado exatamente 1)', v_marca, v_n;
  end if;

  -- ===== 7. Editar texto que contem SQL e como se quebra SQL gravado =====
  -- Entao a consulta e EXTRAIDA do comentario recem-gravado e executada, com as
  -- quatro colunas da conferencia resolvidas contra o schema de verdade.
  v_q := substring(v_txt from 'with f as \(.*from partes;');
  if v_q is null then
    raise exception 'nao achei a consulta de diagnostico no comentario depois do replace';
  end if;
  v_q := rtrim(btrim(v_q), ';');
  execute 'select count(*) from (select provisoes, explicado, consolidado_fecha, residuo from ('
          || v_q || ') x) y' into v_n;

  -- ===== 8. Os dois corpos, de novo, e a varredura =====
  if md5((select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_aprovar_folha'))
     <> 'a1261a1ccbff886980f0991da47a2446' then
    raise exception 'fn_aprovar_folha mudou de corpo no meio desta migration';
  end if;
  if md5((select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_gerar_folha'))
     <> '0705f9c753f84e16f411ef4e35ec9b9c' then
    raise exception 'fn_gerar_folha mudou de corpo no meio desta migration';
  end if;

  select count(*), min(objeto || ' / ' || erro) into v_falhas, v_primeira
  from public.fn_verificar_diagnosticos_gravados();
  if v_falhas <> 0 then
    raise exception 'fn_verificar_diagnosticos_gravados() acusou % consulta(s) gravada(s); a primeira: %', v_falhas, v_primeira;
  end if;
end $mig$;
