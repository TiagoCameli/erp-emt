-- Conciliação passa a casar transferência entre contas, não só parcela paga.
--
-- O DEFEITO (print do usuário em 14/09/2026): no extrato de janeiro/2025 da
-- Caixa, o débito de R$ 450.000,00 de 07/01 ("ENVIO DE TED") fica eternamente
-- pendente com "Nenhuma parcela compatível". Ele ESTÁ lançado: é a
-- TRF-2026-0168, Caixa -> BB 102.124-9, mesmo dia, mesmo valor.
--
-- A causa é estrutural, não um filtro apertado: transferência entre contas
-- NÃO É `lancamento_parcelas`, vive em `transferencias_contas`, e a
-- conciliação só sabia procurar parcela. Nenhuma transferência jamais
-- poderia ser conciliada — são 348 no banco, e toda transferência deixa DOIS
-- movimentos de extrato (o débito na origem e o crédito no destino), então o
-- buraco é de duas linhas por transferência.
--
-- MODELO: `extrato_transacoes` ganha `transferencia_id`, alternativo a
-- `parcela_id` (um CHECK impede os dois juntos). A unicidade é por LADO:
-- a mesma transferência é conciliada uma vez como débito (na origem) e uma
-- vez como crédito (no destino), e o sentido do movimento é que diz o lado.
--
-- FORA DE ESCOPO, de propósito: a TARIFA da transferência, que
-- `fn_extrato_conta` trata como movimento separado. Hoje são 0 tarifas em 348
-- transferências. Se passar a existir, a linha da tarifa fica pendente e
-- precisa de tratamento próprio — o índice único por lado não a acomoda.
--
-- Tudo aqui é ADITIVO para o código que já está no ar: a coluna é nova, o
-- CHECK só pode reprovar uma escrita que preencha `transferencia_id` (nenhum
-- código publicado faz isso) e a policy só alarga. Ver
-- [[feedback_estreitar_privilegio_derruba_producao]].

alter table public.extrato_transacoes
  add column if not exists transferencia_id uuid references public.transferencias_contas(id);

comment on column public.extrato_transacoes.transferencia_id is
  'Transferência entre contas casada com este movimento. Alternativo a parcela_id: um movimento do extrato é uma parcela paga OU um lado de uma transferência, nunca os dois.';

-- Um lado por transferência: o débito casa com a origem, o crédito com o
-- destino. Sem o `tipo` na chave, conciliar a saída na Caixa impediria de
-- conciliar a entrada no BB, que é o outro extrato da MESMA transferência.
create unique index if not exists extrato_transacoes_transferencia_lado
  on public.extrato_transacoes (transferencia_id, tipo)
  where transferencia_id is not null;

create index if not exists idx_extrato_transacoes_transferencia
  on public.extrato_transacoes (transferencia_id);

alter table public.extrato_transacoes
  drop constraint if exists extrato_transacoes_um_vinculo;
alter table public.extrato_transacoes
  add constraint extrato_transacoes_um_vinculo
  check (parcela_id is null or transferencia_id is null);

-- Casa o movimento do extrato com um LADO da transferência.
create or replace function public.fn_conciliar_transferencia(
  p_transacao_id uuid,
  p_transferencia_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_t_conta uuid; v_t_valor numeric(14,2); v_t_tipo text; v_t_conciliada boolean;
  v_f_valor numeric(14,2); v_f_origem uuid; v_f_destino uuid; v_conta_do_lado uuid;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then raise exception 'Sem permissao para conciliar'; end if;

  select t.conta_bancaria_id, t.valor, t.tipo, t.conciliada
    into v_t_conta, v_t_valor, v_t_tipo, v_t_conciliada
  from public.extrato_transacoes t where t.id = p_transacao_id;
  if v_t_conta is null then raise exception 'Transacao nao encontrada'; end if;
  if v_t_conciliada then raise exception 'Transacao ja conciliada'; end if;

  select f.valor, f.conta_origem_id, f.conta_destino_id
    into v_f_valor, v_f_origem, v_f_destino
  from public.transferencias_contas f where f.id = p_transferencia_id;
  if v_f_valor is null then raise exception 'Transferencia nao encontrada'; end if;

  -- O sentido do movimento decide o lado: saiu daqui = esta conta e a origem.
  v_conta_do_lado := case when v_t_tipo = 'debito' then v_f_origem else v_f_destino end;
  if v_conta_do_lado is distinct from v_t_conta then
    raise exception 'A transferencia nao passa por esta conta neste sentido';
  end if;

  if round(v_f_valor, 2) <> round(abs(v_t_valor), 2) then
    raise exception 'O valor da transferencia diverge do valor da transacao';
  end if;

  if exists (
    select 1 from public.extrato_transacoes e
    where e.transferencia_id = p_transferencia_id
      and e.tipo = v_t_tipo
      and e.id <> p_transacao_id
  ) then
    raise exception 'Este lado da transferencia ja foi conciliado com outra transacao';
  end if;

  update public.extrato_transacoes
     set conciliada = true,
         transferencia_id = p_transferencia_id,
         parcela_id = null,
         conciliado_por = (select auth.uid()),
         conciliado_em = now()
   where id = p_transacao_id;
end $function$;

revoke all on function public.fn_conciliar_transferencia(uuid, uuid) from public;
grant execute on function public.fn_conciliar_transferencia(uuid, uuid) to authenticated;

-- Desfazer tem que limpar os DOIS vínculos. Sem isto, desconciliar um
-- movimento casado com transferência deixaria `transferencia_id` preenchido e
-- o lado seguiria ocupado pelo índice único: o movimento voltaria a "pendente"
-- e não aceitaria mais nenhuma conciliação, calado.
create or replace function public.fn_desconciliar_transacao(p_transacao_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then raise exception 'Sem permissao para conciliar'; end if;
  update public.extrato_transacoes
  set conciliada = false, parcela_id = null, transferencia_id = null, conciliado_por = null, conciliado_em = null
  where id = p_transacao_id;
end $function$;

-- Quem concilia precisa LER a transferência para poder casá-la. A policy
-- listava três recursos e a Conciliação não estava entre eles, então o
-- sugeridor voltaria vazio mesmo com a função nova no lugar — o mesmo defeito
-- que `contas_bancarias` tinha em 11/09. Ver
-- [[project_erp_emt_ler_cadastro_do_documento]].
alter policy transferencias_contas_select on public.transferencias_contas
using (
  (select public.tem_permissao('financeiro.transferencias', 'ver'))
  or (select public.tem_permissao('financeiro.relatorios', 'ver'))
  or (select public.tem_permissao('financeiro.contas-bancarias', 'ver'))
  or (select public.tem_permissao('financeiro.conciliacao', 'ver'))
);
