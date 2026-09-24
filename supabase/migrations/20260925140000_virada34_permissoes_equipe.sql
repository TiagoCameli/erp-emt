-- Virada do Combustível e do Frete: quem lança hoje no Gestão Obras ganha no ERP o equivalente
-- do que tem lá (decisão do Tiago, 24/09: "Conceder o equivalente"). SÓ ACRESCENTA: nada é
-- tirado, sem aplicar_perfil (Andreia e Marvin mantêm Compras). De-para pelas chaves da origem:
--   Andreia (Gerente): todo o Combustível; Frete com fretes, pedidos e pagamentos (com excluir),
--     conta corrente, ajustes ver+criar (ajustar_saldo_transportadora; aprovar fica com os Admins)
--     e anomalias ver.
--   Marvin (Apontador): Combustível sem excluir, sem anomalias e sem relatórios (não tem essas
--     chaves lá); fretes ver/criar/editar.
--   Bruno (Apontador): já tem o Combustível; + fretes ver/criar/editar/excluir.
with novas(usuario_id, recurso, acao) as (
  select '7d0194c2-fd7e-41d1-b6c4-f05c0a652229'::uuid, r, a from (values
    ('combustivel.painel', 'ver'),
    ('combustivel.tanques', 'ver'), ('combustivel.tanques', 'criar'), ('combustivel.tanques', 'editar'), ('combustivel.tanques', 'excluir'),
    ('combustivel.entradas', 'ver'), ('combustivel.entradas', 'criar'), ('combustivel.entradas', 'editar'), ('combustivel.entradas', 'excluir'),
    ('combustivel.saidas', 'ver'), ('combustivel.saidas', 'criar'), ('combustivel.saidas', 'editar'), ('combustivel.saidas', 'excluir'),
    ('combustivel.transferencias', 'ver'), ('combustivel.transferencias', 'criar'), ('combustivel.transferencias', 'editar'), ('combustivel.transferencias', 'excluir'),
    ('combustivel.esvaziamentos', 'ver'), ('combustivel.esvaziamentos', 'criar'), ('combustivel.esvaziamentos', 'excluir'),
    ('combustivel.anomalias', 'ver'), ('combustivel.anomalias', 'editar'),
    ('combustivel.relatorios', 'ver'),
    ('frete.painel', 'ver'),
    ('frete.fretes', 'ver'), ('frete.fretes', 'criar'), ('frete.fretes', 'editar'), ('frete.fretes', 'excluir'),
    ('frete.pedidos-material', 'ver'), ('frete.pedidos-material', 'criar'), ('frete.pedidos-material', 'editar'), ('frete.pedidos-material', 'excluir'),
    ('frete.conta-corrente', 'ver'),
    ('frete.pagamentos', 'ver'), ('frete.pagamentos', 'criar'), ('frete.pagamentos', 'editar'), ('frete.pagamentos', 'excluir'),
    ('frete.ajustes', 'ver'), ('frete.ajustes', 'criar'),
    ('frete.anomalias', 'ver')
  ) v(r, a)
  union all
  select '9d4b8593-5d54-4b54-97c3-6d4df473e4fd'::uuid, r, a from (values
    ('combustivel.painel', 'ver'),
    ('combustivel.tanques', 'ver'), ('combustivel.tanques', 'criar'), ('combustivel.tanques', 'editar'),
    ('combustivel.entradas', 'ver'), ('combustivel.entradas', 'criar'), ('combustivel.entradas', 'editar'),
    ('combustivel.saidas', 'ver'), ('combustivel.saidas', 'criar'), ('combustivel.saidas', 'editar'),
    ('combustivel.transferencias', 'ver'), ('combustivel.transferencias', 'criar'), ('combustivel.transferencias', 'editar'),
    ('combustivel.esvaziamentos', 'ver'), ('combustivel.esvaziamentos', 'criar'),
    ('frete.fretes', 'ver'), ('frete.fretes', 'criar'), ('frete.fretes', 'editar')
  ) v(r, a)
  union all
  select 'b5c1a4e2-0e51-41c5-9c73-a851d9193f8b'::uuid, r, a from (values
    ('frete.fretes', 'ver'), ('frete.fretes', 'criar'), ('frete.fretes', 'editar'), ('frete.fretes', 'excluir')
  ) v(r, a)
)
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select usuario_id, recurso, acao from novas
on conflict (usuario_id, recurso, acao) do nothing;

do $confere$
declare v int;
begin
  select count(*) into v from public.usuario_permissoes
   where usuario_id = '7d0194c2-fd7e-41d1-b6c4-f05c0a652229' and (recurso like 'combustivel.%' or recurso like 'frete.%');
  if v <> 40 then raise exception 'Andreia: esperado 40 permissões de Combustível e Frete, veio %', v; end if;
  select count(*) into v from public.usuario_permissoes
   where usuario_id = '9d4b8593-5d54-4b54-97c3-6d4df473e4fd' and (recurso like 'combustivel.%' or recurso like 'frete.%');
  if v <> 18 then raise exception 'Marvin: esperado 18, veio %', v; end if;
  select count(*) into v from public.usuario_permissoes
   where usuario_id = 'b5c1a4e2-0e51-41c5-9c73-a851d9193f8b' and (recurso like 'combustivel.%' or recurso like 'frete.%');
  if v <> 27 then raise exception 'Bruno: esperado 27 (23 + 4), veio %', v; end if;
end $confere$;
