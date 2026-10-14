-- Busca universal, bloco 1c: a coluna computada lê o índice como DEFINER.
--
-- Com `busca(...)` SECURITY INVOKER, cada chamada era uma consulta nova sobre
-- `busca_indice`, e a policy do índice rodava `tem_permissao` de novo em toda
-- linha. Medido como authenticated em 14/10/2026, 232 OCs e duas palavras:
-- 67 ms invoker, 7 ms definer (~15 µs por linha).
--
-- Por que é seguro:
-- - A RLS da tabela de origem continua valendo: a função recebe a linha que a
--   consulta já leu, e a policy da OC entra no filtro ANTES dela (security
--   barrier). Quem não vê a OC não chega a chamar `busca` nela.
-- - O parâmetro é SEM NOME. O PostgREST só chama por /rpc função com argumento
--   nomeado; sem nome, ela existe apenas como coluna computada da tabela.
-- - `busca_indice` deixa de ter grant e policy: só os construtores (definer)
--   escrevem e só `busca(...)` (definer) lê, uma linha por chave.

drop policy if exists busca_indice_select on public.busca_indice;
revoke all on public.busca_indice from anon, authenticated;

drop function if exists public.busca(public.ordens_compra);
drop function if exists public.busca(public.cotacoes);

create function public.busca(public.ordens_compra)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select b.texto from public.busca_indice b
                    where b.tabela = 'ordens_compra' and b.registro_id = $1.id), '');
$$;

create function public.busca(public.cotacoes)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select b.texto from public.busca_indice b
                    where b.tabela = 'cotacoes' and b.registro_id = $1.id), '');
$$;

revoke all on function public.busca(public.ordens_compra) from public, anon;
revoke all on function public.busca(public.cotacoes) from public, anon;
grant execute on function public.busca(public.ordens_compra) to authenticated;
grant execute on function public.busca(public.cotacoes) to authenticated;

notify pgrst, 'reload schema';
