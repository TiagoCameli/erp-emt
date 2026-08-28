-- Prova de aceite: tirar um colaborador DESTA folha, e trazer de volta.
--
-- A prova CHAMA as duas RPCs. Não basta conferir que o PostgREST acha a função:
-- em 28/08/2026 uma RPC de escrita deste mesmo projeto foi entregue com a
-- assinatura provada e o corpo quebrado (`unnest ... as conta`), porque plpgsql
-- só valida as queries do corpo na primeira EXECUÇÃO. Migration com `success` e
-- advisor limpo não dizem que a função roda.
--
-- O CONTROLE QUE DÁ SENTIDO À OBRA é o B: depois de tirar, roda-se o Regerar
-- (`fn_gerar_folha`, o mesmo que o botão da tela chama) e a pessoa TEM que
-- continuar fora. Sem a tabela `folha_exclusoes`, o delete/rebuild da geração
-- recriaria o item e a exclusão duraria até o próximo clique em Regerar — que é
-- o clique que o Tiago dá toda vez que muda um parâmetro.
--
-- Tudo dentro de DO que termina em `raise`: nada é gravado. A folha volta ao
-- estado anterior, inclusive o status que o caso E altera para testar a trava.
--
-- `set_config('request.jwt.claims', ...)` sozinho não prova nada: o MCP entra
-- como owner. Quem faz a permissão valer é o `set local role authenticated`.

do $prova$
declare
  v_tiago   uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';  -- rh.folha completo
  v_andreia uuid := '7d0194c2-fd7e-41d1-b6c4-f05c0a652229';  -- sem rh.folha
  v_folha uuid; v_comp date;
  v_colab uuid; v_nome text; v_peso numeric;
  base_itens int; base_bruto numeric;
  a_itens int; a_bruto numeric;
  b_depois_regerar int;
  c_itens int; c_bruto numeric;
  d_erro text := 'PASSOU (NAO DEVIA)';
  e_erro text := 'PASSOU (NAO DEVIA)';
  f_erro text := 'PASSOU (NAO DEVIA)';
