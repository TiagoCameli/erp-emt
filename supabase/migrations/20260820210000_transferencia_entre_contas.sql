-- Transferencia entre contas: a movimentacao de dinheiro entre as contas da
-- propria EMT, que ate agora nao existia no app.
--
-- ## Por que tabela propria, e nao um par de lancamentos
--
-- O caminho obvio seria criar um lancamento a_pagar na origem e um a_receber no
-- destino. Seria errado: `lancamentos` alimenta o DRE. Tirar R$ 100 mil do BB e
-- por na Caixa viraria R$ 100 mil de DESPESA e R$ 100 mil de RECEITA no mesmo
-- mes, inflando os dois lados de um resultado em que nada aconteceu. Alem
-- disso, todo lancamento exige centro de custo no rateio, e transferencia nao
-- tem centro de custo: ninguem gastou nada.
--
-- Entao a transferencia e uma entidade propria, que mexe em SALDO DE CONTA e
-- nao em resultado. Quem le isso e `fn_rel_posicao_bancaria`, estendida no fim
-- deste arquivo.
--
-- ## Decisoes do Tiago (20/08/2026)
--
-- 1. SEM aprovacao. Registro direto: e movimentacao entre contas da propria
--    empresa, nao pagamento a terceiro, entao o risco e de digitacao e nao de
--    desvio. A auditoria e a lixeira continuam valendo, entao nada se perde.
-- 2. COM campo de tarifa, e a tarifa NAO tem centro de custo. Ele foi avisado
--    de que isso cria uma saida de dinheiro fora do DRE e reafirmou a escolha.
--    Consequencia registrada aqui para quem ler depois: a tarifa sai do saldo da
--    conta de origem e NAO aparece em nenhum relatorio de custo. Se um dia a
--    tarifa precisar entrar no resultado, ela vira lancamento proprio na
--    categoria "Tarifa Bancaria", que ja existe no cadastro.
--
-- ## Competencia fechada NAO trava a transferencia
--
-- De proposito. `fn_exigir_competencia_aberta` existe para proteger o
-- RESULTADO de um mes ja fechado, e transferencia nao entra no resultado. Travar
-- por competencia impediria registrar a movimentacao de caixa de um mes fechado
-- -- que e exatamente o caso da carga historica de 2025 em diante (jan/2025 a
-- jun/2026 estao todos fechados hoje).

-- ---------------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------------

create table if not exists public.transferencias_contas (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  conta_origem_id uuid not null references public.contas_bancarias (id),
  conta_destino_id uuid not null references public.contas_bancarias (id),
  data_transferencia date not null,
  -- VALOR e dinheiro que muda de conta: duas casas, como manda casas-decimais.ts.
  valor numeric(14, 2) not null,
  tarifa numeric(14, 2) not null default 0,
  descricao text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  constraint transferencias_contas_contas_diferentes
    check (conta_origem_id <> conta_destino_id),
  constraint transferencias_contas_valor_positivo
    check (valor > 0),
  constraint transferencias_contas_tarifa_nao_negativa
    check (tarifa >= 0)
);

comment on table public.transferencias_contas is
  'Movimentacao de dinheiro entre contas da propria EMT. Nao entra no DRE: mexe em saldo de conta, nao em resultado.';
comment on column public.transferencias_contas.tarifa is
  'Tarifa bancaria da transferencia. Sai da conta de ORIGEM junto com o valor. Sem centro de custo, por decisao do Tiago em 20/08/2026: nao aparece em relatorio de custo.';
comment on column public.transferencias_contas.data_transferencia is
  'Data em que o dinheiro mudou de conta. Nao ha mes de competencia: transferencia e caixa, nao resultado.';

-- Os dois indices que as telas usam: a listagem ordena por data desc, e a
-- posicao bancaria agrupa por conta. Sem eles a soma por conta faz seq scan.
create index if not exists idx_transferencias_contas_data
  on public.transferencias_contas (data_transferencia desc, id);
create index if not exists idx_transferencias_contas_origem
  on public.transferencias_contas (conta_origem_id);
create index if not exists idx_transferencias_contas_destino
  on public.transferencias_contas (conta_destino_id);

-- ---------------------------------------------------------------------------
-- 2. Triggers padrao
-- ---------------------------------------------------------------------------

drop trigger if exists trg_transferencias_contas_updated_at on public.transferencias_contas;
create trigger trg_transferencias_contas_updated_at
  before update on public.transferencias_contas
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_set_created_by on public.transferencias_contas;
create trigger trg_set_created_by
  before insert on public.transferencias_contas
  for each row execute function public.fn_set_created_by();

