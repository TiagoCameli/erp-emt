-- =============================================================
-- Financeiro > Aplicacoes: cadastro, posicao do extrato, rendimento e CDI
--
-- PEDIDO DO TIAGO (25/09/2026): controlar as aplicacoes com o saldo batendo com
-- o banco, mostrando rendimento e rentabilidade. Aplicar e resgatar CONTINUAM
-- transferencia com etapa (20260925191000); nada aqui mexe nelas.
--
-- ============================================================
-- A REGRA, por aplicacao
-- ============================================================
-- Uma vez por mes (ou quando o Tiago quiser) grava-se a POSICAO do extrato: o
-- saldo LIQUIDO da aplicacao numa data, com o PDF anexado. Bruto, IR e IOF sao
-- so informacao.
--
--   rendimento da posicao = liquido desta - liquido da anterior
--                           - aplicado + resgatado no intervalo (anterior, esta]
--
-- A posicao e o saldo do FIM do dia, entao a transferencia do mesmo dia entra no
-- periodo dela. Sem posicao anterior, a anterior vale zero.
--
-- Cada posicao gera UM lancamento (origem 'aplicacao', origem_id = a posicao),
-- ja pago na subconta, na data da posicao, rateio 100% na etapa. Assim o saldo
-- da subconta = soma das posicoes liquidas + o que se aplicou e resgatou depois
-- da ultima. Regravar atualiza o MESMO lancamento; o indice unico em
-- (origem_id) where origem = 'aplicacao' torna duplicidade impossivel, nao so
-- improvavel.
--
-- Recalculo: gravar, regravar ou excluir uma posicao recalcula ela e as
-- posteriores. Uma transferencia de aplicacao lancada, editada ou apagada com
-- data antiga recalcula tambem (trigger), sem tocar a transferencia.
--
-- Categorias:
--   rendimento >= 0       -> 'Juros de aplicacoes financeiras' (receita, financeira)
--   rendimento <  0       -> 'Rendimento negativo de aplicacoes financeiras'
--                            (despesa, financeira), lancamento a_pagar
--   posicao de ABERTURA   -> 'Ajuste de abertura de aplicacoes' (movimentacao)
--
-- ============================================================
-- A ABERTURA (decisao do Tiago em 25/09/2026)
-- ============================================================
-- A primeira posicao (25/09/2026) carrega o saldo anterior a abril e o
-- rendimento passado: 90.374,18 no CDB e 13.923,78 no Fundo. Isso NAO e receita
-- de setembro. Vai numa categoria de natureza MOVIMENTACAO, que ja fica fora do
-- fluxo de caixa, do custo e do resultado. O Tiago pediu que nem apareca no DRE,
-- entao fn_rel_dre tira lancamento de origem 'aplicacao' com natureza
-- movimentacao.
--
-- O que precisou mudar para a abertura mover a subconta: lancamento de natureza
-- movimentacao fica fora do saldo bancario (22/08/2026). A excecao e UMA, e
-- estreita: origem = 'aplicacao'. So fn_rel_posicao_bancaria (que alimenta
-- fn_saldo_conta e fn_saldos_das_contas) e fn_extrato_conta ganham o "or".
--
-- Por que nao uma natureza nova: tocaria 19 funcoes e 10+ arquivos TS, e
-- natureza desconhecida cai em OPERACIONAL no DRE (calculo.ts), entao um
-- descompasso de deploy transformaria o ajuste em receita operacional.
-- Por que nao mexer no saldo_inicial: e um numero por CONTA (nao separa CDB e
-- Fundo) e quebraria a identidade saldo_inicial = aplicado - resgatado ate
-- 26/08 que o #313 registrou.
--
-- A carga da abertura NAO esta aqui: vai em migration propria, depois da prova.
-- =============================================================

-- ---------- 1. categorias ----------
insert into public.categorias_financeiras (id, nome, tipo, natureza, ativo)
values
  ('9feb495d-3d71-48b6-b509-2c798cb45e19', 'Ajuste de abertura de aplicações', 'receita', 'movimentacao', true),
  ('d0157304-467a-4def-81fd-09660a0e02af', 'Rendimento negativo de aplicações financeiras', 'despesa', 'financeira', true)
on conflict (id) do nothing;

do $cat$
begin
  if not exists (
    select 1 from public.categorias_financeiras
    where id = 'ad676dc2-eb07-49ec-9005-ed85f98f9dbe'
      and tipo = 'receita' and natureza = 'financeira'
  ) then
    raise exception 'Categoria Juros de aplicacoes financeiras nao encontrada com tipo/natureza esperados';
  end if;
end $cat$;

-- ---------- 2. origem nova de lancamento ----------
alter table public.lancamentos drop constraint lancamentos_origem_check;
alter table public.lancamentos add constraint lancamentos_origem_check
  check (origem = any (array[
    'oc', 'manual', 'diaria', 'folha', 'folha_guia', 'adiantamento', 'rescisao',
    'decimo_terceiro', 'ferias', 'decimo_terceiro_guia', 'ferias_guia', 'aplicacao'
  ]));

create unique index lancamentos_um_por_posicao_de_aplicacao
  on public.lancamentos (origem_id) where origem = 'aplicacao';

-- ---------- 3. cadastro da aplicacao ----------
create table public.aplicacoes (
  id uuid primary key default gen_random_uuid(),
  centro_custo_id uuid not null unique references public.centros_custo(id),
  conta_bancaria_id uuid not null references public.contas_bancarias(id),
  produto text not null check (produto in ('cdb', 'fundo', 'lca', 'lci', 'tesouro', 'outro')),
  indexador text not null default 'cdi' check (indexador in ('cdi', 'ipca', 'pre', 'outro')),
  -- % do indexador (95 = 95% do CDI). Taxa: 4 casas.
  taxa_percentual numeric(8, 4) check (taxa_percentual is null or taxa_percentual > 0),
  liquidez text not null check (liquidez in ('diaria', 'd_mais_n', 'carencia')),
  liquidez_dias smallint check (liquidez_dias is null or liquidez_dias > 0),
  carencia_ate date,
  vencimento date,
  tipo_ir text not null check (tipo_ir in ('regressivo', 'come_cotas', 'isento')),
  ativa boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint aplicacoes_d_mais_n_tem_dias check (liquidez <> 'd_mais_n' or liquidez_dias is not null),
  constraint aplicacoes_carencia_tem_data check (liquidez <> 'carencia' or carencia_ate is not null)
);

