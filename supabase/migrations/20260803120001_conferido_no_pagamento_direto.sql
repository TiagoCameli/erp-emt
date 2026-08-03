-- FASE A de duas: troca o carimbo do pagamento direto de "revisado" para
-- "conferido" SEM derrubar nada.
--
-- ================== ORDEM OBRIGATORIA (nao inverta) ==================
--   1. aplicar ESTA fase A                  <- antes do deploy
--   2. deploy do codigo novo e confirmar a tela de aprovacao abrindo
--   3. aplicar 20260803120002_remover_revisado_no_pagamento_direto.sql
--
-- Por que aditiva e nao um rename: um rename atomico deixa o codigo que esta
-- EM PRODUCAO pedindo nomes que nao existem mais. Foi o que aconteceu em
-- 03/08/2026: revisado_por virou conferido_por no banco enquanto o bundle
-- publicado ainda pedia revisado_em e o embed
-- usuarios!lancamento_parcelas_revisado_por_fkey, e a aba "Aprovacao de
-- pagamentos" ficou em "Algo deu errado ao carregar esta tela" ate o rename ser
-- desfeito. Detalhe que custa uma tentativa a quem tentar de novo: renomear a
-- COLUNA nao basta, porque o PostgREST desambigua o embed pelo NOME DA
-- CONSTRAINT.
--
-- Depois desta fase o banco atende os DOIS vocabularios ao mesmo tempo:
-- revisado_por/revisado_em + fn_marcar_parcela_revisada continuam de pe (o
-- codigo em producao segue funcionando) e conferido_por/conferido_em +
-- fn_marcar_parcela_conferida passam a existir (o codigo novo funciona no
-- segundo em que sobe). Nao existe janela de tela quebrada.
--
-- Por que trocar a palavra: "revisao" JA significa DEVOLVER PARA AJUSTE neste
-- modulo. E' o sentido de lancamento_parcelas.status = 'em_revisao', de
-- fn_revisar_parcela, de parcela_eventos.tipo = 'revisou' e do KPI "Em revisao"
-- da fila. O carimbo da aba "Dinheiro e cartao" quer dizer o OPOSTO: alguem
-- CONFERIU um pagamento que ja seguiu o caminho dele. Duas palavras iguais com
-- sentidos contrarios na mesma tela e' o que o Tiago pediu para acabar.
--
-- O que este arquivo NAO muda, e essa e' a regra que manda: o carimbo continua
-- nao sendo etapa de nada. fn_aplicar_regra_pagamento, fn_aprovar_parcela e
-- fn_pagar_parcela nao sao tocadas. Pagar parcela nunca conferida continua
-- passando, e supabase/provas/conferido_no_pagamento_direto.sql exercita isso.

-- =====================================================================
-- 1. Colunas novas, ao lado das antigas
-- =====================================================================
-- Sem `references` inline de proposito: a FK nasce no bloco seguinte com nome
-- declarado. Nome de FK aqui e' contrato de app, nao detalhe de schema.
alter table public.lancamento_parcelas
  add column if not exists conferido_por uuid,
  add column if not exists conferido_em timestamptz;

comment on column public.lancamento_parcelas.conferido_por is
  'Quem conferiu este pagamento fora da fila de aprovacao (dinheiro, cartao). Carimbo de conferencia: nao autoriza nem bloqueia pagamento.';

comment on column public.lancamento_parcelas.conferido_em is
  'Quando a conferencia foi registrada. Nulo = nao conferido. Nao e pre-requisito de nada.';

-- A tabela tem varias FKs para usuarios (aprovado_por, pago_por, revisado_por e
-- agora conferido_por), entao o PostgREST exige a dica de qual usar e a dica e'
-- o NOME da constraint: queries.ts pede
-- `usuarios!lancamento_parcelas_conferido_por_fkey(nome)`. Nome diferente deste
-- = erro de ambiguidade = tela de aprovacao em branco.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lancamento_parcelas'::regclass
      and conname = 'lancamento_parcelas_conferido_por_fkey'
  ) then
    alter table public.lancamento_parcelas
      add constraint lancamento_parcelas_conferido_por_fkey
      foreign key (conferido_por) references public.usuarios(id);
  end if;
end $$;

-- Check proprio, com nome proprio: nao existe "conferido sem quem" nem "quem
-- sem quando". O check antigo (lancamento_parcelas_revisado_par) continua
-- valendo para o par antigo e cai junto com as colunas na fase B.
alter table public.lancamento_parcelas
  drop constraint if exists lancamento_parcelas_conferido_par;

alter table public.lancamento_parcelas
  add constraint lancamento_parcelas_conferido_par
  check ((conferido_por is null) = (conferido_em is null));

-- FK sem indice vira advisor de performance, igual aprovado_por e pago_por ja
-- tem o seu.
create index if not exists idx_lancamento_parcelas_conferido_por
  on public.lancamento_parcelas (conferido_por);

