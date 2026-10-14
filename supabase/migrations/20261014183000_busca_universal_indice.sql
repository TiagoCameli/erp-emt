-- Busca universal, bloco 1b: o texto pesquisável passa a ser GRAVADO.
--
-- A primeira versão (20261014180000) montava o texto na hora, dentro da
-- coluna computada `busca(...)`. Medido no banco vivo em 14/10/2026: 0,7 ms por
-- OC (241 ms para 232 OCs com duas palavras), porque cada palavra reavalia a
-- função linha a linha. Em Lançamentos, com ~6 mil linhas, isso passaria de
-- segundos por palavra. Gravando o texto, a busca vira um `ilike` sobre texto
-- pronto.
--
-- O texto mora numa tabela À PARTE (`busca_indice`), e não numa coluna da
-- própria OC, de propósito: reescrever a OC quando um item muda ou o fornecedor
-- troca de nome dispararia a auditoria (uma "edição" que ninguém fez), mexeria
-- no updated_at e esbarraria nas travas de status (OC aprovada não se edita).
--
-- Quem mantém o índice são triggers: a própria linha, as tabelas filhas (itens,
-- participantes) e os cadastros cujo NOME entra no texto (fornecedor, insumo,
-- centro, categoria, forma, condição). Os construtores são SECURITY DEFINER
-- para o texto sair completo mesmo quando quem grava não lê todas as tabelas.
--
-- Leitura: a policy libera cada tabela do índice para quem tem `ver` no
-- recurso dela — o mesmo que a RLS da tabela de origem exige. O
-- `(select tem_permissao(...))` vira initplan, avaliado uma vez por consulta.

