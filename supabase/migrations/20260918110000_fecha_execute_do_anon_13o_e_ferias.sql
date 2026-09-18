-- Funcao nasce com EXECUTE para PUBLIC, e PUBLIC inclui o `anon`.
--
-- As 18 RPCs do 13o e do recibo de ferias foram criadas com `create function`
-- e nenhum `grant`, entao o ACL delas ficou NULO, que em Postgres quer dizer
-- "EXECUTE para PUBLIC". Efeito: qualquer um com a chave publicavel podia
-- chamar `/rest/v1/rpc/fn_gerar_decimo_terceiro` sem estar logado.
--
-- Na pratica as funcoes recusavam, porque a primeira linha de cada uma e
-- `tem_permissao(...)` e sem sessao isso da false. Mas isso e a segunda
-- tranca segurando sozinha: a superficie exposta nao deveria existir.
--
-- Levantado pelo advisor de seguranca em 18/09/2026
-- (`anon_security_definer_function_executable`, 19 achados).
--
-- Por que `revoke ... from public` e nao `from anon`: o privilegio nao esta no
-- anon, esta no PUBLIC que o anon herda. Revogar do anon nao tira nada.
--
-- O `grant` para `authenticated` vem na MESMA transacao do `revoke`: separados,
-- existe um instante em que quem esta logado perde a funcao e a tela quebra.
--
-- `fn_dt_recalcular_totais` NAO recebe grant: e helper interno, chamado so de
-- dentro das outras RPCs (que sao security definer e rodam como postgres).
-- Nenhuma tela chama. Sem grant ela sai da superficie REST inteira.
--
-- Fora deste conserto: `fn_trava_saldo_inicial`, que tambem aparece no advisor
-- mas retorna `trigger` (o PostgREST nao expoe funcao de trigger) e e de outra
-- frente.

do $$
declare
  v_fn text;
  v_oid oid;
  -- As que a tela chama: revoke do PUBLIC, grant para authenticated.
  v_expostas text[] := array[
    'fn_adicionar_ao_lote_decimo_terceiro',
    'fn_aprovar_decimo_terceiro',
    'fn_definir_vencimento_decimo_terceiro',
    'fn_desaprovar_decimo_terceiro',
    'fn_editar_item_decimo_terceiro',
    'fn_enviar_decimo_terceiro_aprovacao',
    'fn_excluir_decimo_terceiro',
    'fn_gerar_decimo_terceiro',
    'fn_rejeitar_decimo_terceiro',
    'fn_tirar_do_lote_decimo_terceiro',
    'fn_voltar_decimo_terceiro_para_rascunho',
    'fn_definir_vencimento_ferias',
    'fn_editar_recibo_ferias',
    'fn_enviar_recibo_ferias_aprovacao',
    'fn_lancar_ferias',
    'fn_rejeitar_recibo_ferias',
    'fn_voltar_recibo_ferias_para_rascunho'
  ];
  -- Helper interno: so revoke.
  v_internas text[] := array['fn_dt_recalcular_totais'];
begin
  foreach v_fn in array v_expostas loop
    select p.oid into v_oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_oid is null then
      raise exception 'Funcao public.% nao existe: a lista deste revoke ficou velha', v_fn;
    end if;

    execute format('revoke execute on function %s from public', v_oid::regprocedure);
    execute format('revoke execute on function %s from anon', v_oid::regprocedure);
    execute format('grant execute on function %s to authenticated', v_oid::regprocedure);
  end loop;

  foreach v_fn in array v_internas loop
    select p.oid into v_oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_oid is null then
      raise exception 'Funcao public.% nao existe: a lista deste revoke ficou velha', v_fn;
    end if;

    execute format('revoke execute on function %s from public', v_oid::regprocedure);
    execute format('revoke execute on function %s from anon', v_oid::regprocedure);
  end loop;
end $$;

-- Trava: nenhuma das 18 pode continuar executavel pelo anon, e as 17 expostas
-- tem que continuar executaveis pelo authenticated. Contar ACL nao bastaria:
-- `has_function_privilege` e o que o Postgres de fato consulta na hora.
do $$
declare
  r record;
  v_anon int := 0;
  v_perdeu int := 0;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'fn_%decimo_terceiro%' or p.proname = 'fn_dt_recalcular_totais'
            or p.proname in ('fn_definir_vencimento_ferias','fn_editar_recibo_ferias',
                             'fn_enviar_recibo_ferias_aprovacao','fn_lancar_ferias',
                             'fn_rejeitar_recibo_ferias','fn_voltar_recibo_ferias_para_rascunho'))
  loop
    if has_function_privilege('anon', r.oid, 'EXECUTE') then
      raise warning 'anon ainda executa %', r.proname;
      v_anon := v_anon + 1;
    end if;

    if r.proname <> 'fn_dt_recalcular_totais'
       and not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      raise warning 'authenticated PERDEU %', r.proname;
      v_perdeu := v_perdeu + 1;
    end if;
  end loop;

  if v_anon > 0 then
    raise exception 'Sobraram % funcoes executaveis pelo anon', v_anon;
  end if;
  if v_perdeu > 0 then
    raise exception '% funcoes ficaram inalcancaveis para quem esta logado: a tela quebraria', v_perdeu;
  end if;
end $$;
