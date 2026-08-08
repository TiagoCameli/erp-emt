-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808181925 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 5 do Bloco 8a, fix round 1: fecha a corrida do for update e poe teto na
-- mensagem de erro. A 20260808174758 fica como está (arquivo é rastro do que
-- rodou, não fonte de reaplicação); esta migration é a correção por cima.
--
-- ===== Fix 1: a trava lia sem lock, e a cascade requalificava só pela FK =====
--
-- A consulta da trava era um SELECT sem lock. Em READ COMMITTED ela lia a versão
-- anterior de uma parcela cujo `update ... status='aprovado'` estava pendente em
-- outra sessão, passava, e aí o `delete from lancamentos` cascateava: bloqueava
-- no lock da outra sessão e, quando ela commitava, o RI da cascade requalificava
-- a linha **só pelo match da FK, não pelo status**. Resultado: apagava calada a
-- parcela recém-aprovada, que é exatamente o que a trava existe para impedir.
--
-- A correção trava as parcelas ANTES de agregar. `for update` não convive com
-- agregado (55000: FOR UPDATE is not allowed with aggregate functions), então
-- vira um `perform` só para pegar o lock, e a consulta seguinte relê linhas já
-- travadas: a sessão concorrente que quiser aprovar/pagar espera, e quando ela
-- soltar, quem relê vê o status novo e a trava pega.
--
-- `for update of pa` trava só `lancamento_parcelas`, não `lancamentos`: é a
-- tabela cujo status a trava lê, e travar o lançamento junto só ampliaria o lock
-- sem fechar nada. Provado no banco pela coluna de sistema `xmax`: antes do
-- perform, 0 das 5 parcelas travadas; depois, 5 de 5, todas com xmax igual ao
-- xid da transação.
--
-- Ordem de lock: folhas (o `for update` que já existia) e depois as parcelas.
-- Sem risco de deadlock com o fluxo de pagamento, que nunca toca `folhas`.
--
-- ===== Fix 2: teto na mensagem =====
--
-- `string_agg(distinct l.descricao)` montava a mensagem com TODOS os lançamentos
-- travados, e ela sobe inteira para o toast (a Server Action repassa
-- `error.message`). Com 20 a 30 CLT, uma folha já paga geraria uma exceção com
-- dezenas de nomes. Agora lista no máximo 3 e acrescenta "e outros N",
-- preservando a propriedade que importa: a mensagem nomeia pelo menos um
-- lançamento concreto, para a pessoa saber onde ir. Medido no banco: 5
-- lançamentos comprometidos viram 69 caracteres.
--
-- 3 e não 5 porque o destino é um toast: 3 nomes de salário já passam de 100
-- caracteres, e o "e outros N" é que dá a escala.
--
-- ===== O que NÃO mudou, e por quê =====
--
-- Nada da receita de delete, nada das checagens da Task 2, nada da assinatura.
-- Duas coisas ficaram deliberadamente de fora, decididas no review:
--
--   * `em_revisao` NÃO trava. A premissa do relatório da Task 5 estava
--     invertida: `em_revisao` não é "alguém conferindo o pagamento", é
--     "devolvida para quem lançou ajustar" (fn_revisar_parcela só aceita
--     `pendente`; fn_aprovar_parcela RECUSA `em_revisao` pedindo reenvio). Ou
--     seja, é MENOS comprometida que `pendente`, e travar nela sem travar em
--     `pendente` seria incoerente.
--
--   * competência fechada NÃO é checada aqui. Seis funções chamam
--     fn_exigir_competencia_aberta e todas são caminho de criar ou mover
--     dinheiro; as quatro que APAGAM lançamento (esta,
--     fn_desaprovar_ordem_compra, fn_excluir_lancamento,
--     fn_excluir_ordem_compra) não chamam nenhuma. O portão do projeto está
--     montado só na entrada. Fechar só esta faria dela a única das quatro com a
--     trava e a assimetria trocaria de lugar; virou item de roadmap para as
--     quatro de uma vez.
create or replace function public.fn_desaprovar_folha(p_folha uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text; v_comp date; v_travado text; v_qtd int;
  -- Teto de nomes na mensagem de erro. O resto vira "e outros N".
  v_limite constant int := 3;
begin
  if not public.tem_permissao('rh.folha', 'desaprovar') then
    raise exception 'Sem permissao para desaprovar a folha';
  end if;

  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'Informe o motivo da desaprovacao';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha for update;

  if v_status is null then raise exception 'Folha nao encontrada'; end if;
  if v_status <> 'aprovado' then
    raise exception 'A folha de %/% esta em "%": só da para desaprovar folha aprovada.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;

  -- Trava as parcelas da folha ANTES de olhar o status delas. Sem este lock a
  -- consulta abaixo e um SELECT em read committed: leria a versao anterior de
  -- uma parcela sendo aprovada em outra sessao, passaria, e a cascade do delete
  -- requalificaria a linha so pelo match da FK, apagando parcela aprovada.
  -- `for update` nao convive com agregado, por isso o lock vem sozinho num
  -- perform e a consulta seguinte rele linhas ja travadas.
  perform 1
  from public.lancamento_parcelas pa
  join public.lancamentos l on l.id = pa.lancamento_id
  where (l.origem = 'folha'      and l.origem_id in (select id from public.folha_itens where folha_id = p_folha))
     or (l.origem = 'folha_guia' and l.origem_id in (select id from public.folha_guias where folha_id = p_folha))
  for update of pa;

  -- Trava: nada de apagar lancamento comprometido. Parcela aprovada ja esta na
  -- fila de pagamento e parcela conciliada ja casou com o extrato do banco.
  -- Mesmas travas da fn_excluir_lancamento. A mensagem nomeia o que travou.
  -- Uma parcela comprometida entre varias barra a desaprovacao inteira: o
  -- delete e por folha, nao por lancamento, entao nao existe meio caminho.
  -- v_qtd conta TODOS os comprometidos; v_travado lista so os v_limite
  -- primeiros, porque a mensagem vai para um toast.
  with comprometidos as (
    select distinct l.descricao as descricao
    from public.lancamentos l
    join public.lancamento_parcelas pa on pa.lancamento_id = l.id
    left join public.extrato_transacoes et on et.parcela_id = pa.id
    where (
        (l.origem = 'folha'      and l.origem_id in (select id from public.folha_itens where folha_id = p_folha))
     or (l.origem = 'folha_guia' and l.origem_id in (select id from public.folha_guias where folha_id = p_folha))
    )
    and (pa.status in ('aprovado', 'pago') or et.id is not null)
  )
  select (select count(*) from comprometidos),
         (select string_agg(descricao, '; ' order by descricao)
          from (select descricao from comprometidos order by descricao limit v_limite) primeiros)
  into v_qtd, v_travado;

  -- Gate no contador, nao no texto: se um dia descricao vier nula, o
  -- string_agg devolveria null e uma trava presa ao texto deixaria passar.
  if v_qtd > 0 then
    if v_qtd > v_limite then
      v_travado := coalesce(v_travado, '?') || format(' e outros %s', v_qtd - v_limite);
    end if;
    raise exception 'Nao da para desaprovar a folha de %/%: ja existe pagamento aprovado, pago ou conciliado em: %. Desaprove ou estorne o pagamento primeiro.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'),
      coalesce(v_travado, v_qtd || ' lancamento(s) sem descricao');
  end if;

  -- Apaga de verdade (escolha do Tiago). Parcelas e rateios caem por
  -- ON DELETE CASCADE. Solta o vinculo nas DUAS tabelas antes: as duas FKs
  -- (folha_itens.lancamento_id e folha_guias.lancamento_id) sao simples, sem
  -- on delete set null, entao apagar o lancamento com qualquer uma das duas
  -- ainda apontando para ele viola a FK.
  update public.folha_itens set lancamento_id = null where folha_id = p_folha;
  update public.folha_guias set lancamento_id = null where folha_id = p_folha;

  delete from public.lancamentos
  where origem = 'folha_guia'
    and origem_id in (select id from public.folha_guias where folha_id = p_folha);

  delete from public.lancamentos
  where origem = 'folha'
    and origem_id in (select id from public.folha_itens where folha_id = p_folha);

  -- Passo 3, obrigatorio: folha_guias tem unique (folha_id, grupo). Linha
  -- sobrando aqui faz a proxima aprovacao da mesma folha estourar no unique.
  delete from public.folha_guias where folha_id = p_folha;

  update public.folhas
  set status = 'rascunho', aprovado_por = null, aprovado_em = null,
      motivo_rejeicao = btrim(p_motivo)
  where id = p_folha;
