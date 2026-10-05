-- =============================================================
-- Conciliacao v2, Bloco I: apelido bancario do fornecedor
--
-- Defeito (Tiago, 05/10/2026): o banco escreve o cedente do boleto
-- (FORTBRAS, PJBANK, F PELEGRINELLI) e o app tem o fornecedor (RONDOBRAS,
-- INVIOLAVEL, REI DOS PNEUS). O automatico casa pela regra (b) com o selo
-- "Confira" e a pessoa revisa o mesmo par todo mes.
--
-- 1. fornecedor_apelidos_bancarios: cedente normalizado -> fornecedor OU
--    colaborador. Unico por (apelido, fornecedor, colaborador).
-- 2. fn_conciliacao_cedente(memo): o mesmo cedenteDoHistorico do TS. Tira os
--    prefixos do BB e numeros soltos; sem prefixo conhecido (tarifa, DARF)
--    devolve null.
-- 3. extrato_transacoes.confira_confirmado_em/_por: a pessoa confirmou o
--    casamento com selo. Desfazer limpa.
-- 4. Aprendizado so com confirmacao humana (nunca do automatico sem
--    confirmar, de estorno ou de transferencia):
--    fn_conciliacao_aprender_apelido(transacao), chamada pelo casar manual
--    sem nome batendo; fn_conciliacao_confirmar_conferencia(ids), o
--    "Confirmar" dos Casados; fn_conciliacao_fechar_mes_confirmando(conta,
--    mes, ids), que confirma os "Confira" do mes, aprende e fecha. Quem diz
--    quais sao os "Confira" e o servidor, com a mesma regra da tela; o
--    fn_conciliacao_fechar_mes original continua igual (codigo no ar).
-- 5. Apelido manual pela tela de Fornecedores: salvar e remover.
-- 6. vezes_usado/ultimo_uso: trigger quando um movimento casa com parcela
--    cujo favorecido tem o apelido do cedente.
-- 7. fn_conciliacao_painel devolve os apelidos de cada candidato e de cada
--    parcela casada, e se o "Confira" ja foi confirmado.
--
-- Nada e removido e nenhuma assinatura em uso muda.
-- =============================================================

