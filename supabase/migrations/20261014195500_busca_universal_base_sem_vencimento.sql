-- Busca universal, bloco 2c.
--
-- A base deixa de levar `lancamentos.data_vencimento`: é o vencimento da 1ª
-- parcela, e na base ele aparecia no texto de TODAS as parcelas (a prova pegou
-- a parcela 2 casando pela data da 1). Cada parcela já leva o próprio
-- vencimento, e o texto completo do lançamento leva o de todas.
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

revoke all on function public.fn_busca_texto_lancamento_base(uuid) from public, anon, authenticated;

select public.fn_busca_indexar('lancamentos', id) from public.lancamentos;