drop trigger if exists trg_audit_transferencias_contas on public.transferencias_contas;
create trigger trg_audit_transferencias_contas
  after insert or update or delete on public.transferencias_contas
  for each row execute function public.fn_audit();

-- ---------------------------------------------------------------------------
-- 3. RLS e grants
-- ---------------------------------------------------------------------------
-- Tabela nova nao herda privilegio nenhum: o grant e explicito e so do que as
-- policies permitem. Nao ha policy de INSERT/UPDATE/DELETE porque toda mutacao
-- passa pelas RPCs security definer abaixo -- entao tambem nao ha grant delas.
-- `anon` nao recebe nada.

alter table public.transferencias_contas enable row level security;

drop policy if exists transferencias_contas_select on public.transferencias_contas;
create policy transferencias_contas_select on public.transferencias_contas
  for select to authenticated
  using (
    (select public.tem_permissao('financeiro.transferencias', 'ver'))
    or (select public.tem_permissao('financeiro.relatorios', 'ver'))
    or (select public.tem_permissao('financeiro.contas-bancarias', 'ver'))
  );

grant select on public.transferencias_contas to authenticated;

-- Quem ve a transferencia precisa ler o nome das duas contas, senao a tela
-- mostra dois uuids. A policy de contas_bancarias e recriada IGUAL a que estava
-- em 20/08/2026 (as cinco chaves lidas de pg_policy na hora), com a chave nova
-- acrescentada no fim. Reescrever de cabeca aqui teria ampliado o acesso sem
-- ninguem pedir.
drop policy if exists contas_bancarias_select on public.contas_bancarias;
create policy contas_bancarias_select on public.contas_bancarias
  for select to authenticated
  using (
    (select public.tem_permissao('financeiro.contas-bancarias', 'ver'))
    or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.recebimentos', 'ver'))
    or (select public.tem_permissao('financeiro.transferencias', 'ver'))
  );

-- ---------------------------------------------------------------------------
-- 4. Salvar (cria e edita)
-- ---------------------------------------------------------------------------