comment on table public.aplicacoes is
  'Cadastro da aplicacao financeira. Uma por etapa do centro de investimento; o dinheiro mora na subconta (conta_bancaria_id).';

create index aplicacoes_conta_idx on public.aplicacoes (conta_bancaria_id);

-- ---------- 4. posicao do extrato ----------
create table public.aplicacao_posicoes (
  id uuid primary key default gen_random_uuid(),
  aplicacao_id uuid not null references public.aplicacoes(id),
  data date not null,
  saldo_liquido numeric(14, 2) not null check (saldo_liquido >= 0),
  saldo_bruto numeric(14, 2) check (saldo_bruto is null or saldo_bruto >= 0),
  ir numeric(14, 2) check (ir is null or ir >= 0),
  iof numeric(14, 2) check (iof is null or iof >= 0),
  -- A abertura carrega saldo anterior e rendimento passado: o lancamento dela
  -- vai na categoria de ajuste, nao em juros. Marcada so pela carga.
  e_abertura boolean not null default false,
  observacoes text,
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint aplicacao_posicoes_exclusao_tem_motivo
    check (excluido_em is null or coalesce(btrim(motivo_exclusao), '') <> '')
);

create unique index aplicacao_posicoes_uma_por_dia
  on public.aplicacao_posicoes (aplicacao_id, data) where excluido_em is null;
create unique index aplicacao_posicoes_uma_abertura
  on public.aplicacao_posicoes (aplicacao_id) where e_abertura and excluido_em is null;

-- ---------- 5. CDI ----------
-- Diario: serie 12 do SGS (% ao dia, 8 casas), usada para o % do CDI exato em
-- qualquer periodo entre duas posicoes. Mensal: serie 4391 (% no mes, 2 casas),
-- conferencia e reserva quando a diaria falhar (carga manual).
create table public.cdi_diario (
  data date primary key,
  taxa numeric(12, 8) not null,
  fonte text not null default 'bcb' check (fonte in ('bcb', 'manual')),
  atualizado_em timestamptz not null default now()
);

create table public.cdi_mensal (
  mes date primary key check (extract(day from mes) = 1),
  taxa numeric(8, 4) not null,
  fonte text not null default 'bcb' check (fonte in ('bcb', 'manual')),
  parcial boolean not null default false,
  atualizado_em timestamptz not null default now()
);

-- ---------- 6. RLS, grants, auditoria ----------
alter table public.aplicacoes enable row level security;
alter table public.aplicacao_posicoes enable row level security;
alter table public.cdi_diario enable row level security;
alter table public.cdi_mensal enable row level security;

create policy aplicacoes_select on public.aplicacoes
  for select to authenticated
  using ((select public.tem_permissao('financeiro.aplicacoes', 'ver')));

-- A posicao E saldo: alem da aba, exige ver o saldo da subconta (que herda o da
-- conta-mae). Sem permissao a linha nao vem, e ausencia nao e zero.
create policy aplicacao_posicoes_select on public.aplicacao_posicoes
  for select to authenticated
  using (
    (select public.tem_permissao('financeiro.aplicacoes', 'ver'))
    and public.fn_pode_ver_saldo(
      (select a.conta_bancaria_id from public.aplicacoes a where a.id = aplicacao_id)
    )
  );

create policy cdi_diario_select on public.cdi_diario
  for select to authenticated
  using ((select public.tem_permissao('financeiro.aplicacoes', 'ver')));

create policy cdi_mensal_select on public.cdi_mensal
  for select to authenticated
  using ((select public.tem_permissao('financeiro.aplicacoes', 'ver')));

-- Escrita so por funcao definer: nenhum grant de insert/update/delete.
revoke all on table public.aplicacoes from anon, authenticated;
revoke all on table public.aplicacao_posicoes from anon, authenticated;
revoke all on table public.cdi_diario from anon, authenticated;
revoke all on table public.cdi_mensal from anon, authenticated;
grant select on table public.aplicacoes to authenticated;
grant select on table public.aplicacao_posicoes to authenticated;
grant select on table public.cdi_diario to authenticated;
grant select on table public.cdi_mensal to authenticated;

create trigger trg_audit_aplicacoes
  after insert or update or delete on public.aplicacoes
  for each row execute function public.fn_audit();
create trigger trg_audit_aplicacao_posicoes
  after insert or update or delete on public.aplicacao_posicoes
  for each row execute function public.fn_audit();
create trigger trg_aplicacoes_updated_at
  before update on public.aplicacoes
  for each row execute function public.fn_set_updated_at();
create trigger trg_aplicacao_posicoes_updated_at
  before update on public.aplicacao_posicoes
  for each row execute function public.fn_set_updated_at();
create trigger trg_aplicacoes_created_by
  before insert on public.aplicacoes
  for each row execute function public.fn_set_created_by();
create trigger trg_aplicacao_posicoes_created_by
  before insert on public.aplicacao_posicoes
  for each row execute function public.fn_set_created_by();

-- ---------- 7. as duas aplicacoes que existem ----------
-- Taxa do Fundo e vencimento do CDB ficam nulos ate o Tiago informar.
-- Liquidez diaria nas duas (Tiago, 25/09/2026).
insert into public.aplicacoes
  (centro_custo_id, conta_bancaria_id, produto, indexador, taxa_percentual, liquidez, tipo_ir)
values
  ('aacc7055-2fcb-48f9-bbcd-0e2ef4125fbb', '37ca9c33-859d-42d7-8c14-78a6119d0258', 'cdb', 'cdi', 95, 'diaria', 'regressivo'),
  ('29378afd-5b44-4935-b0d6-7e99979e955a', '37ca9c33-859d-42d7-8c14-78a6119d0258', 'fundo', 'cdi', null, 'diaria', 'come_cotas');