end;
$function$;

revoke all on function public.fn_desaprovar_folha(uuid, text) from public;
grant execute on function public.fn_desaprovar_folha(uuid, text) to authenticated;

comment on function public.fn_desaprovar_folha(uuid, text) is
'Desaprova a folha aprovada: volta para rascunho com motivo e APAGA os lancamentos que a aprovacao gerou (origem folha e folha_guia), com parcelas e rateios caindo por cascade e as linhas de folha_guias apagadas para nao travar o unique (folha_id, grupo) da proxima aprovacao. Recusa, sem apagar nada, se qualquer parcela de qualquer lancamento da folha estiver com status aprovado ou pago ou conciliada em extrato_transacoes (mesmas travas da fn_excluir_lancamento); a mensagem nomeia ate 3 lancamentos e resume o resto como "e outros N". Trava as parcelas com for update antes de ler o status delas, senao em read committed a cascade do delete apagaria parcela aprovada em outra sessao (requalifica pelo match da FK, nao pelo status). NAO trava em em_revisao, que no projeto significa devolvida para quem lancou ajustar, ou seja menos comprometida que pendente. NAO checa competencia fechada: nenhuma das 4 funcoes que apagam lancamento checa, o portao esta montado so na entrada, e a assimetria e item de roadmap para as 4 de uma vez.';

