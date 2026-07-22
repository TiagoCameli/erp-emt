-- salvar_condicao: grava cabecalho (condicoes_pagamento) + parcelas
-- (condicao_parcelas) numa unica transacao.
--
-- Bug corrigido: criarCondicao (actions.ts) inseria o cabecalho direto na
-- tabela e só DEPOIS chamava a RPC salvar_condicao_parcelas. Quando a RPC
-- falhava (permissao insuficiente ou soma de percentuais != 100), o
-- código tentava desfazer com um `.delete()` client-side em
-- condicoes_pagamento — mas `authenticated` nunca teve grant de DELETE
-- nessa tabela (rule 1 do projeto: sem policy de delete = sem grant), e o
-- código não checava o erro desse delete. Resultado: cabeçalho órfão sem
-- nenhuma parcela e, como `descricao` é UNIQUE, aquela descrição ficava
-- travada pra sempre sem recuperação pelo app.
--
-- Corrige também o caso "criar sem editar": salvar_condicao_parcelas
-- sempre exigia a permissão 'editar', mesmo quando chamada como parte da
-- criação de uma condição nova — um perfil com só 'criar' (sem 'editar')
-- passava pela checagem de criarCondicao mas travava na RPC de parcelas.
-- Aqui a permissão exigida depende de p_id: null (criação) -> 'criar';
-- não-null (edição) -> 'editar'.
--
-- Esta função NÃO chama salvar_condicao_parcelas (que sempre exige
-- 'editar') — a validação da soma e o delete+insert das parcelas estão
-- inline, na mesma transação do cabeçalho, pra manter o cenário
-- criar-sem-editar funcionando e tudo atômico.
--
-- Rollback:
--   drop function if exists public.salvar_condicao(uuid, text, boolean, jsonb);

create or replace function public.salvar_condicao(
  p_id uuid, p_descricao text, p_ativo boolean, p_parcelas jsonb
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_soma numeric(6,2);
begin
  if p_id is null then
    if not public.tem_permissao('cadastros.condicoes-pagamento', 'criar') then
      raise exception 'Sem permissao para criar condicoes de pagamento';
    end if;
  else
    if not public.tem_permissao('cadastros.condicoes-pagamento', 'editar') then
      raise exception 'Sem permissao para editar condicoes de pagamento';
    end if;
  end if;

  if p_id is null then
    insert into public.condicoes_pagamento (descricao, ativo)
    values (p_descricao, coalesce(p_ativo, true))
    returning id into v_id;
  else
    update public.condicoes_pagamento
    set descricao = p_descricao,
        ativo = coalesce(p_ativo, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Condicao de pagamento nao encontrada';
    end if;
  end if;

  -- Mesma validacao da salvar_condicao_parcelas: soma dos percentuais
  -- precisa fechar em 100. Se falhar aqui, o insert/update do cabecalho
  -- acima e desfeito junto (tudo na mesma transacao da chamada RPC), sem
  -- deixar cabecalho orfao.
  select coalesce(sum((p ->> 'percentual')::numeric), 0) into v_soma
  from jsonb_array_elements(coalesce(p_parcelas, '[]'::jsonb)) p;

  if round(v_soma, 2) <> 100.00 then
    raise exception 'A soma dos percentuais das parcelas deve ser 100 (recebido %)', v_soma;
  end if;

  delete from public.condicao_parcelas where condicao_id = v_id;

  insert into public.condicao_parcelas (condicao_id, numero, dias_offset, percentual)
  select
    v_id,
    row_number() over (order by (p ->> 'dias_offset')::int),
    (p ->> 'dias_offset')::int,
    (p ->> 'percentual')::numeric
  from jsonb_array_elements(p_parcelas) p;

  return v_id;
end;
$$;

revoke all on function public.salvar_condicao(uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.salvar_condicao(uuid, text, boolean, jsonb) to authenticated;
