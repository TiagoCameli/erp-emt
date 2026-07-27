-- fn_atestados_ponto: colaboradores cobertos por atestado numa data, para o
-- ponto abater a falta do dia (Bloco 5, Task 1).
--
-- Porque uma fn SECURITY DEFINER em vez de ler rh_ocorrencias direto do ponto:
--   Quem bate ponto usa o perfil rh.apontamentos, que NAO necessariamente tem
--   rh.ocorrencias/ver. A RLS de public.rh_ocorrencias
--   (ocorrencias_select = tem_permissao('rh.ocorrencias','ver')) e tudo-ou-nada
--   por sessao: lendo a tabela direto do ponto, esses perfis veriam zero linhas
--   -> falso "sem atestado" -> a falta seria cobrada indevidamente. Bug
--   silencioso (sem excecao), a lição do Bloco 4.
--
--   Esta fn (definer) atravessa a RLS de rh_ocorrencias e gateia pela permissao
--   correta (rh.apontamentos/ver) no proprio WHERE: sem a permissao, retorna
--   vazio. Mesmo padrao das demais fns definer do projeto (fn_jornadas_ponto,
--   fn_epis_a_recolher, nomes_usuarios_compras, fn_gerar_folha).
--
--   Cobertura: um atestado cobre p_data quando p_data cai entre `data` e
--   `data_fim` (inclusive nas duas bordas). data_fim nulo = atestado de um dia,
--   entao coalesce(data_fim, data) fecha o intervalo no proprio `data`.
--
-- Rollback:
--   drop function public.fn_atestados_ponto(date);

create or replace function public.fn_atestados_ponto(p_data date)
returns table (
  colaborador_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.colaborador_id
  from public.rh_ocorrencias o
  where o.tipo = 'atestado'
    and p_data between o.data and coalesce(o.data_fim, o.data)
    and public.tem_permissao('rh.apontamentos', 'ver');
$$;

revoke all on function public.fn_atestados_ponto(date) from public, anon;
grant execute on function public.fn_atestados_ponto(date) to authenticated;
