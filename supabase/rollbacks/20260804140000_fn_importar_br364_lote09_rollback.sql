-- Rollback da importacao BR-364 Lote 09 (migration 20260804140000).
--
-- Desfaz DADO e CADASTRO criados pela importacao, e depois derruba as duas
-- funcoes. Roda inteiro numa transacao: ou desfaz tudo, ou nada.
--
-- Como ele acha o que apagar sem depender da staging (que pode ja ter sido
-- derrubada): todo id gravado pela importacao e derivado por md5 da marca de
-- origem, entao e recalculavel a partir do proprio registro. O lancamento
-- carrega tambem a marca em texto nas observacoes.
--
-- CUIDADO: se depois da importacao alguem tiver aprovado, pago, conciliado ou
-- editado alguma dessas parcelas, este rollback apaga esse trabalho junto. Ele
-- e para desfazer uma carga recem-aplicada, nao para "limpar" meses depois.

begin;

-- 1. Lancamentos importados. parcelas e rateios saem por ON DELETE CASCADE.
--    Conta quantos vai apagar e avisa, para nao apagar em silencio.
do $$
declare v_qtd integer; v_valor numeric;
begin
  select count(*), coalesce(sum(valor), 0) into v_qtd, v_valor
  from public.lancamentos
  where observacoes like '%Importado da planilha BR-364 Lote 09 (%';
  raise notice 'Apagando % lancamento(s) importado(s), R$ %.', v_qtd, v_valor;
end $$;

delete from public.lancamentos
where observacoes like '%Importado da planilha BR-364 Lote 09 (%';

-- 2. Saldo inicial das contas volta a zero. A importacao foi quem o definiu
--    (era 0,00 nas cinco contas antes da carga).
update public.contas_bancarias
set saldo_inicial = 0
where nome in (
  'BANCO DO BRASIL 102.124-9',
  'BANCO DO BRASIL 1197-5 AMAZÔNIA',
  'BANCO DO BRASIL 30.893-5',
  'CAIXA ECONOMICA 578367973-5',
  'CAIXINHA DE DINHEIRO'
);

-- 3. Fornecedores criados pela importacao, e SO os que ninguem mais usa. O
--    id derivado por md5 identifica quem a importacao criou; os "not exists"
--    impedem de apagar fornecedor que passou a ser usado em outro documento.
delete from public.fornecedores f
where f.id = md5('br364-lote09:forn:' || public.fn_chave_nome(f.razao_social))::uuid
  and f.observacoes = 'Cadastrado na importacao do historico financeiro BR-364 Lote 09.'
  and not exists (select 1 from public.lancamentos x where x.fornecedor_id = f.id)
  and not exists (select 1 from public.ordens_compra x where x.fornecedor_id = f.id)
  and not exists (select 1 from public.cotacao_fornecedores x where x.fornecedor_id = f.id);

-- 4. Categorias criadas pela importacao, so as nao usadas.
delete from public.categorias_financeiras c
where c.id = md5('br364-lote09:cat:' || public.fn_chave_nome(c.nome))::uuid
  and not exists (select 1 from public.lancamentos x where x.categoria_id = c.id)
  and not exists (select 1 from public.categorias_financeiras x where x.pai_id = c.id);

-- 5. Forma de pagamento criada pela importacao ("Débito Automático"), se nao usada.
delete from public.formas_pagamento f
where f.id = md5('br364-lote09:forma:' || f.nome)::uuid
  and not exists (select 1 from public.lancamentos x where x.forma_pagamento_id = f.id);

-- 6. As funcoes.
drop function if exists public.fn_importar_br364_lote09(uuid, boolean, boolean);
drop function if exists public.fn_chave_nome(text);

-- 7. Conferencia: nada de importado pode sobrar.
do $$
declare v_qtd integer;
begin
  select count(*) into v_qtd from public.lancamentos
  where observacoes like '%Importado da planilha BR-364 Lote 09 (%';
  if v_qtd > 0 then
    raise exception 'Sobraram % lancamento(s) importado(s) depois do rollback.', v_qtd;
  end if;
  if exists (select 1 from public.contas_bancarias
              where saldo_inicial <> 0
                and nome in ('BANCO DO BRASIL 102.124-9', 'BANCO DO BRASIL 1197-5 AMAZÔNIA',
                             'BANCO DO BRASIL 30.893-5', 'CAIXA ECONOMICA 578367973-5',
                             'CAIXINHA DE DINHEIRO')) then
    raise exception 'Alguma conta ficou com saldo inicial diferente de zero.';
  end if;
end $$;

commit;
