-- Busca universal, bloco 3: OS de manutenção, Insumos e lançamentos de Medição.
--
-- Contrato: src/lib/busca.ts. Motivo do índice gravado e da leitura DEFINER:
-- 20261014183000 e 20261014184500.
--
-- - OS e Insumos entram no índice gravado, como OC e lançamento.
-- - Medição lê a view `mc_v_lancamentos`, e tudo o que entra na busca já está
--   na linha da view (código e descrição do item, estaca, local, observação,
--   data, quantidade, nº da medição). Sem junção, não há o que gravar: a função
--   monta o texto direto da linha.

-- ---------------------------------------------------------------------------
-- Construtores.

create or replace function public.fn_busca_texto_ordem_servico(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select concat_ws(' ',
    public.fn_busca_norm(concat_ws(' ',
      os.numero, os.numero_legado, os.descricao, os.defeito_reportado,
      os.causa_raiz, os.observacoes, os.motivo_cancelamento,
      replace(os.tipo, '_', ' '), replace(os.prioridade, '_', ' '),
      replace(os.status, '_', ' '), replace(os.origem, '_', ' '),
      e.codigo, e.descricao, e.placa, e.marca, e.modelo, e.tipo,
      c.codigo, c.nome, pai.codigo, pai.nome,
      (select string_agg(concat_ws(' ', i.codigo, i.nome, p.observacoes), ' ')
         from public.os_pecas p
         left join public.insumos i on i.id = p.insumo_id
        where p.ordem_servico_id = os.id)
    )),
    public.fn_busca_valor(os.custo_total),
    public.fn_busca_data(os.data_abertura),
    public.fn_busca_data(os.data_inicio),
    public.fn_busca_data(os.data_conclusao)
  )
  from public.ordens_servico os
  left join public.equipamentos e on e.id = os.equipamento_id
  left join public.centros_custo c on c.id = os.centro_custo_id
  left join public.centros_custo pai on pai.id = c.pai_id
  where os.id = p_id and os.excluido_em is null;
$$;

create or replace function public.fn_busca_texto_insumo(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.fn_busca_norm(concat_ws(' ',
    i.codigo, i.nome, i.descricao, ci.nome, g.nome, u.sigla, u.nome, cf.nome
  ))
  from public.insumos i
  left join public.categorias_insumo ci on ci.id = i.categoria_id
  left join public.insumo_grupos g on g.id = ci.grupo_id
  left join public.unidades_medida u on u.id = i.unidade_id
  left join public.categorias_financeiras cf on cf.id = i.categoria_financeira_id
  where i.id = p_id;
$$;

-- Reescrita a partir de 20261014194500: entram OS e Insumos.
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
    when 'ordens_servico' then
      perform public.fn_busca_gravar(p_tabela, p_id, public.fn_busca_texto_ordem_servico(p_id));
    when 'insumos' then
      perform public.fn_busca_gravar(p_tabela, p_id, public.fn_busca_texto_insumo(p_id));
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

-- Reescrita a partir de 20261014193000: entram equipamento, unidade e grupo,
-- e insumo, categoria, centro e categoria financeira passam a regravar também
-- OS e o próprio cadastro de insumos.
create or replace function public.trg_busca_indice_cadastro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := new.id;
begin
  case tg_table_name
    when 'fornecedores' then
      perform public.fn_busca_indexar_varios('ordens_compra',
        array(select id from public.ordens_compra where fornecedor_id = v_id));
      perform public.fn_busca_indexar_varios('cotacoes',
        array(select id from public.cotacoes where vencedor_fornecedor_id = v_id
              union select cotacao_id from public.cotacao_fornecedores where fornecedor_id = v_id));
      perform public.fn_busca_indexar_varios('lancamentos',
        array(select id from public.lancamentos where fornecedor_id = v_id));
    when 'insumos' then
      perform public.fn_busca_indexar_varios('ordens_compra',
        array(select distinct ordem_compra_id from public.oc_itens where insumo_id = v_id));
      perform public.fn_busca_indexar_varios('cotacoes',
        array(select distinct cotacao_id from public.cotacao_itens where insumo_id = v_id));
      perform public.fn_busca_indexar_varios('ordens_servico',
        array(select distinct ordem_servico_id from public.os_pecas where insumo_id = v_id));
    when 'categorias_insumo' then
      perform public.fn_busca_indexar_varios('ordens_compra',
        array(select distinct it.ordem_compra_id from public.oc_itens it
                join public.insumos i on i.id = it.insumo_id where i.categoria_id = v_id));
      perform public.fn_busca_indexar_varios('insumos',
        array(select id from public.insumos where categoria_id = v_id));
    when 'insumo_grupos' then
      perform public.fn_busca_indexar_varios('insumos',
        array(select i.id from public.insumos i
                join public.categorias_insumo ci on ci.id = i.categoria_id where ci.grupo_id = v_id));
    when 'unidades_medida' then
      perform public.fn_busca_indexar_varios('insumos',
        array(select id from public.insumos where unidade_id = v_id));
    when 'equipamentos' then
      perform public.fn_busca_indexar_varios('ordens_servico',
        array(select id from public.ordens_servico where equipamento_id = v_id));
    when 'centros_custo' then
      perform public.fn_busca_indexar_varios('ordens_compra',
        array(select distinct it.ordem_compra_id from public.oc_itens it
                join public.centros_custo c on c.id = it.centro_custo_id
               where c.id = v_id or c.pai_id = v_id));
      perform public.fn_busca_indexar_varios('lancamentos',
        array(select l.id from public.lancamentos l
                join public.centros_custo c on c.id = l.centro_custo_id
               where c.id = v_id or c.pai_id = v_id
              union
              select r.lancamento_id from public.lancamento_rateios r
                join public.centros_custo c on c.id = r.centro_custo_id
               where c.id = v_id or c.pai_id = v_id));
      perform public.fn_busca_indexar_varios('ordens_servico',
        array(select os.id from public.ordens_servico os
                join public.centros_custo c on c.id = os.centro_custo_id
               where c.id = v_id or c.pai_id = v_id));
    when 'categorias_financeiras' then
      perform public.fn_busca_indexar_varios('ordens_compra',
        array(select id from public.ordens_compra where categoria_id = v_id));
      perform public.fn_busca_indexar_varios('cotacoes',
        array(select id from public.cotacoes where categoria_id = v_id));
      perform public.fn_busca_indexar_varios('lancamentos',
        array(select id from public.lancamentos where categoria_id = v_id
              union select lancamento_id from public.lancamento_rateios where categoria_id = v_id));
      perform public.fn_busca_indexar_varios('insumos',
        array(select id from public.insumos where categoria_financeira_id = v_id));
    when 'formas_pagamento' then
      perform public.fn_busca_indexar_varios('ordens_compra',
        array(select id from public.ordens_compra where forma_pagamento_id = v_id));
      perform public.fn_busca_indexar_varios('lancamentos',
        array(select id from public.lancamentos where forma_pagamento_id = v_id
              union select lancamento_id from public.lancamento_formas where forma_pagamento_id = v_id));
    when 'condicoes_pagamento' then
      perform public.fn_busca_indexar_varios('ordens_compra',
        array(select id from public.ordens_compra where condicao_pagamento_id = v_id));
      perform public.fn_busca_indexar_varios('lancamentos',
        array(select id from public.lancamentos where condicao_pagamento_id = v_id));
    when 'clientes' then
      perform public.fn_busca_indexar_varios('lancamentos',
        array(select id from public.lancamentos where cliente_id = v_id));
    when 'colaboradores' then
      perform public.fn_busca_indexar_varios('lancamentos',
        array(select id from public.lancamentos where colaborador_id = v_id));
    when 'contas_bancarias' then
      perform public.fn_busca_indexar_varios('lancamento_parcelas',
        array(select id from public.lancamento_parcelas where conta_bancaria_id = v_id));
      perform public.fn_busca_indexar_varios('lancamentos',
        array(select distinct lancamento_id from public.lancamento_parcelas where conta_bancaria_id = v_id));
  end case;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers. O insumo já tinha `trg_busca_indice` (regrava quem o cita); o do
-- próprio cadastro ganha nome à parte.

create trigger trg_busca_indice
  after insert or update or delete on public.ordens_servico
  for each row execute function public.trg_busca_indice_linha('ordens_servico');
create trigger trg_busca_indice
  after insert or update or delete on public.os_pecas
  for each row execute function public.trg_busca_indice_filho('ordens_servico', 'ordem_servico_id');
create trigger trg_busca_indice_proprio
  after insert or update or delete on public.insumos
  for each row execute function public.trg_busca_indice_linha('insumos');
create trigger trg_busca_indice
  after update of nome on public.insumo_grupos
  for each row execute function public.trg_busca_indice_cadastro();
create trigger trg_busca_indice
  after update of sigla, nome on public.unidades_medida
  for each row execute function public.trg_busca_indice_cadastro();
create trigger trg_busca_indice
  after update of codigo, descricao, placa, marca, modelo, tipo on public.equipamentos
  for each row execute function public.trg_busca_indice_cadastro();

-- ---------------------------------------------------------------------------
-- Colunas computadas.

create function public.busca(public.ordens_servico)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select b.texto from public.busca_indice b
                    where b.tabela = 'ordens_servico' and b.registro_id = $1.id), '');
