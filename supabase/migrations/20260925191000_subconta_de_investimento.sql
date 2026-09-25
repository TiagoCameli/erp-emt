-- =============================================================
-- Toda conta bancaria ganha uma SUBCONTA DE INVESTIMENTOS
--
-- PEDIDO DO TIAGO (24/09/2026): "todas as contas bancarias deve ter uma
-- subconta de investimentos para onde o dinheiro vai quando um investimento e
-- lancado". Escolha dele: saldo SEPARADO (a conta corrente mostra so o que esta
-- disponivel; o aplicado mora na subconta).
--
-- ============================================================
-- COMO FUNCIONA
-- ============================================================
-- A subconta e uma linha de `contas_bancarias` com tipo 'investimento' e
-- `conta_pai_id` apontando para a conta. Aplicar e uma TRANSFERENCIA da conta
-- para a subconta; resgatar e a transferencia de volta. Transferencia ja tem
-- tudo o que uma aplicacao precisa: move o saldo das duas pontas, fica fora do
-- DRE, do custo e do fluxo de caixa operacional, e concilia com o extrato OFX
-- (as duas pontas, desde 14/09).
--
-- O que a transferencia NAO tinha, e ganha aqui: a APLICACAO (CDB, fundo). Vai
-- em `centro_custo_id`, que aponta para uma etapa do centro de investimento
-- (20260925190000). E obrigatoria quando uma das pontas e subconta, e proibida
-- quando nenhuma e: transferencia entre contas correntes nao e investimento.
--
-- Guarda de coerencia: a subconta so troca dinheiro com a PROPRIA conta. Aplicar
-- do BB na subconta da Caixa nao existe no banco, e deixaria as duas erradas.
--
-- Permissao de ver saldo: a subconta herda a da conta-mae. Quem ve o saldo da
-- Caixa ve o aplicado da Caixa; quem nao ve, nao ve nenhum dos dois.
-- =============================================================

-- ---------- 1. a coluna e as regras ----------
alter table public.contas_bancarias drop constraint contas_bancarias_tipo_check;
alter table public.contas_bancarias add constraint contas_bancarias_tipo_check
  check (tipo = any (array['corrente', 'poupanca', 'caixa', 'investimento']));

alter table public.contas_bancarias
  add column conta_pai_id uuid references public.contas_bancarias(id);

alter table public.contas_bancarias add constraint contas_bancarias_subconta_tem_pai
  check ((tipo = 'investimento') = (conta_pai_id is not null));

create unique index contas_bancarias_uma_subconta_por_conta
  on public.contas_bancarias (conta_pai_id) where conta_pai_id is not null;

-- So leitura: a subconta e criada e mantida pelo banco, nunca pelo formulario.
grant select (conta_pai_id) on public.contas_bancarias to authenticated;

comment on column public.contas_bancarias.conta_pai_id is
  'Subconta de investimentos: a conta corrente dona dela. Criada pelo trigger trg_conta_cria_subconta.';

-- ---------- 2. a subconta nasce e acompanha a conta ----------
create or replace function public.fn_conta_cria_subconta()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.tipo in ('corrente', 'poupanca') then
    insert into public.contas_bancarias (
      nome, banco, agencia, conta, tipo, saldo_inicial, saldo_inicial_data,
      ativo, conta_pai_id, created_by
    )
    values (
      new.nome || ' · INVESTIMENTOS', new.banco, new.agencia, new.conta,
      'investimento', 0, new.saldo_inicial_data, new.ativo, new.id, new.created_by
    )
    on conflict do nothing;
  end if;
  return new;
end $function$;

create or replace function public.fn_conta_atualiza_subconta()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.nome is distinct from old.nome or new.ativo is distinct from old.ativo
     or new.banco is distinct from old.banco or new.agencia is distinct from old.agencia
     or new.conta is distinct from old.conta then
    update public.contas_bancarias
    set nome = new.nome || ' · INVESTIMENTOS',
        ativo = new.ativo,
        banco = new.banco,
        agencia = new.agencia,
        conta = new.conta
    where conta_pai_id = new.id;
  end if;
  return new;
end $function$;

revoke all on function public.fn_conta_cria_subconta() from public;
revoke all on function public.fn_conta_atualiza_subconta() from public;

create trigger trg_conta_cria_subconta
  after insert on public.contas_bancarias
  for each row execute function public.fn_conta_cria_subconta();

create trigger trg_conta_atualiza_subconta
  after update on public.contas_bancarias
  for each row when (old.conta_pai_id is null)
  execute function public.fn_conta_atualiza_subconta();

