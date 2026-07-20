-- Reforma A: limpa permissoes orfas, zera o transacional e ajusta 2 funcoes
-- que ainda referenciavam recursos/branches removidos por migrations anteriores.
--
-- Recon (antes de aplicar, project vsesgvqjgqpapoxhnbqx):
--   perfil_permissoes:  132 linhas de recurso removido a apagar (de 346 no total)
--   usuario_permissoes:  59 linhas de recurso removido a apagar (de 175 no total)
--   lancamentos: 7964 linhas / lancamento_parcelas: 7964 linhas
--   lancamento_rateios: 0 / extrato_transacoes: 0 / rh_diarias: 0
--     (backup de lancamentos/parcelas ja existe fora do banco, conforme orientado)
--   documento_sequencias: colunas reais sao (tipo, ano, proximo) -- NAO existe
--     coluna "proximo_numero"; PK e (tipo, ano). Linhas atuais: LAN, OC, PED, REC.

-- 1) Apagar permissoes de recursos que sairam do catalogo: Estoque, Manutencao,
--    Medicao, Gestao (modulos inteiros removidos) e os recursos descontinuados
--    de Cadastros/Compras (orcamentos, depositos, pedidos, recebimentos, painel).
delete from public.perfil_permissoes
 where recurso like 'estoque.%' or recurso like 'manutencao.%'
    or recurso like 'medicao.%' or recurso like 'gestao.%'
    or recurso in ('cadastros.orcamentos','cadastros.depositos',
                   'compras.pedidos','compras.recebimentos','compras.painel');

delete from public.usuario_permissoes
 where recurso like 'estoque.%' or recurso like 'manutencao.%'
    or recurso like 'medicao.%' or recurso like 'gestao.%'
    or recurso in ('cadastros.orcamentos','cadastros.depositos',
                   'compras.pedidos','compras.recebimentos','compras.painel');

-- 2) Zerar o transacional para comecar limpo no modelo novo. O cascade em
--    lancamentos tambem limpa lancamento_parcelas, lancamento_rateios,
--    extrato_transacoes (via parcela_id) e rh_diarias (via lancamento_id).
--    Todas sao transacionais; backup ja existe.
truncate table public.lancamentos restart identity cascade;

-- 3) Reiniciar a numeracao de documentos para comecar limpo. Coluna real e
--    "proximo" (nao "proximo_numero", que nao existe nesta tabela).
update public.documento_sequencias set proximo = 1;

-- 4) nomes_usuarios_compras: o recurso 'compras.pedidos' foi removido do
--    catalogo (Task 4, enxuga Compras). Troca o gate para 'compras.ordens',
--    o recurso de OC que sobrevive. Assinatura, corpo (fora da string do
--    recurso) e atributos da funcao (SECURITY DEFINER, search_path, grants)
--    ficam identicos.
create or replace function public.nomes_usuarios_compras(p_ids uuid[])
 returns table(id uuid, nome text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select u.id, u.nome from public.usuarios u
  where u.id = any (p_ids) and public.tem_permissao('compras.ordens', 'ver');
$function$;

-- 5) fn_recurso_do_cadastro: remove o branch morto 'depositos' (a tabela
--    depositos e a aba cadastros.depositos ja foram removidas nas migrations
--    de Estoque/Cadastros). Demais branches, o else e a assinatura ficam
--    identicos.
create or replace function public.fn_recurso_do_cadastro(p_tabela text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case p_tabela
    when 'unidades_medida'   then 'cadastros.unidades'
    when 'categorias_insumo' then 'cadastros.categorias'
    when 'clientes'          then 'cadastros.clientes'
    when 'fornecedores'      then 'cadastros.fornecedores'
    when 'insumos'           then 'cadastros.insumos'
    when 'colaboradores'     then 'cadastros.colaboradores'
    else null
  end;
$function$;
