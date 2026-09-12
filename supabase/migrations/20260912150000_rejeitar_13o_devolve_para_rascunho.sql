-- Rejeitar o lote de 13o devolve para RASCUNHO, nao para 'rejeitado'.
--
-- Bug achado na revisao da Task 9, antes de ir ao ar: `fn_rejeitar` gravava
-- status 'rejeitado' e `fn_enviar_decimo_terceiro_aprovacao` so aceita
-- 'rascunho'. Lote rejeitado ficava PRESO, sem caminho de volta pela tela.
--
-- A rescisao ja resolvia assim (fn_rejeitar_rescisao grava 'rascunho' e guarda
-- o motivo em motivo_rejeicao), e e o que o texto da propria tela promete:
-- "O lote volta para rascunho e quem gerou pode corrigir".
--
-- 'rejeitado' segue no CHECK da tabela, igual a rh_rescisoes: valor declarado
-- pela maquina de status do CLAUDE.md que nenhuma funcao escreve hoje.
create or replace function public.fn_rejeitar_decimo_terceiro(p_lote uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'aprovar') then
    raise exception 'Sem permissao para rejeitar o 13o';
  end if;

  if btrim(coalesce(p_motivo, ''), E' \t\r\n') = '' then
    raise exception 'Informe o motivo da rejeicao';
  end if;

  select status into v_status from public.rh_decimo_terceiro
   where id = p_lote and excluido_em is null for update;
  if not found then raise exception 'Lote nao encontrado'; end if;

  if v_status <> 'pendente_aprovacao' then
    raise exception 'O lote esta em "%": so da para devolver o que esta pendente de aprovacao.', v_status;
  end if;

  update public.rh_decimo_terceiro
     set status = 'rascunho',
         motivo_rejeicao = btrim(p_motivo, E' \t\r\n'),
         updated_at = now()
   where id = p_lote;
end $$;

comment on function public.fn_rejeitar_decimo_terceiro(uuid, text) is
  'Devolve o lote pendente para RASCUNHO guardando o motivo. Nao usa o status "rejeitado": ele seria um beco sem saida, porque fn_enviar_decimo_terceiro_aprovacao so aceita rascunho.';