-- As contas que ja existem, inclusive as inativas: o trigger acima e de INSERT,
-- entao uma conta reativada depois nao ganharia subconta. A de conta inativa ja
-- nasce inativa (e o trigger de UPDATE reativa as duas juntas).
insert into public.contas_bancarias (
  nome, banco, agencia, conta, tipo, saldo_inicial, saldo_inicial_data,
  ativo, conta_pai_id
)
select c.nome || ' · INVESTIMENTOS', c.banco, c.agencia, c.conta, 'investimento',
       0, c.saldo_inicial_data, c.ativo, c.id
from public.contas_bancarias c
where c.tipo in ('corrente', 'poupanca')
  and not exists (select 1 from public.contas_bancarias s where s.conta_pai_id = c.id);

-- ---------- 3. ver saldo: a subconta herda da mae ----------
create or replace function public.fn_pode_ver_saldo(p_conta uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select
    (select public.tem_permissao('administracao.usuarios', 'editar'))
    or exists (
      select 1 from public.usuario_conta_saldo x
      where x.usuario_id = (select auth.uid())
        and x.conta_bancaria_id = coalesce(
          (select c.conta_pai_id from public.contas_bancarias c where c.id = p_conta),
          p_conta
        )
    );
$function$;

-- ---------- 4. a transferencia sabe qual aplicacao ----------
alter table public.transferencias_contas
  add column centro_custo_id uuid references public.centros_custo(id);

grant select (centro_custo_id) on public.transferencias_contas to authenticated;

comment on column public.transferencias_contas.centro_custo_id is
  'A aplicacao (etapa do centro de investimento) quando uma ponta e subconta de investimentos. Nula entre contas correntes.';

create index transferencias_contas_centro_custo_idx
  on public.transferencias_contas (centro_custo_id) where centro_custo_id is not null;

drop function public.fn_salvar_transferencia(uuid, uuid, uuid, date, numeric, numeric, text, text);

create function public.fn_salvar_transferencia(
  p_id uuid,
  p_conta_origem_id uuid,
  p_conta_destino_id uuid,
  p_data date,
  p_valor numeric,
  p_tarifa numeric default 0,
  p_descricao text default null,
  p_observacoes text default null,
  p_centro_custo_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_acao text := case when p_id is null then 'criar' else 'editar' end;
  v_tarifa numeric(14, 2) := round(coalesce(p_tarifa, 0), 2);
  v_valor numeric(14, 2) := round(coalesce(p_valor, 0), 2);
  v_origem public.contas_bancarias;
  v_destino public.contas_bancarias;
  v_investimento boolean;
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

  select * into v_origem from public.contas_bancarias where id = p_conta_origem_id;
  select * into v_destino from public.contas_bancarias where id = p_conta_destino_id;

  if not v_origem.ativo or not v_destino.ativo then
    raise exception 'Conta bancaria inativa nao pode receber nem enviar transferencia';
  end if;

  v_investimento := v_origem.tipo = 'investimento' or v_destino.tipo = 'investimento';

  if v_investimento then
    -- A subconta so troca dinheiro com a propria conta.
    if coalesce(v_origem.conta_pai_id, v_origem.id) <> coalesce(v_destino.conta_pai_id, v_destino.id) then
      raise exception 'A subconta de investimentos so recebe e devolve dinheiro da propria conta';
    end if;
    if p_centro_custo_id is null then
      raise exception 'Escolha a aplicacao (CDB, fundo) desta movimentacao';
    end if;
    if not exists (
      select 1 from public.centros_custo e
      join public.centros_custo raiz on raiz.id = e.pai_id
      where e.id = p_centro_custo_id and e.nivel = 2 and raiz.tipo = 'investimento'
    ) then
      raise exception 'A aplicacao escolhida nao e uma aplicacao do centro de investimentos';
    end if;
  elsif p_centro_custo_id is not null then
    raise exception 'Transferencia entre contas correntes nao tem aplicacao';
  end if;

  if p_id is null then
    insert into public.transferencias_contas (
      numero, conta_origem_id, conta_destino_id, data_transferencia,
      valor, tarifa, descricao, observacoes, centro_custo_id
    )
    values (
      public.proximo_numero_documento('TRF'),
      p_conta_origem_id, p_conta_destino_id, p_data,
      v_valor, v_tarifa,
      nullif(btrim(coalesce(p_descricao, '')), ''),
      nullif(btrim(coalesce(p_observacoes, '')), ''),
      p_centro_custo_id
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
        observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''),
        centro_custo_id = p_centro_custo_id
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Transferencia nao encontrada';
    end if;
  end if;

  return v_id;
end;
$function$;

revoke all on function public.fn_salvar_transferencia(uuid, uuid, uuid, date, numeric, numeric, text, text, uuid) from public, anon;
grant execute on function public.fn_salvar_transferencia(uuid, uuid, uuid, date, numeric, numeric, text, text, uuid) to authenticated;