-- Nao ha grant novo a dar: o SELECT de authenticated em lancamento_parcelas e'
-- de TABELA (nao por coluna), entao coluna nova ja entra visivel. INSERT e
-- UPDATE continuam nao existindo para authenticated: toda escrita passa por RPC
-- security definer, e e' assim que fica.

-- =====================================================================
-- 2. Copia o que houver do par antigo
-- =====================================================================
-- Na hora em que este arquivo foi escrito o banco tinha ZERO parcela marcada
-- (count(*) filter (where revisado_em is not null) = 0), mas a migration nao
-- pode depender disso: entre escrever e aplicar alguem pode carimbar uma linha
-- em producao, e essa linha nao pode sumir da tela depois do deploy.
--
-- `execute` dinamico porque a fase B derruba revisado_*: sem isso, reaplicar
-- este arquivo depois da fase B estouraria no parse de uma coluna que nao
-- existe mais.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lancamento_parcelas'
      and column_name = 'revisado_em'
  ) then
    execute $sql$
      update public.lancamento_parcelas
      set conferido_por = revisado_por,
          conferido_em = revisado_em
      where revisado_em is not null
        and conferido_em is null
    $sql$;
  end if;
end $$;

-- =====================================================================
-- 3. RPC nova: fn_marcar_parcela_conferida
-- =====================================================================
-- Copia fiel da fn_marcar_parcela_revisada VIVA (lida com pg_get_functiondef,
-- porque os .sql do repo divergem do banco neste projeto), escrevendo nas
-- colunas novas. Nenhuma guarda foi afrouxada: security definer com search_path
-- vazio, permissao financeiro.aprovacao-pagamentos:aprovar, idempotencia nos
-- dois sentidos, nenhuma restricao de status nem de forma de pagamento, revoke
-- de public/anon e grant execute so para authenticated.
--
-- A antiga NAO e' derrubada aqui: e' ela que o codigo em producao chama ate o
-- deploy. Quem derruba e' a fase B.
--
-- Um unico caminho para os dois sentidos: desmarcar importa tanto quanto
-- marcar. Marcar errado numa tela de dinheiro sem volta e' pior que nao ter o
-- botao.
--
-- Sem restricao de status de proposito: pendente, em_revisao, aprovado e pago
-- podem ser conferidos. Parcela paga e' o caso principal.
--
-- Sem restricao de forma de pagamento tambem de proposito: quem decide o que
-- entra na aba e' a consulta da tela. Amarrar a conferencia a
-- formas_pagamento.tipo aqui acoplaria este carimbo a regra de pagamento, que e'
-- justamente o que ele nao pode virar.
create or replace function public.fn_marcar_parcela_conferida(
  p_parcela_id uuid,
  p_conferido boolean default true
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_encontrou boolean;
  v_conferido_por uuid;
  v_conferido_em timestamptz;
begin
  -- Quem confere e' o responsavel pela aprovacao de pagamentos, a mesma
  -- permissao de fn_aprovar_parcela. A aba e' area dele.
  if not public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar') then
    raise exception 'Sem permissao para marcar pagamentos como conferidos';
  end if;

  select true, lp.conferido_por, lp.conferido_em
  into v_encontrou, v_conferido_por, v_conferido_em
  from public.lancamento_parcelas lp
  where lp.id = p_parcela_id;

  if not coalesce(v_encontrou, false) then
    raise exception 'Parcela nao encontrada';
  end if;

  -- Idempotente: clicar duas vezes nao gera linha de auditoria a toa nem
  -- reescreve o carimbo de quem ja tinha conferido. Pessoa diferente marcando
  -- por cima passa e vira quem conferiu, com a anterior guardada no audit_log.
  if p_conferido and v_conferido_por is not distinct from (select auth.uid()) then
    return;
  end if;
  if not p_conferido and v_conferido_em is null then
    return;
  end if;

  update public.lancamento_parcelas
  set conferido_por = case when p_conferido then (select auth.uid()) end,
      conferido_em = case when p_conferido then now() end
  where id = p_parcela_id;
  -- Auditoria: trg_audit_lancamento_parcelas grava o UPDATE (antes/depois).
  -- audit_log.acao so aceita INSERT/UPDATE/DELETE, entao nao ha acao nova para
  -- inventar aqui.
end;
$$;

comment on function public.fn_marcar_parcela_conferida(uuid, boolean) is
  'Marca (p_conferido = true) ou desmarca (false) a conferencia de uma parcela. Nao muda status nem qualquer outro campo da parcela: nao e etapa do pagamento.';

revoke all on function public.fn_marcar_parcela_conferida(uuid, boolean) from public, anon;
grant execute on function public.fn_marcar_parcela_conferida(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