begin
  select id, competencia, valor_bruto into v_folha, v_comp, base_bruto
  from public.folhas where status = 'rascunho' order by competencia desc limit 1;
  select count(*) into base_itens from public.folha_itens where folha_id = v_folha;

  -- Uma pessoa da folha, com o PESO dela no bruto medido ANTES de sair. O peso é
  -- lido do item, não chumbado: a folha é regerada o tempo todo e um número fixo
  -- faria a prova deixar de medir sem avisar.
  select i.colaborador_id, c.nome, i.salario_base + i.gratificacao + i.valor_extras
    into v_colab, v_nome, v_peso
  from public.folha_itens i join public.colaboradores c on c.id = i.colaborador_id
  where i.folha_id = v_folha order by c.nome limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- A: tirar da folha. O bruto tem que cair EXATAMENTE o peso da pessoa — não
  -- "mais ou menos": se cair diferente, a regeneração mudou outra coisa junto.
  perform public.fn_tirar_da_folha(v_folha, v_colab, 'licenca neste mes');
  select count(*) into a_itens from public.folha_itens where folha_id = v_folha;
  select valor_bruto into a_bruto from public.folhas where id = v_folha;

  -- B CONTROLE: o Regerar NÃO pode trazer a pessoa de volta.
  perform public.fn_gerar_folha(v_comp);
  select count(*) into b_depois_regerar
  from public.folha_itens where folha_id = v_folha and colaborador_id = v_colab;

  -- C: trazer de volta. Os totais têm que voltar ao valor da base.
  perform public.fn_voltar_para_folha(v_folha, v_colab);
  select count(*) into c_itens from public.folha_itens where folha_id = v_folha;
  select valor_bruto into c_bruto from public.folhas where id = v_folha;

  -- D CONTROLE: trazer de volta quem já está dentro. Recusar é melhor que
  -- regenerar a folha inteira por um clique que não mudava nada.
  begin
    perform public.fn_voltar_para_folha(v_folha, v_colab);
  exception when others then d_erro := sqlerrm;
  end;
  reset role;

  -- E CONTROLE: folha fora de rascunho. Mexer nos colaboradores de uma folha que
  -- já foi para aprovação mudaria o que alguém está aprovando.
  update public.folhas set status = 'pendente_aprovacao' where id = v_folha;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.fn_tirar_da_folha(v_folha, v_colab, null);
  exception when others then e_erro := sqlerrm;
  end;
  reset role;
  update public.folhas set status = 'rascunho' where id = v_folha;

  -- F CONTROLE: sem permissão de folha.
  perform set_config('request.jwt.claims', json_build_object('sub', v_andreia, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.fn_tirar_da_folha(v_folha, v_colab, null);
  exception when others then f_erro := sqlerrm;
  end;
  reset role;

  raise exception E'PROVA TIRAR DA FOLHA (desfeita, nada gravado)\n  base: % itens, bruto %\n  tirado: % (peso % no bruto)\n  A) depois de tirar: % itens, bruto %  (esperado % e %)\n  B) CONTROLE apos Regerar, item da pessoa: % (tem que ser 0)\n  C) depois de voltar: % itens, bruto %\n  D) CONTROLE voltar de novo -> %\n  E) CONTROLE folha em pendente_aprovacao -> %\n  F) CONTROLE Andreia (sem rh.folha) -> %',
    base_itens, base_bruto, v_nome, v_peso,
    a_itens, a_bruto, base_itens - 1, base_bruto - v_peso,
    b_depois_regerar, c_itens, c_bruto, d_erro, e_erro, f_erro;
end $prova$;

-- Resultado em 28/08/2026, folha 08/2026 em rascunho:
--
--   base: 58 itens, bruto 188466.93
--   tirado: ALDENISIA DE SOUZA LIMA (peso 1621.00 no bruto)
--   A) depois de tirar: 57 itens, bruto 186845.93  (esperado 57 e 186845.93)
--   B) CONTROLE apos Regerar, item da pessoa: 0 (tem que ser 0)
--   C) depois de voltar: 58 itens, bruto 188466.93
--   D) CONTROLE voltar de novo -> Este colaborador nao esta fora desta folha
--   E) CONTROLE folha em pendente_aprovacao -> A folha de 08/2026 esta em
--      "pendente_aprovacao": so da para tirar colaborador em rascunho. Rejeite
--      ou desaprove antes.
--   F) CONTROLE Andreia (sem rh.folha) -> Sem permissao para editar a folha
--
-- O bruto de A é o da base MENOS o peso, ao centavo, e o de C volta ao da base:
-- tirar e trazer de volta são exatamente reversíveis, e a regeneração no meio
-- não mexeu em mais nada.
--
-- B é a linha que justifica a tabela existir.

-- =====================================================================
-- Parte 2 (HTTP): o PostgREST resolve as duas assinaturas
-- =====================================================================
--
-- A parte 1 prova que as funções RODAM. Esta prova a outra metade: que a Server
-- Action consegue CHAMÁ-LAS. São falhas diferentes — em 28/08/2026, neste mesmo
-- projeto, uma RPC com assinatura certa quebrou no corpo, e antes disso outra
-- com corpo certo teria quebrado por nome de parâmetro. Nenhuma das duas
-- aparece no `tsc`, no build ou nos testes.
--
-- Rodado com a chave `anon`, de propósito: o que se quer saber é se a URL
-- RESOLVE, e o 42501 de permissão prova isso melhor que um 200 (que exigiria um
-- JWT de usuário logado).
--
--   POST /rest/v1/rpc/fn_tirar_da_folha
--        {"p_folha_id":..., "p_colaborador_id":..., "p_motivo":"teste"}
--   -> 401 {"code":"42501","message":"permission denied for function fn_tirar_da_folha"}
--
--   O MESMO com "p_motivo": null (o caso do campo vazio na tela)
--   -> 401 42501  (o default do parâmetro não atrapalha o casamento por nome)
--
--   POST /rest/v1/rpc/fn_voltar_para_folha
--        {"p_folha_id":..., "p_colaborador_id":...}
--   -> 401 42501
--
-- CONTROLE, trocando UM nome (p_folha_id -> p_folha):
--   -> 404 {"code":"PGRST202","message":"Could not find the function
--           public.fn_voltar_para_folha(p_colaborador_id, p_folha) ..."}
--
-- O controle é o que dá valor aos três primeiros: a resolução por nome de
-- parâmetro acontece ANTES da checagem de permissão, então o 42501 só aparece
-- quando os nomes batem. E confirma de passagem que o `revoke ... from public`
-- da migration fechou a porta do `anon`.