-- Trava fail-closed. Alem do que a 20260808174758 ja verificava, agora tambem:
-- o lock das parcelas existe e vem ANTES da consulta que le o status delas, e a
-- mensagem tem teto.
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_desaprovar_folha';

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_desaprovar_folha'
      and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
  ) then
    raise exception 'fn_desaprovar_folha precisa ser security definer com dono postgres';
  end if;

  -- As checagens herdadas da Task 2 nao podem ter caido na reescrita.
  if v_def not like '%tem_permissao(''rh.folha'', ''desaprovar'')%'
     or v_def not like '%Informe o motivo da desaprovacao%'
     or v_def not like '%v_status <> ''aprovado''%'
     or v_def not like '%for update;%'
     or v_def not like '%aprovado_por = null%' then
    raise exception 'fn_desaprovar_folha perdeu uma das checagens da Task 2';
  end if;

  -- O corpo tem os tres passos da receita da Task 4.
  if v_def not like '%update public.folha_itens set lancamento_id = null%'
     or v_def not like '%update public.folha_guias set lancamento_id = null%'
     or v_def not like '%delete from public.lancamentos%'
     or v_def not like '%delete from public.folha_guias where folha_id = p_folha%' then
    raise exception 'fn_desaprovar_folha nao apaga os lancamentos da folha nos tres passos';
  end if;

  -- A trava existe e cobre os dois criterios da fn_excluir_lancamento.
  if v_def not like '%pa.status in (''aprovado'', ''pago'')%'
     or v_def not like '%public.extrato_transacoes%' then
    raise exception 'fn_desaprovar_folha nao tem a trava de pagamento aprovado/pago/conciliado';
  end if;

  -- Fix 1: o lock das parcelas existe e vem ANTES da consulta que le o status.
  if strpos(v_def, 'for update of pa') = 0 then
    raise exception 'fn_desaprovar_folha precisa travar as parcelas com for update of pa antes de ler o status delas';
  end if;
  if strpos(v_def, 'for update of pa') > strpos(v_def, 'with comprometidos') then
    raise exception 'o for update of pa tem que vir antes da consulta da trava, senao a leitura e sem lock';
  end if;

  -- Fix 2: a mensagem tem teto.
  if v_def not like '%e outros %' or v_def not like '%v_limite constant int%' then
    raise exception 'a mensagem da fn_desaprovar_folha precisa de teto de nomes ("e outros N")';
  end if;

  -- E a excecao da trava estoura antes de qualquer delete ou de soltar o vinculo.
  if strpos(v_def, 'if v_qtd > 0 then') = 0
     or strpos(v_def, 'if v_qtd > 0 then') > strpos(v_def, 'update public.folha_itens set lancamento_id = null')
     or strpos(v_def, 'if v_qtd > 0 then') > strpos(v_def, 'delete from public.lancamentos') then
    raise exception 'a trava da fn_desaprovar_folha precisa estourar antes de qualquer delete';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_desaprovar_folha'
      and has_function_privilege('anon', p.oid, 'execute')
  ) then
    raise exception 'anon nao pode executar a fn_desaprovar_folha';
  end if;

  -- O passo 3 existe por causa deste unique. Se ele sair, o comentario da fn
  -- passa a mentir.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.folha_guias'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (folha_id, grupo)'
  ) then
    raise exception 'folha_guias perdeu o unique (folha_id, grupo) que justifica o passo 3';
  end if;
end $$;

-- Rollback: recriar a fn_desaprovar_folha com o corpo da 20260808174758
-- (sem o lock das parcelas e sem o teto da mensagem), mantendo a assinatura.
