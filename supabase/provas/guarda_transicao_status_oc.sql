-- Prova de aceite: a maquina de status da ordem de compra nao se burla mais por
-- UPDATE direto na tabela (trigger trg_ordens_compra_status).
--
-- Roda contra o banco vivo dentro de begin ... rollback: nao deixa nada para
-- tras, nem a funcao, nem o trigger, nem as duas OCs de prova (que nascem aqui,
-- modeladas numa OC real; nenhuma OC de producao e tocada). A guarda sai e volta
-- no meio da transacao, porque os casos 2 e 3 precisam rodar SEM ela para
-- reproduzir o defeito: por isso a prova da o mesmo resultado antes e depois da
-- migration, e pode ser rodada de novo quando quiser.
--
-- Rodada duas vezes: antes de aplicar a migration e depois, 16 de 16 PASSOU.
--
-- O defeito: `authenticated` tem UPDATE em ordens_compra e a policy
-- ordens_compra_update so checa permissao, nem status nem coluna. Quem tem
-- compras.ordens:editar devolve uma OC aprovada para 'pendente_aprovacao' com
-- um PATCH direto, pulando fn_desaprovar_ordem_compra, que e o unico lugar que
-- apaga o lancamento financeiro daquela OC. Sobra OC pendente com lancamento
-- vivo pendurado. Foi por ai que apareceu a OC com dois lancamentos.
--
-- Cobre:
--   1. hoje nenhuma OC pendente/rascunho/rejeitada tem lancamento vivo
--   2. SEM a guarda: aprovado -> pendente_aprovacao por UPDATE direto e ACEITO
--   3. SEM a guarda: pendente_aprovacao -> aprovado por UPDATE direto e ACEITO
--      (auto-aprovacao sem lancamento, sem checar competencia nem parcelas)
--   4. COM a guarda: aprovado -> pendente_aprovacao por UPDATE direto e RECUSADO
--   5. COM a guarda: pendente_aprovacao -> aprovado por UPDATE direto e RECUSADO
--   6. COM a guarda: aprovado -> recebido e -> pago por UPDATE direto e RECUSADO
--   7. COM a guarda: desaprovar pela RPC continua passando (e apaga o lancamento)
--   8. COM a guarda: editar OC pendente do jeito que o app edita continua passando
--      (cabecalho por UPDATE direto + troca de oc_itens + fn_salvar_parcelas_oc)
--   9. COM a guarda: aprovar pela RPC continua passando (e gera 1 lancamento)
--  10. COM a guarda: registrar recebimento pela RPC continua passando
--  11. COM a guarda: enviar para aprovacao (rascunho -> pendente) por UPDATE
--      direto continua passando, que e o caminho do app hoje
--  12. COM a guarda: rejeitar sem a permissao 'aprovar' e RECUSADO
--  13. COM a guarda: rejeitar (pendente -> rejeitado) por UPDATE direto continua
--      passando, que e o caminho do app hoje
--  14. COM a guarda: transicao que o app nao faz (rejeitado -> rascunho) e RECUSADA
--  15. COM a guarda: cancelar pela RPC continua passando
--  16. nenhuma funcao existente foi reescrita (except all nas duas direcoes +
--      md5 do prosrc antes e depois)
--
-- IMPORTANTE: as funcoes checam tem_permissao(), que depende de auth.uid().
-- Rodando fora de sessao autenticada (SQL editor, MCP), o bloco assume o
-- primeiro usuario ativo com compras.ordens criar + editar + aprovar +
-- desaprovar.

begin;

create temp table prova_status_oc (
  ordem int generated always as identity,
  caso text, esperado text, obtido text, passou boolean
) on commit drop;

create temp table prova_ctx (chave text primary key, valor text) on commit drop;

