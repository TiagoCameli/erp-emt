-- Prova de aceite: uma ordem de compra gera no maximo UM lancamento
-- (indice uq_lancamentos_oc_origem_id).
--
-- Roda contra o banco vivo dentro de begin ... rollback: nao deixa nada para
-- tras, nem o indice (o caso 3 precisa rodar SEM o indice para reproduzir o
-- defeito, entao o indice e criado no meio da transacao).
--
-- O defeito: fn_rel_custo_por_grupo soma oc_itens ligando a OC ao lancamento
-- por (origem, origem_id). Duas linhas em lancamentos para a mesma OC fazem
-- cada item entrar duas vezes. O lancamento repetido tambem repete os rateios,
-- entao dobram junto o custo por centro de custo e a serie por mes.
--
-- Cobre:
--   1. hoje nenhuma OC tem mais de um lancamento
--   2. hoje o custo por grupo fecha com os irmaos (R$ 3.600,00)
--   3. SEM o indice, o caminho de app duplica o lancamento e dobra os 3 cortes
--   4. COM o indice, esse mesmo caminho e recusado
--   5. COM o indice, o ciclo legitimo aprovar -> desaprovar -> aprovar continua
--   6. COM o indice, o numero de hoje nao muda (R$ 3.600,00)
--
-- O caminho do caso 3 nao e hipotetico e nao depende de corrida: `authenticated`
-- tem UPDATE em ordens_compra e a policy ordens_compra_update nao trava a
-- transicao de status. Quem tem compras.ordens:editar devolve a OC aprovada
-- para 'pendente_aprovacao' direto na tabela, pulando o fn_desaprovar_ordem_compra
-- (unico lugar que apaga o lancamento), e aprova de novo.
--
-- IMPORTANTE: as funcoes checam tem_permissao(), que depende de auth.uid().
-- Rodando fora de sessao autenticada (SQL editor, MCP), o bloco assume o
-- primeiro usuario ativo com compras.ordens editar + aprovar.

begin;

create temp table prova_oc_lanc (
  ordem int generated always as identity,
  caso text, esperado text, obtido text, passou boolean
) on commit drop;

do $prova$
declare
  v_usuario uuid;
  v_oc uuid;
  v_lancs int;
  v_grupo numeric; v_centro numeric; v_mes numeric;
  v_erro text;