create or replace function public.fn_conciliacao_normalizar_cedente(p_texto text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select nullif(btrim(regexp_replace(regexp_replace(upper(translate(coalesce(p_texto, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^A-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')), '');
$function$;

create or replace function public.fn_conciliacao_cedente(p_memo text)
returns text
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v text := coalesce(public.fn_conciliacao_normalizar_cedente(p_memo), '');
  v_prefixo text;
  v_achou boolean := false;
  v_resto text;
begin
  foreach v_prefixo in array array[
    'PIX ENVIADO', 'PIX RECEBIDO', 'PAGAMENTO DE BOLETO', 'PAGTO VIA AUTO ATEND BB',
    'TED TRANSF ELETR DISPONIV', 'TRANSFERENCIA ENVIADA', 'TRANSFERIDO PARA POUPANCA',
    'PAGTO CONTA TELEFONE', 'PAGAMENTO CONTA LUZ', 'IMPOSTOS'
  ] loop
    if v = v_prefixo or left(v, length(v_prefixo) + 1) = v_prefixo || ' ' then
      v := substr(v, length(v_prefixo) + 1);
      v_achou := true;
      exit;
    end if;
  end loop;
  if not v_achou then return null; end if;

  select string_agg(w, ' ' order by n) into v_resto
  from regexp_split_to_table(btrim(v), ' ') with ordinality as t(w, n)
  where w <> '' and w !~ '^[0-9]+$';

  if v_resto is null or length(regexp_replace(v_resto, '[^A-Z]', '', 'g')) < 3 then
    return null;
  end if;
  return v_resto;
end;
$function$;

create table if not exists public.fornecedor_apelidos_bancarios (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid references public.fornecedores(id) on delete cascade,
  colaborador_id uuid references public.colaboradores(id) on delete cascade,
  apelido text not null check (length(apelido) >= 3),
  origem text not null check (origem in ('conciliacao', 'manual')),
  vezes_usado int not null default 0,
  ultimo_uso timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint fornecedor_apelidos_um_favorecido
    check (num_nonnulls(fornecedor_id, colaborador_id) = 1),
  constraint fornecedor_apelidos_normalizado
    check (apelido = public.fn_conciliacao_normalizar_cedente(apelido)),
  constraint fornecedor_apelidos_unico unique nulls not distinct (apelido, fornecedor_id, colaborador_id)
);

create index if not exists idx_fornecedor_apelidos_fornecedor on public.fornecedor_apelidos_bancarios (fornecedor_id);
create index if not exists idx_fornecedor_apelidos_colaborador on public.fornecedor_apelidos_bancarios (colaborador_id);
create index if not exists idx_fornecedor_apelidos_apelido on public.fornecedor_apelidos_bancarios (apelido);
create index if not exists idx_fornecedor_apelidos_created_by on public.fornecedor_apelidos_bancarios (created_by);

alter table public.fornecedor_apelidos_bancarios enable row level security;
drop policy if exists fornecedor_apelidos_select on public.fornecedor_apelidos_bancarios;
create policy fornecedor_apelidos_select on public.fornecedor_apelidos_bancarios
  for select to authenticated
  using ((select public.tem_permissao('financeiro.conciliacao', 'ver'))
         or (select public.tem_permissao('cadastros.fornecedores', 'ver')));
revoke all on table public.fornecedor_apelidos_bancarios from public, anon, authenticated;
grant select on table public.fornecedor_apelidos_bancarios to authenticated;

drop trigger if exists trg_audit_fornecedor_apelidos on public.fornecedor_apelidos_bancarios;
create trigger trg_audit_fornecedor_apelidos after insert or update or delete on public.fornecedor_apelidos_bancarios
  for each row execute function public.fn_audit();
drop trigger if exists trg_fornecedor_apelidos_created_by on public.fornecedor_apelidos_bancarios;
create trigger trg_fornecedor_apelidos_created_by before insert on public.fornecedor_apelidos_bancarios
  for each row execute function public.fn_set_created_by();

alter table public.extrato_transacoes
  add column if not exists confira_confirmado_em timestamptz,
  add column if not exists confira_confirmado_por uuid references public.usuarios(id);
create index if not exists idx_extrato_transacoes_confira_confirmado_por
  on public.extrato_transacoes (confira_confirmado_por) where confira_confirmado_por is not null;

-- Desfazer limpa a confirmacao junto com o vinculo.
create or replace function public.fn_desconciliar_transacao(p_transacao_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_conta uuid;
  v_data date;
  v_par uuid;
  v_par_data date;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then raise exception 'Sem permissao para conciliar'; end if;
  select conta_bancaria_id, data_movimento, estorno_par_id into v_conta, v_data, v_par
  from public.extrato_transacoes where id = p_transacao_id;
  perform public.fn_conciliacao_exigir_mes_aberto(v_conta, v_data);
  if v_par is not null then
    select data_movimento into v_par_data from public.extrato_transacoes where id = v_par;
    perform public.fn_conciliacao_exigir_mes_aberto(v_conta, v_par_data);
  end if;
  update public.extrato_transacoes
  set conciliada = false, parcela_id = null, transferencia_id = null, estorno_par_id = null,
      conciliado_por = null, conciliado_em = null, conciliacao_automatica = false,
      confira_confirmado_em = null, confira_confirmado_por = null
  where id = p_transacao_id or (v_par is not null and id = v_par);
end
$function$;

-- -------------------------------------------------------------
-- Aprender: so de casamento com parcela que uma pessoa fez ou confirmou.
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_aprender_apelido(p_transacao_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_t public.extrato_transacoes;
  v_cedente text;
  v_fornecedor uuid;
  v_colaborador uuid;
  v_novo uuid;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  select * into v_t from public.extrato_transacoes where id = p_transacao_id;
  if v_t.id is null or not v_t.conciliada or v_t.parcela_id is null then return false; end if;
  -- Automatico sem confirmacao nao ensina nada.
  if v_t.conciliacao_automatica and v_t.confira_confirmado_em is null then return false; end if;

  v_cedente := public.fn_conciliacao_cedente(v_t.memo);
  if v_cedente is null then return false; end if;

  select l.fornecedor_id, case when l.fornecedor_id is null then l.colaborador_id end
    into v_fornecedor, v_colaborador
  from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
  where p.id = v_t.parcela_id;
  if v_fornecedor is null and v_colaborador is null then return false; end if;

  insert into public.fornecedor_apelidos_bancarios (fornecedor_id, colaborador_id, apelido, origem)
  values (v_fornecedor, v_colaborador, v_cedente, 'conciliacao')
  on conflict on constraint fornecedor_apelidos_unico do nothing
  returning id into v_novo;
  return v_novo is not null;
end;
$function$;

revoke all on function public.fn_conciliacao_aprender_apelido(uuid) from public, anon;
grant execute on function public.fn_conciliacao_aprender_apelido(uuid) to authenticated;

-- -------------------------------------------------------------
-- "Confirmar" dos Casados: tira o selo e aprende.
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_confirmar_conferencia(p_transacao_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_confirmadas int := 0;
  v_aprendidos int := 0;
  v_conta uuid;
  v_data date;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  foreach v_id in array coalesce(p_transacao_ids, '{}') loop
    select conta_bancaria_id, data_movimento into v_conta, v_data
    from public.extrato_transacoes
    where id = v_id and conciliada and parcela_id is not null and confira_confirmado_em is null;
    if v_conta is null then continue; end if;
    perform public.fn_conciliacao_exigir_mes_aberto(v_conta, v_data);
    update public.extrato_transacoes
       set confira_confirmado_em = now(), confira_confirmado_por = (select auth.uid())
     where id = v_id;
    v_confirmadas := v_confirmadas + 1;
    if public.fn_conciliacao_aprender_apelido(v_id) then v_aprendidos := v_aprendidos + 1; end if;
  end loop;
  return jsonb_build_object('confirmadas', v_confirmadas, 'aprendidos', v_aprendidos);
end;
$function$;

revoke all on function public.fn_conciliacao_confirmar_conferencia(uuid[]) from public, anon;
grant execute on function public.fn_conciliacao_confirmar_conferencia(uuid[]) to authenticated;

-- -------------------------------------------------------------
-- Fechar o mes e a confirmacao: confirma os "Confira" do mes (a lista vem
-- do servidor, com a regra da tela), aprende e fecha, tudo ou nada.
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_fechar_mes_confirmando(
  p_conta_id uuid, p_mes date, p_confira_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_ids uuid[];
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  select coalesce(array_agg(t.id), '{}') into v_ids
  from public.extrato_transacoes t
  where t.id = any (coalesce(p_confira_ids, '{}'))
    and t.conta_bancaria_id = p_conta_id
    and t.data_movimento between v_inicio and v_fim;
  perform public.fn_conciliacao_confirmar_conferencia(v_ids);
  return public.fn_conciliacao_fechar_mes(p_conta_id, v_inicio);
end;
$function$;

revoke all on function public.fn_conciliacao_fechar_mes_confirmando(uuid, date, uuid[]) from public, anon;
grant execute on function public.fn_conciliacao_fechar_mes_confirmando(uuid, date, uuid[]) to authenticated;

-- -------------------------------------------------------------
-- Apelido manual (Cadastros > Fornecedores > Apelidos bancarios).
-- -------------------------------------------------------------
create or replace function public.fn_fornecedor_apelido_salvar(
  p_fornecedor_id uuid, p_colaborador_id uuid, p_apelido text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_apelido text := public.fn_conciliacao_normalizar_cedente(p_apelido);
  v_id uuid;
begin
  if not (public.tem_permissao('cadastros.fornecedores', 'editar')
          or public.tem_permissao('financeiro.conciliacao', 'editar')) then
    raise exception 'Sem permissao para editar apelidos bancarios';
  end if;
  if num_nonnulls(p_fornecedor_id, p_colaborador_id) <> 1 then
    raise exception 'Escolha o fornecedor ou o colaborador';
  end if;
  if v_apelido is null or length(regexp_replace(v_apelido, '[^A-Z]', '', 'g')) < 3 then
    raise exception 'O apelido precisa ter pelo menos 3 letras';
  end if;
  insert into public.fornecedor_apelidos_bancarios (fornecedor_id, colaborador_id, apelido, origem)
  values (p_fornecedor_id, p_colaborador_id, v_apelido, 'manual')
  on conflict on constraint fornecedor_apelidos_unico do nothing
  returning id into v_id;
  if v_id is null then raise exception 'Este apelido ja esta cadastrado'; end if;
  return v_id;
end;
$function$;

revoke all on function public.fn_fornecedor_apelido_salvar(uuid, uuid, text) from public, anon;
grant execute on function public.fn_fornecedor_apelido_salvar(uuid, uuid, text) to authenticated;

create or replace function public.fn_fornecedor_apelido_remover(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not (public.tem_permissao('cadastros.fornecedores', 'editar')
          or public.tem_permissao('financeiro.conciliacao', 'editar')) then
    raise exception 'Sem permissao para editar apelidos bancarios';
  end if;
  delete from public.fornecedor_apelidos_bancarios where id = p_id;
  if not found then raise exception 'Apelido nao encontrado'; end if;
end;
$function$;

revoke all on function public.fn_fornecedor_apelido_remover(uuid) from public, anon;
grant execute on function public.fn_fornecedor_apelido_remover(uuid) to authenticated;

-- -------------------------------------------------------------
-- Uso: um movimento casou com parcela cujo favorecido tem o apelido.
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_contar_uso_apelido()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cedente text := public.fn_conciliacao_cedente(new.memo);
begin
  if v_cedente is null then return new; end if;
  update public.fornecedor_apelidos_bancarios a
     set vezes_usado = a.vezes_usado + 1, ultimo_uso = now()
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
   where p.id = new.parcela_id
     and a.apelido = v_cedente
     and ((l.fornecedor_id is not null and a.fornecedor_id = l.fornecedor_id)
          or (l.fornecedor_id is null and l.colaborador_id is not null and a.colaborador_id = l.colaborador_id));
  return new;
end;
$function$;

revoke all on function public.fn_conciliacao_contar_uso_apelido() from public, anon, authenticated;

drop trigger if exists trg_extrato_transacoes_uso_apelido on public.extrato_transacoes;
create trigger trg_extrato_transacoes_uso_apelido
  after update of parcela_id on public.extrato_transacoes
  for each row
  when (new.parcela_id is not null and new.parcela_id is distinct from old.parcela_id)
  execute function public.fn_conciliacao_contar_uso_apelido();

-- -------------------------------------------------------------
-- Painel: apelidos dos candidatos e das parcelas casadas, e a confirmacao.
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_painel(p_conta_id uuid, p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_folga_paga int := 5;
  v_folga_aberta int := 45;
  v_tolerancia numeric := 1.00;
  v_valores numeric[];
  v_resultado jsonb;
  v_saldo jsonb;
  v_banco numeric(14, 2);
  v_banco_data date;
  v_tem_extrato boolean := false;
  v_app numeric(14, 2);
  v_pode_ver boolean;
  v_fechamento jsonb;
  v_corte date;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'ver') then
    raise exception 'Sem permissao para ver a conciliacao';
  end if;
  if p_conta_id is null or p_inicio is null or p_fim is null then
    raise exception 'Informe a conta e o periodo';
  end if;
  if p_inicio > p_fim then
    raise exception 'O periodo comeca depois de terminar';
  end if;

  select coalesce(array_agg(distinct round(abs(t.valor), 2)), '{}')
    into v_valores
  from public.extrato_transacoes t
  where t.conta_bancaria_id = p_conta_id
    and t.data_movimento between p_inicio and p_fim
    and not t.conciliada;

  -- Saldo do banco: o do extrato que cobre o ultimo dia do periodo (o mais
  -- recente importado, se houver mais de um). A data e a menor entre o DTASOF
  -- e o fim do periodo: o BB poe no DTASOF o dia da exportacao, mas o saldo e
  -- o do fim do extrato.
  select true, e.saldo_final, least(coalesce(e.saldo_final_data, e.periodo_fim), e.periodo_fim)
    into v_tem_extrato, v_banco, v_banco_data
  from public.extratos_ofx e
  where e.conta_bancaria_id = p_conta_id
    and e.periodo_inicio <= p_fim and e.periodo_fim >= p_fim
  order by e.importado_em desc
  limit 1;

  if coalesce(v_tem_extrato, false) then
    v_pode_ver := public.fn_pode_ver_saldo(p_conta_id);
    select saldo_inicial_data into v_corte from public.contas_bancarias where id = p_conta_id;
    if v_banco is not null then
      v_app := public.fn_conciliacao_saldo_app_interno(p_conta_id, v_banco_data);
    end if;
    -- Quem nao ve saldo recebe so se bateu ou nao, calculado aqui.
    v_saldo := jsonb_build_object(
      'data', v_banco_data,
      'temSaldoNoArquivo', v_banco is not null,
      'podeVer', v_pode_ver,
      'banco', case when v_pode_ver then v_banco end,
      'app', case when v_pode_ver then v_app end,
      'diferenca', case when v_pode_ver and v_banco is not null then v_banco - v_app end,
      'bate', case when v_banco is null then null else v_banco = v_app end,
      -- Antes do corte o saldo do app e calculado para tras a partir do
      -- saldo inicial: a tela diz isso, porque a diferenca pode vir de
      -- qualquer mes entre a data e o corte.
      'corte', v_corte,
      'antesDoCorte', v_corte is not null and v_banco_data < v_corte
    );
  end if;

  select jsonb_build_object(
           'fechadoEm', f.fechado_em,
           'fechadoPor', u.nome,
           'saldoBanco', case when public.fn_pode_ver_saldo(p_conta_id) then f.saldo_banco end)
    into v_fechamento
  from public.conciliacao_fechamentos f
  left join public.usuarios u on u.id = f.fechado_por
  where f.conta_bancaria_id = p_conta_id
    and f.mes = date_trunc('month', p_inicio)::date
    and f.reaberto_em is null;

  with base as (
    -- So o que pode interessar: pagas na janela, abertas na janela maior, e
    -- as ja vinculadas a movimentos deste periodo. Antes a CTE varria todas
    -- as parcelas do banco.
    select p.*
    from public.lancamento_parcelas p
    where (p.status = 'pago'
           and p.data_pagamento between p_inicio - v_folga_paga and p_fim + v_folga_paga)
       or (p.status in ('pendente', 'aprovado')
           and coalesce(p.data_programada, p.data_vencimento)
               between p_inicio - v_folga_aberta and p_fim + v_folga_aberta)
       or p.id in (
           select t.parcela_id from public.extrato_transacoes t
           where t.conta_bancaria_id = p_conta_id
             and t.data_movimento between p_inicio and p_fim
             and t.parcela_id is not null)
  ),
  parcela_info as (
    select
      p.id, p.lancamento_id, p.numero_parcela, p.status, p.valor, p.desconto,
      p.juros, p.outras_despesas, p.valor_liquido, p.data_pagamento,
      p.data_vencimento, p.data_programada, p.conta_bancaria_id,
      l.numero as lancamento_numero, l.descricao, l.tipo, l.origem,
      l.numero_documento,
      -- Apelidos bancarios do favorecido (Bloco I): o cedente que o banco
      -- escreve no historico e que a pessoa ja confirmou ser este fornecedor.
      coalesce((
        select array_agg(a.apelido order by a.apelido)
        from public.fornecedor_apelidos_bancarios a
        where (l.fornecedor_id is not null and a.fornecedor_id = l.fornecedor_id)
           or (l.colaborador_id is not null and a.colaborador_id = l.colaborador_id)
      ), '{}') as apelidos,
      coalesce(f.nome_fantasia, f.razao_social, cl.nome_fantasia, cl.nome, co.nome) as nome,
      f.razao_social as razao_social,
      cb.nome as conta_nome,
      q.qtd as qtd_parcelas,
      exists (select 1 from public.extrato_transacoes e where e.parcela_id = p.id) as vinculada
    from base p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.fornecedores f on f.id = l.fornecedor_id
    left join public.clientes cl on cl.id = l.cliente_id
    left join public.colaboradores co on co.id = l.colaborador_id
    left join public.contas_bancarias cb on cb.id = p.conta_bancaria_id
    left join lateral (
      select count(*) as qtd from public.lancamento_parcelas p2 where p2.lancamento_id = p.lancamento_id
    ) q on true
    where l.status <> 'cancelado'
  ),
  livres as (
    select pi.* from parcela_info pi where not pi.vinculada
  ),
  -- Perto de algum movimento sem par (ate a tolerancia).
  perto as (
    select lv.* from livres lv
    where exists (
      select 1 from unnest(v_valores) v
      where abs(v - round(lv.valor_liquido, 2)) <= v_tolerancia
    )
  ),
  transf as (
    select
      tr.id, tr.numero, tr.descricao, tr.data_transferencia, tr.valor,
      tr.conta_origem_id, tr.conta_destino_id,
      o.nome as origem_nome, d.nome as destino_nome,
      case when tr.conta_origem_id = p_conta_id then 'saida' else 'entrada' end as lado
    from public.transferencias_contas tr
    join public.contas_bancarias o on o.id = tr.conta_origem_id
    join public.contas_bancarias d on d.id = tr.conta_destino_id
    where p_conta_id in (tr.conta_origem_id, tr.conta_destino_id)
  )
  select jsonb_build_object(
    'saldo', v_saldo,
    'fechamento', v_fechamento,
    'transacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'extratoId', t.extrato_id,
        'dataMovimento', t.data_movimento,
        'valor', t.valor,
        'tipo', t.tipo,
        'memo', t.memo,
        'conciliada', t.conciliada,
        'automatica', t.conciliacao_automatica,
        'confiraConfirmado', t.confira_confirmado_em is not null,
        'parcela', case when pi.id is null then null else jsonb_build_object(
          'id', pi.id, 'lancamentoId', pi.lancamento_id, 'lancamentoNumero', pi.lancamento_numero,
          'descricao', pi.descricao, 'nome', pi.nome, 'numeroParcela', pi.numero_parcela,
          'valorLiquido', pi.valor_liquido, 'dataPagamento', pi.data_pagamento,
          'apelidos', to_jsonb(pi.apelidos)) end,
        'transferencia', case when tf.id is null then null else jsonb_build_object(
          'id', tf.id, 'numero', tf.numero, 'descricao', tf.descricao,
          'origemNome', tf.origem_nome, 'destinoNome', tf.destino_nome,
          'data', tf.data_transferencia) end,
        'estorno', case when ep.id is null then null else jsonb_build_object(
          'id', ep.id, 'dataMovimento', ep.data_movimento, 'valor', ep.valor,
          'memo', ep.memo) end
      ) order by t.data_movimento, t.created_at)
      from public.extrato_transacoes t
      left join parcela_info pi on pi.id = t.parcela_id
      left join transf tf on tf.id = t.transferencia_id
      left join public.extrato_transacoes ep on ep.id = t.estorno_par_id
      where t.conta_bancaria_id = p_conta_id
        and t.data_movimento between p_inicio and p_fim
    ), '[]'::jsonb),

    -- Movimentos sem par logo antes e logo depois do periodo: o envio de
    -- uma TED devolvida no comeco do mes pode ter saido no mes anterior.
    'vizinhos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'dataMovimento', v.data_movimento, 'valor', v.valor,
        'tipo', v.tipo, 'memo', v.memo) order by v.data_movimento)
      from public.extrato_transacoes v
      where v.conta_bancaria_id = p_conta_id
        and not v.conciliada
        and (v.data_movimento between p_inicio - 10 and p_inicio - 1
             or v.data_movimento between p_fim + 1 and p_fim + 10)
    ), '[]'::jsonb),

    'pagasNaConta', coalesce((
      select jsonb_agg(to_jsonb(lv) order by lv."dataPagamento")
      from (
        select id, lancamento_id as "lancamentoId", lancamento_numero as "lancamentoNumero",
               descricao, nome, razao_social as "razaoSocial", tipo, origem,
               numero_parcela as "numeroParcela", qtd_parcelas as "qtdParcelas",
               valor, valor_liquido as "valorLiquido", data_pagamento as "dataPagamento",
               numero_documento as "numeroDocumento", status, conta_nome as "contaNome",
               conta_bancaria_id as "contaId", apelidos
        from livres
        where status = 'pago'
          and conta_bancaria_id = p_conta_id
      ) lv
    ), '[]'::jsonb),

    'pagasEmOutraConta', coalesce((
      select jsonb_agg(to_jsonb(lv) order by lv."dataPagamento")
      from (
        select id, lancamento_id as "lancamentoId", lancamento_numero as "lancamentoNumero",
               descricao, nome, razao_social as "razaoSocial", tipo, origem,
               numero_parcela as "numeroParcela", qtd_parcelas as "qtdParcelas",
               valor, valor_liquido as "valorLiquido", data_pagamento as "dataPagamento",
               numero_documento as "numeroDocumento", status, conta_nome as "contaNome",
               conta_bancaria_id as "contaId", apelidos
        from perto
        where status = 'pago'
          and conta_bancaria_id is distinct from p_conta_id
      ) lv
    ), '[]'::jsonb),

    'abertas', coalesce((
      select jsonb_agg(to_jsonb(lv) order by lv."dataVencimento")
      from (
        select id, lancamento_id as "lancamentoId", lancamento_numero as "lancamentoNumero",
               descricao, nome, razao_social as "razaoSocial", tipo, origem,
               numero_parcela as "numeroParcela", qtd_parcelas as "qtdParcelas",
               valor, valor_liquido as "valorLiquido",
               coalesce(data_programada, data_vencimento) as "dataVencimento",
               numero_documento as "numeroDocumento", status, conta_nome as "contaNome",
               conta_bancaria_id as "contaId", apelidos
        from perto
        where status in ('pendente', 'aprovado')
      ) lv
    ), '[]'::jsonb),

    'transferencias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tf.id, 'numero', tf.numero, 'descricao', tf.descricao,
        'data', tf.data_transferencia, 'valor', tf.valor, 'lado', tf.lado,
        'origemNome', tf.origem_nome, 'destinoNome', tf.destino_nome
      ) order by tf.data_transferencia)
      from transf tf
      where tf.data_transferencia between p_inicio - v_folga_paga and p_fim + v_folga_paga
        and not exists (
          select 1 from public.extrato_transacoes e
          where e.transferencia_id = tf.id
            and e.tipo = case when tf.lado = 'saida' then 'debito' else 'credito' end
        )
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$function$;