-- Definicao viva das funcoes que escrevem em ordens_compra, ANTES da migration.
create temp table prova_defs_antes on commit drop as
select p.proname, pg_get_functiondef(p.oid) as def, md5(p.prosrc) as md5
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosrc ~* 'update\s+(public\.)?ordens_compra';

do $prova$
declare
  v_usuario uuid;
  v_modelo uuid;
  v_oc uuid;
  v_oc2 uuid;
  v_cab jsonb;
  v_itens jsonb;
  v_status text;
  v_pendurados int;
begin
  select u.id into v_usuario
  from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo and up.recurso = 'compras.ordens'
  group by u.id
  having bool_or(up.acao = 'criar') and bool_or(up.acao = 'editar')
     and bool_or(up.acao = 'aprovar') and bool_or(up.acao = 'desaprovar')
  limit 1;
  if v_usuario is null then
    raise exception 'Nenhum usuario ativo com compras.ordens criar + editar + aprovar + desaprovar';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

  -- 1. estado de hoje: OC fora de aprovado/recebido/pago com lancamento vivo.
  select count(*)::int into v_pendurados
  from public.ordens_compra o
  join public.lancamentos l on l.origem = 'oc' and l.origem_id = o.id
  where o.status in ('rascunho', 'pendente_aprovacao', 'rejeitado')
    and l.status <> 'cancelado';
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('1. OC pendente/rascunho/rejeitada com lancamento vivo hoje',
          '0', v_pendurados::text, v_pendurados = 0);

  -- OC de prova, modelada numa OC real (FKs, categoria ativa e mes aberto
  -- garantidos): nenhuma OC de producao e mexida.
  select o.id into v_modelo
  from public.ordens_compra o
  where exists (select 1 from public.oc_itens oi where oi.ordem_compra_id = o.id)
    and not exists (select 1 from public.competencias_fechadas cf where cf.mes = o.mes_competencia)
    and coalesce((select f.tipo from public.formas_pagamento f where f.id = o.forma_pagamento_id), 'bancario') = 'bancario'
  limit 1;
  if v_modelo is null then
    raise exception 'Nenhuma OC com item, mes aberto e forma bancaria para modelar a prova';
  end if;

  select jsonb_build_object(
           'fornecedor_id', o.fornecedor_id,
           'condicao_pagamento_id', o.condicao_pagamento_id,
           'forma_pagamento_id', o.forma_pagamento_id,
           'data_compra', o.data_compra,
           'mes_competencia', o.mes_competencia,
           'descricao', '[PROVA] guarda de transicao de status',
           'categoria_id', o.categoria_id
         )
  into v_cab
  from public.ordens_compra o where o.id = v_modelo;

  select jsonb_agg(jsonb_build_object(
           'insumo_id', i.insumo_id,
           'quantidade', i.quantidade,
           'preco_unitario', i.preco_unitario,
           'centro_custo_id', i.centro_custo_id))
  into v_itens
  from public.oc_itens i where i.ordem_compra_id = v_modelo;

  set local role authenticated;
  v_oc := public.fn_criar_ordem_compra(v_cab, v_itens);
  v_oc2 := public.fn_criar_ordem_compra(v_cab, v_itens);
  -- rascunho -> pendente e pendente -> aprovado pelo caminho de hoje, para a
  -- OC de prova chegar em 'aprovado' com o lancamento previsto gerado.
  update public.ordens_compra set status = 'pendente_aprovacao', motivo_rejeicao = null where id = v_oc;
  perform public.fn_aprovar_ordem_compra(v_oc);
  reset role;

  insert into prova_ctx (chave, valor) values
    ('usuario', v_usuario::text), ('oc', v_oc::text), ('oc2', v_oc2::text),
    ('itens', v_itens::text);

  -- Depois da migration a guarda ja existe. Para os casos 2 e 3 poderem
  -- reproduzir o defeito, ela sai aqui dentro da transacao e volta logo abaixo,
  -- entao esta prova pode rodar de novo a qualquer momento e da o mesmo
  -- resultado. O drop pega ACCESS EXCLUSIVE em ordens_compra por instantes.
  drop trigger if exists trg_ordens_compra_status on public.ordens_compra;

  -- 2. SEM a guarda: a OC aprovada volta para pendente por UPDATE direto,
  --    pulando o fn_desaprovar_ordem_compra e deixando o lancamento vivo.
  --    Roda numa subtransacao abortada de proposito: o defeito nao sobra para
  --    os casos seguintes (as variaveis plpgsql sobrevivem ao abort, as
  --    escritas nao).
  begin
    set local role authenticated;
    update public.ordens_compra
    set status = 'pendente_aprovacao', aprovado_por = null, aprovado_em = null
    where id = v_oc;
    reset role;

    select status into v_status from public.ordens_compra where id = v_oc;
    select count(*)::int into v_pendurados
    from public.lancamentos where origem = 'oc' and origem_id = v_oc and status <> 'cancelado';

    raise exception 'desfaz o pulo' using errcode = 'P0001';
  exception when raise_exception then
    if sqlerrm <> 'desfaz o pulo' then raise; end if;
  end;
  reset role;
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('2. sem guarda: aprovado -> pendente por UPDATE direto',
          'aceitou, com lancamento pendurado (defeito)',
          v_status || ', lancamentos vivos: ' || v_pendurados::text,
          v_status = 'pendente_aprovacao' and v_pendurados = 1);

  -- 3. SEM a guarda: auto-aprovacao por UPDATE direto (nem lancamento nem
  --    checagem de competencia e parcelas).
  begin
    set local role authenticated;
    update public.ordens_compra set status = 'pendente_aprovacao' where id = v_oc2;
    update public.ordens_compra set status = 'aprovado' where id = v_oc2;
    reset role;
    select status into v_status from public.ordens_compra where id = v_oc2;
    raise exception 'desfaz a auto aprovacao' using errcode = 'P0001';
  exception when raise_exception then
    if sqlerrm <> 'desfaz a auto aprovacao' then raise; end if;
  end;
  reset role;
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('3. sem guarda: pendente -> aprovado por UPDATE direto',
          'aceitou, sem lancamento (defeito)', v_status, v_status = 'aprovado');
