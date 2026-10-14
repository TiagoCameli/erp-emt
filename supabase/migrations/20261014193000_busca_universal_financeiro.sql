-- Busca universal, bloco 2: Financeiro (Lançamentos, Pagamentos, Recebimentos).
--
-- Contrato e motivo do índice gravado: 20261014183000 e src/lib/busca.ts.
--
-- Três tipos de linha no índice para o dinheiro:
-- - `lancamentos_base`: o lançamento sem as parcelas (número, nota, descrição,
--   fornecedor/cliente/colaborador, categorias, centros, formas, OC de origem,
--   valor, datas e competência).
-- - `lancamento_parcelas`: só o que é da parcela (valor, líquido, vencimento,
--   pagamento, data programada, situação e conta).
-- - `lancamentos`: a base mais o texto de TODAS as parcelas. É o que a tela de
--   Lançamentos busca: quem procura "15/03" ali quer o lançamento que tem
--   parcela vencendo nesse dia.
--
-- Pagamentos e Recebimentos listam PARCELAS, e `busca(lancamento_parcelas)` é a
-- parcela mais a BASE do lançamento — nunca as irmãs. Sem isso, "15/03" em
-- Pagas traria as doze parcelas de um parcelamento só porque uma delas é de 15/03.

-- ---------------------------------------------------------------------------
-- Construtores.