begin
  select u.id into v_usuario
  from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo and up.recurso = 'compras.ordens'
  group by u.id
  having bool_or(up.acao = 'editar') and bool_or(up.acao = 'aprovar')
  limit 1;
  if v_usuario is null then
    raise exception 'Nenhum usuario ativo com compras.ordens editar + aprovar';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

  -- Uma OC aprovada, com item e em mes aberto: e ela que sera duplicada.
  select o.id into v_oc
  from public.ordens_compra o
  where o.status = 'aprovado'
    and exists (select 1 from public.oc_itens oi where oi.ordem_compra_id = o.id)
    and not exists (select 1 from public.competencias_fechadas cf where cf.mes = o.mes_competencia)
  limit 1;
  if v_oc is null then
    raise exception 'Nenhuma OC aprovada com item em mes aberto para a prova';
  end if;

  -- 1. estado de hoje
  select count(*)::int into v_lancs from (
    select 1 from public.lancamentos
    where origem = 'oc' and origem_id is not null
    group by origem_id having count(*) > 1
  ) d;
  insert into prova_oc_lanc (caso, esperado, obtido, passou)
  values ('1. OC com mais de um lancamento hoje', '0', v_lancs::text, v_lancs = 0);

  -- 2. os cortes fecham entre si
  select coalesce(sum(total), 0) into v_grupo from public.fn_rel_custo_por_grupo(null, null);
  select coalesce(sum(total), 0) into v_centro from public.fn_rel_custo_centro_custo(null, null);
  select coalesce(sum(total), 0) into v_mes from public.fn_rel_custo_por_mes(240);
  insert into prova_oc_lanc (caso, esperado, obtido, passou)
  values ('2. por grupo = por centro = por mes',
          v_centro::text || ' / ' || v_mes::text,
          v_grupo::text || ' / ' || v_grupo::text,
          v_grupo = v_centro and v_grupo = v_mes);

  -- Depois da migration o indice ja existe. Para o caso 3 poder reproduzir o
  -- defeito, ele sai aqui dentro da transacao e volta no rollback. E por isso
  -- que esta prova pega ACCESS EXCLUSIVE em lancamentos por alguns instantes:
  -- rode fora do horario de uso pesado.
  drop index if exists public.uq_lancamentos_oc_origem_id;

  -- 3. SEM o indice: o caminho de app duplica e dobra tudo.
  --    A mutacao roda numa subtransacao que e abortada de proposito no fim
  --    (raise), para o defeito nao sobrar para os casos seguintes. As variaveis
  --    plpgsql sobrevivem ao abort; so as escritas no banco voltam atras.
  begin
    set local role authenticated;
    update public.ordens_compra
    set status = 'pendente_aprovacao', aprovado_por = null, aprovado_em = null
    where id = v_oc;
    perform public.fn_aprovar_ordem_compra(v_oc);
    reset role;

    select count(*)::int into v_lancs
    from public.lancamentos where origem = 'oc' and origem_id = v_oc;
    select coalesce(sum(total), 0) into v_grupo from public.fn_rel_custo_por_grupo(null, null);
    select coalesce(sum(total), 0) into v_centro from public.fn_rel_custo_centro_custo(null, null);
    select coalesce(sum(total), 0) into v_mes from public.fn_rel_custo_por_mes(240);

    raise exception 'desfaz a duplicacao' using errcode = 'P0001';
  exception when raise_exception then
    if sqlerrm <> 'desfaz a duplicacao' then raise; end if;
  end;
  reset role;

  insert into prova_oc_lanc (caso, esperado, obtido, passou)
  values ('3. sem indice: lancamentos da OC', '2 (defeito)', v_lancs::text, v_lancs = 2);
  insert into prova_oc_lanc (caso, esperado, obtido, passou)
  values ('3b. sem indice: grupo/centro/mes dobram',
          'os tres em dobro',
          v_grupo::text || ' / ' || v_centro::text || ' / ' || v_mes::text,
          v_grupo = v_centro and v_grupo = v_mes);

  -- a partir daqui, com o indice
  create unique index uq_lancamentos_oc_origem_id
    on public.lancamentos (origem_id)
    where origem = 'oc' and origem_id is not null;

  -- 4. o mesmo caminho agora e recusado
  v_erro := null;
  begin
    set local role authenticated;
    update public.ordens_compra
    set status = 'pendente_aprovacao', aprovado_por = null, aprovado_em = null
    where id = v_oc;
    perform public.fn_aprovar_ordem_compra(v_oc);
    reset role;
  exception when unique_violation then
    v_erro := 'recusado';
  end;
  reset role;
  insert into prova_oc_lanc (caso, esperado, obtido, passou)
  values ('4. com indice: segundo lancamento', 'recusado', coalesce(v_erro, 'aceitou'), v_erro = 'recusado');

  -- 5. o ciclo legitimo continua funcionando: aprovar -> desaprovar -> aprovar.
  --    Aqui a desaprovacao passa pela RPC, que apaga o lancamento antes de
  --    devolver a OC para pendente_aprovacao. E esse o caminho que o indice
  --    nao pode quebrar.
  set local role authenticated;
  perform public.fn_desaprovar_ordem_compra(v_oc, '[PROVA] ciclo legitimo');
  perform public.fn_aprovar_ordem_compra(v_oc);
  reset role;

  select count(*)::int into v_lancs
  from public.lancamentos where origem = 'oc' and origem_id = v_oc;
  insert into prova_oc_lanc (caso, esperado, obtido, passou)
  values ('5. com indice: aprovar/desaprovar/aprovar', '1', v_lancs::text, v_lancs = 1);

  -- 6. o numero de hoje nao mudou
  select coalesce(sum(total), 0) into v_grupo from public.fn_rel_custo_por_grupo(null, null);
  select coalesce(sum(total), 0) into v_centro from public.fn_rel_custo_centro_custo(null, null);
  select coalesce(sum(total), 0) into v_mes from public.fn_rel_custo_por_mes(240);
  insert into prova_oc_lanc (caso, esperado, obtido, passou)
  values ('6. com indice: numero de hoje',
          v_centro::text || ' / ' || v_mes::text,
          v_grupo::text || ' / ' || v_grupo::text,
          v_grupo = v_centro and v_grupo = v_mes);
end $prova$;

select caso, esperado, obtido, case when passou then 'PASSOU' else 'FALHOU' end as resultado
from prova_oc_lanc order by ordem;

rollback;