-- Parcial: btrim no fim, para o texto do banco ser igual ao `normalizarBusca`.
create or replace function public.fn_busca_norm(texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(lower(regexp_replace(
    translate(
      coalesce(texto, ''),
      'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'
    ),
    '\s+', ' ', 'g'
  )));
$$;

create table public.busca_indice (
  tabela text not null,
  registro_id uuid not null,
  texto text not null default '',
  atualizado_em timestamptz not null default now(),
  primary key (tabela, registro_id)
);

comment on table public.busca_indice is
  'Texto pesquisável de cada registro (busca universal). Mantido por trigger; contrato em src/lib/busca.ts.';

alter table public.busca_indice enable row level security;

create policy busca_indice_select on public.busca_indice
  for select to authenticated
  using (
    (tabela = 'ordens_compra' and (select public.tem_permissao('compras.ordens', 'ver')))
    or (tabela = 'cotacoes' and (select public.tem_permissao('compras.cotacoes', 'ver')))
  );

revoke all on public.busca_indice from anon, authenticated;
grant select on public.busca_indice to authenticated;

-- ---------------------------------------------------------------------------
-- Construtores do texto, um por tabela indexada.

create or replace function public.fn_busca_texto_ordem_compra(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select concat_ws(' ',
    public.fn_busca_norm(concat_ws(' ',
      oc.numero, oc.numero_documento, oc.descricao, oc.observacoes,
      replace(oc.status, '_', ' '),
      f.razao_social, f.nome_fantasia, f.cnpj_cpf,
      regexp_replace(f.cnpj_cpf, '\D', '', 'g'),
      fp.nome, cp.descricao, cf.nome,
      (select string_agg(concat_ws(' ', i.codigo, i.nome, ci.nome,
                                   c.codigo, c.nome, pai.codigo, pai.nome), ' ')
         from public.oc_itens it
         left join public.insumos i on i.id = it.insumo_id
         left join public.categorias_insumo ci on ci.id = i.categoria_id
         left join public.centros_custo c on c.id = it.centro_custo_id
         left join public.centros_custo pai on pai.id = c.pai_id
        where it.ordem_compra_id = oc.id)
    )),
    public.fn_busca_valor(oc.valor_total),
    public.fn_busca_data(oc.data_compra),
    public.fn_busca_mes(oc.mes_competencia)
  )
  from public.ordens_compra oc
  left join public.fornecedores f on f.id = oc.fornecedor_id
  left join public.formas_pagamento fp on fp.id = oc.forma_pagamento_id
  left join public.condicoes_pagamento cp on cp.id = oc.condicao_pagamento_id
  left join public.categorias_financeiras cf on cf.id = oc.categoria_id
  where oc.id = p_id;
$$;

create or replace function public.fn_busca_texto_cotacao(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select concat_ws(' ',
    public.fn_busca_norm(concat_ws(' ',
      c.numero, c.descricao, c.observacoes, c.motivo_selecao,
      replace(c.status, '_', ' '),
      cf.nome, v.razao_social, v.nome_fantasia,
      (select string_agg(concat_ws(' ', f.razao_social, f.nome_fantasia), ' ')
         from public.cotacao_fornecedores cfo
         join public.fornecedores f on f.id = cfo.fornecedor_id
        where cfo.cotacao_id = c.id),
      (select string_agg(distinct concat_ws(' ', i.codigo, i.nome), ' ')
         from public.cotacao_itens ct
         join public.insumos i on i.id = ct.insumo_id
        where ct.cotacao_id = c.id)
    )),
    public.fn_busca_data((c.created_at at time zone 'America/Rio_Branco')::date)
  )
  from public.cotacoes c
  left join public.categorias_financeiras cf on cf.id = c.categoria_id
  left join public.fornecedores v on v.id = c.vencedor_fornecedor_id
  where c.id = p_id;
$$;

-- Regrava o texto de um registro (ou apaga, se o registro sumiu).
create or replace function public.fn_busca_indexar(p_tabela text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_texto text;
begin
  if p_id is null then
    return;
  end if;
  v_texto := case p_tabela
    when 'ordens_compra' then public.fn_busca_texto_ordem_compra(p_id)
    when 'cotacoes' then public.fn_busca_texto_cotacao(p_id)
  end;
  if v_texto is null then
    delete from public.busca_indice where tabela = p_tabela and registro_id = p_id;
  else
    insert into public.busca_indice (tabela, registro_id, texto, atualizado_em)
    values (p_tabela, p_id, v_texto, now())
    on conflict (tabela, registro_id)
      do update set texto = excluded.texto, atualizado_em = excluded.atualizado_em
      where public.busca_indice.texto is distinct from excluded.texto;
  end if;
end;
$$;

-- Regrava todos os registros de uma tabela que citam o id (renomeou o cadastro).
create or replace function public.fn_busca_indexar_varios(p_tabela text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  foreach v_id in array coalesce(p_ids, '{}') loop
    perform public.fn_busca_indexar(p_tabela, v_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers.

-- A própria linha indexada (TG_ARGV[0] = nome da tabela no índice).
create or replace function public.trg_busca_indice_linha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.busca_indice where tabela = tg_argv[0] and registro_id = old.id;
    return old;
  end if;
  perform public.fn_busca_indexar(tg_argv[0], new.id);
  return new;
end;
$$;

-- Tabela filha: regrava o pai (TG_ARGV[0] = tabela do pai, [1] = coluna do pai).
create or replace function public.trg_busca_indice_filho()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_novo uuid;
  v_velho uuid;
begin
  if tg_op <> 'DELETE' then
    v_novo := (to_jsonb(new) ->> tg_argv[1])::uuid;
  end if;
  if tg_op <> 'INSERT' then
    v_velho := (to_jsonb(old) ->> tg_argv[1])::uuid;
  end if;
  perform public.fn_busca_indexar(tg_argv[0], v_novo);
  if v_velho is distinct from v_novo then
    perform public.fn_busca_indexar(tg_argv[0], v_velho);
  end if;
  return null;
end;
$$;

-- Cadastro renomeado: regrava quem o cita. Só dispara quando um campo que
-- entra no texto muda (o `update of` de cada trigger).
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
    when 'categorias_financeiras' then
      perform public.fn_busca_indexar_varios('ordens_compra',
        array(select id from public.ordens_compra where categoria_id = v_id));
      perform public.fn_busca_indexar_varios('cotacoes',
        array(select id from public.cotacoes where categoria_id = v_id));
    when 'formas_pagamento' then
      perform public.fn_busca_indexar_varios('ordens_compra',
        array(select id from public.ordens_compra where forma_pagamento_id = v_id));
    when 'condicoes_pagamento' then
      perform public.fn_busca_indexar_varios('ordens_compra',
        array(select id from public.ordens_compra where condicao_pagamento_id = v_id));
  end case;
  return null;
end;
$$;

create trigger trg_busca_indice
  after insert or update or delete on public.ordens_compra
  for each row execute function public.trg_busca_indice_linha('ordens_compra');
create trigger trg_busca_indice
  after insert or update or delete on public.oc_itens
  for each row execute function public.trg_busca_indice_filho('ordens_compra', 'ordem_compra_id');

create trigger trg_busca_indice
  after insert or update or delete on public.cotacoes
  for each row execute function public.trg_busca_indice_linha('cotacoes');
create trigger trg_busca_indice
  after insert or update or delete on public.cotacao_fornecedores
  for each row execute function public.trg_busca_indice_filho('cotacoes', 'cotacao_id');
create trigger trg_busca_indice
  after insert or update or delete on public.cotacao_itens
  for each row execute function public.trg_busca_indice_filho('cotacoes', 'cotacao_id');

create trigger trg_busca_indice
  after update of razao_social, nome_fantasia, cnpj_cpf on public.fornecedores
  for each row execute function public.trg_busca_indice_cadastro();
create trigger trg_busca_indice
  after update of nome, codigo, categoria_id on public.insumos
  for each row execute function public.trg_busca_indice_cadastro();
create trigger trg_busca_indice
  after update of nome on public.categorias_insumo
  for each row execute function public.trg_busca_indice_cadastro();
create trigger trg_busca_indice
  after update of nome, codigo, pai_id on public.centros_custo
  for each row execute function public.trg_busca_indice_cadastro();
create trigger trg_busca_indice
  after update of nome on public.categorias_financeiras
  for each row execute function public.trg_busca_indice_cadastro();
create trigger trg_busca_indice
  after update of nome on public.formas_pagamento
  for each row execute function public.trg_busca_indice_cadastro();
create trigger trg_busca_indice
  after update of descricao on public.condicoes_pagamento
  for each row execute function public.trg_busca_indice_cadastro();

-- ---------------------------------------------------------------------------
-- A coluna computada que as listagens filtram: só lê o texto gravado.
-- SECURITY INVOKER: a policy do índice decide o que volta.

drop function if exists public.busca(public.ordens_compra);
drop function if exists public.busca(public.cotacoes);
drop function if exists public.fn_busca_centro(uuid);

create function public.busca(oc public.ordens_compra)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select b.texto from public.busca_indice b
                    where b.tabela = 'ordens_compra' and b.registro_id = oc.id), '');
$$;

create function public.busca(c public.cotacoes)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select b.texto from public.busca_indice b
                    where b.tabela = 'cotacoes' and b.registro_id = c.id), '');
$$;

-- ---------------------------------------------------------------------------
-- Privilégios: construtores e triggers não são chamáveis por ninguém de fora.

revoke all on function public.fn_busca_texto_ordem_compra(uuid) from public, anon, authenticated;
revoke all on function public.fn_busca_texto_cotacao(uuid) from public, anon, authenticated;
revoke all on function public.fn_busca_indexar(text, uuid) from public, anon, authenticated;
revoke all on function public.fn_busca_indexar_varios(text, uuid[]) from public, anon, authenticated;
revoke all on function public.trg_busca_indice_linha() from public, anon, authenticated;
revoke all on function public.trg_busca_indice_filho() from public, anon, authenticated;
revoke all on function public.trg_busca_indice_cadastro() from public, anon, authenticated;
revoke all on function public.busca(public.ordens_compra) from public, anon;
revoke all on function public.busca(public.cotacoes) from public, anon;
grant execute on function public.busca(public.ordens_compra) to authenticated;
grant execute on function public.busca(public.cotacoes) to authenticated;

-- ---------------------------------------------------------------------------
-- Carga inicial.

select public.fn_busca_indexar('ordens_compra', id) from public.ordens_compra;
select public.fn_busca_indexar('cotacoes', id) from public.cotacoes;

notify pgrst, 'reload schema';