end $prova$;

-- ---------------------------------------------------------------------------
-- A guarda (texto identico ao da migration 20260804120001).
-- ---------------------------------------------------------------------------
create or replace function public.fn_guarda_status_oc()
returns trigger
language plpgsql
set search_path to ''
as $guarda$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- As RPCs da maquina de status sao security definer com dono postgres, entao
  -- dentro delas current_user deixa de ser 'authenticated'. Elas SAO a maquina
  -- (checam permissao, motivo, competencia e efeito posterior) e passam. A
  -- guarda vale para o UPDATE direto na tabela, que o PostgREST abre para quem
  -- tem compras.ordens:editar ou :aprovar pela policy ordens_compra_update.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Os dois unicos passos que o app faz por UPDATE direto hoje
  -- (transicionarStatus em src/modules/compras/ordens/actions.ts). A permissao
  -- exigida e a mesma que a Server Action checa em cada um.
  if old.status = 'rascunho' and new.status = 'pendente_aprovacao'
     and public.tem_permissao('compras.ordens', 'editar') then
    return new;
  end if;

  if old.status = 'pendente_aprovacao' and new.status = 'rejeitado'
     and public.tem_permissao('compras.ordens', 'aprovar') then
    return new;
  end if;

  if old.status = 'aprovado' and new.status = 'pendente_aprovacao' then
    raise exception 'Para devolver a ordem % para pendente use a acao Desaprovar: ela exige motivo, recusa se houver pagamento aprovado, pago ou conciliado e apaga o lancamento financeiro. Mudar o status direto deixaria o lancamento pendurado na ordem.',
      coalesce(new.numero, '');
  end if;

  raise exception 'Mudanca de status nao permitida na ordem %: de "%" para "%". Use as acoes da ordem de compra (enviar para aprovacao, aprovar, rejeitar, desaprovar, registrar recebimento, cancelar), que sao o unico caminho com motivo, permissao e efeito financeiro.',
    coalesce(new.numero, ''), old.status, new.status;