-- ---------- 8. permissao ----------
with acoes(recurso, acao) as (
  values ('financeiro.aplicacoes', 'ver'), ('financeiro.aplicacoes', 'editar')
)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao
from public.perfis p cross join acoes a
where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (
  values ('financeiro.aplicacoes', 'ver'), ('financeiro.aplicacoes', 'editar')
)
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select u.id, a.recurso, a.acao
from public.usuarios u
join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
cross join acoes a
where u.ativo and u.excluido_em is null
on conflict (usuario_id, recurso, acao) do nothing;

do $confere$
declare v_admins int; v_linhas int;
begin
  select count(*) into v_admins
  from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
  where u.ativo and u.excluido_em is null;
  select count(*) into v_linhas
  from public.usuario_permissoes where recurso = 'financeiro.aplicacoes';
  if v_admins = 0 or v_linhas <> v_admins * 2 then
    raise exception 'Permissao financeiro.aplicacoes: % admins, % linhas', v_admins, v_linhas;
  end if;
end $confere$;

-- ---------- 9. anexo do extrato ----------
create or replace function public.fn_recurso_da_entidade(p_tipo text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case p_tipo
    when 'cotacao'        then 'compras.cotacoes'
    when 'ordem_compra'   then 'compras.ordens'
    when 'lancamento'     then 'financeiro.lancamentos'
    when 'pagamento'      then 'financeiro.pagamentos'
    when 'rh_documento'   then 'rh.documentos'
    when 'rh_epi'         then 'rh.epis'
    when 'rh_ocorrencia'  then 'rh.ocorrencias'
    when 'equipamento_documento' then 'cadastros.equipamentos'
    when 'frete'          then 'frete.fretes'
    when 'frete_chegada'  then 'frete.fretes'
    when 'frete_pagamento' then 'frete.pagamentos'
    when 'pedido_material' then 'frete.pedidos-material'
    when 'combustivel_entrada' then 'combustivel.entradas'
    when 'combustivel_saida' then 'combustivel.saidas'
    when 'combustivel_transferencia' then 'combustivel.transferencias'
    when 'manutencao_os'  then 'manutencao.servicos'
    when 'aplicacao_posicao' then 'financeiro.aplicacoes'
    else null
  end;
$function$;

-- ---------- 10. o motor: sincronizar o lancamento de UMA posicao ----------
create or replace function public.fn_aplicacao_sincronizar_posicao(p_posicao uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c_juros constant uuid := 'ad676dc2-eb07-49ec-9005-ed85f98f9dbe';
  c_negativo constant uuid := 'd0157304-467a-4def-81fd-09660a0e02af';
  c_abertura constant uuid := '9feb495d-3d71-48b6-b509-2c798cb45e19';
  v_aplicacao uuid; v_data date; v_saldo numeric(14, 2); v_abertura boolean; v_excluida boolean;
  v_etapa uuid; v_etapa_nome text; v_conta uuid;
  v_data_ant date; v_saldo_ant numeric(14, 2);
  v_aplicado numeric(14, 2); v_resgatado numeric(14, 2); v_rend numeric(14, 2);
  v_valor numeric(14, 2); v_tipo text; v_categoria uuid; v_descricao text; v_mes date;
  v_lanc uuid; v_lanc_tipo text; v_lanc_cat uuid; v_lanc_valor numeric(14, 2);
  v_lanc_mes date; v_lanc_data date;
begin
  select p.aplicacao_id, p.data, p.saldo_liquido, p.e_abertura, p.excluido_em is not null
    into v_aplicacao, v_data, v_saldo, v_abertura, v_excluida
  from public.aplicacao_posicoes p where p.id = p_posicao;
  if v_aplicacao is null then
    raise exception 'Posicao nao encontrada';
  end if;

  select a.centro_custo_id, cc.nome, a.conta_bancaria_id
    into v_etapa, v_etapa_nome, v_conta
  from public.aplicacoes a join public.centros_custo cc on cc.id = a.centro_custo_id
  where a.id = v_aplicacao;

  select l.id, l.tipo, l.categoria_id, l.valor, l.mes_competencia, l.data_compra
    into v_lanc, v_lanc_tipo, v_lanc_cat, v_lanc_valor, v_lanc_mes, v_lanc_data
  from public.lancamentos l
  where l.origem = 'aplicacao' and l.origem_id = p_posicao;

  if v_lanc is not null and exists (
    select 1 from public.extrato_transacoes t
    join public.lancamento_parcelas lp on lp.id = t.parcela_id
    where lp.lancamento_id = v_lanc
  ) then
    raise exception 'O rendimento desta posicao esta conciliado com o extrato. Desfaca a conciliacao primeiro';
  end if;

  if not v_excluida then
    select p.data, p.saldo_liquido into v_data_ant, v_saldo_ant
    from public.aplicacao_posicoes p
    where p.aplicacao_id = v_aplicacao and p.excluido_em is null and p.data < v_data
    order by p.data desc limit 1;

    -- Resgate sai da subconta com a tarifa: e isso que o saldo dela perde.
    select
      coalesce(sum(t.valor) filter (where t.conta_destino_id = v_conta), 0),
      coalesce(sum(t.valor + t.tarifa) filter (where t.conta_origem_id = v_conta), 0)
      into v_aplicado, v_resgatado
    from public.transferencias_contas t
    where t.centro_custo_id = v_etapa
      and v_conta in (t.conta_origem_id, t.conta_destino_id)
      and t.data_transferencia <= v_data
      and (v_data_ant is null or t.data_transferencia > v_data_ant);

    v_rend := v_saldo - coalesce(v_saldo_ant, 0) - v_aplicado + v_resgatado;
  else
    v_rend := 0;
  end if;

  v_valor := abs(v_rend);
  v_mes := date_trunc('month', v_data)::date;
  if v_abertura then
    v_categoria := c_abertura;
    v_tipo := case when v_rend >= 0 then 'a_receber' else 'a_pagar' end;
    v_descricao := 'Ajuste de abertura · ' || v_etapa_nome;
  elsif v_rend >= 0 then
    v_categoria := c_juros;
    v_tipo := 'a_receber';
    v_descricao := 'Rendimento · ' || v_etapa_nome;
  else
    v_categoria := c_negativo;
    v_tipo := 'a_pagar';
    v_descricao := 'Rendimento negativo · ' || v_etapa_nome;
  end if;

  -- Excluida, ou rendimento zero: nao ha lancamento.
  if v_valor = 0 then
    if v_lanc is not null then
      perform public.fn_exigir_competencia_aberta(v_lanc_mes, 'aplicacao_posicao', p_posicao);
      delete from public.lancamentos where id = v_lanc;
    end if;
    return;
  end if;

  if v_lanc is not null then
    if v_lanc_tipo = v_tipo and v_lanc_cat = v_categoria
       and v_lanc_valor = v_valor and v_lanc_data = v_data then
      return;  -- nada mudou: nao gera trilha de auditoria a toa
    end if;
    perform public.fn_exigir_competencia_aberta(v_lanc_mes, 'aplicacao_posicao', p_posicao);
    perform public.fn_exigir_competencia_aberta(v_mes, 'aplicacao_posicao', p_posicao);

    update public.lancamentos
       set tipo = v_tipo, categoria_id = v_categoria, valor = v_valor,
           descricao = v_descricao, data_compra = v_data, data_vencimento = v_data,
           mes_competencia = v_mes, status = 'pago', centro_custo_id = v_etapa
     where id = v_lanc;
    update public.lancamento_parcelas
       set valor = v_valor, data_vencimento = v_data, data_pagamento = v_data,
           conta_bancaria_id = v_conta, status = 'pago'
     where lancamento_id = v_lanc;
    delete from public.lancamento_rateios where lancamento_id = v_lanc;
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id)
    values (v_lanc, v_etapa, v_valor, v_categoria);
    return;
  end if;

  perform public.fn_exigir_competencia_aberta(v_mes, 'aplicacao_posicao', p_posicao);

  insert into public.lancamentos (
    tipo, origem, origem_id, centro_custo_id, categoria_id, descricao, valor, status,
    data_compra, mes_competencia, data_vencimento, observacoes
  ) values (
    v_tipo, 'aplicacao', p_posicao, v_etapa, v_categoria, v_descricao, v_valor, 'pago',
    v_data, v_mes, v_data,
    'Gerado pela posicao de ' || to_char(v_data, 'DD/MM/YYYY')
      || '. Nao se edita aqui: regrave ou exclua a posicao em Financeiro > Aplicacoes.'
  ) returning id into v_lanc;

  insert into public.lancamento_parcelas (
    lancamento_id, numero_parcela, valor, data_vencimento, status,
    conta_bancaria_id, data_pagamento, pago_por, pago_em
  ) values (
    v_lanc, 1, v_valor, v_data, 'pago', v_conta, v_data, (select auth.uid()), now()
  );

  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id)
  values (v_lanc, v_etapa, v_valor, v_categoria);
