-- Busca universal, bloco 2b: o texto da parcela é gravado já com o do lançamento.
--
-- Em 20261014193000 `busca(lancamento_parcelas)` lia DUAS linhas do índice e as
-- juntava a cada chamada. Medido como authenticated em 14/10/2026, 9.648
-- parcelas: 252 ms com duas palavras, contra 124 ms nos 7.145 lançamentos, que
-- leem uma linha só. Agora a linha `lancamento_parcelas` do índice guarda
-- "parcela + base do lançamento" e a leitura vira uma consulta por chave.
--
-- Quem regrava: reindexar o LANÇAMENTO regrava a base, todas as parcelas dele e
-- o texto completo; reindexar uma PARCELA lê a base já gravada. Os triggers não
-- mudam (a parcela dispara os dois: ela mesma e o lançamento).

create or replace function public.fn_busca_indexar(p_tabela text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_parcela record;
  v_textos text[] := '{}';
  v_proprio text;
begin
  if p_id is null then
    return;
  end if;
  case p_tabela
    when 'ordens_compra' then
      perform public.fn_busca_gravar(p_tabela, p_id, public.fn_busca_texto_ordem_compra(p_id));
    when 'cotacoes' then
      perform public.fn_busca_gravar(p_tabela, p_id, public.fn_busca_texto_cotacao(p_id));
    when 'lancamentos' then
      v_base := public.fn_busca_texto_lancamento_base(p_id);
      perform public.fn_busca_gravar('lancamentos_base', p_id, v_base);
      for v_parcela in
        select p.id from public.lancamento_parcelas p where p.lancamento_id = p_id
      loop
        v_proprio := public.fn_busca_texto_parcela(v_parcela.id);
        v_textos := v_textos || v_proprio;
        perform public.fn_busca_gravar('lancamento_parcelas', v_parcela.id,
          case when v_proprio is not null then concat_ws(' ', v_proprio, v_base) end);
      end loop;
      perform public.fn_busca_gravar('lancamentos', p_id,
        case when v_base is not null
          then concat_ws(' ', v_base, array_to_string(v_textos, ' ')) end);
    when 'lancamento_parcelas' then
      v_proprio := public.fn_busca_texto_parcela(p_id);
      perform public.fn_busca_gravar(p_tabela, p_id,
        case when v_proprio is not null then concat_ws(' ', v_proprio,
          (select b.texto from public.busca_indice b
             join public.lancamento_parcelas p on p.lancamento_id = b.registro_id
            where b.tabela = 'lancamentos_base' and p.id = p_id)) end);
  end case;
end;
$$;

create or replace function public.busca(public.lancamento_parcelas)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select b.texto from public.busca_indice b
                    where b.tabela = 'lancamento_parcelas' and b.registro_id = $1.id), '');
$$;

revoke all on function public.fn_busca_indexar(text, uuid) from public, anon, authenticated;

-- Regrava parcelas e lançamentos no formato novo.
select public.fn_busca_indexar('lancamentos', id) from public.lancamentos;

notify pgrst, 'reload schema';