create or replace function public.fn_salvar_transferencia(
  p_id uuid,
  p_conta_origem_id uuid,
  p_conta_destino_id uuid,
  p_data date,
  p_valor numeric,
  p_tarifa numeric default 0,
  p_descricao text default null,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_acao text := case when p_id is null then 'criar' else 'editar' end;
  v_tarifa numeric(14, 2) := round(coalesce(p_tarifa, 0), 2);
  v_valor numeric(14, 2) := round(coalesce(p_valor, 0), 2);
begin
  if not public.tem_permissao('financeiro.transferencias', v_acao) then
    raise exception 'Sem permissao para % transferencias', v_acao;
  end if;

  if p_conta_origem_id is null or p_conta_destino_id is null then
    raise exception 'Escolha a conta de origem e a de destino';
  end if;
  if p_conta_origem_id = p_conta_destino_id then
    raise exception 'A conta de origem e a de destino precisam ser diferentes';
  end if;
  if p_data is null then
    raise exception 'Informe a data da transferencia';
  end if;
  if v_valor <= 0 then
    raise exception 'O valor da transferencia precisa ser maior que zero';
  end if;
  if v_tarifa < 0 then
    raise exception 'A tarifa nao pode ser negativa';
  end if;

  -- Conta inativa nao entra: o seletor da tela so lista ativa, entao aceitar
  -- aqui deixaria a transferencia apontando para um cadastro que a tela nao
  -- sabe nomear.
  if exists (
    select 1 from public.contas_bancarias c
    where c.id in (p_conta_origem_id, p_conta_destino_id) and not c.ativo
  ) then
    raise exception 'Conta bancaria inativa nao pode receber nem enviar transferencia';
  end if;

  if p_id is null then
    insert into public.transferencias_contas (
      numero, conta_origem_id, conta_destino_id, data_transferencia,
      valor, tarifa, descricao, observacoes
    )
    values (
      public.proximo_numero_documento('TRF'),
      p_conta_origem_id, p_conta_destino_id, p_data,
      v_valor, v_tarifa,
      nullif(btrim(coalesce(p_descricao, '')), ''),
      nullif(btrim(coalesce(p_observacoes, '')), '')
    )
    returning id into v_id;
  else
    update public.transferencias_contas
    set conta_origem_id = p_conta_origem_id,
        conta_destino_id = p_conta_destino_id,
        data_transferencia = p_data,
        valor = v_valor,
        tarifa = v_tarifa,
        descricao = nullif(btrim(coalesce(p_descricao, '')), ''),
        observacoes = nullif(btrim(coalesce(p_observacoes, '')), '')
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Transferencia nao encontrada';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.fn_salvar_transferencia(uuid, uuid, uuid, date, numeric, numeric, text, text) from public;
grant execute on function public.fn_salvar_transferencia(uuid, uuid, uuid, date, numeric, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Excluir (lixeira, com motivo)
-- ---------------------------------------------------------------------------
-- Regra de ouro 7: transacional vai para a lixeira com motivo, nao some. Reusa
-- a mesma tabela `lixeira` dos cadastros -- o restaurador ja sabe ler dela.

create or replace function public.fn_excluir_transferencia(
  p_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_dados jsonb;
begin
  if not public.tem_permissao('financeiro.transferencias', 'excluir') then
    raise exception 'Sem permissao para excluir transferencias';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusao';
  end if;

  select to_jsonb(t) into v_dados
  from public.transferencias_contas t where t.id = p_id;

  if v_dados is null then
    raise exception 'Transferencia nao encontrada';
  end if;

  insert into public.lixeira (tabela, registro_id, dados, motivo, excluido_por)
  values ('transferencias_contas', p_id::text, v_dados, p_motivo, (select auth.uid()));

  delete from public.transferencias_contas where id = p_id;
end;
$$;

revoke all on function public.fn_excluir_transferencia(uuid, text) from public;
grant execute on function public.fn_excluir_transferencia(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. A posicao bancaria passa a enxergar a transferencia
-- ---------------------------------------------------------------------------
-- Mesma assinatura de antes (conta_bancaria_id, tipo, total), entao nenhum
-- consumidor quebra e nao ha DROP nem re-grant. O que muda e que agora ela
-- devolve tambem duas linhas novas por conta:
--
--   'transferencia_entrada' -> o que a conta RECEBEU (soma do valor)
--   'transferencia_saida'   -> o que a conta MANDOU (valor + tarifa)
--
-- A tarifa entra na saida da origem e NAO na entrada do destino, porque e isso
-- que o banco faz: debita o valor mais a tarifa e credita so o valor.
--
-- Quem soma isso do lado do Node (`movimentoPorContaEmCentavos`) trata como
-- POSITIVO apenas 'a_receber' e 'transferencia_entrada'. Sem essa mudanca no TS,
-- a entrada de transferencia entraria subtraindo.

create or replace function public.fn_rel_posicao_bancaria()
returns table(conta_bancaria_id uuid, tipo text, total numeric)
language sql
stable
set search_path to ''
as $$
  -- valor_liquido, nao valor: aqui so entra parcela paga, e o que a conta
  -- movimentou foi o liquido.
  select p.conta_bancaria_id, l.tipo, sum(p.valor_liquido) as total
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.status = 'pago'
    and p.conta_bancaria_id is not null
    and l.status <> 'cancelado'
  group by p.conta_bancaria_id, l.tipo

  union all

  select t.conta_destino_id, 'transferencia_entrada', sum(t.valor)
  from public.transferencias_contas t
  group by t.conta_destino_id

  union all

  select t.conta_origem_id, 'transferencia_saida', sum(t.valor + t.tarifa)
  from public.transferencias_contas t
  group by t.conta_origem_id
$$;

-- ---------------------------------------------------------------------------
-- 7. Permissoes
-- ---------------------------------------------------------------------------
-- O recurso novo espelha exatamente quem hoje tem `financeiro.contas-bancarias`:
-- quem mexe no cadastro da conta e quem move dinheiro entre elas e a mesma
-- pessoa. Admin e Financeiro fazem tudo, Gestor so ve.
--
-- As duas tabelas precisam ser preenchidas: `usuario_permissoes` NAO e derivada
-- de `perfil_permissoes` em tempo de leitura, e um recurso novo so no perfil
-- deixaria a aba invisivel para todo mundo que ja existe.

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select pp.perfil_id, 'financeiro.transferencias', pp.acao
from public.perfil_permissoes pp
where pp.recurso = 'financeiro.contas-bancarias'
on conflict do nothing;

insert into public.usuario_permissoes (usuario_id, recurso, acao)
select up.usuario_id, 'financeiro.transferencias', up.acao
from public.usuario_permissoes up
where up.recurso = 'financeiro.contas-bancarias'
on conflict do nothing;
