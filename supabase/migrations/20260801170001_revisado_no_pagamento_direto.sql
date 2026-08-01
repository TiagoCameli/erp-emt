-- Marcar como revisado o pagamento que NAO passa pela fila de aprovacao
-- (dinheiro e cartao de credito).
--
-- O que isto e': um carimbo de conferencia. O responsavel pela aprovacao de
-- pagamentos registra que olhou um lancamento que nunca chegou na fila dele,
-- inclusive um que ja foi pago. E' o caso principal, nao a excecao.
--
-- O que isto NAO e', e essa e' a regra que manda:
--   - nao e' etapa. Nenhuma funcao de pagamento passa a exigir revisado_em.
--   - nao muda status, nao mexe em data programada, conta ou valor.
--   - dinheiro continua indo direto para Pagamentos e cartao continua nascendo
--     quitado, revisado ou nao. fn_aplicar_regra_pagamento, fn_aprovar_parcela e
--     fn_pagar_parcela nao sao tocadas por este arquivo.
-- A prova em supabase/provas/revisado_no_pagamento_direto.sql exercita
-- exatamente isso: pagar sem revisao nenhuma continua passando.
--
-- Coluna em vez de tabela de eventos, e o motivo:
--   1. parcela_eventos.tipo ja tem 'revisou', e la' significa o OPOSTO: devolver
--      a parcela para ajuste. Enfiar a conferencia na mesma coluna poe dois
--      sentidos contrarios da mesma palavra na mesma trilha.
--   2. a aba lista o estado atual (quem revisou, quando) linha a linha, que e'
--      exatamente como aprovado_por/aprovado_em e pago_por/pago_em ja vivem.
--   3. o historico de marcar e desmarcar nao se perde: o trigger
--      trg_audit_lancamento_parcelas ja grava cada UPDATE em audit_log com
--      dados_antes e dados_depois. Quem marcou, quem desmarcou e quando ficam
--      registrados sem tabela nova.

-- =====================================================================
-- 1. Estado atual da conferencia na parcela
-- =====================================================================

alter table public.lancamento_parcelas
  add column if not exists revisado_por uuid references public.usuarios(id),
  add column if not exists revisado_em timestamptz;

comment on column public.lancamento_parcelas.revisado_por is
  'Quem conferiu este pagamento fora da fila de aprovacao (dinheiro, cartao). Carimbo de conferencia: nao autoriza nem bloqueia pagamento.';

comment on column public.lancamento_parcelas.revisado_em is
  'Quando a conferencia foi registrada. Nulo = nao revisado. Nao e pre-requisito de nada.';

-- Os dois andam juntos: nao existe "revisado sem quem" nem "quem sem quando".
alter table public.lancamento_parcelas
  drop constraint if exists lancamento_parcelas_revisado_par;

alter table public.lancamento_parcelas
  add constraint lancamento_parcelas_revisado_par
  check ((revisado_por is null) = (revisado_em is null));

-- FK sem indice vira advisor de performance, igual aprovado_por e pago_por ja
-- tem o seu.
create index if not exists idx_lancamento_parcelas_revisado_por
  on public.lancamento_parcelas (revisado_por);

-- =====================================================================
-- 2. Marcar e desmarcar
-- =====================================================================
-- Um unico caminho para os dois sentidos: desmarcar importa tanto quanto
-- marcar. Marcar errado numa tela de dinheiro sem volta e' pior que nao ter o
-- botao.
--
-- Sem restricao de status de proposito: pendente, em_revisao, aprovado e pago
-- podem ser marcados. Parcela paga e' o caso principal.
--
-- Sem restricao de forma de pagamento tambem de proposito: quem decide o que
-- entra na aba e' a consulta da tela. Amarrar a conferencia a
-- formas_pagamento.tipo aqui acoplaria este carimbo a regra de pagamento, que e'
-- justamente o que ele nao pode virar.

create or replace function public.fn_marcar_parcela_revisada(
  p_parcela_id uuid,
  p_revisado boolean default true
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_encontrou boolean;
  v_revisado_por uuid;
  v_revisado_em timestamptz;
begin
  -- Quem revisa e' o responsavel pela aprovacao de pagamentos, a mesma
  -- permissao de fn_aprovar_parcela. A aba e' area dele.
  if not public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar') then
    raise exception 'Sem permissao para marcar pagamentos como revisados';
  end if;

  select true, lp.revisado_por, lp.revisado_em
  into v_encontrou, v_revisado_por, v_revisado_em
  from public.lancamento_parcelas lp
  where lp.id = p_parcela_id;

  if not coalesce(v_encontrou, false) then
    raise exception 'Parcela nao encontrada';
  end if;

  -- Idempotente: clicar duas vezes nao gera linha de auditoria a toa nem
  -- reescreve o carimbo de quem ja tinha revisado. Revisor diferente marcando
  -- por cima passa e vira o revisor corrente, com o anterior guardado no
  -- audit_log.
  if p_revisado and v_revisado_por is not distinct from (select auth.uid()) then
    return;
  end if;
  if not p_revisado and v_revisado_em is null then
    return;
  end if;

  update public.lancamento_parcelas
  set revisado_por = case when p_revisado then (select auth.uid()) end,
      revisado_em = case when p_revisado then now() end
  where id = p_parcela_id;
  -- Auditoria: trg_audit_lancamento_parcelas grava o UPDATE (antes/depois).
  -- audit_log.acao so aceita INSERT/UPDATE/DELETE, entao nao ha acao nova para
  -- inventar aqui.
end;
$$;

comment on function public.fn_marcar_parcela_revisada(uuid, boolean) is
  'Marca (p_revisado = true) ou desmarca (false) a conferencia de uma parcela. Nao muda status nem qualquer outro campo da parcela: nao e etapa do pagamento.';

revoke all on function public.fn_marcar_parcela_revisada(uuid, boolean) from public, anon;
grant execute on function public.fn_marcar_parcela_revisada(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
