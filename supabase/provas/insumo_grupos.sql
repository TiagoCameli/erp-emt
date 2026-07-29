-- Prova de aceite dos 2 níveis de categoria de insumo (4 grupos fixos +
-- subcategorias) e do custo por grupo.
--
-- Roda contra o banco vivo, cria só um insumo de teste ([PROVA-GRUPOS]) e apaga.
-- Cobre:
--   1. existem exatamente 4 grupos
--   2. criar grupo novo é recusado (trigger)
--   3. apagar grupo é recusado (trigger)
--   4. editar o rótulo do grupo continua permitido
--   5. toda categoria tem grupo; todo insumo tem categoria
--   6. apagar categoria com insumo vinculado é recusado (FK)
--   7. "A classificar" existe nos 4 grupos (unique por nome + grupo)
--   8. o grupo do insumo vem por join, e reclassificar troca o grupo junto
--   9. soma do custo por grupo = custo total do mês (sem dupla contagem)
--  10. nenhum insumo com marca de desativação no nome
--
-- IMPORTANTE: as funções checam tem_permissao(), que depende de auth.uid().
-- Rodando fora de sessão autenticada, o bloco abaixo assume o primeiro usuário
-- ativo com cadastros.insumos:editar.

do $prova$
declare v_usuario uuid;
begin
  select u.id into v_usuario from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo and up.recurso = 'cadastros.insumos' and up.acao = 'editar' limit 1;
  if v_usuario is null then
    raise exception 'Nenhum usuario ativo com cadastros.insumos:editar';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, false);
end $prova$;

create temp table if not exists prova_grupos (
  ordem int generated always as identity,
  caso text, esperado text, obtido text, passou boolean
);
truncate prova_grupos;

do $prova$
declare
  v_int int; v_txt text; v_num numeric; v_num2 numeric;
  v_grupo uuid; v_cat uuid; v_insumo uuid; v_und uuid;
begin
  select count(*)::int into v_int from public.insumo_grupos;
  insert into prova_grupos (caso, esperado, obtido, passou)
  values ('1. existem 4 grupos', '4', v_int::text, v_int = 4);

  begin
    insert into public.insumo_grupos (slug, nome, ordem) values ('material', 'Novo', 9);
    insert into prova_grupos (caso, esperado, obtido, passou)
    values ('2. criar grupo novo', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_grupos (caso, esperado, obtido, passou)
    values ('2. criar grupo novo', 'recusado', left(sqlerrm, 45), true);
  end;

  begin
    delete from public.insumo_grupos where slug = 'outros';
    insert into prova_grupos (caso, esperado, obtido, passou)
    values ('3. apagar grupo', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_grupos (caso, esperado, obtido, passou)
    values ('3. apagar grupo', 'recusado', left(sqlerrm, 45), true);
  end;

  update public.insumo_grupos set nome = 'Material' where slug = 'material';
  select nome into v_txt from public.insumo_grupos where slug = 'material';
  insert into prova_grupos (caso, esperado, obtido, passou)
  values ('4. editar rotulo do grupo', 'Material', v_txt, v_txt = 'Material');

  select count(*)::int into v_int from public.categorias_insumo where grupo_id is null;
  insert into prova_grupos (caso, esperado, obtido, passou)
  values ('5. categoria sem grupo', '0', v_int::text, v_int = 0);

  select count(*)::int into v_int from public.insumos where categoria_id is null;
  insert into prova_grupos (caso, esperado, obtido, passou)
  values ('5b. insumo sem categoria', '0', v_int::text, v_int = 0);

  select c.id into v_cat
  from public.categorias_insumo c
  join public.insumos i on i.categoria_id = c.id
  group by c.id having count(i.id) > 0 limit 1;

  begin
    delete from public.categorias_insumo where id = v_cat;
    insert into prova_grupos (caso, esperado, obtido, passou)
    values ('6. apagar categoria com insumo', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_grupos (caso, esperado, obtido, passou)
    values ('6. apagar categoria com insumo', 'recusado', left(sqlerrm, 45), true);
  end;

  select count(*)::int into v_int from public.categorias_insumo where nome = 'A classificar';
  insert into prova_grupos (caso, esperado, obtido, passou)
  values ('7. A classificar em cada grupo', '4', v_int::text, v_int = 4);

  select id into v_grupo from public.insumo_grupos where slug = 'outros';
  select id into v_cat from public.categorias_insumo
  where grupo_id = v_grupo and nome = 'Taxas e administrativo';
  select id into v_und from public.unidades_medida where ativo limit 1;

  insert into public.insumos (nome, categoria_id, unidade_id, ativo)
  values ('[PROVA-GRUPOS] item de teste', v_cat, v_und, true)
  returning id into v_insumo;

  select g.slug into v_txt
  from public.insumos i
  join public.categorias_insumo c on c.id = i.categoria_id
  join public.insumo_grupos g on g.id = c.grupo_id
  where i.id = v_insumo;
  insert into prova_grupos (caso, esperado, obtido, passou)
  values ('8. grupo do insumo vem por join', 'outros', v_txt, v_txt = 'outros');

  select id into v_cat from public.categorias_insumo
  where grupo_id = (select id from public.insumo_grupos where slug = 'material')
    and nome = 'Elétrica';
  update public.insumos set categoria_id = v_cat where id = v_insumo;

  select g.slug into v_txt
  from public.insumos i
  join public.categorias_insumo c on c.id = i.categoria_id
  join public.insumo_grupos g on g.id = c.grupo_id
  where i.id = v_insumo;
  insert into prova_grupos (caso, esperado, obtido, passou)
  values ('8b. reclassificar troca o grupo junto', 'material', v_txt, v_txt = 'material');

  delete from public.insumos where id = v_insumo;

  select coalesce(sum(total), 0) into v_num from public.fn_rel_custo_por_grupo(null, null);
  select coalesce(sum(total), 0) into v_num2 from public.fn_rel_custo_centro_custo(null, null);
  insert into prova_grupos (caso, esperado, obtido, passou)
  values ('9. soma por grupo = custo total', v_num2::text, v_num::text, v_num = v_num2);

  select count(*)::int into v_int from public.insumos where nome ~ '^\s*!';
  insert into prova_grupos (caso, esperado, obtido, passou)
  values ('10. nome sem marca de desativacao', '0', v_int::text, v_int = 0);
end $prova$;

select caso, esperado, obtido, case when passou then 'PASSOU' else 'FALHOU' end as resultado
from prova_grupos order by ordem;
