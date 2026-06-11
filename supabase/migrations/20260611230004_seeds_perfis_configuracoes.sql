-- =============================================================
-- Fase 0 / Migration 4: seeds
-- Perfis padrao + permissoes do Admin + configuracoes iniciais.
-- Os demais perfis ganham permissoes conforme os modulos nascem.
-- =============================================================

insert into public.perfis (nome, descricao) values
  ('Admin', 'Acesso total. Administra usuarios, permissoes e configuracoes.'),
  ('Compras', 'Pedidos, cotacoes, ordens de compra e recebimentos.'),
  ('Financeiro', 'Lancamentos, pagamentos, contas e conciliacao.'),
  ('Almoxarife', 'Estoque, depositos, tanques e movimentacoes.'),
  ('Mecanico', 'Ordens de servico e checklists de manutencao.'),
  ('Apontador', 'Apontamento de campo: ponto, abastecimento, checklist.'),
  ('RH', 'Colaboradores, ponto, ferias, EPI e folha gerencial.'),
  ('Engenharia', 'Medicoes, planilhas contratuais e boletins.'),
  ('Gestor', 'Paineis de gestao e aprovacoes.');

-- Admin: matriz completa dos recursos da Fase 0
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, r.recurso, a.acao
from public.perfis p
cross join (values
  ('administracao.usuarios'),
  ('administracao.perfis'),
  ('administracao.configuracoes')
) as r (recurso)
cross join (values ('ver'), ('criar'), ('editar'), ('excluir')) as a (acao)
where p.nome = 'Admin';

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, v.recurso, v.acao
from public.perfis p
cross join (values
  ('administracao.auditoria', 'ver'),
  ('administracao.lixeira', 'ver'),
  ('administracao.lixeira', 'editar')
) as v (recurso, acao)
where p.nome = 'Admin';

-- Configuracoes iniciais
insert into public.configuracoes (chave, valor, descricao) values
  ('tolerancia_divergencia_nf_percentual', '2'::jsonb, 'Divergencia maxima entre NF e OC sem travar o recebimento (%).'),
  ('encargos_estimados_percentual', '80'::jsonb, 'Percentual de encargos estimados sobre salario na folha gerencial.'),
  ('banco_horas_ativo', 'false'::jsonb, 'Habilita o modulo opcional de banco de horas no RH.');
