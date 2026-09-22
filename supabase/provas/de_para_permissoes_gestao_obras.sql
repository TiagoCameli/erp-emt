-- =============================================================================
-- De-para das permissões do Gestão Obras para o ERP-EMT
-- Frete, Combustível e Manutenção (plano docs/PLANO-FRETE-COMBUSTIVEL-MANUTENCAO.md, seção 4)
--
-- O QUE É
--   Levantamento, feito em 22/09/2026, de TODAS as chaves de permissão que existem hoje
--   em funcionarios.acoes_permitidas no Gestão Obras (Supabase gunyitwrbxbmnezokgjq), e de
--   qual recurso/ação do ERP (Supabase vsesgvqjgqpapoxhnbqx) cada uma vira.
--
-- PARA QUEM
--   Para o Tiago revisar ANTES de qualquer coisa ser aplicada. Nada aqui grava:
--   o arquivo só tem SELECT e um VALUES. Não é migration.
--
-- REGRAS QUE ESTE DE-PARA SEGUE
--   1. Só entram os recursos da seção 4.1 do plano, mais os que já existem no ERP
--      (cadastros.equipamentos e administracao.lixeira). Só as ações do catálogo ACOES de
--      src/config/recursos.ts (ver, criar, editar, excluir, aprovar, desaprovar).
--      Nenhuma chave solta vira recurso.
--   2. Toda chave ver_* / aba_* de um recurso vira `ver`. Exportar vira `ver` (padrão do
--      ERP: listagem gerencial exporta com ver, plano 4.1).
--   3. Quando a origem dá criar sem nenhuma chave de ver do mesmo recurso (ajuste de saldo,
--      esvaziamento, horímetro), a chave gera também a linha de `ver`: sem ela a aba some (4.4).
--   4. Cadastros compartilhados que o ERP já governa (fornecedores, insumos, unidades,
--      obras, categorias, colaboradores) NÃO são concedidos por este de-para. Só entram os
--      cadastros que os módulos novos exigem: cadastros.equipamentos e cadastros.localidades.
--   5. O significado de cada chave foi lido no código do Gestão Obras:
--      src/utils/permissions.ts (ACOES_PLATAFORMA com rótulo e grupo, e DEPENDENCIAS_ACOES)
--      e o uso real com grep de temAcao('...') em src/.
--
-- QUANDO FOR APLICAR (fora deste arquivo)
--   SÓ ADICIONA LINHAS em usuario_permissoes (insert ... on conflict do nothing).
--   NUNCA usar aplicar_perfil em quem já tem acesso: aplicar_perfil SUBSTITUI a matriz
--   inteira e a pessoa perde Compras, Financeiro ou RH (plano 4.3.2).
--   Os 4 Admins ativos (Tiago, Emanuel, James, Lorenzo) recebem TUDO pela migration de cada
--   fase (plano 4.3.1) e não precisam de linha aqui.
--
-- NÚMEROS (medidos em 22/09/2026)
--   Chaves distintas na origem ....................... 251  (o Tiago tem 250; a que falta
--                                                             nele é aba_combustivel_sem_suprimento)
--   Linhas do de_para ................................ 262  (uma chave pode dar mais de uma)
--   Chaves que viram ao menos um recurso do ERP ......  96
--   Chaves que NÃO entram (com o motivo) ............. 148  (3 são órfãs: criar_apontamentos,
--                                                             ver_apontamentos, ver_insumos não
--                                                             existem em ACOES_PLATAFORMA nem em src/)
--   Chaves em DÚVIDA .................................   7  (recurso NULL até o Tiago decidir)
--
-- ACHADOS QUE PEDEM DECISÃO DO TIAGO
--   A. aprovar_lancamento_manual NÃO é de frete. O plano 4.2 manda para frete.ajustes/aprovar,
--      mas na origem ela é do grupo "Apontamento RH" (rótulo "Aprovar lançamento manual
--      (supervisor)", depende de lancar_ponto_manual) e só aparece na policy
--      apont_registros_ponto_update (migration 20260525130000_tighten_rls_apont_tables.sql).
--      transportadora_movimentos não tem coluna de aprovação: hoje o ajuste de saldo não é
--      aprovado por ninguém. Proposta: não conceder; frete.ajustes/aprovar+desaprovar ficam só
--      com os Admins. O plano 4.2 precisa ser corrigido.
--   B. A lixeira do ERP NÃO confere o recurso de origem hoje. No banco vivo, a policy
--      lixeira_select pede só tem_permissao('administracao.lixeira','ver') e
--      fn_restaurar_cadastro pede só ('administracao.lixeira','editar'). Quem receber a lixeira
--      vê e restaura TUDO o que está nela (Financeiro, RH, cadastros), não só frete e
--      combustível. O branch por tabela em fn_recurso_do_cadastro prometido na 4.1 ainda não
--      existe. Proposta: segurar as linhas de administracao.lixeira da seção 4 até isso
--      estar pronto.
--   C. Ninguém fora dos Admins tem chave que vire frete.anomalias, combustivel.esvaziamentos/
--      excluir, manutencao.almoxarifado/excluir ou manutencao.medicoes/editar. Esses ficam só
--      com os Admins até o Tiago dizer o contrário.
--   D. Yara recebe manutencao.servicos/criar SEM ver (na origem ela tem criar_os e
--      abrir_os_mobile, sem nenhuma aba de Manutenção: só abre OS pelo celular). No ERP isso
--      só funciona se a tela de OS do celular não exigir `ver`.
-- =============================================================================


-- =============================================================================
-- 2 e 3. DE-PARA + JUNÇÃO COM A ORIGEM
--   Rodar contra a ORIGEM (gunyitwrbxbmnezokgjq). Só leitura.
--   A consulta final lista, por funcionário ativo, cada chave que ele tem e o recurso/ação
--   do ERP em que ela vira (recurso NULL = não entra; a observação diz por quê).
--   Para ver só o de-para, troque o SELECT final por:  select * from de_para order by chave;
--   Para ver a matriz deduplicada, troque o SELECT final pelo bloco comentado no fim.
-- =============================================================================
with de_para(chave, recurso, acao, observacao) as (
  values
    ('ver_frete', 'frete.fretes', 'ver', 'plano 4.2: ver_frete = frete.fretes/ver'),
    ('aba_frete_fretes', 'frete.fretes', 'ver', 'plano 4.2'),
    ('criar_frete', 'frete.fretes', 'criar', 'plano 4.2'),
    ('editar_frete', 'frete.fretes', 'editar', 'plano 4.2'),
    ('excluir_frete', 'frete.fretes', 'excluir', 'plano 4.2'),
    ('exportar_frete', 'frete.fretes', 'ver', 'exportar segue o padrão do ERP: listagem exporta com ver (plano 4.1)'),
    ('importar_frete', 'frete.fretes', 'criar', 'importar Excel cria fretes; a chave não é usada no src da origem hoje'),
    ('anexar_documentos_frete', 'frete.fretes', 'editar', 'anexar ao frete já lançado é editar o frete'),
    ('aba_frete_dashboard', 'frete.painel', 'ver', 'aba Dashboard de Frete = frete.painel'),
    ('gerenciar_pagamentos_frete', 'frete.pagamentos', 'ver', 'na origem é o pré-requisito das 3 chaves de pagamento (DEPENDENCIAS_ACOES)'),
    ('aba_frete_pagamentos', 'frete.pagamentos', 'ver', ''),
    ('criar_pagamento_frete', 'frete.pagamentos', 'criar', ''),
    ('editar_pagamento_frete', 'frete.pagamentos', 'editar', ''),
    ('excluir_pagamento_frete', 'frete.pagamentos', 'excluir', ''),
    ('ver_pedidos_material', 'frete.pedidos-material', 'ver', ''),
    ('aba_frete_pedidos', 'frete.pedidos-material', 'ver', ''),
    ('criar_pedido_material_frete', 'frete.pedidos-material', 'criar', ''),
    ('editar_pedido_material_frete', 'frete.pedidos-material', 'editar', ''),
    ('excluir_pedido_material_frete', 'frete.pedidos-material', 'excluir', ''),
    ('exportar_pedidos_material', 'frete.pedidos-material', 'ver', 'exportar = ver (padrão do ERP)'),
    ('ver_extrato_transportadora', 'frete.conta-corrente', 'ver', 'extrato da transportadora = conta corrente'),
    ('aba_frete_conta_corrente', 'frete.conta-corrente', 'ver', ''),
    ('exportar_extrato_transportadora', 'frete.conta-corrente', 'ver', 'exportar = ver (padrão do ERP)'),
    ('ajustar_saldo_transportadora', 'frete.ajustes', 'criar', 'plano 4.2; o ajuste só mexe no saldo depois de aprovado'),
    ('ajustar_saldo_transportadora', 'frete.ajustes', 'ver', 'sem ver a aba some (4.4); na origem o ajuste fica dentro do extrato'),
    ('ver_lixeira_frete', 'administracao.lixeira', 'ver', 'lixeira universal do ERP'),
    ('aba_frete_lixeira', 'administracao.lixeira', 'ver', 'lixeira universal do ERP'),
    ('restaurar_lixeira_frete', 'administracao.lixeira', 'editar', 'plano 4.2: lixeira universal, a restauração confere o recurso de origem'),
    ('ver_combustivel', null, null, 'acesso ao módulo na origem; no ERP o módulo aparece quando há ver em alguma aba, e as abas vêm das chaves aba_combustivel_*'),
    ('aba_combustivel_visao_geral', 'combustivel.painel', 'ver', ''),
    ('ver_dashboard_combustivel', null, null, 'card "Resumo de Combustível" do Dashboard geral da origem (useDashboardPrefs.ts); o Dashboard geral fica na origem'),
    ('aba_combustivel_saidas', 'combustivel.saidas', 'ver', ''),
    ('criar_saida_combustivel', 'combustivel.saidas', 'criar', 'plano 4.2'),
    ('saida_combustivel_mobile', 'combustivel.saidas', 'criar', 'plano 4.2: a tela do celular é o mesmo recurso'),
    ('criar_abastecimento_carreta', 'combustivel.saidas', 'criar', 'plano 4.2: carreta de transportadora é saída'),
    ('aba_combustivel_entradas', 'combustivel.entradas', 'ver', ''),
    ('criar_entrada_combustivel', 'combustivel.entradas', 'criar', ''),
    ('aba_combustivel_transferencias', 'combustivel.transferencias', 'ver', ''),
    ('criar_transferencia_combustivel', 'combustivel.transferencias', 'criar', ''),
    ('editar_combustivel', 'combustivel.entradas', 'editar', 'na origem uma chave só edita entrada, saída e transferência (EntradaForm, SaidaCombustivelForm, TransferenciaForm)'),
    ('editar_combustivel', 'combustivel.saidas', 'editar', 'idem'),
    ('editar_combustivel', 'combustivel.transferencias', 'editar', 'idem'),
    ('excluir_combustivel', 'combustivel.entradas', 'excluir', 'na origem uma chave só exclui as movimentações (FrotaCombustivelContainer.tsx)'),
    ('excluir_combustivel', 'combustivel.saidas', 'excluir', 'idem'),
    ('excluir_combustivel', 'combustivel.transferencias', 'excluir', 'idem'),
    ('aba_combustivel_tanques', 'combustivel.tanques', 'ver', ''),
    ('criar_tanque', 'combustivel.tanques', 'criar', 'chave do grupo Combustível; não é usada no src hoje (quem vale é criar_tanques, do cadastro)'),
    ('editar_tanque', 'combustivel.tanques', 'editar', 'idem'),
    ('excluir_tanque', 'combustivel.tanques', 'excluir', 'idem'),
    ('criar_tanques', 'combustivel.tanques', 'criar', 'cadastro de tanques da origem (tanques.config.tsx); no ERP o tanque é de Combustível'),
    ('editar_tanques', 'combustivel.tanques', 'editar', 'idem'),
    ('excluir_tanques', 'combustivel.tanques', 'excluir', 'idem'),
    ('esvaziar_tanque', 'combustivel.esvaziamentos', 'criar', 'plano 4.2'),
    ('esvaziar_tanque', 'combustivel.esvaziamentos', 'ver', 'sem ver a aba some (4.4); na origem o esvaziamento é um modal do tanque'),
    ('ver_anomalias_combustivel', 'combustivel.anomalias', 'ver', ''),
    ('aba_combustivel_anomalias', 'combustivel.anomalias', 'ver', ''),
    ('aba_combustivel_sem_suprimento', 'combustivel.anomalias', 'ver', 'plano 4.1: anomalias inclui "sem suprimento"'),
    ('corrigir_anomalias_combustivel', 'combustivel.anomalias', 'editar', 'plano 4.2'),
    ('aba_combustivel_relatorios', 'combustivel.relatorios', 'ver', ''),
    ('aba_combustivel_consumidores', 'combustivel.relatorios', 'ver', 'aba do grupo "Analítico" (Equipamentos/Carretas), só leitura; sem recurso próprio na 4.1'),
    ('aba_combustivel_obras', 'combustivel.relatorios', 'ver', 'aba do grupo "Analítico" (Obras), só leitura'),
    ('aba_combustivel_fornecedores', 'combustivel.relatorios', 'ver', 'aba do grupo "Analítico" (Fornecedores), só leitura'),
    ('exportar_combustivel', 'combustivel.relatorios', 'ver', 'exportar = ver (padrão do ERP)'),
    ('exportar_raw_combustivel', 'combustivel.relatorios', 'ver', 'exportar dados brutos = ver (padrão do ERP)'),
    ('anexar_documentos_combustivel', null, null, 'anexar faz parte do criar/editar do movimento no ERP; sozinha não concede editar'),
    ('salvar_views_combustivel', null, null, 'preferência de filtro salva; no ERP o filtro vive na URL, não é permissão'),
    ('ver_lixeira_combustivel', 'administracao.lixeira', 'ver', 'lixeira universal do ERP'),
    ('aba_combustivel_lixeira', 'administracao.lixeira', 'ver', 'lixeira universal do ERP'),
    ('restaurar_lixeira_combustivel', 'administracao.lixeira', 'editar', 'lixeira universal, a restauração confere o recurso de origem'),
    ('ver_manutencao', null, null, 'acesso ao módulo na origem; as abas vêm das chaves aba_manutencao_*'),
    ('aba_manutencao_dashboard', 'manutencao.painel', 'ver', ''),
    ('ver_dashboard_manutencao', null, null, 'card "Resumo de Manutenção" do Dashboard geral da origem; o Dashboard geral fica na origem'),
    ('aba_manutencao_os', 'manutencao.servicos', 'ver', ''),
    ('criar_os', 'manutencao.servicos', 'criar', 'plano 4.2'),
    ('abrir_os_mobile', 'manutencao.servicos', 'criar', 'plano 4.2'),
    ('editar_os', 'manutencao.servicos', 'editar', ''),
    ('excluir_os', 'manutencao.servicos', 'excluir', ''),
    ('editar_diagnostico_os', 'manutencao.servicos', 'editar', 'plano 4.2'),
    ('adicionar_peca_os', 'manutencao.servicos', 'editar', 'plano 4.2: peça é linha da OS'),
    ('adicionar_oleo_os', 'manutencao.servicos', 'editar', 'plano 4.2: óleo é linha da OS'),
    ('adicionar_terceiro_os', 'manutencao.servicos', 'editar', 'plano 4.2: terceiro é linha da OS'),
    ('ver_custos', 'manutencao.servicos', 'ver', 'na origem libera o export da Manutenção (Manutencao.tsx); o custo é da OS, e export = ver'),
    ('gerenciar_tipos_oleo', 'manutencao.tipos-oleo', 'ver', 'uma chave só na origem (TiposOleoPage.tsx) = o CRUD inteiro'),
    ('gerenciar_tipos_oleo', 'manutencao.tipos-oleo', 'criar', 'idem'),
    ('gerenciar_tipos_oleo', 'manutencao.tipos-oleo', 'editar', 'idem'),
    ('gerenciar_tipos_oleo', 'manutencao.tipos-oleo', 'excluir', 'idem'),
    ('ver_almoxarifado', 'manutencao.almoxarifado', 'ver', ''),
    ('aba_manutencao_almoxarifado', 'manutencao.almoxarifado', 'ver', ''),
    ('criar_peca_almoxarifado', 'manutencao.almoxarifado', 'criar', 'cadastro da peça no depósito (plano 4.1)'),
    ('criar_entrada_almoxarifado', 'manutencao.almoxarifado', 'criar', 'entrada de peça (plano 4.1)'),
    ('editar_peca_almoxarifado', 'manutencao.almoxarifado', 'editar', ''),
    ('lancar_medicao_mobile', 'manutencao.medicoes', 'criar', 'plano 4.2; no src é a rota /m/medicao/:equipamentoId (horímetro/km), apesar do rótulo "atividade de medição"'),
    ('lancar_medicao_mobile', 'manutencao.medicoes', 'ver', 'sem ver a aba some (4.4)'),
    ('ver_frota', 'cadastros.equipamentos', 'ver', 'Frota da origem = cadastro de equipamento do ERP. Na origem ver_frota também abre o menu de Manutenção e Combustível (Header.tsx); no ERP isso vem das abas'),
    ('criar_veiculo', 'cadastros.equipamentos', 'criar', ''),
    ('editar_veiculo', 'cadastros.equipamentos', 'editar', ''),
    ('excluir_veiculo', 'cadastros.equipamentos', 'excluir', ''),
    ('criar_equipamentos', 'cadastros.equipamentos', 'criar', 'cadastro de equipamento da origem (equipamentos.config.tsx)'),
    ('editar_equipamentos', 'cadastros.equipamentos', 'editar', 'idem'),
    ('excluir_equipamentos', 'cadastros.equipamentos', 'excluir', 'idem'),
    ('exportar_frota', 'cadastros.equipamentos', 'ver', 'exportar = ver (padrão do ERP)'),
    ('gerar_etiquetas_qr', 'cadastros.equipamentos', 'editar', 'plano 4.1: etiquetas QR = cadastros.equipamentos/editar'),
    ('mudar_status_equipamento', 'cadastros.equipamentos', 'editar', 'plano 4.1: status do equipamento = cadastros.equipamentos/editar'),
    ('editar_especificacoes_equipamento', 'cadastros.equipamentos', 'editar', 'especificações viram equipamento_especificacoes 1:1 (plano 3)'),
    ('ver_documentos_equipamento', 'cadastros.equipamentos', 'ver', 'equipamento_documentos é do cadastro (plano 3)'),
    ('gerenciar_documentos_equipamento', 'cadastros.equipamentos', 'editar', 'idem'),
    ('gerenciar_fotos_equipamento', 'cadastros.equipamentos', 'editar', 'galeria do equipamento; a chave não é usada no src hoje'),
    ('ver_historico_equipamento', 'cadastros.equipamentos', 'ver', 'histórico de status do equipamento; a chave não é usada no src hoje'),
    ('ver_financeiro_equipamento', null, null, 'DÚVIDA: a seção Financeiro do equipamento (aquisição, financiamento, locação; FinanceiroEquipamentoSection.tsx) não aparece nas tabelas do plano. Se migrar, seria cadastros.equipamentos/ver'),
    ('editar_financeiro_equipamento', null, null, 'DÚVIDA: idem; se migrar, seria cadastros.equipamentos/editar'),
    ('ver_custos_pecas_equipamento', null, null, 'DÚVIDA: não é usada no src hoje; custo de peça por equipamento no ERP estaria na OS (manutencao.servicos/ver)'),
    ('scan_qr_equipamento', null, null, 'Hub do QR no celular; no ERP o QR leva às telas de abastecimento e horímetro, cada uma com o próprio recurso'),
    ('usar_app_mobile', null, null, 'acesso ao app mobile da origem; no ERP cada tela do celular pede o recurso dela'),
    ('ver_cadastros', 'cadastros.localidades', 'ver', 'ver genérico da tela Cadastros da origem (as configs só declaram create/edit/delete); no ERP entra só para o cadastro novo (localidades) e para equipamentos'),
    ('ver_cadastros', 'cadastros.equipamentos', 'ver', 'idem: na origem o cadastro de equipamento abre com ver_cadastros'),
    ('criar_localidades', 'cadastros.localidades', 'criar', ''),
    ('editar_localidades', 'cadastros.localidades', 'editar', ''),
    ('excluir_localidades', 'cadastros.localidades', 'excluir', ''),
    ('criar_cadastros', null, null, 'permissão genérica da tela Cadastros da origem; no ERP cada cadastro tem recurso próprio'),
    ('editar_cadastros', null, null, 'idem'),
    ('excluir_cadastros', null, null, 'idem'),
    ('importar_cadastros', null, null, 'idem (importar Excel)'),
    ('criar_fornecedores', null, null, 'cadastro compartilhado que o ERP já governa (cadastros.fornecedores); não é concedido por este de-para'),
    ('editar_fornecedores', null, null, 'idem (as colunas novas de transportadora/tanque são editadas em cadastros.fornecedores, plano 3)'),
    ('excluir_fornecedores', null, null, 'idem'),
    ('criar_insumos', null, null, 'cadastro compartilhado que o ERP já governa (cadastros.insumos); não é concedido por este de-para'),
    ('editar_insumos', null, null, 'idem'),
    ('excluir_insumos', null, null, 'idem'),
    ('exportar_insumos', null, null, 'idem'),
    ('criar_unidades', null, null, 'cadastro compartilhado que o ERP já governa (cadastros.unidades); não é concedido por este de-para'),
    ('editar_unidades', null, null, 'idem'),
    ('excluir_unidades', null, null, 'idem'),
    ('criar_tipos_insumo', null, null, 'tipo de insumo da origem; no ERP a classificação é cadastros.categorias, já governada; não é concedido'),
    ('editar_tipos_insumo', null, null, 'idem'),
    ('excluir_tipos_insumo', null, null, 'idem'),
    ('criar_categorias_material', null, null, 'categoria de material da origem; no ERP é cadastros.categorias, já governada; não é concedido'),
    ('editar_categorias_material', null, null, 'idem'),
    ('excluir_categorias_material', null, null, 'idem'),
    ('criar_tipos_equipamento', null, null, 'tipo de equipamento da origem; não existe recurso no ERP nem na 4.1'),
    ('editar_tipos_equipamento', null, null, 'idem'),
    ('excluir_tipos_equipamento', null, null, 'idem'),
    ('criar_empresas', null, null, 'empresas da origem; não é cadastro de que os 3 módulos precisem, fora da 4.1'),
    ('editar_empresas', null, null, 'idem'),
    ('excluir_empresas', null, null, 'idem'),
    ('criar_colaboradores', null, null, 'colaborador é cadastro do RH do ERP (cadastros.colaboradores) e do Apontamento RH da origem; não é concedido'),
    ('editar_colaboradores', null, null, 'idem'),
    ('excluir_colaboradores', null, null, 'idem'),
    ('criar_depositos_material', null, null, 'DÚVIDA: o cadastro de depósito de material é do módulo Depósitos, que fica na origem (decisão 1). Se o almoxarifado de peças do ERP tiver depósito próprio, seria manutencao.almoxarifado/criar'),
    ('editar_depositos_material', null, null, 'DÚVIDA: idem; seria manutencao.almoxarifado/editar'),
    ('excluir_depositos_material', null, null, 'DÚVIDA: idem; seria manutencao.almoxarifado/excluir'),
    ('ver_etapas', null, null, 'Obras/Etapas fica no Gestão Obras (decisão 1); no ERP etapa é centro de custo'),
    ('criar_etapas', null, null, 'idem'),
    ('editar_etapas', null, null, 'idem'),
    ('excluir_etapas', null, null, 'idem'),
    ('unificar_funcionarios', null, null, 'módulo que fica no Gestão Obras: Apontamento RH'),
    ('backfill_apontamentos', null, null, 'módulo que fica no Gestão Obras: Apontamento RH'),
    ('ver_obras', null, null, 'Obras/Etapas fica no Gestão Obras (decisão 1); obra no ERP é cadastros.obras, já governado'),
    ('criar_obras', null, null, 'idem'),
    ('editar_obras', null, null, 'idem'),
    ('excluir_obras', null, null, 'idem'),
    ('importar_etapas_obra', null, null, 'idem'),
    ('importar_equipamentos_obra', null, null, 'idem'),
    ('exportar_orcamento', null, null, 'idem'),
    ('gerenciar_tipos_equipamento_obra', null, null, 'idem'),
    ('gerenciar_categorias_material_obra', null, null, 'idem'),
    ('ver_dashboard', null, null, 'Dashboard geral da origem (KPIs de obras, gastos) fica lá; não é o gestao.painel'),
    ('filtros_dashboard', null, null, 'idem'),
    ('ver_dashboard_insumos', null, null, 'card do Dashboard geral da origem; fica lá'),
    ('ver_dashboard_obras', null, null, 'card do Dashboard geral da origem; fica lá'),
    ('ver_materiais', null, null, 'módulo que fica no Gestão Obras: Depósitos de material'),
    ('criar_entrada_material', null, null, 'idem'),
    ('criar_saida_material', null, null, 'idem'),
    ('criar_transferencia_material', null, null, 'idem'),
    ('editar_material', null, null, 'idem'),
    ('excluir_material', null, null, 'idem'),
    ('exportar_material', null, null, 'idem'),
    ('ver_depositos', null, null, 'idem'),
    ('criar_deposito', null, null, 'idem'),
    ('editar_deposito', null, null, 'idem'),
    ('excluir_deposito', null, null, 'idem'),
    ('ver_saldos', null, null, 'idem'),
    ('criar_entrada_material_avulsa', null, null, 'idem'),
    ('criar_perda_material', null, null, 'idem'),
    ('restaurar_lixeira_depositos', null, null, 'idem (lixeira de Depósitos)'),
    ('excluir_permanente_depositos', null, null, 'idem'),
    ('ver_funcionarios', null, null, 'gestão de usuários da origem; no ERP é administracao.usuarios, que fica com o Admin'),
    ('criar_funcionarios', null, null, 'idem'),
    ('editar_funcionarios', null, null, 'idem'),
    ('excluir_funcionarios', null, null, 'idem'),
    ('gerenciar_permissoes', null, null, 'idem'),
    ('ver_matriz_permissoes', null, null, 'idem'),
    ('redefinir_senha', null, null, 'idem'),
    ('importar_funcionarios', null, null, 'idem'),
    ('migrar_dados', null, null, 'sistema da origem'),
    ('ver_auditoria', null, null, 'auditoria da origem; no ERP é administracao.auditoria, fora deste de-para'),
    ('configurar_sistema', null, null, 'sistema da origem; no ERP é administracao.configuracoes, fora deste de-para'),
    ('ver_medicao', null, null, 'RodoTracker/Medição fica na origem'),
    ('aba_medicao_mapa', null, null, 'idem'),
    ('aba_medicao_planejamento', null, null, 'idem'),
    ('aba_medicao_contrato', null, null, 'idem'),
    ('criar_obra_medicao', null, null, 'idem'),
    ('editar_obra_medicao', null, null, 'idem'),
    ('excluir_obra_medicao', null, null, 'idem'),
    ('criar_atividade_medicao', null, null, 'idem'),
    ('editar_atividade_medicao', null, null, 'idem'),
    ('excluir_atividade_medicao', null, null, 'idem'),
    ('upload_fotos_medicao', null, null, 'idem'),
    ('upload_pdfs_medicao', null, null, 'idem'),
    ('importar_cbuq_medicao', null, null, 'idem'),
    ('importar_contrato_medicao', null, null, 'idem'),
    ('baixar_template_contrato', null, null, 'idem'),
    ('gerenciar_planejamento', null, null, 'idem'),
    ('gerenciar_contrato', null, null, 'idem'),
    ('editar_itens_contrato', null, null, 'idem'),
    ('trocar_periodo_medicao', null, null, 'idem'),
    ('fechar_medicao', null, null, 'idem'),
    ('exportar_medicao', null, null, 'idem'),
    ('migrar_medicao_local', null, null, 'idem'),
    ('aprovar_lancamento_manual', null, null, 'DÚVIDA: o plano 4.2 manda para frete.ajustes/aprovar+desaprovar, mas na origem a chave é do grupo Apontamento RH ("Aprovar lançamento manual (supervisor)", depende de lancar_ponto_manual) e só aparece na policy apont_registros_ponto_update; transportadora_movimentos não tem coluna de aprovação. Proposta: não conceder; frete.ajustes/aprovar+desaprovar ficam só com os Admins'),
    ('ver_apontamento_rh', null, null, 'módulo que fica no Gestão Obras: Apontamento RH'),
    ('aba_rh_dashboard', null, null, 'idem'),
    ('aba_rh_funcionarios', null, null, 'idem'),
    ('aba_rh_alocacao', null, null, 'idem'),
    ('aba_rh_ponto', null, null, 'idem'),
    ('aba_rh_servico', null, null, 'idem'),
    ('aba_rh_aprovacao', null, null, 'idem'),
    ('aba_rh_historico', null, null, 'idem'),
    ('criar_func_rh', null, null, 'idem'),
    ('editar_func_rh', null, null, 'idem'),
    ('excluir_func_rh', null, null, 'idem'),
    ('gerenciar_equipes', null, null, 'idem'),
    ('criar_equipe', null, null, 'idem'),
    ('editar_equipe', null, null, 'idem'),
    ('excluir_equipe', null, null, 'idem'),
    ('alocar_funcionarios_equipe', null, null, 'idem'),
    ('transferir_equipe_obra', null, null, 'idem'),
    ('registrar_ponto', null, null, 'idem'),
    ('registrar_ponto_lote', null, null, 'idem'),
    ('captura_facial_ponto', null, null, 'idem'),
    ('lancar_ponto_manual', null, null, 'idem'),
    ('editar_batida_ponto', null, null, 'idem'),
    ('excluir_batida_ponto', null, null, 'idem'),
    ('aprovar_ponto_diario', null, null, 'idem'),
    ('sincronizar_fila_offline', null, null, 'idem (fila offline do ponto)'),
    ('lancar_apontamento_servico', null, null, 'idem'),
    ('editar_apontamento_servico', null, null, 'idem'),
    ('ver_historico_apontamentos', null, null, 'idem'),
    ('editar_apontamentos', null, null, 'idem'),
    ('excluir_apontamentos', null, null, 'idem'),
    ('lancar_ausencia', null, null, 'idem'),
    ('lancar_adiantamento', null, null, 'idem'),
    ('fechar_folha', null, null, 'idem'),
    ('exportar_folha', null, null, 'idem'),
    ('reabrir_periodo', null, null, 'idem'),
    ('ver_relatorios_rh', null, null, 'idem'),
    ('ver_aprovacoes_rh', null, null, 'idem'),
    ('aprovar_apontamento_rh', null, null, 'idem'),
    ('reverter_aprovacao_rh', null, null, 'idem'),
    ('bater_ponto_mobile', null, null, 'idem (ponto pelo celular)'),
    ('criar_apontamentos', null, null, 'chave órfã: não está em ACOES_PLATAFORMA nem em src/ ou supabase/ da origem; pelo nome é do Apontamento RH, que fica na origem'),
    ('ver_insumos', null, null, 'chave órfã: não está em ACOES_PLATAFORMA nem em src/ da origem; insumo é cadastro compartilhado que o ERP já governa (cadastros.insumos)'),
    ('ver_apontamentos', null, null, 'chave órfã: não está em ACOES_PLATAFORMA nem em src/ da origem; pelo nome é do Apontamento RH, que fica na origem')
),
ordem(acao, n) as (
  values ('ver', 1), ('criar', 2), ('editar', 3), ('excluir', 4), ('aprovar', 5), ('desaprovar', 6)
),
juncao as (
  select f.nome, k.chave, d.recurso, d.acao, d.observacao
  from public.funcionarios f
  cross join lateral unnest(f.acoes_permitidas) as k(chave)
  left join de_para d on d.chave = k.chave
  where f.status = 'ativo'
)
select nome, chave, recurso, acao, observacao
from juncao
order by nome, recurso nulls last, chave, acao;

-- Matriz deduplicada (troque o SELECT final acima por este):
--   select j.nome, j.recurso, string_agg(distinct j.acao, '+') as acoes
--   from juncao j
--   where j.recurso is not null
--   group by j.nome, j.recurso
--   order by j.nome, j.recurso;
--   (a ordem ver+criar+editar+excluir abaixo saiu de um join com `ordem`)
--
-- Conferência de cobertura (troque o SELECT final por este; tem que voltar 0 linhas):
--   select distinct k.chave from public.funcionarios f
--   cross join lateral unnest(f.acoes_permitidas) k(chave)
--   where not exists (select 1 from de_para d where d.chave = k.chave);


-- -----------------------------------------------------------------------------
-- RESULTADO RODADO NA ORIGEM EM 22/09/2026 (matriz deduplicada, só o que vira recurso)
--   9 funcionários com chave; todos com status 'ativo'. CRUD = ver+criar+editar+excluir.
--
--   Tiago de Melo Cameli (250 chaves)   [Admin no ERP]
--     frete.painel ver | frete.fretes CRUD | frete.pedidos-material CRUD | frete.conta-corrente ver
--     frete.pagamentos CRUD | frete.ajustes ver+criar
--     combustivel.painel ver | .tanques CRUD | .entradas CRUD | .saidas CRUD | .transferencias CRUD
--     combustivel.esvaziamentos ver+criar | .anomalias ver+editar | .relatorios ver
--     manutencao.painel ver | .servicos CRUD | .almoxarifado ver+criar+editar
--     manutencao.medicoes ver+criar | .tipos-oleo CRUD
--     cadastros.equipamentos CRUD | cadastros.localidades CRUD | administracao.lixeira ver+editar
--
--   James Castro Cameli (196)   [Admin no ERP]
--     igual ao Tiago, exceto cadastros.localidades só ver
--
--   Emanuel de Melo Cameli (44)   [Admin no ERP]
--     frete.fretes CRUD | combustivel.entradas/.saidas/.transferencias criar+editar+excluir (sem ver)
--     combustivel.relatorios ver | manutencao.servicos ver+criar+editar
--     cadastros.equipamentos ver | cadastros.localidades ver
--
--   Andreia Alencar Silva (145)
--     frete.painel ver | frete.fretes CRUD | frete.pedidos-material CRUD | frete.conta-corrente ver
--     frete.pagamentos CRUD | frete.ajustes ver+criar
--     combustivel.painel ver | .tanques CRUD | .entradas CRUD | .saidas CRUD | .transferencias CRUD
--     combustivel.esvaziamentos ver+criar | .anomalias ver+editar | .relatorios ver
--     manutencao.painel ver | .servicos CRUD | .almoxarifado ver+criar+editar | .tipos-oleo CRUD
--     cadastros.equipamentos CRUD | cadastros.localidades CRUD | administracao.lixeira ver+editar
--
--   Brenda Ciacci (154)
--     frete: igual à Andreia (painel, fretes, pedidos, conta-corrente, pagamentos, ajustes ver+criar)
--     combustivel: igual à Andreia (painel, tanques, entradas, saidas, transferencias CRUD;
--       esvaziamentos ver+criar; anomalias ver+editar; relatorios ver)
--     manutencao: nada
--     cadastros.equipamentos CRUD | cadastros.localidades CRUD | administracao.lixeira ver+editar
--
--   Marvim Almeida (114)
--     frete.fretes ver+criar+editar
--     combustivel.painel ver | .tanques/.entradas/.saidas/.transferencias ver+criar+editar
--     combustivel.esvaziamentos ver+criar | .relatorios ver
--     manutencao.painel ver | .servicos CRUD | .almoxarifado ver+criar+editar | .tipos-oleo CRUD
--     cadastros.equipamentos CRUD | cadastros.localidades ver+criar | administracao.lixeira ver
--
--   Yara Nylla (66)
--     frete.fretes CRUD | frete.pedidos-material CRUD | frete.conta-corrente ver
--     frete.pagamentos CRUD | frete.ajustes ver+criar
--     combustivel.painel ver | .tanques/.entradas/.saidas/.transferencias CRUD
--     combustivel.esvaziamentos ver+criar | .anomalias ver+editar | .relatorios ver
--     manutencao.medicoes ver+criar | manutencao.servicos criar (sem ver)
--     cadastros.equipamentos ver | administracao.lixeira ver+editar
--
--   Bruno Souza (58)
--     frete.fretes CRUD
--     combustivel.painel ver | .entradas/.saidas/.transferencias CRUD | .tanques ver+criar+editar
--     combustivel.esvaziamentos ver+criar | .anomalias ver | .relatorios ver
--     cadastros.equipamentos ver
--
--   Racenilton (1: só ver_frete)
--     frete.fretes ver
-- -----------------------------------------------------------------------------


-- =============================================================================
-- 4. MATRIZ PROPOSTA POR USUÁRIO DO ERP
--   = matriz da seção 3  MENOS  o que a pessoa já tem em usuario_permissoes do ERP
--                        MENOS  os 4 Admins ativos (recebem tudo pela migration da fase).
--
--   Consulta do que cada um tem HOJE no ERP nos recursos que este de-para toca.
--   Rodar contra o DESTINO (vsesgvqjgqpapoxhnbqx). Só leitura.
-- =============================================================================
select u.nome, u.email, u.ativo, p.nome as perfil, up.recurso,
       string_agg(up.acao, '+' order by array_position(
         array['ver','criar','editar','excluir','aprovar','desaprovar'], up.acao)) as acoes
from public.usuarios u
left join public.perfis p on p.id = u.perfil_id
left join public.usuario_permissoes up
       on up.usuario_id = u.id
      and (up.recurso like 'frete.%' or up.recurso like 'combustivel.%'
           or up.recurso like 'manutencao.%'
           or up.recurso in ('cadastros.equipamentos', 'cadastros.localidades',
                             'administracao.lixeira'))
where u.excluido_em is null
group by u.nome, u.email, u.ativo, p.nome, up.recurso
order by u.nome, up.recurso;

-- -----------------------------------------------------------------------------
-- RESULTADO NO ERP EM 22/09/2026
--   Usuários: Andreia Alencar (Compras), Brenda Ciacci (RH), Dora Silva (Financeiro),
--   Marvin Almeida (Compras), e os Admins Tiago, Emanuel, James Cameli, Lorenzo Bagnolo.
--   Nenhum usuário tem frete.*, combustivel.* ou manutencao.* (os recursos ainda não existem).
--   cadastros.localidades ver+criar+editar+excluir: só os 4 Admins (já aplicado no banco vivo
--   quando esta consulta foi rodada; na primeira leitura do dia ainda não havia ninguém).
--   administracao.lixeira ver+editar: só os 4 Admins.
--   cadastros.equipamentos ver+criar+editar+excluir: Andreia, Brenda, Dora, Marvin e os Admins.
--
-- Casamento de pessoa (por nome, plano 4.3.3):
--   Tiago de Melo Cameli = Tiago de Melo Cameli   -> Admin, fora
--   Emanuel de Melo Cameli = Emanuel de Melo Cameli -> Admin, fora
--   James Castro Cameli = James Cameli            -> Admin, fora
--   (Lorenzo Bagnolo não existe na origem)        -> Admin, fora
--   Andreia Alencar Silva = Andreia Alencar
--   Brenda Ciacci = Brenda Ciacci
--   Marvim Almeida = Marvin Almeida
--   Yara Nylla, Bruno Souza, Racenilton           -> não existem no ERP (convite pendente)
--   Dora Silva                                    -> não existe na origem, nada a propor
--
-- PROPOSTA (linhas a ADICIONAR; nada sai de ninguém)
--   [L] = linha de administracao.lixeira: SEGURAR até a lixeira conferir o recurso de origem
--         (achado B do cabeçalho). Sem isso a pessoa vê e restaura o que é de Financeiro e RH.
--
--   Andreia Alencar  (já tem cadastros.equipamentos CRUD: nada a adicionar ali)
--     frete.painel ver
--     frete.fretes ver, criar, editar, excluir
--     frete.pedidos-material ver, criar, editar, excluir
--     frete.conta-corrente ver
--     frete.pagamentos ver, criar, editar, excluir
--     frete.ajustes ver, criar
--     combustivel.painel ver
--     combustivel.tanques ver, criar, editar, excluir
--     combustivel.entradas ver, criar, editar, excluir
--     combustivel.saidas ver, criar, editar, excluir
--     combustivel.transferencias ver, criar, editar, excluir
--     combustivel.esvaziamentos ver, criar
--     combustivel.anomalias ver, editar
--     combustivel.relatorios ver
--     manutencao.painel ver
--     manutencao.servicos ver, criar, editar, excluir
--     manutencao.almoxarifado ver, criar, editar
--     manutencao.tipos-oleo ver, criar, editar, excluir
--     cadastros.localidades ver, criar, editar, excluir
--     [L] administracao.lixeira ver, editar
--     = 54 linhas (+2 da lixeira)
--
--   Brenda Ciacci  (já tem cadastros.equipamentos CRUD)
--     frete.*: igual à Andreia (painel ver; fretes, pedidos-material, pagamentos CRUD;
--              conta-corrente ver; ajustes ver, criar)
--     combustivel.*: igual à Andreia (painel ver; tanques, entradas, saidas, transferencias CRUD;
--              esvaziamentos ver, criar; anomalias ver, editar; relatorios ver)
--     cadastros.localidades ver, criar, editar, excluir
--     [L] administracao.lixeira ver, editar
--     = 42 linhas (+2 da lixeira)
--
--   Marvin Almeida  (já tem cadastros.equipamentos CRUD)
--     frete.fretes ver, criar, editar
--     combustivel.painel ver
--     combustivel.tanques ver, criar, editar
--     combustivel.entradas ver, criar, editar
--     combustivel.saidas ver, criar, editar
--     combustivel.transferencias ver, criar, editar
--     combustivel.esvaziamentos ver, criar
--     combustivel.relatorios ver
--     manutencao.painel ver
--     manutencao.servicos ver, criar, editar, excluir
--     manutencao.almoxarifado ver, criar, editar
--     manutencao.tipos-oleo ver, criar, editar, excluir
--     cadastros.localidades ver, criar
--     [L] administracao.lixeira ver
--     = 33 linhas (+1 da lixeira)
--
--   Yara Nylla  (NÃO existe no ERP; pronta para quando o convite for aceito)
--     frete.fretes ver, criar, editar, excluir
--     frete.pedidos-material ver, criar, editar, excluir
--     frete.conta-corrente ver
--     frete.pagamentos ver, criar, editar, excluir
--     frete.ajustes ver, criar
--     combustivel.painel ver
--     combustivel.tanques ver, criar, editar, excluir
--     combustivel.entradas ver, criar, editar, excluir
--     combustivel.saidas ver, criar, editar, excluir
--     combustivel.transferencias ver, criar, editar, excluir
--     combustivel.esvaziamentos ver, criar
--     combustivel.anomalias ver, editar
--     combustivel.relatorios ver
--     manutencao.medicoes ver, criar
--     manutencao.servicos criar          (sem ver: achado D)
--     cadastros.equipamentos ver
--     [L] administracao.lixeira ver, editar
--     = 41 linhas (+2 da lixeira)
--
--   Bruno Souza  (NÃO existe no ERP; pronta para o convite)
--     frete.fretes ver, criar, editar, excluir
--     combustivel.painel ver
--     combustivel.tanques ver, criar, editar
--     combustivel.entradas ver, criar, editar, excluir
--     combustivel.saidas ver, criar, editar, excluir
--     combustivel.transferencias ver, criar, editar, excluir
--     combustivel.esvaziamentos ver, criar
--     combustivel.anomalias ver
--     combustivel.relatorios ver
--     cadastros.equipamentos ver
--     = 25 linhas
--
--   Racenilton  (NÃO existe no ERP; pronta para o convite)
--     frete.fretes ver
--     = 1 linha
--     (na origem ele só tem ver_frete, sem nenhuma aba_frete_*: hoje não vê aba nenhuma.)
-- -----------------------------------------------------------------------------


-- =============================================================================
-- 5. PERFIS-MODELO
--   Só para quem entrar depois (plano 4.3.4). aplicar_perfil substitui a matriz: nunca
--   aplicar em quem já tem acesso.
--
--   SUGESTÃO (o Tiago decide) - perfis novos
--   "Frete"
--     frete.painel ver
--     frete.fretes ver, criar, editar, excluir
--     frete.pedidos-material ver, criar, editar, excluir
--     frete.conta-corrente ver
--     frete.pagamentos ver, criar, editar, excluir
--     frete.ajustes ver, criar                 (aprovar/desaprovar fica com quem aprova)
--     frete.anomalias ver, editar
--     cadastros.localidades ver, criar, editar
--   "Combustível"
--     combustivel.painel ver
--     combustivel.tanques ver
--     combustivel.entradas ver, criar, editar, excluir
--     combustivel.saidas ver, criar, editar, excluir
--     combustivel.transferencias ver, criar, editar, excluir
--     combustivel.esvaziamentos ver, criar
--     combustivel.anomalias ver, editar
--     combustivel.relatorios ver
--     cadastros.equipamentos ver
--   "Manutenção"
--     manutencao.painel ver
--     manutencao.servicos ver, criar, editar, excluir
--     manutencao.almoxarifado ver, criar, editar
--     manutencao.medicoes ver, criar, editar
--     manutencao.tipos-oleo ver, criar, editar
--     cadastros.equipamentos ver, editar       (status e etiqueta QR, plano 4.1)
--
--   PERFIL EXISTENTE "Apontador" (plano 4.3.4)
--     Hoje (consulta abaixo): rh.apontamentos ver, criar, editar; 0 usuários.
--     Ganha: combustivel.saidas ver, criar
--            manutencao.medicoes ver, criar
--     Como tem 0 usuários, mexer no perfil não tira nada de ninguém.
-- =============================================================================
select p.nome as perfil, p.descricao,
       (select count(*) from public.usuarios u where u.perfil_id = p.id) as usuarios,
       pp.recurso, pp.acao
from public.perfis p
left join public.perfil_permissoes pp on pp.perfil_id = p.id
where p.nome in ('Apontador', 'Frete', 'Combustível', 'Manutenção')
order by p.nome, pp.recurso, pp.acao;
-- Resultado no ERP em 22/09/2026: só existe "Apontador" (0 usuários) com
-- rh.apontamentos ver, criar, editar. "Frete", "Combustível" e "Manutenção" não existem.