end;
$function$;

revoke all on function public.fn_aplicacao_sincronizar_posicao(uuid) from public, anon, authenticated;

-- Recalcula as posicoes da aplicacao a partir de uma data (inclusive). So a
-- primeira posicao >= a data muda de fato; as seguintes saem inalteradas e o
-- sincronizar nao grava nada nelas.
create or replace function public.fn_aplicacao_recalcular(p_aplicacao uuid, p_desde date)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_id uuid;
begin
  for v_id in
    select p.id from public.aplicacao_posicoes p
    where p.aplicacao_id = p_aplicacao and p.excluido_em is null and p.data >= p_desde
    order by p.data
  loop
    perform public.fn_aplicacao_sincronizar_posicao(v_id);
  end loop;
end;
$function$;

revoke all on function public.fn_aplicacao_recalcular(uuid, date) from public, anon, authenticated;

-- ---------- 11. transferencia de aplicacao recalcula ----------
create or replace function public.fn_transferencia_recalcula_aplicacao()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_apl uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.centro_custo_id is not null then
    select a.id into v_apl from public.aplicacoes a where a.centro_custo_id = old.centro_custo_id;
    if v_apl is not null then
      perform public.fn_aplicacao_recalcular(v_apl, old.data_transferencia);
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.centro_custo_id is not null then
    v_apl := null;
    select a.id into v_apl from public.aplicacoes a where a.centro_custo_id = new.centro_custo_id;
    if v_apl is not null then
      perform public.fn_aplicacao_recalcular(v_apl, new.data_transferencia);
    end if;
  end if;
  return null;
end;
$function$;

revoke all on function public.fn_transferencia_recalcula_aplicacao() from public, anon, authenticated;

create trigger trg_transferencia_recalcula_aplicacao
  after insert or update or delete on public.transferencias_contas
  for each row execute function public.fn_transferencia_recalcula_aplicacao();

