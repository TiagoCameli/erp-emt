-- A linha de encargo individual passa a se chamar "Encargos individuais".
--
-- Vinha como "Encargos", e isso colide de verdade: a seção "Encargos por tipo"
-- do detalhe da folha agrupa `folha_item_encargos` por NOME
-- (`resumoPorEncargo`, em src/modules/rh/folha/calculo.ts). Se o Tiago
-- cadastrar um `folha_encargos` chamado "Encargos" — nome perfeitamente
-- plausível para quem quer uma linha só —, as duas origens somariam na MESMA
-- linha do resumo: encargo que gera guia misturado com encargo que não gera,
-- num único número, sem nada na tela dizendo que são coisas diferentes.
--
-- Nome próprio resolve sem depender da disciplina de quem cadastra. E fica
-- legível por si: "Encargos individuais R$ 400,00" diz de onde o número veio.
--
-- Só o rótulo muda. Nenhuma fórmula, nenhuma faixa, nenhum arredondamento —
-- o resto do corpo é idêntico ao da migration 20260820170100.

create or replace function public.fn_folha_aplicar_encargos_e_provisoes(
  p_item uuid,
  p_base numeric,
  p_encargos_percentual numeric
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_enc record; v_prov record;
  v_valor numeric; v_encargos numeric := 0; v_provisoes numeric := 0;
  v_pct_total numeric; v_pct_provisao numeric;
  v_prov_principal numeric; v_prov_encargos numeric;
begin
  -- Recalcular e sempre apagar e reescrever: a edicao de um item precisa
  -- desfazer as linhas anteriores, e a geracao chama isto num item recem
  -- inserido, onde o delete nao encontra nada.
  delete from public.folha_item_encargos where folha_item_id = p_item;
  delete from public.folha_item_provisoes where folha_item_id = p_item;

  if p_encargos_percentual is not null then
    v_valor := round(p_base * p_encargos_percentual / 100.0, 2);
    -- Grava a linha mesmo com 0,00: e ela que explica na tela POR QUE o
    -- encargo de um terceiro e zero, em vez de deixar o numero pelado e
    -- parecer config faltando.
    -- "Encargos individuais" e nome PROPRIO: o resumo por tipo agrupa por
    -- nome, e um "Encargos" generico fundiria com um folha_encargos de mesmo
    -- nome, somando numa linha so o que gera guia e o que nao gera.
    insert into public.folha_item_encargos
      (folha_item_id, nome, percentual, valor, grupo_recolhimento)
    values (p_item, 'Encargos individuais', p_encargos_percentual, v_valor, null);
    v_encargos := v_valor;
  else
    for v_enc in
      select nome, percentual, grupo_recolhimento
      from public.folha_encargos where ativo order by nome
    loop
      v_valor := round(p_base * v_enc.percentual / 100.0, 2);
      insert into public.folha_item_encargos
        (folha_item_id, nome, percentual, valor, grupo_recolhimento)
      values (p_item, v_enc.nome, v_enc.percentual, v_valor, v_enc.grupo_recolhimento);
      v_encargos := v_encargos + v_valor;
    end loop;
  end if;

  -- Provisao de 13o e ferias: custo do mes, SEM caixa (nao gera lancamento nem
  -- guia). Principal + os encargos que vao incidir quando o 13o e as ferias
  -- forem pagos, usando a MESMA base de encargo deste item — global quando o
  -- item segue a config, individual quando ele tem percentual proprio. Se
  -- usasse sempre o total global, um terceiro com 0% de encargo provisionaria
  -- encargo de CLT.
  -- O percentual da provisao JA EMBUTE o terco constitucional (regra do
  -- Tiago): nao se soma terco nenhum aqui.
  select coalesce(sum(percentual), 0) into v_pct_total
  from public.folha_encargos where ativo;
  v_pct_provisao := coalesce(p_encargos_percentual, v_pct_total);

  for v_prov in
    select nome, percentual from public.folha_provisoes where ativo order by nome
  loop
    v_prov_principal := round(p_base * v_prov.percentual / 100.0, 2);
    v_prov_encargos := round(v_prov_principal * v_pct_provisao / 100.0, 2);

    insert into public.folha_item_provisoes
      (folha_item_id, nome, percentual, valor_principal, valor_encargos)
    values (p_item, v_prov.nome, v_prov.percentual, v_prov_principal, v_prov_encargos);

    v_provisoes := v_provisoes + v_prov_principal + v_prov_encargos;
  end loop;

  update public.folha_itens
     set encargos = v_encargos, provisoes = v_provisoes
   where id = p_item;
end;
$function$;

comment on function public.fn_folha_aplicar_encargos_e_provisoes(uuid, numeric, numeric) is
  'Reescreve as linhas de folha_item_encargos e folha_item_provisoes de um item sobre p_base (o SALARIO BASE, sem gratificacao) e atualiza os totais encargos/provisoes do item. p_encargos_percentual null = discrimina os folha_encargos ativos (com grupo, gera guia); preenchido = uma linha "Encargos individuais" sem grupo (custo gerencial, sem guia; nome proprio para nao fundir com um folha_encargos homonimo no resumo por tipo). Interna.';

revoke all on function public.fn_folha_aplicar_encargos_e_provisoes(uuid, numeric, numeric)
  from public, anon, authenticated;