create or replace function public.fn_busca_texto_lancamento_base(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select concat_ws(' ',
    public.fn_busca_norm(concat_ws(' ',
      l.numero, l.numero_documento, l.descricao, l.observacoes,
      replace(l.status, '_', ' '), replace(l.origem, '_', ' '), l.tipo,
      f.razao_social, f.nome_fantasia, f.cnpj_cpf,
      regexp_replace(f.cnpj_cpf, '\D', '', 'g'),
      cl.nome, cl.nome_fantasia, cl.cpf_cnpj,
      regexp_replace(cl.cpf_cnpj, '\D', '', 'g'),
      co.nome, cf.nome, fp.nome, cp.descricao, oc.numero,
      cc.codigo, cc.nome, ccp.codigo, ccp.nome,
      (select string_agg(concat_ws(' ', c.codigo, c.nome, pai.codigo, pai.nome, rc.nome), ' ')
         from public.lancamento_rateios r
         left join public.centros_custo c on c.id = r.centro_custo_id
         left join public.centros_custo pai on pai.id = c.pai_id
         left join public.categorias_financeiras rc on rc.id = r.categoria_id
        where r.lancamento_id = l.id),
      (select string_agg(fpf.nome, ' ')
         from public.lancamento_formas lf
         join public.formas_pagamento fpf on fpf.id = lf.forma_pagamento_id
        where lf.lancamento_id = l.id)
    )),
    public.fn_busca_valor(l.valor),
    case when l.valor_bruto is distinct from l.valor then public.fn_busca_valor(l.valor_bruto) end,
    public.fn_busca_data(l.data_compra),
    public.fn_busca_data(l.data_vencimento),
    public.fn_busca_mes(l.mes_competencia)
  )
  from public.lancamentos l
  left join public.fornecedores f on f.id = l.fornecedor_id
  left join public.clientes cl on cl.id = l.cliente_id
  left join public.colaboradores co on co.id = l.colaborador_id
  left join public.categorias_financeiras cf on cf.id = l.categoria_id
  left join public.formas_pagamento fp on fp.id = l.forma_pagamento_id
  left join public.condicoes_pagamento cp on cp.id = l.condicao_pagamento_id
  left join public.ordens_compra oc on oc.id = l.origem_id
  left join public.centros_custo cc on cc.id = l.centro_custo_id
  left join public.centros_custo ccp on ccp.id = cc.pai_id
  where l.id = p_id;
$$;

create or replace function public.fn_busca_texto_parcela(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select concat_ws(' ',
    public.fn_busca_norm(concat_ws(' ',
      replace(p.status, '_', ' '), cb.nome, cb.banco, cb.agencia, cb.conta
    )),
    public.fn_busca_valor(p.valor),
    case when p.valor_liquido is distinct from p.valor then public.fn_busca_valor(p.valor_liquido) end,
    public.fn_busca_data(p.data_vencimento),
    public.fn_busca_data(p.data_pagamento),
    case when p.data_programada is distinct from p.data_vencimento then public.fn_busca_data(p.data_programada) end
  )
  from public.lancamento_parcelas p
  left join public.contas_bancarias cb on cb.id = p.conta_bancaria_id
  where p.id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- Gravação: um texto, uma linha do índice.

create or replace function public.fn_busca_gravar(p_tabela text, p_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_texto is null then
    delete from public.busca_indice where tabela = p_tabela and registro_id = p_id;
  else
    insert into public.busca_indice (tabela, registro_id, texto, atualizado_em)
    values (p_tabela, p_id, p_texto, now())
    on conflict (tabela, registro_id)
      do update set texto = excluded.texto, atualizado_em = excluded.atualizado_em
      where public.busca_indice.texto is distinct from excluded.texto;
  end if;
end;
$$;

-- Reescrita a partir da versão de 20261014183000: os ramos de Compras ficam
-- iguais, entram os do Financeiro, e a gravação passa para `fn_busca_gravar`.
create or replace function public.fn_busca_indexar(p_tabela text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
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
      perform public.fn_busca_gravar('lancamentos', p_id,
        case when v_base is not null then concat_ws(' ', v_base,
          (select string_agg(public.fn_busca_texto_parcela(p.id), ' ')
             from public.lancamento_parcelas p where p.lancamento_id = p_id)) end);
    when 'lancamento_parcelas' then
      perform public.fn_busca_gravar(p_tabela, p_id, public.fn_busca_texto_parcela(p_id));
  end case;
end;
$$;

-- Apagar a linha apaga também a variante `_base` (só o lançamento tem).
create or replace function public.trg_busca_indice_linha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.busca_indice
     where registro_id = old.id and tabela in (tg_argv[0], tg_argv[0] || '_base');
    return old;
  end if;
  perform public.fn_busca_indexar(tg_argv[0], new.id);
  return new;
end;
$$;

-- Reescrita a partir da versão de 20261014183000: Compras igual, mais quem
-- cita cada cadastro no Financeiro. Cliente, colaborador e conta são novos.
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
    when 'categorias_insumo' then
      perform public.fn_busca_indexar_varios('ordens_compra',
        array(select distinct it.ordem_compra_id from public.oc_itens it
                join public.insumos i on i.id = it.insumo_id where i.categoria_id = v_id));
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
    when 'categorias_financeiras' then
      perform public.fn_busca_indexar_varios('ordens_compra',
        array(select id from public.ordens_compra where categoria_id = v_id));
      perform public.fn_busca_indexar_varios('cotacoes',
        array(select id from public.cotacoes where categoria_id = v_id));
      perform public.fn_busca_indexar_varios('lancamentos',
        array(select id from public.lancamentos where categoria_id = v_id
              union select lancamento_id from public.lancamento_rateios where categoria_id = v_id));
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
-- Triggers.

create trigger trg_busca_indice
  after insert or update or delete on public.lancamentos
  for each row execute function public.trg_busca_indice_linha('lancamentos');
create trigger trg_busca_indice
  after insert or update or delete on public.lancamento_parcelas
  for each row execute function public.trg_busca_indice_linha('lancamento_parcelas');
create trigger trg_busca_indice_pai
  after insert or update or delete on public.lancamento_parcelas
  for each row execute function public.trg_busca_indice_filho('lancamentos', 'lancamento_id');
create trigger trg_busca_indice
  after insert or update or delete on public.lancamento_rateios
  for each row execute function public.trg_busca_indice_filho('lancamentos', 'lancamento_id');
create trigger trg_busca_indice
  after insert or update or delete on public.lancamento_formas
  for each row execute function public.trg_busca_indice_filho('lancamentos', 'lancamento_id');

create trigger trg_busca_indice
  after update of nome, nome_fantasia, cpf_cnpj on public.clientes
  for each row execute function public.trg_busca_indice_cadastro();
create trigger trg_busca_indice
  after update of nome on public.colaboradores
  for each row execute function public.trg_busca_indice_cadastro();
create trigger trg_busca_indice
  after update of nome, banco, agencia, conta on public.contas_bancarias
  for each row execute function public.trg_busca_indice_cadastro();

-- ---------------------------------------------------------------------------
-- Colunas computadas (parâmetro sem nome e DEFINER: ver 20261014184500).

create function public.busca(public.lancamentos)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select b.texto from public.busca_indice b
                    where b.tabela = 'lancamentos' and b.registro_id = $1.id), '');
$$;

create function public.busca(public.lancamento_parcelas)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select concat_ws(' ',
    (select b.texto from public.busca_indice b
      where b.tabela = 'lancamento_parcelas' and b.registro_id = $1.id),
    (select b.texto from public.busca_indice b
      where b.tabela = 'lancamentos_base' and b.registro_id = $1.lancamento_id));
$$;

revoke all on function public.fn_busca_texto_lancamento_base(uuid) from public, anon, authenticated;
revoke all on function public.fn_busca_texto_parcela(uuid) from public, anon, authenticated;
revoke all on function public.fn_busca_gravar(text, uuid, text) from public, anon, authenticated;
revoke all on function public.fn_busca_indexar(text, uuid) from public, anon, authenticated;
revoke all on function public.trg_busca_indice_linha() from public, anon, authenticated;
revoke all on function public.trg_busca_indice_cadastro() from public, anon, authenticated;
revoke all on function public.busca(public.lancamentos) from public, anon;
revoke all on function public.busca(public.lancamento_parcelas) from public, anon;
grant execute on function public.busca(public.lancamentos) to authenticated;
grant execute on function public.busca(public.lancamento_parcelas) to authenticated;

-- ---------------------------------------------------------------------------
-- Carga inicial (parcelas antes, porque o texto completo do lançamento as lê
-- do construtor e não do índice — a ordem só importa para a leitura rápida).

select public.fn_busca_indexar('lancamento_parcelas', id) from public.lancamento_parcelas;
select public.fn_busca_indexar('lancamentos', id) from public.lancamentos;

notify pgrst, 'reload schema';
