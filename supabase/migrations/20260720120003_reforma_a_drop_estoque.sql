-- Reforma A: dropa o modulo Estoque e Combustivel.
--
-- Manutencao ja foi dropada na migracao anterior (120002), levando consigo
-- os_pecas (FK para depositos/estoque_movimentos) e fn_os_adicionar_peca
-- (chamava fn_estoque_saida_interna). Confirmado via pg_constraint que a
-- unica FK restante de uma tabela sobrevivente para dentro do Estoque e
-- oc_itens_deposito_id_fkey. leituras_equipamento so tem FK para
-- equipamentos (sobrevive), sem FK de volta; drop e seguro.
--
-- Todas as 7 tabelas abaixo estavam com 0 linhas no recon.
--
-- fn_recurso_do_cadastro(text) tambem casou no discovery (corpo cita
-- 'depositos'), mas e funcao generica de mapeamento tabela->recurso usada
-- por fn_excluir_cadastro/fn_restaurar_cadastro para varios cadastros
-- (unidades, categorias, clientes, fornecedores, insumos, colaboradores).
-- NAO e dropada aqui; o case 'depositos' vira ramo morto inofensivo.

-- 1) Sever a FK cruzada e dropar a coluna deposito_id da OC (era do estoque).
alter table public.oc_itens drop constraint if exists oc_itens_deposito_id_fkey;
alter table public.oc_itens drop column     if exists deposito_id;

-- 2) Dropar funcoes de estoque/abastecimento.
drop function if exists public.fn_abastecer(uuid,uuid,numeric,numeric,numeric,uuid,date,text) cascade;
drop function if exists public.fn_estoque_ajuste(uuid,uuid,numeric,text) cascade;
drop function if exists public.fn_estoque_entrada(uuid,uuid,numeric,numeric,date,text) cascade;
drop function if exists public.fn_estoque_entrada_interna(uuid,uuid,numeric,numeric,text,uuid,date,text) cascade;
drop function if exists public.fn_estoque_saida(uuid,uuid,numeric,uuid,date,text) cascade;
drop function if exists public.fn_estoque_saida_interna(uuid,uuid,numeric,text,uuid,text,uuid,date,text,uuid) cascade;
drop function if exists public.fn_estoque_transferencia(uuid,uuid,uuid,numeric,date,text) cascade;
drop function if exists public.fn_recalcular_saldo_estoque(uuid,uuid) cascade;

-- 3) Dropar tabelas (filha -> pai).
drop table if exists public.abastecimentos;
drop table if exists public.estoque_camadas;
drop table if exists public.estoque_saldos;
drop table if exists public.estoque_minimos;
drop table if exists public.leituras_equipamento;
drop table if exists public.estoque_movimentos;
drop table if exists public.depositos;
