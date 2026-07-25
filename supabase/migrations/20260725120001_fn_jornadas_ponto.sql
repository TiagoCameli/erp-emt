-- fn_jornadas_ponto: horas da jornada de cada colaborador ativo, resolvidas
-- (jornada propria via jornada_id ou o fallback "Padrao EMT"), para o split
-- normal/extra do apontamento de ponto (Bloco 4, Task 4).
--
-- Porque uma fn SECURITY DEFINER em vez de ler jornadas direto:
--   O select anterior de listarColaboradoresComJornada lia a jornada por embed
--   `jornadas(...)` (via jornada_id) e por um lookup direto da "Padrao EMT" de
--   fallback. Essas leituras passam pela RLS de public.jornadas
--   (jornadas_select = tem_permissao('cadastros.jornadas','ver')). Mas os
--   perfis que usam o ponto (Apontador, RH) tem rh.apontamentos e NAO tem
--   cadastros.jornadas/ver: pra eles o embed volta null e o fallback volta zero
--   linhas -> a jornada resolvia pra zero -> separaHoras jogava 100% do total
--   em horasExtras e sugereFalta nunca disparava. Bug silencioso (sem excecao),
--   so nao apareceu porque hoje so o Admin (que tem a permissao) usa o ponto.
--
--   Esta fn (definer) atravessa a RLS de jornadas e gateia pela permissao
--   correta (rh.apontamentos/ver) no proprio WHERE: sem a permissao, retorna
--   vazio. Mesmo padrao das demais fns definer do projeto (fn_epis_a_recolher,
--   nomes_usuarios_compras, fn_gerar_folha).
--
--   Semantica identica ao codigo anterior: jornada propria quando jornada_id
--   aponta pra uma jornada; senao a "Padrao EMT"; se nem ela existir, zeros.
--
-- Rollback:
--   drop function public.fn_jornadas_ponto();

create or replace function public.fn_jornadas_ponto()
returns table (
  colaborador_id uuid,
  horas_segunda numeric,
  horas_terca numeric,
  horas_quarta numeric,
  horas_quinta numeric,
  horas_sexta numeric,
  horas_sabado numeric,
  horas_domingo numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    coalesce(j.horas_segunda, p.horas_segunda, 0),
    coalesce(j.horas_terca,   p.horas_terca,   0),
    coalesce(j.horas_quarta,  p.horas_quarta,  0),
    coalesce(j.horas_quinta,  p.horas_quinta,  0),
    coalesce(j.horas_sexta,   p.horas_sexta,   0),
    coalesce(j.horas_sabado,  p.horas_sabado,  0),
    coalesce(j.horas_domingo, p.horas_domingo, 0)
  from public.colaboradores c
  left join public.jornadas j on j.id = c.jornada_id
  left join lateral (
    select * from public.jornadas where nome = 'Padrão EMT' limit 1
  ) p on true
  where c.ativo = true
    and public.tem_permissao('rh.apontamentos', 'ver');
$$;

revoke all on function public.fn_jornadas_ponto() from public, anon;
grant execute on function public.fn_jornadas_ponto() to authenticated;
