-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-20, versão
-- 20260820191509 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Centro de custo "Investimentos", pedido pelo Tiago em 20/08/2026.
--
-- Entra como OBRA, e não como insert direto em centros_custo, porque centro raiz
-- nesta base nasce por trigger da obra: o app só cria etapa e item. É o mesmo
-- caminho de "Aquisição de Equipamentos" (obra criada em 14/08, status
-- em_andamento, todo o resto nulo), que este insert espelha.
--
-- Contexto: na reclassificação da planilha de 20/08 o Tiago escreveu
-- "Investimentos" na coluna Centro de custo de LAN-2026-1047, e o nome só existia
-- como CATEGORIA financeira. Aquele lançamento ficou de fora por decisão dele;
-- agora o centro passa a existir, então dá para apontá-lo pela tela.
--
-- Ensaiado antes em transação revertida: a trigger cria exatamente 1 centro,
-- nome "Investimentos", tipo obra, nível 1, raiz (sem pai), ativo. Conferido
-- depois de aplicar: é isso, com 0 lançamento apontando para ele.
--
-- Idempotente: recusa se já existir obra ou centro com esse nome.
--
-- Rollback: excluir a obra por fn_excluir_obra (que trata o centro de custo
-- raiz), nunca apagando o centro direto.
do $$
declare v_uid uuid; v_obra uuid; v_n int; v_tipo text; v_nivel int;
begin
  select id into v_uid from public.usuarios where nome = 'Tiago de Melo Cameli';
  if v_uid is null then
    raise exception 'nao achei o usuario para o created_by';
  end if;

  if exists (select 1 from public.obras where nome = 'Investimentos') then
    raise exception 'ja existe obra chamada Investimentos: nao vou criar duplicata';
  end if;
  if exists (select 1 from public.centros_custo where nome = 'Investimentos') then
    raise exception 'ja existe centro de custo chamado Investimentos';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  insert into public.obras (nome, status, ativo, created_by)
  values ('Investimentos', 'em_andamento', true, v_uid)
  returning id into v_obra;

  select count(*) into v_n from public.centros_custo where obra_id = v_obra;
  if v_n <> 1 then
    raise exception 'a trigger da obra criou % centros de custo, esperava 1', v_n;
  end if;

  select tipo, nivel into v_tipo, v_nivel
  from public.centros_custo where obra_id = v_obra;

  if v_tipo <> 'obra' or v_nivel <> 1 then
    raise exception 'centro criado fora do padrao de raiz: tipo=% nivel=%', v_tipo, v_nivel;
  end if;
end $$;