-- ---------- 12. gravar, simular e excluir posicao ----------
create or replace function public.fn_salvar_posicao_aplicacao(
  p_aplicacao_id uuid,
  p_data date,
  p_saldo_liquido numeric,
  p_saldo_bruto numeric default null,
  p_ir numeric default null,
  p_iof numeric default null,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_conta uuid; v_id uuid; v_abertura date;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
begin
  if not public.tem_permissao('financeiro.aplicacoes', 'editar') then
    raise exception 'Sem permissao para gravar posicao de aplicacao';
  end if;

  select a.conta_bancaria_id into v_conta
  from public.aplicacoes a where a.id = p_aplicacao_id for update;
  if v_conta is null then
    raise exception 'Aplicacao nao encontrada';
  end if;
  if not public.fn_pode_ver_saldo(v_conta) then
    raise exception 'Sem permissao para ver o saldo desta conta';
  end if;

  if p_data is null then raise exception 'Informe a data da posicao'; end if;
  if p_data > v_hoje then raise exception 'A posicao nao pode ter data futura'; end if;
  if p_saldo_liquido is null or p_saldo_liquido < 0 then
    raise exception 'Informe o saldo liquido da posicao';
  end if;
  if round(p_saldo_liquido, 2) <> p_saldo_liquido then
    raise exception 'Saldo liquido com mais de duas casas';
  end if;

  select p.data into v_abertura
  from public.aplicacao_posicoes p
  where p.aplicacao_id = p_aplicacao_id and p.e_abertura and p.excluido_em is null;
  if v_abertura is not null and p_data < v_abertura then
    raise exception 'A posicao nao pode ser anterior a abertura (%)', to_char(v_abertura, 'DD/MM/YYYY');
  end if;

  select p.id into v_id
  from public.aplicacao_posicoes p
  where p.aplicacao_id = p_aplicacao_id and p.data = p_data and p.excluido_em is null;

  if v_id is null then
    insert into public.aplicacao_posicoes
      (aplicacao_id, data, saldo_liquido, saldo_bruto, ir, iof, observacoes)
    values
      (p_aplicacao_id, p_data, p_saldo_liquido, p_saldo_bruto, p_ir, p_iof, nullif(btrim(p_observacoes), ''))
    returning id into v_id;
  else
    update public.aplicacao_posicoes
       set saldo_liquido = p_saldo_liquido, saldo_bruto = p_saldo_bruto, ir = p_ir, iof = p_iof,
           observacoes = nullif(btrim(p_observacoes), '')
     where id = v_id;
  end if;

  perform public.fn_aplicacao_recalcular(p_aplicacao_id, p_data);
  return v_id;
end;
$function$;

revoke all on function public.fn_salvar_posicao_aplicacao(uuid, date, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.fn_salvar_posicao_aplicacao(uuid, date, numeric, numeric, numeric, numeric, text) to authenticated;

-- O drawer mostra o rendimento ANTES de salvar, com a mesma conta do motor.
create or replace function public.fn_simular_posicao_aplicacao(
  p_aplicacao_id uuid, p_data date, p_saldo_liquido numeric
)
returns table(data_anterior date, saldo_anterior numeric, aplicado numeric, resgatado numeric, rendimento numeric, e_abertura boolean)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_conta uuid; v_etapa uuid;
begin
  if not public.tem_permissao('financeiro.aplicacoes', 'ver') then
    raise exception 'Sem permissao para ver aplicacoes';
  end if;
  select a.conta_bancaria_id, a.centro_custo_id into v_conta, v_etapa
  from public.aplicacoes a where a.id = p_aplicacao_id;
  if v_conta is null or not public.fn_pode_ver_saldo(v_conta) then
    return;
  end if;

  return query
  with ant as (
    select p.data, p.saldo_liquido from public.aplicacao_posicoes p
    where p.aplicacao_id = p_aplicacao_id and p.excluido_em is null and p.data < p_data
    order by p.data desc limit 1
  ),
  fl as (
    select
      coalesce(sum(t.valor) filter (where t.conta_destino_id = v_conta), 0)::numeric as apl,
      coalesce(sum(t.valor + t.tarifa) filter (where t.conta_origem_id = v_conta), 0)::numeric as res
    from public.transferencias_contas t
    where t.centro_custo_id = v_etapa
      and v_conta in (t.conta_origem_id, t.conta_destino_id)
      and t.data_transferencia <= p_data
      and (not exists (select 1 from ant) or t.data_transferencia > (select ant.data from ant))
  )
  select
    (select ant.data from ant),
    (select ant.saldo_liquido from ant)::numeric,
    fl.apl, fl.res,
    (p_saldo_liquido - coalesce((select ant.saldo_liquido from ant), 0) - fl.apl + fl.res)::numeric,
    coalesce((
      select p.e_abertura from public.aplicacao_posicoes p
      where p.aplicacao_id = p_aplicacao_id and p.data = p_data and p.excluido_em is null
    ), false)
  from fl;
end;
$function$;

revoke all on function public.fn_simular_posicao_aplicacao(uuid, date, numeric) from public, anon;
grant execute on function public.fn_simular_posicao_aplicacao(uuid, date, numeric) to authenticated;

create or replace function public.fn_excluir_posicao_aplicacao(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_apl uuid; v_data date; v_abertura boolean; v_conta uuid;
begin
  if not public.tem_permissao('financeiro.aplicacoes', 'editar') then
    raise exception 'Sem permissao para excluir posicao de aplicacao';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusao';
  end if;

  select p.aplicacao_id, p.data, p.e_abertura into v_apl, v_data, v_abertura
  from public.aplicacao_posicoes p where p.id = p_id and p.excluido_em is null;
  if v_apl is null then raise exception 'Posicao nao encontrada'; end if;
  if v_abertura then
    raise exception 'A posicao de abertura nao se exclui: regrave o valor dela';
  end if;

  select a.conta_bancaria_id into v_conta from public.aplicacoes a where a.id = v_apl for update;
  if not public.fn_pode_ver_saldo(v_conta) then
    raise exception 'Sem permissao para ver o saldo desta conta';
  end if;

  update public.aplicacao_posicoes
     set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo)
   where id = p_id;

  perform public.fn_aplicacao_sincronizar_posicao(p_id);   -- estorna o lancamento dela
  perform public.fn_aplicacao_recalcular(v_apl, v_data);   -- a seguinte ganha outra anterior
end;
$function$;

revoke all on function public.fn_excluir_posicao_aplicacao(uuid, text) from public, anon;
grant execute on function public.fn_excluir_posicao_aplicacao(uuid, text) to authenticated;

-- ---------- 13. editar o cadastro da aplicacao ----------
create or replace function public.fn_salvar_aplicacao(
  p_id uuid,
  p_centro_custo_id uuid,
  p_conta_bancaria_id uuid,
  p_produto text,
  p_indexador text,
  p_taxa_percentual numeric,
  p_liquidez text,
  p_liquidez_dias smallint,
  p_carencia_ate date,
  p_vencimento date,
  p_tipo_ir text,
  p_ativa boolean,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_id uuid;
begin
  if not public.tem_permissao('financeiro.aplicacoes', 'editar') then
    raise exception 'Sem permissao para editar aplicacoes';
  end if;
  if not exists (
    select 1 from public.centros_custo e
    join public.centros_custo r on r.id = e.pai_id
    where e.id = p_centro_custo_id and e.nivel = 2 and r.tipo = 'investimento'
  ) then
    raise exception 'A aplicacao tem que ser uma etapa do centro de investimento';
  end if;
  if not exists (
    select 1 from public.contas_bancarias c
    where c.id = p_conta_bancaria_id and c.tipo = 'investimento'
  ) then
    raise exception 'A conta da aplicacao tem que ser uma subconta de investimentos';
  end if;

  if p_id is null then
    insert into public.aplicacoes (
      centro_custo_id, conta_bancaria_id, produto, indexador, taxa_percentual, liquidez,
      liquidez_dias, carencia_ate, vencimento, tipo_ir, ativa, observacoes
    ) values (
      p_centro_custo_id, p_conta_bancaria_id, p_produto, p_indexador, p_taxa_percentual, p_liquidez,
      p_liquidez_dias, p_carencia_ate, p_vencimento, p_tipo_ir, coalesce(p_ativa, true),
      nullif(btrim(p_observacoes), '')
    ) returning id into v_id;
    return v_id;
  end if;

  -- Trocar etapa ou conta de uma aplicacao com posicao mudaria o dinheiro de
  -- lugar por baixo das posicoes gravadas.
  if exists (
    select 1 from public.aplicacoes a
    where a.id = p_id
      and (a.centro_custo_id <> p_centro_custo_id or a.conta_bancaria_id <> p_conta_bancaria_id)
      and exists (select 1 from public.aplicacao_posicoes p where p.aplicacao_id = a.id and p.excluido_em is null)
  ) then
    raise exception 'Esta aplicacao ja tem posicao gravada: etapa e conta nao mudam mais';
  end if;

  update public.aplicacoes
     set centro_custo_id = p_centro_custo_id, conta_bancaria_id = p_conta_bancaria_id,
         produto = p_produto, indexador = p_indexador, taxa_percentual = p_taxa_percentual,
         liquidez = p_liquidez, liquidez_dias = p_liquidez_dias, carencia_ate = p_carencia_ate,
         vencimento = p_vencimento, tipo_ir = p_tipo_ir, ativa = coalesce(p_ativa, true),
         observacoes = nullif(btrim(p_observacoes), '')
   where id = p_id
  returning id into v_id;
  if v_id is null then raise exception 'Aplicacao nao encontrada'; end if;
  return v_id;
end;
$function$;

revoke all on function public.fn_salvar_aplicacao(uuid, uuid, uuid, text, text, numeric, text, smallint, date, date, text, boolean, text) from public, anon;
grant execute on function public.fn_salvar_aplicacao(uuid, uuid, uuid, text, text, numeric, text, smallint, date, date, text, boolean, text) to authenticated;

-- ---------- 14. CDI: carga do BC e carga manual ----------
-- Chamada pela rota /api/cdi (service role, cron) e pelo botao da aba.
-- p_diario: [{"data":"2026-09-01","taxa":0.05513100}], p_mensal: [{"mes":"2026-09-01","taxa":0.88,"parcial":true}]
create or replace function public.fn_cdi_gravar(p_diario jsonb, p_mensal jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare v_n int := 0; v_m int := 0;
begin
  if not ((select auth.role()) = 'service_role'
          or public.tem_permissao('financeiro.aplicacoes', 'editar')) then
    raise exception 'Sem permissao para carregar o CDI';
  end if;

  insert into public.cdi_diario as d (data, taxa, fonte, atualizado_em)
  select (x->>'data')::date, (x->>'taxa')::numeric, 'bcb', now()
  from jsonb_array_elements(coalesce(p_diario, '[]'::jsonb)) x
  on conflict (data) do update
    set taxa = excluded.taxa, fonte = 'bcb', atualizado_em = now()
    where d.taxa is distinct from excluded.taxa
       or d.fonte <> 'bcb';
  get diagnostics v_n = row_count;

  insert into public.cdi_mensal as m (mes, taxa, fonte, parcial, atualizado_em)
  select date_trunc('month', (x->>'mes')::date)::date, (x->>'taxa')::numeric, 'bcb',
         coalesce((x->>'parcial')::boolean, false), now()
  from jsonb_array_elements(coalesce(p_mensal, '[]'::jsonb)) x
  on conflict (mes) do update
    set taxa = excluded.taxa, fonte = 'bcb', parcial = excluded.parcial, atualizado_em = now()
    where m.taxa is distinct from excluded.taxa
       or m.parcial is distinct from excluded.parcial
       or m.fonte <> 'bcb';
  get diagnostics v_m = row_count;

  return v_n + v_m;
end;
$function$;

revoke all on function public.fn_cdi_gravar(jsonb, jsonb) from public, anon;
grant execute on function public.fn_cdi_gravar(jsonb, jsonb) to authenticated, service_role;

-- Reserva: se a API do BC falhar, o Tiago digita o CDI do mes (% no mes).
create or replace function public.fn_cdi_mensal_manual(p_mes date, p_taxa numeric)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.tem_permissao('financeiro.aplicacoes', 'editar') then
    raise exception 'Sem permissao para editar o CDI';
  end if;
  if p_mes is null or p_taxa is null then raise exception 'Informe o mes e a taxa'; end if;
  insert into public.cdi_mensal (mes, taxa, fonte, parcial, atualizado_em)
  values (date_trunc('month', p_mes)::date, p_taxa, 'manual', false, now())
  on conflict (mes) do update
    set taxa = excluded.taxa, fonte = 'manual', parcial = false, atualizado_em = now();
end;
$function$;

revoke all on function public.fn_cdi_mensal_manual(date, numeric) from public, anon;
grant execute on function public.fn_cdi_mensal_manual(date, numeric) to authenticated;

-- ---------- 15. a funcao da aba ----------
-- Por aplicacao e por mes. Identidade que a prova confere:
--   posicao_final = posicao_inicial + aplicado - resgatado + rendimento + ajuste_abertura
-- e a soma das posicoes finais do mes corrente = saldo da subconta.
--
-- posicao_final do mes = ultima posicao ate o fim do mes + fluxo depois dela.
-- Antes da primeira posicao, e o principal (aplicado - resgatado).
-- rendimento: soma do rendimento das posicoes (nao abertura) com data no mes;
-- NULO quando nao ha posicao no mes (ausencia nao e zero).
-- rendimento_pct: Dietz modificado por posicao (o aporte pesa pelos dias que
-- ficou aplicado no periodo), composto no mes.
-- cdi_pct: serie 12 composta de [data anterior, data da posicao), composta no
-- mes; cai para a 4391 do mes quando a diaria nao cobre e o periodo e o mes
-- cheio. pct_cdi = rendimento_pct / cdi_pct.
create or replace function public.fn_aba_aplicacoes(p_inicio date default null, p_fim date default null)
returns table(
  aplicacao_id uuid, mes date, posicao_inicial numeric, aplicado numeric, resgatado numeric,
  rendimento numeric, ajuste_abertura numeric, posicao_final numeric,
  rendimento_pct numeric, cdi_pct numeric, pct_cdi numeric, ultima_posicao date
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_fim date := date_trunc('month', coalesce(p_fim, (now() at time zone 'America/Rio_Branco')::date))::date;
  v_cdi_ate date := (select max(c.data) from public.cdi_diario c);
begin
  if not public.tem_permissao('financeiro.aplicacoes', 'ver') then
    raise exception 'Sem permissao para ver aplicacoes';
  end if;

  return query
  with apl as (
    select a.id, a.centro_custo_id, a.conta_bancaria_id
    from public.aplicacoes a
    where public.fn_pode_ver_saldo(a.conta_bancaria_id)
  ),
  mov as (
    select apl.id as apl_id, t.data_transferencia as data,
      case when t.conta_destino_id = apl.conta_bancaria_id then t.valor else 0 end::numeric as ap,
      case when t.conta_origem_id = apl.conta_bancaria_id then t.valor + t.tarifa else 0 end::numeric as rs
    from apl
    join public.transferencias_contas t
      on t.centro_custo_id = apl.centro_custo_id
     and apl.conta_bancaria_id in (t.conta_origem_id, t.conta_destino_id)
  ),
  pos as (
    select p.aplicacao_id as apl_id, p.data, p.saldo_liquido, p.e_abertura,
      lag(p.data) over w as data_ant, lag(p.saldo_liquido) over w as saldo_ant
    from public.aplicacao_posicoes p
    join apl on apl.id = p.aplicacao_id
    where p.excluido_em is null
    window w as (partition by p.aplicacao_id order by p.data)
  ),
  pos_calc as (
    select pos.*, f.ap, f.rs, f.base,
      pos.saldo_liquido - coalesce(pos.saldo_ant, 0) - f.ap + f.rs as rend,
      case
        when pos.data_ant is null then null
        when v_cdi_ate is null or v_cdi_ate < pos.data - 5 then
          -- diaria nao cobre: 4391 so se o periodo for o mes cheio
          case when pos.data_ant = (date_trunc('month', pos.data) - interval '1 day')::date
                and pos.data = (date_trunc('month', pos.data) + interval '1 month' - interval '1 day')::date
               then (select cm.taxa / 100 from public.cdi_mensal cm
                     where cm.mes = date_trunc('month', pos.data)::date and not cm.parcial)
          end
        else (
          select exp(sum(ln(1 + c.taxa / 100))) - 1
          from public.cdi_diario c
          where c.data >= pos.data_ant and c.data < pos.data
        )
      end as cdi_per
    from pos
    cross join lateral (
      select
        coalesce(sum(m.ap), 0) as ap,
        coalesce(sum(m.rs), 0) as rs,
        coalesce(pos.saldo_ant, 0) + coalesce(sum(
          (m.ap - m.rs) * (pos.data - m.data)::numeric / nullif(pos.data - pos.data_ant, 0)
        ), 0) as base
      from mov m
      where m.apl_id = pos.apl_id
        and m.data <= pos.data
        and (pos.data_ant is null or m.data > pos.data_ant)
    ) f
  ),
  inicio as (
    select apl.id as apl_id, date_trunc('month', least(
      (select min(m.data) from mov m where m.apl_id = apl.id),
      (select min(p.data) from pos p where p.apl_id = apl.id)
    ))::date as m0
    from apl
  ),
  meses as (
    select i.apl_id, g::date as mes,
      (g + interval '1 month' - interval '1 day')::date as fim
    from inicio i
    cross join lateral generate_series(i.m0, v_fim, interval '1 month') g
    where i.m0 is not null
  ),
  por_mes as (
    select ms.apl_id, ms.mes,
      (select coalesce(sum(m.ap), 0) from mov m
        where m.apl_id = ms.apl_id and m.data between ms.mes and ms.fim) as ap,
      (select coalesce(sum(m.rs), 0) from mov m
        where m.apl_id = ms.apl_id and m.data between ms.mes and ms.fim) as rs,
      (select sum(pc.rend) from pos_calc pc
        where pc.apl_id = ms.apl_id and pc.data between ms.mes and ms.fim and not pc.e_abertura) as rend,
      (select sum(pc.rend) from pos_calc pc
        where pc.apl_id = ms.apl_id and pc.data between ms.mes and ms.fim and pc.e_abertura) as ajuste,
      (select case when count(*) = 0 or bool_or(pc.base <= 0 or pc.data_ant is null
                     or 1 + pc.rend / nullif(pc.base, 0) <= 0) then null
                   else exp(sum(ln(1 + pc.rend / pc.base))) - 1 end
        from pos_calc pc
        where pc.apl_id = ms.apl_id and pc.data between ms.mes and ms.fim and not pc.e_abertura) as rent,
      (select case when count(*) = 0 or bool_or(pc.cdi_per is null) then null
                   else exp(sum(ln(1 + pc.cdi_per))) - 1 end
        from pos_calc pc
        where pc.apl_id = ms.apl_id and pc.data between ms.mes and ms.fim and not pc.e_abertura) as cdi,
      ult.data as ult_data,
      coalesce(ult.saldo_liquido, 0) + (
        select coalesce(sum(m.ap - m.rs), 0) from mov m
        where m.apl_id = ms.apl_id and m.data <= ms.fim
          and (ult.data is null or m.data > ult.data)
      ) as final
    from meses ms
    left join lateral (
      select p.data, p.saldo_liquido from pos p
      where p.apl_id = ms.apl_id and p.data <= ms.fim
      order by p.data desc limit 1
    ) ult on true
  ),
  com_inicial as (
    select pm.*,
      coalesce(lag(pm.final) over (partition by pm.apl_id order by pm.mes), 0) as inicial
    from por_mes pm
  )
  select
    ci.apl_id, ci.mes, round(ci.inicial, 2), round(ci.ap, 2), round(ci.rs, 2),
    round(ci.rend, 2), round(ci.ajuste, 2), round(ci.final, 2),
    round(ci.rent * 100, 6), round(ci.cdi * 100, 6),
    round(ci.rent / nullif(ci.cdi, 0) * 100, 4),
    ci.ult_data
  from com_inicial ci
  where p_inicio is null or ci.mes >= date_trunc('month', p_inicio)::date
  order by ci.apl_id, ci.mes;
end;
$function$;

revoke all on function public.fn_aba_aplicacoes(date, date) from public, anon;
grant execute on function public.fn_aba_aplicacoes(date, date) to authenticated;

-- ---------- 16. o saldo passa a contar o lancamento da aplicacao ----------
-- Unica mudanca nas duas: "or l.origem = 'aplicacao'" junto do filtro de
-- natureza. Todo o resto e o texto vigente (20260822210000 e 20260826170000).
create or replace function public.fn_rel_posicao_bancaria()
 returns table(conta_bancaria_id uuid, tipo text, total numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select p.conta_bancaria_id, l.tipo, sum(p.valor_liquido) as total
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  left join public.categorias_financeiras cf on cf.id = l.categoria_id
  join public.contas_bancarias c on c.id = p.conta_bancaria_id
  where p.status = 'pago'
    and p.conta_bancaria_id is not null
    and l.status <> 'cancelado'
    and (coalesce(cf.natureza, 'operacional') <> 'movimentacao' or l.origem = 'aplicacao')
    and (
      c.saldo_inicial_data is null
      or p.data_pagamento is null
      or p.data_pagamento > c.saldo_inicial_data
    )
  group by p.conta_bancaria_id, l.tipo

  union all

  select t.conta_destino_id, 'transferencia_entrada', sum(t.valor)
  from public.transferencias_contas t
  join public.contas_bancarias c on c.id = t.conta_destino_id
  where c.saldo_inicial_data is null
     or t.data_transferencia > c.saldo_inicial_data
  group by t.conta_destino_id

  union all

  select t.conta_origem_id, 'transferencia_saida', sum(t.valor + t.tarifa)
  from public.transferencias_contas t
  join public.contas_bancarias c on c.id = t.conta_origem_id
  where c.saldo_inicial_data is null
     or t.data_transferencia > c.saldo_inicial_data
  group by t.conta_origem_id
$function$;

do $extrato$
declare
  v_def text;
  v_de constant text := 'and coalesce(cf.natureza, ''operacional'') <> ''movimentacao''';
  v_para constant text := 'and (coalesce(cf.natureza, ''operacional'') <> ''movimentacao'' or l.origem = ''aplicacao'')';
begin
  select pg_get_functiondef('public.fn_extrato_conta(uuid, boolean)'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'fn_extrato_conta: esperava 1 filtro de natureza';
  end if;
  execute replace(v_def, v_de, v_para);
end $extrato$;

-- ---------- 17. DRE: a abertura nao aparece (pedido do Tiago) ----------
create or replace function public.fn_rel_dre(p_inicio date, p_fim date)
 returns table(tipo text, categoria_id uuid, categoria text, natureza text, total numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select
    l.tipo,
    c.id as categoria_id,
    c.nome as categoria,
    -- Sem categoria a linha nao tem como ser classificada. Cai em operacional
    -- porque o DRE tem de continuar mostrando ela: sumir com despesa por falta
    -- de cadastro seria o mesmo erro que esta funcao conserta, ao contrario.
    coalesce(c.natureza, 'operacional') as natureza,
    sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.categorias_financeiras c
    on c.id = coalesce(r.categoria_id, l.categoria_id)
  where l.status <> 'cancelado'
    and l.mes_competencia >= date_trunc('month', p_inicio)::date
    and l.mes_competencia < p_fim
    -- Ajuste de abertura de aplicacao: saldo anterior e rendimento passado,
    -- nao e movimento do periodo (Tiago, 25/09/2026).
    and not (l.origem = 'aplicacao' and coalesce(c.natureza, 'operacional') = 'movimentacao')
  group by l.tipo, c.id, c.nome, c.natureza
$function$;

-- ---------- 18. travas: lancamento gerado nao se mexe por fora ----------
do $travas$
declare
  v_def text;
  v_novo text;
  v_ancora text;
  v_trava text;
begin
  -- Estorno de pagamento/recebimento
  select pg_get_functiondef('public.fn_estornar_pagamento(uuid)'::regprocedure) into v_def;
  v_ancora := 'if v_status is null then raise exception ''Parcela nao encontrada''; end if;';
  v_trava := v_ancora || E'\n  if exists (select 1 from public.lancamentos l join public.lancamento_parcelas lp on lp.lancamento_id = l.id where lp.id = p_parcela_id and l.origem = ''aplicacao'') then\n    raise exception ''Nao da para estornar: este lancamento foi gerado pela posicao da aplicacao. Regrave ou exclua a posicao em Financeiro > Aplicacoes'';\n  end if;';
  if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'fn_estornar_pagamento: ancora nao encontrada uma vez';
  end if;
  execute replace(v_def, v_ancora, v_trava);

  -- Rateio e parcelas: mesma ancora nas duas
  v_ancora := E'raise exception ''Lancamento nao encontrado'';\n  end if;';
  foreach v_novo in array array[
    'public.fn_definir_rateio_lancamento(uuid, jsonb, text)',
    'public.fn_definir_parcelas_lancamento(uuid, jsonb, text)'
  ] loop
    select pg_get_functiondef(v_novo::regprocedure) into v_def;
    if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
      raise exception '%: ancora nao encontrada uma vez', v_novo;
    end if;
    v_trava := v_ancora || E'\n  if exists (select 1 from public.lancamentos l where l.id = p_lanc_id and l.origem = ''aplicacao'') then\n    raise exception ''Nao da para mexer aqui: este lancamento foi gerado pela posicao da aplicacao. Regrave ou exclua a posicao em Financeiro > Aplicacoes'';\n  end if;';
    execute replace(v_def, v_ancora, v_trava);
  end loop;
end $travas$;