$$;

create function public.busca(public.insumos)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select b.texto from public.busca_indice b
                    where b.tabela = 'insumos' and b.registro_id = $1.id), '');
$$;

-- Medição: INVOKER, porque não lê nada além da própria linha da view.
create function public.busca(public.mc_v_lancamentos)
returns text
language sql
stable
set search_path = ''
as $$
  select concat_ws(' ',
    public.fn_busca_norm(concat_ws(' ',
      $1.codigo, $1.descricao, $1.unidade, $1.estaca, $1.local_texto,
      $1.observacao, $1.motivo_excesso, replace($1.medicao_status, '_', ' '),
      'medicao ' || $1.medicao_numero, $1.quantidade, $1.km_inicial, $1.km_final
    )),
    public.fn_busca_data($1.data)
  );
$$;

revoke all on function public.fn_busca_texto_ordem_servico(uuid) from public, anon, authenticated;
revoke all on function public.fn_busca_texto_insumo(uuid) from public, anon, authenticated;
revoke all on function public.fn_busca_indexar(text, uuid) from public, anon, authenticated;
revoke all on function public.trg_busca_indice_cadastro() from public, anon, authenticated;
revoke all on function public.busca(public.ordens_servico) from public, anon;
revoke all on function public.busca(public.insumos) from public, anon;
revoke all on function public.busca(public.mc_v_lancamentos) from public, anon;
grant execute on function public.busca(public.ordens_servico) to authenticated;
grant execute on function public.busca(public.insumos) to authenticated;
grant execute on function public.busca(public.mc_v_lancamentos) to authenticated;

-- ---------------------------------------------------------------------------
-- Carga inicial.

select public.fn_busca_indexar('ordens_servico', id) from public.ordens_servico;
select public.fn_busca_indexar('insumos', id) from public.insumos;

notify pgrst, 'reload schema';
