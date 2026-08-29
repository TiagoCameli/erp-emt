-- =============================================================
-- Folha: quem edita pode retomar a folha que está esperando aprovação
-- =============================================================
-- PEDIDO DO TIAGO (29/08/2026): "a pessoa que faz a folha e manda a aprovacao
-- pode tirar a folha do status de pendente de aprovacao para rascunho desde de
-- que a folha nao esteja aprovada"
--
-- ============================================================
-- SÃO DUAS SAÍDAS DIFERENTES PELO MESMO PAR DE STATUS
-- ============================================================
-- `pendente_aprovacao -> rascunho` já existia, mas com uma leitura só: **quem
-- aprova devolve a folha, e tem de dizer por quê**. Agora existe a segunda:
-- **quem monta a folha se arrepende e retoma**.
--
--   DEVOLVER (permissão `aprovar`) ..... exige motivo. Alguém do outro lado vai
--                                        ler aquilo para saber o que corrigir, e
--                                        a Trilha rotula o texto.
--   RETOMAR (permissão `editar`) ....... sem motivo. Não é devolução a ninguém:
--                                        é a própria pessoa puxando de volta o
--                                        que ela mesma enviou. Exigir motivo aqui
--                                        seria pedir que ela escrevesse um bilhete
--                                        para si mesma.
--
-- O trigger só enxerga o par (old, new) — as duas ações são o mesmo UPDATE. Por
-- isso a ORDEM das condições importa: quem tem `editar` passa primeiro, sem
-- motivo; quem tem só `aprovar` cai na regra do motivo obrigatório. Na prática o
-- Tiago tem as duas permissões, então para ele o banco não exige motivo — quem
-- exige é a Server Action de "Mandar para revisão", que sempre pede. O banco
-- garante QUEM pode transicionar; a ação garante o motivo daquele caminho.
--
-- ============================================================
-- O QUE NÃO MUDA
-- ============================================================
-- Folha `aprovado` continua intocável por UPDATE de status: quem quiser desfazer
-- usa Desaprovar, que apaga os lançamentos gerados e recusa se houver pagamento
-- aprovado, pago ou conciliado. Isso é o "desde que a folha não esteja aprovada"
-- do pedido dele, e já era assim.
--
-- Editada por ÂNCORA a partir da definição viva: várias frentes mexem nestas
-- funções, e CREATE OR REPLACE sobrescreve sem dar conflito.

