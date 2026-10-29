-- Prova de aceite da folha customizável (29/10/2026, migration 20261029160001).
--
-- Roda sobre a folha em rascunho de 10/2026, dentro de DO que termina em
-- `raise`: nada é gravado. Quem faz a permissão valer é o
-- `set local role authenticated` (o MCP entra como owner).
--
-- Resultado em 29/10/2026:
--   base: itens=60 ativos=58
--   A regerar: itens=58 (esperado 58), inativos=0
--   B incluir: dias=28 base=1512.93, apos regerar presente=t
--   C duplicado: FRANCISCA ... ja esta nesta folha
--   D tirar: presente=f inclusao=f
--   D2 reincluir: presente=t exclusao=f
--   E desligado antes: FRANCISCO BRUNO ... foi desligado em 29/09/2026, antes de 10/2026 ...
--   F funcao: ret=t funcao_ok=t
--   G vinculo: ret=t vinc=terceiro base=2011.11 (esperado 2011.11) manual=t
--   H andreia incluir / cadastro: Sem permissao para editar a folha
--
-- O controle de A é a contagem de ATIVOS medida antes: regerar tem que tirar
-- exatamente os inativos, nem um ativo a mais. O de G é o salário editado à mão
-- (+11,11 sobre o que estava): mudar o vínculo regenera a folha, e a edição tem
-- que sobreviver.

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_andreia uuid := '7d0194c2-fd7e-41d1-b6c4-f05c0a652229';
  v_folha uuid := 'b01166af-ef28-4e35-b425-735bc2f73c10'; v_comp date := '2026-10-01';
  v_fran uuid; v_ativo_clt uuid; v_ativo_nome text; v_inativo_velho uuid; v_func uuid; v_func_antes uuid;
  r text := '';
  n int; n2 int; ok boolean; e text; v_dias int; v_base numeric; v_vinc text; v_man boolean; v_sal numeric;
begin
  select id into v_fran from colaboradores where nome like 'FRANCISCA VANGELINA%';
  select c.id, c.nome, c.funcao_id into v_ativo_clt, v_ativo_nome, v_func_antes from folha_itens i join colaboradores c on c.id=i.colaborador_id
    where i.folha_id=v_folha and c.ativo and c.vinculo='clt' order by c.nome limit 1;
  select id into v_func from funcoes where ativo and id is distinct from v_func_antes order by nome limit 1;
  select id into v_inativo_velho from colaboradores where not ativo and data_demissao < '2026-10-01' order by nome limit 1;

  select count(*) into n from folha_itens i join colaboradores c on c.id=i.colaborador_id where i.folha_id=v_folha and c.ativo;
  r := r || format('base: itens=%s ativos=%s | ', (select count(*) from folha_itens where folha_id=v_folha), n);

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  perform fn_gerar_folha(v_comp);
  select count(*) into n2 from folha_itens where folha_id=v_folha;
  r := r || format('A regerar: itens=%s (esperado %s), inativos=%s | ', n2, n,
    (select count(*) from folha_itens i join colaboradores c on c.id=i.colaborador_id where i.folha_id=v_folha and not c.ativo));

  perform fn_incluir_na_folha(v_folha, v_fran, 'teste');
  select dias_trabalhados, salario_base into v_dias, v_base from folha_itens where folha_id=v_folha and colaborador_id=v_fran;
  perform fn_gerar_folha(v_comp);
  r := r || format('B incluir: dias=%s base=%s, apos regerar presente=%s | ', v_dias, v_base,
    exists(select 1 from folha_itens where folha_id=v_folha and colaborador_id=v_fran));

  begin perform fn_incluir_na_folha(v_folha, v_fran, null); e := 'PASSOU'; exception when others then e := sqlerrm; end;
  r := r || 'C duplicado: ' || e || ' | ';

  perform fn_tirar_da_folha(v_folha, v_fran, 'teste');
  r := r || format('D tirar: presente=%s inclusao=%s | ',
    exists(select 1 from folha_itens where folha_id=v_folha and colaborador_id=v_fran),
    exists(select 1 from folha_inclusoes where folha_id=v_folha and colaborador_id=v_fran));
  perform fn_incluir_na_folha(v_folha, v_fran, null);
  r := r || format('D2 reincluir: presente=%s exclusao=%s | ',
    exists(select 1 from folha_itens where folha_id=v_folha and colaborador_id=v_fran),
    exists(select 1 from folha_exclusoes where folha_id=v_folha and colaborador_id=v_fran));

  if v_inativo_velho is not null then
    begin perform fn_incluir_na_folha(v_folha, v_inativo_velho, null); e := 'PASSOU'; exception when others then e := sqlerrm; end;
    r := r || 'E desligado antes: ' || e || ' | ';
  end if;

  ok := fn_folha_atualizar_colaborador(v_folha, v_ativo_clt, v_ativo_nome, 'clt', v_func);
  r := r || format('F funcao: ret=%s funcao_ok=%s | ', ok, (select funcao_id = v_func from colaboradores where id=v_ativo_clt));

  reset role;
  update folha_itens set salario_base = salario_base + 11.11, editado_manualmente = true where folha_id=v_folha and colaborador_id=v_ativo_clt
    returning salario_base into v_sal;
  execute 'set local role authenticated';
  ok := fn_folha_atualizar_colaborador(v_folha, v_ativo_clt, v_ativo_nome, 'terceiro', v_func);
  select c.vinculo, i.salario_base, i.editado_manualmente into v_vinc, v_base, v_man from folha_itens i join colaboradores c on c.id=i.colaborador_id where i.folha_id=v_folha and i.colaborador_id=v_ativo_clt;
  r := r || format('G vinculo: ret=%s vinc=%s base=%s (esperado %s) manual=%s | ', ok, v_vinc, v_base, v_sal, v_man);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_andreia, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform fn_incluir_na_folha(v_folha, v_fran, null); e := 'PASSOU'; exception when others then e := sqlerrm; end;
  r := r || 'H andreia incluir: ' || e || ' | ';
  begin perform fn_folha_atualizar_colaborador(v_folha, v_ativo_clt, 'X', 'clt', null); e := 'PASSOU'; exception when others then e := sqlerrm; end;
  r := r || 'H andreia cadastro: ' || e;
  reset role;

  raise exception 'RELATORIO: %', r;
end $prova$;
