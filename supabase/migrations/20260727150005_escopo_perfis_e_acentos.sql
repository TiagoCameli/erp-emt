-- QA / escopo: o ERP cobre so Compras, Financeiro e RH. Os perfis Almoxarife,
-- Engenharia e Mecanico (Estoque/Medicao/Manutencao) ficaram orfaos apos a
-- Reforma A (0 usuarios, 0 permissoes) e so confundem em Administracao > Perfis.
-- Removidos aqui. E as descricoes de perfis/configuracoes estavam sem acento no
-- seed (20260611230004); corrigidas via UPDATE (vale para producao e instalacoes
-- novas, pois roda depois do seed).
--
-- Rollback: reinserir os 3 perfis e reverter as descricoes ao texto sem acento.

delete from public.perfis where nome in ('Almoxarife', 'Engenharia', 'Mecanico');

update public.perfis set descricao = 'Acesso total. Administra usuários, permissões e configurações.' where nome = 'Admin';
update public.perfis set descricao = 'Apontamento de campo: ponto, abastecimento, checklist.' where nome = 'Apontador';
update public.perfis set descricao = 'Pedidos, cotações, ordens de compra e recebimentos.' where nome = 'Compras';
update public.perfis set descricao = 'Lançamentos, pagamentos, contas e conciliação.' where nome = 'Financeiro';
update public.perfis set descricao = 'Painéis de gestão e aprovações.' where nome = 'Gestor';
update public.perfis set descricao = 'Colaboradores, ponto, férias, EPI e folha gerencial.' where nome = 'RH';

update public.configuracoes set descricao = 'Habilita o módulo opcional de banco de horas no RH.' where chave = 'banco_horas_ativo';
update public.configuracoes set descricao = 'Percentual de encargos estimados sobre salário na folha gerencial.' where chave = 'encargos_estimados_percentual';
update public.configuracoes set descricao = 'Divergência máxima entre NF e OC sem travar o recebimento (%).' where chave = 'tolerancia_divergencia_nf_percentual';