do $guarda$
declare
  v_def text; v_de text; v_para text; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_guarda_status_folha';
  if v_def is null then
    raise exception 'fn_guarda_status_folha nao existe.';
  end if;

  v_de :=
    '  if old.status = ''pendente_aprovacao'' and new.status = ''rascunho''' || chr(10) ||
    '     and public.tem_permissao(''rh.folha'', ''aprovar'') then' || chr(10) ||
    '    if new.motivo_rejeicao is null or length(btrim(new.motivo_rejeicao)) = 0 then' || chr(10) ||
    '      raise exception ''Rejeitar a folha de %/% exige motivo.'',' || chr(10) ||
    '        to_char(new.competencia, ''MM''), to_char(new.competencia, ''YYYY'');' || chr(10) ||
    '    end if;' || chr(10) ||
    '    return new;' || chr(10) ||
    '  end if;';

  v_para :=
    '  -- RETOMAR: quem MONTA a folha puxa de volta o que ela mesma enviou. Sem' || chr(10) ||
    '  -- motivo, porque nao e devolucao a ninguem -- seria um bilhete para si' || chr(10) ||
    '  -- mesma. Vem ANTES da regra do motivo de proposito: quem tem as duas' || chr(10) ||
    '  -- permissoes passa por aqui, e quem cobra o motivo naquele caminho e a' || chr(10) ||
    '  -- Server Action de "Mandar para revisao".' || chr(10) ||
    '  if old.status = ''pendente_aprovacao'' and new.status = ''rascunho''' || chr(10) ||
    '     and public.tem_permissao(''rh.folha'', ''editar'') then' || chr(10) ||
    '    return new;' || chr(10) ||
    '  end if;' || chr(10) ||
    chr(10) ||
    '  -- MANDAR PARA REVISAO: quem APROVA devolve, e tem de dizer por que. Alguem' || chr(10) ||
    '  -- do outro lado vai ler aquilo para saber o que corrigir, e a Trilha rotula' || chr(10) ||
    '  -- o texto. Motivo obrigatorio aqui, no banco: a Server Action ja barra vazio,' || chr(10) ||
    '  -- mas o UPDATE direto pela RLS nao passa por ela.' || chr(10) ||
    '  if old.status = ''pendente_aprovacao'' and new.status = ''rascunho''' || chr(10) ||
    '     and public.tem_permissao(''rh.folha'', ''aprovar'') then' || chr(10) ||
    '    if new.motivo_rejeicao is null or length(btrim(new.motivo_rejeicao)) = 0 then' || chr(10) ||
    '      raise exception ''Mandar a folha de %/% para revisao exige motivo.'',' || chr(10) ||
    '        to_char(new.competencia, ''MM''), to_char(new.competencia, ''YYYY'');' || chr(10) ||
    '    end if;' || chr(10) ||
    '    return new;' || chr(10) ||
    '  end if;';

  v_n := (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de);
  if v_n <> 1 then
    raise exception 'A ancora da volta para rascunho aparece % vez(es) e eu esperava 1.', v_n;
  end if;

  execute replace(v_def, v_de, v_para);
end $guarda$;

-- ---------------------------------------------------------------
-- PROVAS
-- ---------------------------------------------------------------
do $provas$
declare
  v_def text; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_guarda_status_folha';

  -- (a) A saída nova existe: quem tem `editar` passa de pendente para rascunho.
  if position('tem_permissao(''rh.folha'', ''editar'')' in v_def) = 0 then
    raise exception 'A funcao nao ganhou a saida de quem edita.';
  end if;

  -- (b) E ela vem ANTES da regra do motivo. Se a ordem invertesse, quem tem as
  --     duas permissoes bateria no motivo obrigatorio e o botao de retomar
  --     morreria com "exige motivo" — o defeito exato que este apply evita.
  if position('tem_permissao(''rh.folha'', ''editar'')' in v_def)
     > position('para revisao exige motivo' in v_def) then
    raise exception 'A saida de quem edita ficou DEPOIS da regra do motivo.';
  end if;

  -- (c) A folha aprovada continua trancada: é o "desde que não esteja aprovada".
  if position('if old.status = ''aprovado'' then' in v_def) = 0 then
    raise exception 'A trava da folha aprovada sumiu.';
  end if;

  -- (d) A que TEM de continuar existindo: a checagem de folha vazia e a de folha
  --     obsoleta no envio para aprovação. A âncora tocou só o bloco da volta, e
  --     se tivesse levado o resto junto é aqui que apareceria.
  if position('esta vazia: gere a folha antes de enviar' in v_def) = 0
     or position('ficou desatualizada: o desconto de adiantamento mudou' in v_def) = 0 then
    raise exception 'A ancora levou junto as guardas do envio para aprovacao.';
  end if;

  -- (e) O texto velho "Rejeitar a folha" não sobrou em lugar nenhum: o botão
  --     passou a se chamar "Mandar para revisão", e a mensagem do banco tem de
  --     falar a mesma língua da tela.
  v_n := (length(v_def) - length(replace(v_def, 'Rejeitar a folha', ''))) / length('Rejeitar a folha');
  if v_n <> 0 then
    raise exception 'Sobraram % mencoes a "Rejeitar a folha" na funcao.', v_n;
  end if;

  raise notice 'Guarda de status da folha: quem edita retoma sem motivo, quem aprova devolve com motivo.';
end $provas$;
