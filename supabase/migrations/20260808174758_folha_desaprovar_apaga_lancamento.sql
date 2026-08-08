-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808174758 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 5 do Bloco 8a, parte 4 de 4: o caminho de volta da task de dinheiro.
--
-- A Task 4 fez a aprovação criar as contas a pagar da folha. Esta faz a
-- desaprovação apagar essas contas, e RECUSAR apagar quando o pagamento já
-- andou. A assinatura NÃO muda: a Server Action desaprovarFolha (Task 2) já
-- chama esta RPC em produção, e as checagens que já existiam (permissão
-- rh.folha:desaprovar, motivo obrigatório, status aprovado, for update, o
-- update que limpa aprovado_por/aprovado_em e grava o motivo) continuam, na
-- mesma ordem.
--
-- A trava é mais forte que "se foi pago": recusa se QUALQUER parcela de
-- QUALQUER lançamento da folha estiver com status aprovado ou pago (parcela
-- aprovada já está na fila de pagamento) ou conciliada em extrato_transacoes.
-- São exatamente os dois critérios da fn_excluir_lancamento canônica. A
-- exceção acontece ANTES de qualquer delete, então trava não deixa meio
-- apagado. A mensagem nomeia o lançamento que travou.
--
-- A ordem dos deletes vem da Task 4 e não é estilo. As duas FKs foram
-- conferidas no banco com pg_get_constraintdef e são SIMPLES, sem
-- on delete set null, de propósito (mesma forma de rh_diarias.lancamento_id,
-- para que esquecer o vínculo dê violação de FK na cara em vez de órfão
-- silencioso):
--   folha_itens_lancamento_id_fkey  FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id)
--   folha_guias_lancamento_id_fkey  FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id)
--   rh_diarias_lancamento_id_fkey   FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id)
-- Logo a receita é, nesta ordem:
--   1. anular lancamento_id nas DUAS tabelas (folha_itens e folha_guias);
--   2. apagar os lançamentos por origem/origem_id (lancamento_parcelas e
--      lancamento_rateios caem por ON DELETE CASCADE, conferido no banco);
--   3. apagar as linhas de folha_guias.
-- O passo 3 não é opcional: folha_guias tem UNIQUE (folha_id, grupo), então
-- linha sobrando da aprovação anterior faz a próxima aprovação da mesma folha
-- estourar no unique. Provado em banco: desaprovar e reaprovar funciona e
-- recria as mesmas 3 guias.
create or replace function public.fn_desaprovar_folha(p_folha uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text; v_comp date; v_travado text;
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

  -- Trava: nada de apagar lancamento comprometido. Parcela aprovada ja esta na
  -- fila de pagamento e parcela conciliada ja casou com o extrato do banco.
  -- Mesmas travas da fn_excluir_lancamento. A mensagem nomeia o que travou.
  -- Uma parcela comprometida entre varias barra a desaprovacao inteira: o
  -- delete e por folha, nao por lancamento, entao nao existe meio caminho.
  select string_agg(distinct l.descricao, '; ' order by l.descricao)
  into v_travado
  from public.lancamentos l
  join public.lancamento_parcelas pa on pa.lancamento_id = l.id
  left join public.extrato_transacoes et on et.parcela_id = pa.id
  where (
      (l.origem = 'folha' and l.origem_id in (select id from public.folha_itens where folha_id = p_folha))
   or (l.origem = 'folha_guia' and l.origem_id in (select id from public.folha_guias where folha_id = p_folha))
  )
  and (pa.status in ('aprovado', 'pago') or et.id is not null);

  if v_travado is not null then
    raise exception 'Nao da para desaprovar a folha de %/%: ja existe pagamento aprovado, pago ou conciliado em: %. Desaprove ou estorne o pagamento primeiro.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_travado;
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
'Desaprova a folha aprovada: volta para rascunho com motivo e APAGA os lancamentos que a aprovacao gerou (origem folha e folha_guia), com parcelas e rateios caindo por cascade e as linhas de folha_guias apagadas para nao travar o unique (folha_id, grupo) da proxima aprovacao. Recusa, sem apagar nada, se qualquer parcela de qualquer lancamento da folha estiver com status aprovado ou pago ou conciliada em extrato_transacoes (mesmas travas da fn_excluir_lancamento); a mensagem nomeia o lancamento que travou. NAO checa competencia fechada: a fn_aprovar_folha checa na entrada, o desfazer nao (registrado no relatorio da Task 5).';

-- Trava fail-closed: a fn continua definer com dono postgres (e o unico jeito
-- de passar pelo trg_guarda_status_folha e de apagar lancamentos sem grant de
-- delete), anon nao executa, o corpo realmente apaga, e a exceção da trava vem
-- ANTES do primeiro delete (trava que apaga metade e depois estoura e pior que
-- trava nenhuma).
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
     or v_def not like '%for update%'
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

  -- E ela estoura antes de qualquer delete ou de soltar o vinculo.
  if strpos(v_def, 'if v_travado is not null then') = 0
     or strpos(v_def, 'if v_travado is not null then') > strpos(v_def, 'update public.folha_itens set lancamento_id = null')
     or strpos(v_def, 'if v_travado is not null then') > strpos(v_def, 'delete from public.lancamentos') then
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

-- Rollback: recriar a fn_desaprovar_folha com o corpo da 20260808144223
-- (só a transição de status, sem apagar lançamento), mantendo a assinatura.
