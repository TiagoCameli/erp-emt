-- Estoque > Movimentações (23/10/2026). Pedido do Tiago: uma aba com todas as movimentações
-- feitas e o saldo atual de cada pilha, depósito e tanque.
--
-- Junta as mesmas três fontes da Posição (fn_estoque_posicao), cada uma pela regra de saldo do
-- módulo dono dela, para o último saldo de cada local bater com a Posição:
--   estoque     estoque_entradas - estoque_saidas, por local (depósito, tanque de material,
--               pilha) e insumo. A transferência e o frete já viram uma entrada e uma saída.
--   combustivel o nível do tanque (fn_comb_estoque_na_data): entradas + transferências
--               recebidas - enviadas - abastecimentos - esvaziamentos, por tanque, sem
--               olhar o combustível (o tanque troca de combustível depois de esvaziar).
--   pecas       almoxarifado_entradas - almoxarifado_saidas não estornadas, por depósito e
--               insumo (fn_almox_recalcular_saldo). A saída de peça não tem data: vale o dia
--               em que foi lançada.
-- Só leitura: nada aqui muda saldo, custo ou dinheiro.

create or replace function public.fn_estoque_movimentacoes()
returns table (
  id text,
  origem text,
  local_tipo text,
  local_id uuid,
  local_nome text,
  insumo_id uuid,
  insumo_nome text,
  unidade text,
  data date,
  momento timestamptz,
  lancado_em timestamptz,
  tipo text,
  quantidade numeric,
  saldo numeric,
  referencia text
) language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
begin
  if not public.tem_permissao('estoque.movimentacoes', 'ver') then
    raise exception 'Sem permissão para ver as movimentações do estoque';
  end if;
  return query
  with mov as (
    -- Estoque: entradas (OC, avulsa, frete e a ponta de chegada da transferência).
    select 'ee:' || e.id::text as id, 'estoque'::text as origem,
           case when e.tanque_id is not null then 'tanque' when e.pilha_id is not null then 'pilha' else 'deposito' end as local_tipo,
           coalesce(e.deposito_id, e.tanque_id, e.pilha_id) as local_id, e.insumo_id,
           e.data, e.data::timestamptz as momento, e.created_at as lancado,
           case when e.transferencia_id is not null then 'transferencia_entrada'
                when e.frete_id is not null then 'frete' else 'entrada' end as tipo,
           e.quantidade as q,
           case
             when e.transferencia_id is not null then
               'De ' || coalesce(od.nome, ot.nome, op.nome, 'outro local')
             else concat_ws(' · ',
               nullif(trim(coalesce(f.nome_fantasia, f.razao_social, '')), ''),
               'OC ' || e.oc_numero, 'NF ' || e.nota_fiscal, nullif(trim(e.observacoes), ''))
           end as referencia
    from public.estoque_entradas e
    left join public.fornecedores f on f.id = e.fornecedor_id
    left join public.estoque_transferencias tr on tr.id = e.transferencia_id
    left join public.almoxarifado_depositos od on od.id = tr.origem_deposito_id
    left join public.tanques ot on ot.id = tr.origem_tanque_id
    left join public.estoque_pilhas op on op.id = tr.origem_pilha_id
    where e.excluido_em is null
    union all
    -- Estoque: saídas para centro de custo e a ponta de partida da transferência.
    select 'es:' || s.id::text, 'estoque',
           case when s.tanque_id is not null then 'tanque' when s.pilha_id is not null then 'pilha' else 'deposito' end,
           coalesce(s.deposito_id, s.tanque_id, s.pilha_id), s.insumo_id,
           s.data, s.data::timestamptz, s.created_at,
           case when s.transferencia_id is not null then 'transferencia_saida' else 'saida' end,
           -s.quantidade,
           case
             when s.transferencia_id is not null then
               'Para ' || coalesce(dd.nome, dt.nome, dp.nome, 'outro local')
             else concat_ws(' · ', cc.nome, nullif(trim(s.observacoes), ''))
           end
    from public.estoque_saidas s
    left join public.centros_custo cc on cc.id = s.centro_custo_id
    left join public.estoque_transferencias tr on tr.id = s.transferencia_id
    left join public.almoxarifado_depositos dd on dd.id = tr.destino_deposito_id
    left join public.tanques dt on dt.id = tr.destino_tanque_id
    left join public.estoque_pilhas dp on dp.id = tr.destino_pilha_id
    where s.excluido_em is null
    union all
    -- Combustível: entrada no tanque.
    select 'ce:' || c.id::text, 'combustivel', 'tanque', c.tanque_id, c.insumo_id,
           (c.data_hora at time zone 'America/Rio_Branco')::date, c.data_hora, c.created_at,
           'entrada', c.litros,
           concat_ws(' · ', nullif(trim(coalesce(f.nome_fantasia, f.razao_social, '')), ''),
             'NF ' || c.nota_fiscal, nullif(trim(c.observacoes), ''))
    from public.combustivel_entradas c
    left join public.fornecedores f on f.id = c.fornecedor_id
    where c.excluido_em is null
    union all
    -- Combustível: abastecimento saindo de um tanque (o de posto externo sem tanque fica fora).
    select 'cs:' || c.id::text, 'combustivel', 'tanque', c.tanque_id, c.insumo_id,
           (c.data at time zone 'America/Rio_Branco')::date, c.data, c.created_at,
           'abastecimento', -c.litros,
           concat_ws(' · ',
             nullif(trim(concat_ws(' ', eq.codigo, eq.descricao)), ''),
             case when eq.id is null then nullif(trim(c.placa), '') end,
             nullif(trim(c.motorista), ''))
    from public.combustivel_saidas c
    left join public.equipamentos eq on eq.id = c.equipamento_id
    where c.excluido_em is null and c.tanque_id is not null
    union all
    -- Combustível: transferência entre tanques, uma linha em cada ponta.
    select 'cto:' || c.id::text, 'combustivel', 'tanque', c.tanque_origem_id, c.insumo_id,
           (c.data_hora at time zone 'America/Rio_Branco')::date, c.data_hora, c.created_at,
           'transferencia_saida', -c.litros, 'Para ' || coalesce(td.nome, 'outro tanque')
    from public.combustivel_transferencias c
    left join public.tanques td on td.id = c.tanque_destino_id
    where c.excluido_em is null
    union all
    select 'ctd:' || c.id::text, 'combustivel', 'tanque', c.tanque_destino_id, c.insumo_id,
           (c.data_hora at time zone 'America/Rio_Branco')::date, c.data_hora, c.created_at,
           'transferencia_entrada', c.litros, 'De ' || coalesce(tor.nome, 'outro tanque')
    from public.combustivel_transferencias c
    left join public.tanques tor on tor.id = c.tanque_origem_id
    where c.excluido_em is null
    union all
    -- Combustível: esvaziamento do tanque.
    select 'cv:' || c.id::text, 'combustivel', 'tanque', c.tanque_id, null::uuid,
           (c.data_hora at time zone 'America/Rio_Branco')::date, c.data_hora, c.created_at,
           'esvaziamento', -c.litros, nullif(trim(c.motivo), '')
    from public.combustivel_esvaziamentos c
    where c.excluido_em is null
    union all
    -- Peças: entrada no almoxarifado.
    select 'pe:' || a.id::text, 'pecas', 'deposito', a.deposito_id, a.insumo_id,
           a.data, a.data::timestamptz, a.created_at,
           'entrada', a.quantidade,
           concat_ws(' · ', nullif(trim(coalesce(f.nome_fantasia, f.razao_social, '')), ''),
             'NF ' || a.nota_fiscal, nullif(trim(a.observacoes), ''))
    from public.almoxarifado_entradas a
    left join public.fornecedores f on f.id = a.fornecedor_id
    where a.excluido_em is null
    union all
    -- Peças: saída para a OS.
    select 'ps:' || a.id::text, 'pecas', 'deposito', a.deposito_id, a.insumo_id,
           (a.created_at at time zone 'America/Rio_Branco')::date, a.created_at, a.created_at,
           'consumo_os', -a.quantidade,
           concat_ws(' · ', 'OS ' || os.numero, nullif(trim(a.motivo), ''))
    from public.almoxarifado_saidas a
    left join public.ordens_servico os on os.id = a.ordem_servico_id
    where a.estornada_em is null
  ), acumulado as (
    select m.*,
           sum(m.q) over (
             -- O tanque de combustível é um saldo só, qualquer que seja o combustível.
             partition by m.origem, m.local_id, case when m.origem = 'combustivel' then null else m.insumo_id end
             order by m.momento, m.lancado, m.id
             rows between unbounded preceding and current row
           ) as acumulado
    from mov m
  ), com_saldo as (
    -- O nível do tanque de combustível nunca fica negativo (fn_comb_estoque_na_data corta em
    -- zero): é o caso do tanque do posto, que só tem os abastecimentos.
    select a.*, case when a.origem = 'combustivel' then greatest(a.acumulado, 0) else a.acumulado end as saldo
    from acumulado a
  )
  select cs.id, cs.origem, cs.local_tipo, cs.local_id,
         coalesce(d.nome, t.nome, p.nome, ''),
         cs.insumo_id, i.nome,
         case when cs.origem = 'combustivel' then 'L' else u.sigla end,
         cs.data, cs.momento, cs.lancado, cs.tipo, cs.q, cs.saldo, nullif(cs.referencia, '')
  from com_saldo cs
  left join public.almoxarifado_depositos d on cs.local_tipo = 'deposito' and d.id = cs.local_id
  left join public.tanques t on cs.local_tipo = 'tanque' and t.id = cs.local_id
  left join public.estoque_pilhas p on cs.local_tipo = 'pilha' and p.id = cs.local_id
  left join public.insumos i on i.id = cs.insumo_id
  left join public.unidades_medida u on u.id = i.unidade_id;
end $$;

revoke all on function public.fn_estoque_movimentacoes() from public, anon;
grant execute on function public.fn_estoque_movimentacoes() to authenticated;

-- Permissão: quem vê a Posição vê as Movimentações (mesma informação, aberta por movimento).
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select perfil_id, 'estoque.movimentacoes', 'ver' from public.perfil_permissoes
where recurso = 'estoque.posicao' and acao = 'ver'
on conflict (perfil_id, recurso, acao) do nothing;
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select usuario_id, 'estoque.movimentacoes', 'ver' from public.usuario_permissoes
where recurso = 'estoque.posicao' and acao = 'ver'
on conflict (usuario_id, recurso, acao) do nothing;

do $confere$
declare v_pos int; v_mov int;
begin
  select count(*) into v_pos from public.usuario_permissoes where recurso = 'estoque.posicao' and acao = 'ver';
  select count(*) into v_mov from public.usuario_permissoes where recurso = 'estoque.movimentacoes' and acao = 'ver';
  if v_mov < v_pos then raise exception 'Esperado ao menos % permissões estoque.movimentacoes, veio %', v_pos, v_mov; end if;
end $confere$;