end;
$guarda$;

revoke all on function public.fn_guarda_status_oc() from public;

drop trigger if exists trg_ordens_compra_status on public.ordens_compra;
create trigger trg_ordens_compra_status
before update of status on public.ordens_compra
for each row execute function public.fn_guarda_status_oc();

-- ---------------------------------------------------------------------------

do $prova$
declare
  v_usuario uuid := (select valor::uuid from prova_ctx where chave = 'usuario');
  v_oc uuid := (select valor::uuid from prova_ctx where chave = 'oc');
  v_oc2 uuid := (select valor::uuid from prova_ctx where chave = 'oc2');
  v_itens jsonb := (select valor::jsonb from prova_ctx where chave = 'itens');
  v_status text;
  v_erro text;
  v_lancs int;
  v_total numeric(14, 2);
  v_obs text;
  v_itens_gravados int;
  v_parcelas int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

  -- 4. COM a guarda: o pulo e recusado.
  v_erro := null;
  begin
    set local role authenticated;
    update public.ordens_compra
    set status = 'pendente_aprovacao', aprovado_por = null, aprovado_em = null
    where id = v_oc;
    reset role;
  exception when others then
    v_erro := left(sqlerrm, 60);
  end;
  reset role;
  select status into v_status from public.ordens_compra where id = v_oc;
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('4. com guarda: aprovado -> pendente por UPDATE direto',
          'recusado, OC segue aprovado',
          coalesce(v_erro, 'ACEITOU') || ' / ' || v_status,
          v_erro is not null and v_status = 'aprovado');

  -- 5. COM a guarda: auto-aprovacao por UPDATE direto e recusada.
  v_erro := null;
  begin
    set local role authenticated;
    update public.ordens_compra set status = 'aprovado' where id = v_oc2;
    reset role;
  exception when others then
    v_erro := left(sqlerrm, 60);
  end;
  reset role;
  select status into v_status from public.ordens_compra where id = v_oc2;
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('5. com guarda: rascunho -> aprovado por UPDATE direto',
          'recusado, OC segue rascunho',
          coalesce(v_erro, 'ACEITOU') || ' / ' || v_status,
          v_erro is not null and v_status = 'rascunho');

  -- 6. COM a guarda: efeito posterior por UPDATE direto tambem e recusado.
  v_erro := null;
  begin
    set local role authenticated;
    update public.ordens_compra set status = 'recebido' where id = v_oc;
    reset role;
  exception when others then
    v_erro := 'recusado';
  end;
  reset role;
  begin
    set local role authenticated;
    update public.ordens_compra set status = 'pago' where id = v_oc;
    reset role;
  exception when others then
    v_erro := coalesce(v_erro, '') || ' + recusado';
  end;
  reset role;
  select status into v_status from public.ordens_compra where id = v_oc;
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('6. com guarda: aprovado -> recebido e -> pago por UPDATE direto',
          'recusado + recusado, OC segue aprovado',
          coalesce(v_erro, 'ACEITOU') || ' / ' || v_status,
          v_erro = 'recusado + recusado' and v_status = 'aprovado');

  -- 7. COM a guarda: desaprovar pela RPC continua passando e apaga o lancamento.
  set local role authenticated;
  perform public.fn_desaprovar_ordem_compra(v_oc, '[PROVA] caminho legitimo');
  reset role;
  select status into v_status from public.ordens_compra where id = v_oc;
  select count(*)::int into v_lancs
  from public.lancamentos where origem = 'oc' and origem_id = v_oc;
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('7. com guarda: desaprovar pela RPC',
          'pendente_aprovacao, 0 lancamentos',
          v_status || ', ' || v_lancs::text,
          v_status = 'pendente_aprovacao' and v_lancs = 0);

  -- 8. COM a guarda: editar OC pendente do jeito que o app edita hoje
  --    (UPDATE direto no cabecalho, sem status; troca inteira de oc_itens;
  --    fn_salvar_parcelas_oc no fim).
  set local role authenticated;
  update public.ordens_compra
  set observacoes = '[PROVA] editado pelo caminho do app',
      descricao = '[PROVA] descricao editada'
  where id = v_oc;

  delete from public.oc_itens where ordem_compra_id = v_oc;
  insert into public.oc_itens (ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id)
  select v_oc, (x->>'insumo_id')::uuid, (x->>'quantidade')::numeric,
         (x->>'preco_unitario')::numeric, (x->>'centro_custo_id')::uuid
  from jsonb_array_elements(v_itens) x;
  reset role;

  select valor_total, observacoes into v_total, v_obs
  from public.ordens_compra where id = v_oc;
  select count(*)::int into v_itens_gravados
  from public.oc_itens where ordem_compra_id = v_oc;

  set local role authenticated;
  perform public.fn_salvar_parcelas_oc(
    v_oc,
    jsonb_build_array(jsonb_build_object(
      'data_vencimento', ((select data_compra from public.ordens_compra where id = v_oc) + 30)::text,
      'valor', v_total))
  );
  reset role;
  select count(*)::int into v_parcelas
  from public.oc_parcelas where ordem_compra_id = v_oc;

  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('8. com guarda: editar OC pendente do jeito do app',
          'observacoes gravadas, ' || jsonb_array_length(v_itens)::text || ' itens, 1 parcela',
          coalesce(v_obs, '(nulo)') || ', ' || v_itens_gravados::text || ' itens, ' || v_parcelas::text || ' parcela',
          v_obs = '[PROVA] editado pelo caminho do app'
            and v_itens_gravados = jsonb_array_length(v_itens)
            and v_parcelas = 1);

  -- 9. COM a guarda: aprovar pela RPC continua passando.
  set local role authenticated;
  perform public.fn_aprovar_ordem_compra(v_oc);
  reset role;
  select status into v_status from public.ordens_compra where id = v_oc;
  select count(*)::int into v_lancs
  from public.lancamentos where origem = 'oc' and origem_id = v_oc;
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('9. com guarda: aprovar pela RPC',
          'aprovado, 1 lancamento', v_status || ', ' || v_lancs::text,
          v_status = 'aprovado' and v_lancs = 1);

  -- 10. COM a guarda: registrar recebimento pela RPC continua passando
  --     (aprovado -> recebido dentro da funcao).
  set local role authenticated;
  perform public.fn_registrar_recebimento(
    v_oc, '[PROVA] 999', v_total,
    (select data_compra from public.ordens_compra where id = v_oc));
  reset role;
  select status into v_status from public.ordens_compra where id = v_oc;
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('10. com guarda: registrar recebimento pela RPC',
          'recebido', v_status, v_status = 'recebido');

  -- 11. COM a guarda: enviar para aprovacao por UPDATE direto (caminho do app).
  set local role authenticated;
  update public.ordens_compra
  set status = 'pendente_aprovacao', motivo_rejeicao = null
  where id = v_oc2;
  reset role;
  select status into v_status from public.ordens_compra where id = v_oc2;
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('11. com guarda: enviar para aprovacao por UPDATE direto',
          'pendente_aprovacao', v_status, v_status = 'pendente_aprovacao');

  -- 12. COM a guarda: quem NAO tem compras.ordens:aprovar nao rejeita por
  --     UPDATE direto, do mesmo jeito que a Server Action rejeitarOrdem exige
  --     'aprovar'. A permissao sai numa subtransacao abortada de proposito:
  --     nada de producao muda. A policy ordens_compra_update continua passando
  --     (o usuario segue com 'editar'), entao quem recusa e a guarda.
  v_erro := null;
  begin
    delete from public.usuario_permissoes
    where usuario_id = v_usuario and recurso = 'compras.ordens' and acao = 'aprovar';

    begin
      set local role authenticated;
      update public.ordens_compra
      set status = 'rejeitado', motivo_rejeicao = '[PROVA] sem permissao'
      where id = v_oc2;
      reset role;
      v_erro := 'ACEITOU';
    exception when others then
      v_erro := 'recusado';
    end;
    reset role;

    raise exception 'desfaz a permissao' using errcode = 'P0001';
  exception when raise_exception then
    if sqlerrm <> 'desfaz a permissao' then raise; end if;
  end;
  reset role;
  select status into v_status from public.ordens_compra where id = v_oc2;
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('12. com guarda: rejeitar sem a permissao aprovar',
          'recusado, OC segue pendente_aprovacao',
          v_erro || ' / ' || v_status,
          v_erro = 'recusado' and v_status = 'pendente_aprovacao');

  -- 13. COM a guarda: rejeitar COM a permissao, por UPDATE direto (caminho do app).
  set local role authenticated;
  update public.ordens_compra
  set status = 'rejeitado', motivo_rejeicao = '[PROVA] rejeitada'
  where id = v_oc2;
  reset role;
  select status into v_status from public.ordens_compra where id = v_oc2;
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('13. com guarda: rejeitar por UPDATE direto',
          'rejeitado', v_status, v_status = 'rejeitado');

  -- 14. COM a guarda: transicao que o app nao faz (rejeitado -> rascunho) e
  --     recusada. Se um dia existir o botao "reabrir", ele entra na guarda.
  v_erro := null;
  begin
    set local role authenticated;
    update public.ordens_compra set status = 'rascunho' where id = v_oc2;
    reset role;
  exception when others then
    v_erro := left(sqlerrm, 60);
  end;
  reset role;
  select status into v_status from public.ordens_compra where id = v_oc2;
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('14. com guarda: rejeitado -> rascunho por UPDATE direto',
          'recusado, OC segue rejeitada',
          coalesce(v_erro, 'ACEITOU') || ' / ' || v_status,
          v_erro is not null and v_status = 'rejeitado');

  -- 15. COM a guarda: cancelar pela RPC continua passando.
  set local role authenticated;
  perform public.fn_cancelar_ordem_compra(v_oc2, '[PROVA] cancelamento legitimo');
  reset role;
  select status into v_status from public.ordens_compra where id = v_oc2;
  insert into prova_status_oc (caso, esperado, obtido, passou)
  values ('15. com guarda: cancelar pela RPC', 'cancelado', v_status, v_status = 'cancelado');
end $prova$;

-- 16. nenhuma funcao existente foi reescrita.
create temp table prova_defs_depois on commit drop as
select p.proname, pg_get_functiondef(p.oid) as def, md5(p.prosrc) as md5
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosrc ~* 'update\s+(public\.)?ordens_compra';

insert into prova_status_oc (caso, esperado, obtido, passou)
select '16. definicao viva das funcoes que escrevem em ordens_compra',
       'sem diferenca nas duas direcoes',
       coalesce((select count(*)::text from (
         (select * from prova_defs_antes except all select * from prova_defs_depois)
         union all
         (select * from prova_defs_depois except all select * from prova_defs_antes)
       ) d), '0') || ' diferencas em ' || (select count(*)::text from prova_defs_antes) || ' funcoes',
       not exists (
         (select * from prova_defs_antes except all select * from prova_defs_depois)
         union all
         (select * from prova_defs_depois except all select * from prova_defs_antes)
       );

select caso, esperado, obtido, case when passou then 'PASSOU' else 'FALHOU' end as resultado
from prova_status_oc order by ordem;

rollback;
