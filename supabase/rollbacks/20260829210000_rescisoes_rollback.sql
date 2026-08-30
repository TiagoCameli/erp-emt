-- Rollback das rescisões (20260829210000, 211000 e 212000).
--
-- ORDEM IMPORTA em dois pontos:
--
-- 1. O CHECK de `lancamentos.origem` só pode voltar a recusar 'rescisao'
--    DEPOIS que nenhum lançamento com essa origem existir. Um `alter table
--    ... add constraint` valida a tabela inteira: com um lançamento de
--    rescisão vivo, o rollback estoura no meio.
-- 2. As tabelas caem por último, porque as funções as referenciam.
--
-- Este rollback APAGA rescisões, e com elas a única explicação de por que
-- alguém está inativo no cadastro. A pessoa NÃO é religada: `ativo` e
-- `data_demissao` são do colaborador, não da rescisão, e mexer neles aqui
-- reativaria gente que de fato saiu da empresa.

drop function if exists public.fn_excluir_rescisao(uuid, text);
drop function if exists public.fn_desaprovar_rescisao(uuid, text);
drop function if exists public.fn_aprovar_rescisao(uuid);
drop function if exists public.fn_rejeitar_rescisao(uuid, text);
drop function if exists public.fn_enviar_rescisao_aprovacao(uuid);
drop function if exists public.fn_remover_item_rescisao(uuid);
drop function if exists public.fn_adicionar_item_rescisao(uuid, text, text, numeric);
drop function if exists public.fn_editar_item_rescisao(uuid, numeric);
drop function if exists public.fn_gerar_rescisao(uuid, text, date, text, date, numeric, integer, numeric, date, text);
drop function if exists public.fn_rescisao_recalcular_totais(uuid);
drop function if exists public.fn_rescisao_gravar_item(uuid, smallint, text, text, text, text, numeric, jsonb);
drop function if exists public.fn_rescisao_periodos_vencidos(uuid, date);
drop function if exists public.fn_rescisao_avos_ferias(date, date);
drop function if exists public.fn_rescisao_avos_13(date, date);

-- Os lançamentos de rescisão viram 'manual': apagá-los tiraria do Financeiro
-- um pagamento que pode já ter saído da conta. `origem_id` fica apontando para
-- uma rescisão que não existe mais, e é por isso que ele é solto junto —
-- ponteiro para o nada é pior que ponteiro nenhum.
update public.lancamentos
   set origem = 'manual', origem_id = null
 where origem = 'rescisao';

alter table public.lancamentos drop constraint if exists lancamentos_origem_check;
alter table public.lancamentos add constraint lancamentos_origem_check
  check (origem = any (array['oc', 'manual', 'diaria', 'folha', 'folha_guia', 'adiantamento']));

delete from public.usuario_permissoes where recurso = 'rh.rescisoes';
delete from public.perfil_permissoes where recurso = 'rh.rescisoes';

drop table if exists public.rh_rescisao_itens;
drop table if exists public.rh_rescisoes;

alter table public.folha_parametros
  drop column if exists aviso_previo_dias_base,
  drop column if exists aviso_previo_dias_por_ano,
  drop column if exists aviso_previo_dias_teto,
  drop column if exists multa_fgts_percentual;

-- A LINHA `folha_parametros` (id = 1) FICA. Ela foi criada em 20260829211000
-- porque a tabela estava vazia, mas a tela de Parâmetros da folha faz `upsert`
-- e passou a ter onde escrever. Apagá-la devolveria o estado em que
-- `fn_aprovar_folha` lê nulls — que era o estado anterior, mas nada aqui
-- depende disso, e uma linha só de defaults não atrapalha ninguém.
