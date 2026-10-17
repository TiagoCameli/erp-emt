-- Módulo Mapa v1.26: excluir uma movimentação do Histórico (16/10/2026).
--
-- Pedido do Tiago: "não quero que seja só desfeito, quero realmente poder deletar cada um desses
-- do histórico se necessário, porque pode acontecer erros". O desfazer (v1.23/v1.24) deixa a linha
-- riscada; agora qualquer linha pode sair da trilha de vez.
--
-- O que fica: o audit_log já tem trg_audit_mapa_movimentacoes com DELETE, então a linha inteira,
-- quem apagou e quando continuam lá. Por isso a exclusão não pede motivo.
--
-- Regras:
--   - pede mapa.mapa/excluir;
--   - p_voltar = true desfaz antes de apagar (chama fn_mapa_desfazer_movimentacao, com todas as
--     recusas dela: só a última que vale, só transferência/posição/estado, máquina não mudou por
--     outro caminho). A máquina volta ao que era e a linha some;
--   - p_voltar = false só apaga o registro: o estado atual da máquina ou da pessoa não muda;
--   - o trigger de imutável só deixa passar o DELETE que esta função liga, pelo id, na própria
--     transação (set_config local). Nenhum outro caminho apaga.

create or replace function public.fn_mapa_trg_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_marcas text[] := array['desfeita_em', 'desfeita_por', 'desfeita_motivo'];
begin
  if tg_op = 'UPDATE' and tg_table_name = 'mapa_movimentacoes'
     and (to_jsonb(old)->>'desfeita_em') is null
     and (to_jsonb(new)->>'desfeita_em') is not null
     and (to_jsonb(new) - v_marcas) = (to_jsonb(old) - v_marcas) then
    return new;
  end if;
  if tg_op = 'DELETE' and tg_table_name = 'mapa_movimentacoes'
     and current_setting('erp.mapa_excluir_movimentacao', true) = (to_jsonb(old)->>'id') then
    return old;
  end if;
  raise exception 'mapa_movimentacoes é imutável: sem UPDATE nem DELETE (só desfazer ou excluir pelo Histórico)';
end
$function$;

create or replace function public.fn_mapa_excluir_movimentacao(p_id bigint, p_voltar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.fn_mapa_exigir('excluir');

  perform 1 from public.mapa_movimentacoes m where m.id = p_id for update;
  if not found then raise exception 'Movimentação não encontrada'; end if;

  if coalesce(p_voltar, false) then
    perform public.fn_mapa_desfazer_movimentacao(p_id, 'Excluída pelo Histórico');
  end if;

  perform set_config('erp.mapa_excluir_movimentacao', p_id::text, true);
  delete from public.mapa_movimentacoes m where m.id = p_id;
  perform set_config('erp.mapa_excluir_movimentacao', '', true);
end
$function$;

comment on function public.fn_mapa_excluir_movimentacao(bigint, boolean) is
  'Apaga uma linha da trilha do Mapa (fica no audit_log). p_voltar desfaz antes (fn_mapa_desfazer_movimentacao); sem ele, o estado atual não muda.';
revoke all on function public.fn_mapa_excluir_movimentacao(bigint, boolean) from public, anon;
grant execute on function public.fn_mapa_excluir_movimentacao(bigint, boolean) to authenticated;
