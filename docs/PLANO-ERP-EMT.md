# PLANO MESTRE: ERP-EMT

Sistema de gestão integrada da EMT Construtora. Projeto novo, do zero, sem nenhum vínculo de código ou dados com sistemas anteriores.

Stack: Next.js + Supabase + Vercel + GitHub. Construção via Claude Code.

---

## 1. Objetivo

Controle total das operações da EMT Construtora, do setor de compras à engenharia, com rastreabilidade ponta a ponta e informação gerencial confiável para decisão. Substituir totalmente o Mais Controle ERP ao final da transição.

Princípio central: **todo real gasto ou recebido tem origem, destino e responsável rastreáveis**. Nenhum custo existe sem centro de custo. Nenhuma aprovação existe sem registro de quem e quando.

## 2. Decisões registradas (especificação acordada)

| # | Tema | Decisão |
|---|------|---------|
| 1 | Escopo | Substituir totalmente o Mais Controle (fiscal entra na fase final da transição) |
| 2 | Empresas | Single-tenant: somente EMT Construtora |
| 3 | Usuários | 20 a 30 usuários. Todos com acesso pelo celular (versão reduzida). Desktop é a versão completa |
| 4 | Offline | Não é necessário. Online apenas |
| 5 | Permissões | Por usuário, por aba de módulo, com ações: ver, criar (lançar), editar, excluir, aprovar, desaprovar. Abas sensíveis podem ser ocultadas por usuário |
| 6 | Login | Todos os usuários têm email. Auth por email/senha com convite |
| 7 | Centro de custo | Hierarquia Obra > Etapa > Item. Escritório Central é centro de custo próprio. Manutenção é centro de custo próprio com cada equipamento como etapa |
| 8 | Aprovação compras | Quem tem a permissão de aprovar no recurso. Sem alçada por valor na v1 (design preparado para receber alçadas depois) |
| 9 | Cotação | Mínimo 1 fornecedor, recomendado mais de 1. Não bloqueia |
| 10 | Aprovação pagamento | Quem tem a permissão de aprovar em financeiro.pagamentos |
| 11 | Bancos | Caixa, Banco do Brasil e Sicredi. Conciliação por importação de OFX |
| 12 | Relatórios financeiros | Conjunto completo de saúde financeira: fluxo de caixa realizado e projetado, DRE gerencial, aging a pagar e a receber, posição bancária, custo por centro de custo, extrato por fornecedor e por cliente |
| 13 | Folha | Folha gerencial dentro do ERP com exportação para o contador fechar a oficial. Sem eSocial próprio |
| 14 | RH | Completo: mais de 50 CLT + diaristas, ponto, férias, EPI, ASO e documentos com vencimento, ocorrências, adiantamentos. Banco de horas como recurso opcional configurável |
| 15 | Boletim de medição | Controle interno, com exportação em PDF e Excel |
| 16 | Faturamento | Medição aprovada gera fatura automática no contas a receber. Reajuste é inserido manualmente no fechamento de cada medição (muda mensalmente) |
| 17 | Estoque | Completo: depósitos centrais e de obra, almoxarifado da mecânica com saída obrigatória via Ordem de Serviço, alertas de estoque mínimo editáveis por depósito dentro do app |
| 18 | Unidades | Cada insumo é controlado na unidade em que foi cadastrado (CAP em ton se cadastrado em ton, etc.). Sem conversão automática na v1 |
| 19 | Referência visual | Sienge (densidade funcional de ERP de construção) + Notion (limpeza, clareza, hierarquia) |
| 20 | Ordem | Fundação > Cadastros > Compras > Financeiro > Estoque e Combustível > Manutenção > Medição > RH > **Gestão (BI)**, com fiscal encerrando a transição |

Decisão adicional: como nada migra de sistemas antigos, **toda tela de cadastro nasce com importação em massa via planilha** (modelo padrão para download, validação linha a linha, relatório de erros antes de confirmar).

---

## 3. Arquitetura técnica

### Stack

- **Frontend/Backend**: Next.js 15 (App Router) + TypeScript strict. Server Components para leitura, Server Actions para mutação.
- **Banco e Auth**: Supabase (Postgres 17, Auth por email com convite, Storage para anexos, RLS em 100% das tabelas).
- **UI**: Tailwind CSS v4 + shadcn/ui como base de componentes + design system EMT por cima (seção 7). Ícones lucide-react.
- **Dados e formulários**: TanStack Table (tabelas), React Hook Form + Zod (validação compartilhada client/server), date-fns, Recharts (módulo Gestão).
- **Exportações**: exceljs (Excel), pdfmake ou @react-pdf/renderer (PDF de boletins e relatórios).
- **Infra**: GitHub (repo `erp-emt`), Vercel (deploy + preview por PR), GitHub Actions (typecheck, lint, build, testes), Supabase CLI com migrations versionadas no repo.
- **Testes**: Vitest (unidade das regras de negócio) + Playwright (smoke dos fluxos críticos: pedido até pagamento, medição até fatura).

### Regras de engenharia inegociáveis

1. **RLS sempre ativo**. Nenhuma tabela sem política. Service role jamais no client.
2. **Dinheiro é NUMERIC(14,2)**, nunca float. Quantidades NUMERIC(14,3). Formatação BRL com números tabulares.
3. **Timezone America/Rio_Branco** em toda exibição. Banco em timestamptz UTC.
4. **Migrations versionadas** no repo, aplicadas pelo Supabase CLI. Proibido alterar schema pelo dashboard.
5. **Auditoria universal**: trigger de audit_log em toda tabela transacional (quem, quando, o quê, valor anterior e novo).
6. **Soft delete** em registros transacionais (excluído vai para lixeira com motivo, restaurável por quem tem permissão).
7. **Status machine padrão** (seção 4.3) para tudo que tem aprovação.

---

## 4. Conceitos transversais (a cola do sistema)

### 4.1 Centro de custo

Tabela única `centros_custo` auto-referenciada em 3 níveis:

```
Nível 1: CENTRO   tipo: obra | escritorio | manutencao
Nível 2: ETAPA    (no centro Manutenção, cada equipamento é uma etapa, criada automaticamente ao cadastrar o equipamento)
Nível 3: ITEM
```

- Todo lançamento de custo (consumo de estoque, lançamento financeiro, folha, OS) aponta para um nó `centro_custo_id`, preferencialmente o nível mais profundo disponível.
- Relatórios agregam pela árvore: item soma na etapa, etapa soma no centro.
- Materiais que entram em depósito ficam como **estoque (ativo), sem custo em obra**. O custo só cai no centro de custo **no consumo** (saída do depósito). Compra com entrega direta na frente de serviço consome direto no item.
- Campo opcional `orcamento` por nó habilita análise orçado x realizado no módulo Gestão.

### 4.2 Permissões

- **Recurso = aba de módulo**, registrado em catálogo tipado no código (ex.: `compras.pedidos`, `compras.ordens`, `financeiro.lancamentos`, `financeiro.pagamentos`, `rh.folha`, `gestao.painel`).
- **Ações**: `ver`, `criar`, `editar`, `excluir`, `aprovar`, `desaprovar`.
- **Perfis** funcionam como templates (Admin, Compras, Financeiro, Almoxarife, Mecânico, Apontador, RH, Engenharia, Gestor). Aplicar perfil preenche a matriz do usuário; ajustes individuais por usuário prevalecem.
- Tela de administração: matriz usuário x recurso x ação com toggles, busca e aplicação de perfil em massa.
- Enforcement em 3 camadas: RLS no Postgres via função `tem_permissao(recurso, acao)`, checagem nas Server Actions, e UI que esconde abas e botões sem permissão. A UI esconder nunca substitui o banco bloquear.

### 4.3 Status machine padrão de aprovação

```
rascunho -> pendente_aprovacao -> aprovado -> [efeito do módulo: recebido | pago | faturado | executado]
                              \-> rejeitado (com motivo)
qualquer estado pré-efeito -> cancelado (com motivo)
```

- **Desaprovar**: volta `aprovado` para `pendente_aprovacao`, exige motivo, registra na auditoria, e **só é possível se não houver efeito posterior** (não se desaprova OC já recebida nem lançamento já pago; primeiro estorna o efeito, com permissão própria).
- **Editar aprovado é proibido**: desaprovar primeiro, editar, reaprovar. Histórico íntegro.
- Toda transição grava: usuário, data/hora, motivo quando aplicável.

### 4.4 Rastreabilidade ponta a ponta

Cadeia que o sistema garante e a interface mostra (componente "Trilha" em toda tela de detalhe):

```
Pedido -> Cotação -> Ordem de Compra -> Recebimento -> Entrada em depósito -> Saída/Consumo -> Centro de custo
                                     \-> Lançamento financeiro -> Aprovação -> Pagamento -> Conciliação OFX
Medição -> Aprovação -> Fatura -> Recebimento -> Conciliação OFX
Apontamento/Ponto -> Folha gerencial -> Custo por centro de custo
OS de manutenção -> Peças (almoxarifado) + Mão de obra + Terceiros -> Centro de custo Manutenção > Equipamento
```

### 4.5 Anexos e importação

- Anexos (NF, comprovantes, fotos, laudos) no Supabase Storage, vinculados ao registro, com política de acesso espelhando a permissão da aba.
- Importação por planilha em todo cadastro: download do modelo, upload, validação linha a linha com prévia de erros, confirmação. Log de importação auditado.

---

## 5. Módulos e abas

A aba é a unidade de permissão. Lista de partida (o catálogo cresce com o projeto):

### 5.1 Cadastros
Abas: Obras, Centros de Custo (árvore com etapas e itens), Clientes, Fornecedores, Insumos (materiais, peças, óleos, combustíveis, betuminosos, serviços; unidade definida aqui), Equipamentos, Depósitos e Tanques, Colaboradores (dados básicos; o restante vive no RH), Unidades de Medida, Categorias.
- Equipamento cadastrado gera automaticamente sua etapa no centro de custo Manutenção.
- Depósitos têm tipo: central, obra, almoxarifado mecânica, tanque combustível, tanque betuminoso. Tanques são depósitos com insumo único.

### 5.2 Compras
Abas: Pedidos, Cotações, Ordens de Compra, Recebimentos, Painel de Compras.
- Pedido: itens (insumo, quantidade, CC destino, depósito destino opcional), justificativa, anexos. Aprovação por permissão.
- Cotação: a partir de pedido aprovado ou avulsa. 1+ fornecedores, mapa comparativo, seleção do vencedor com motivo quando não for o menor preço.
- OC: gerada de pedido/cotação ou direta. Condição de pagamento (à vista, parcelas, prazo). Aprovação por permissão. OC aprovada gera lançamento financeiro **previsto**.
- Recebimento: total ou parcial, confere NF (número, valor, anexo), dá entrada no depósito ou consumo direto no CC. Recebimento confirma o lançamento financeiro (vira **a pagar** com vencimentos reais).
- Divergência NF x OC acima de tolerância configurável trava e exige tratamento por quem tem permissão de editar.

### 5.3 Financeiro
Abas: Lançamentos, Aprovação de Pagamentos, Pagamentos, Contas a Receber, Contas Bancárias, Conciliação (OFX), Categorias (plano de contas gerencial), Relatórios.
- Lançamentos: automáticos (de OC, de fatura de medição, de folha, de diaristas, de terceiros em OS) e avulsos manuais. Todo lançamento tem categoria + rateio por centro de custo (1..n nós) + parcelas.
- Fluxo a pagar: lançado -> aprovado para pagamento -> pago (conta bancária, data, comprovante anexo).
- Contas a receber: faturas de medição + recebimentos avulsos; baixa com data e conta.
- Conciliação: importa OFX (Caixa, BB, Sicredi), matching automático por valor e data com tolerância, confirmação manual, transação sem par permite criar lançamento a partir dela. Saldo banco x saldo sistema sempre visível.
- Relatórios: fluxo de caixa realizado + projetado (por vencimentos), DRE gerencial mensal por categoria, aging a pagar/receber (vencido, 7, 15, 30, 60, 90), posição consolidada de contas, custo por centro de custo, extrato por fornecedor/cliente.

### 5.4 Estoque e Combustível
Abas: Posição de Estoque, Entradas, Saídas e Consumos, Transferências, Inventário e Ajustes, Tanques, Alertas.
- Movimentos sempre com depósito, insumo, quantidade na unidade do cadastro, documento de origem e responsável.
- Saída de consumo exige centro de custo destino. Saída do almoxarifado da mecânica exige OS.
- Custo médio móvel por insumo + depósito; o consumo lança o custo no CC pelo médio do depósito.
- Tanques: abastecimento de equipamento registra litros/quantidade, horímetro ou km, operador; medição de régua gera ajuste de inventário auditado. Tanques betuminosos (CAP, RR, imprimação) seguem a unidade do cadastro.
- Alertas: estoque mínimo editável por insumo + depósito na própria tela; painel de itens abaixo do mínimo.

### 5.5 Manutenção
Abas: Ordens de Serviço, Planos Preventivos, Checklists, Painel de Frota.
- OS corretiva ou preventiva: equipamento, problema, mecânicos com horas, peças (saída automática do almoxarifado), serviços de terceiros (gera lançamento financeiro), horímetro/km na abertura e no fechamento, fotos.
- Custo total da OS cai em Manutenção > Equipamento (etapa) automaticamente.
- Planos preventivos por tipo de equipamento: atividades com intervalo por horímetro, km ou tempo; leituras alimentam a previsão e geram OS programada.
- Checklist pré-uso no celular pelo operador; item reprovado pode abrir OS na hora.
- Painel de Frota: status de cada equipamento (operando, parado, em manutenção), custo acumulado, R$/hora.

### 5.6 Medição (dentro de Obras)
Abas: Planilha Contratual, Medições, Faturas Geradas.
- Planilha contratual por obra: itens com código (SICRO ou próprio), descrição, unidade, quantidade contratada, preço unitário. Importável por planilha.
- Medição do período: quantidades por item, memória de cálculo e anexos opcionais, colunas de acumulado anterior, atual, acumulado total e saldo contratual. Validação contra saldo.
- Fechamento: campo de **reajuste** (valor ou percentual, informado manualmente a cada medição).
- Aprovação interna -> gera **fatura automática** no contas a receber com competência e vencimento previsto.
- Exporta boletim em PDF e Excel.

### 5.7 RH
Abas: Colaboradores, Ponto e Apontamentos, Férias, Ausências e Ocorrências, EPI, Documentos e ASO, Adiantamentos, Diaristas, Folha Gerencial, Banco de Horas (ativável).
- Colaborador: dados completos, função, salário, vínculo (CLT, diarista, terceiro), obra/CC padrão.
- Ponto: apontamento diário por equipe feito pelo encarregado no celular, com aprovação do dia.
- Férias: períodos aquisitivos, programação, avisos de vencimento.
- EPI: entregas com termo; Documentos e ASO com data de vencimento e painel de alertas.
- Diaristas: registro de diárias/horas, fechamento gera pagamento no financeiro.
- Folha gerencial mensal: consolida ponto, adiantamentos, descontos, encargos estimados (percentuais configuráveis); custo alocado por centro de custo proporcional aos apontamentos; **exporta planilha para o contador fechar a folha oficial**. Sem eSocial próprio.
- Banco de horas: módulo opcional, ligado por configuração, com regras de compensação simples.

### 5.8 Gestão (BI) - o módulo vitrine
Abas: Painel da Empresa, Painel por Obra, Custos, Equipamentos, Alertas.
Tem que responder em segundos: **as obras estão dando lucro?**
- Por obra: valor contratual, medido acumulado e % de avanço, faturado x recebido, custo acumulado por grupo (material, combustível, folha, manutenção, serviços/frete), **margem bruta em R$ e %** (medido menos custo), curva mensal custo x faturamento x recebimento, custo por etapa e por item (orçado x realizado quando houver orçamento), ranking de insumos mais caros do mês.
- Empresa: caixa consolidado, a pagar e a receber 30/60/90, resultado gerencial mensal, custo do Escritório Central, evolução de margem por obra lado a lado.
- Equipamentos: custo total (manutenção + combustível) por equipamento, R$/hora, disponibilidade, top ofensores.
- Alertas inteligentes: margem de obra caindo X pontos, custo sem medição correspondente no período, estoque crítico, documento vencendo.
- **Drill-down completo**: todo número do painel abre a lista de lançamentos que o compõem, até o documento de origem. Rastreabilidade é a alma do módulo.

### 5.9 Administração
Abas: Usuários e Permissões (matriz), Perfis, Auditoria (consulta do audit_log), Lixeira, Configurações (tolerâncias, encargos estimados, banco de horas on/off, alertas).

---

## 6. Modelo de dados (visão de entidades)

Nomes em português, snake_case, sem acento. Principais entidades por grupo:

- **Identidade**: usuarios, perfis, perfil_permissoes, usuario_permissoes, audit_log, lixeira
- **Cadastros**: obras, centros_custo (auto-ref, 3 níveis), clientes, fornecedores, insumos, unidades_medida, categorias_insumo, equipamentos, equipamento_documentos, depositos, colaboradores
- **Compras**: pedidos, pedido_itens, cotacoes, cotacao_fornecedores, cotacao_itens, ordens_compra, oc_itens, recebimentos, recebimento_itens, anexos
- **Financeiro**: lancamentos, lancamento_parcelas, lancamento_rateios, pagamentos, faturas, recebimentos_financeiros, contas_bancarias, extratos_ofx, extrato_transacoes, conciliacoes, categorias_financeiras
- **Estoque**: estoque_movimentos (entrada, saida, transferencia, ajuste, num modelo único com tipo), estoque_saldos (materializado por insumo+depósito), estoque_minimos, abastecimentos (visão de movimento de tanque com horímetro/operador)
- **Manutenção**: ordens_servico, os_pecas, os_mao_obra, os_terceiros, os_transicoes, planos_preventivos, plano_atividades, equipamento_planos, leituras_equipamento (horímetro/km), checklists, checklist_perguntas, checklist_execucoes, checklist_respostas
- **Medição**: planilhas_contratuais, planilha_itens, medicoes, medicao_itens, medicao_anexos
- **RH**: rh_pontos, rh_apontamentos, rh_ferias, rh_ocorrencias, rh_epis, rh_documentos, rh_adiantamentos, rh_diarias, folhas, folha_itens, banco_horas_movimentos

DDL detalhado é produzido fase a fase pelo Claude Code, seguindo as regras do CLAUDE.md (RLS, auditoria, soft delete, NUMERIC).

---

## 7. Design system "EMT" (padrão único do app inteiro)

Direção: **a clareza do Notion com a densidade útil do Sienge**. Interface séria de trabalho, zero enfeite, hierarquia que se entende em um olhar.

### Identidade
- **Neutros (base Notion)**: fundo #FFFFFF, superfície/sidebar #F7F7F5, bordas #E8E6E1, texto #1F1F1F, texto secundário #6B6B6B.
- **Cor de marca: âmbar de sinalização rodoviária**. Ação primária #B45309 (legível sobre branco), acento #F59E0B.
- **Assinatura visual: "a Faixa"**: barra âmbar de 3px que marca o item ativo na sidebar, a aba ativa e a borda esquerda dos cards de KPI. É a faixa da pista. Em todo o app, sempre igual.
- **Status**: aprovado verde #15803D, pendente âmbar #B45309, rejeitado/vencido vermelho #B91C1C, rascunho/inativo cinza #6B7280. Badge sempre com texto, nunca só cor.

### Tipografia
- **Inter** para toda a UI, escala fixa: 24/18/15/13/12. Peso carrega a hierarquia, não tamanho gigante.
- **Mono (JetBrains Mono)** para códigos de documento (OC-2026-0001, placas, nº de NF).
- **Números tabulares obrigatórios** em toda coluna numérica e valor monetário. Dinheiro alinhado à direita, sempre R$ 1.234,56.

### Layout padrão (todas as telas seguem isto)
```
[Sidebar fixa: módulos]  [Topo: busca global + obra ativa + usuário]
                          [Título da tela + ações primárias]
                          [Abas do módulo (permissão filtra)]
                          [Barra de filtros persistentes]
                          [DataTable densa OU painel]
                          [Drawer lateral para criar/editar | página de detalhe com Trilha]
```
- Mobile: sidebar vira menu inferior com os módulos liberados; telas de campo (apontamento, checklist, abastecimento, pedido, aprovações) são desenhadas mobile-first; telas pesadas (conciliação, folha, planilha contratual) são desktop-only e avisam isso no celular.

### Componentes canônicos (construídos uma vez, usados em tudo)
AppShell, DataTable (ordenação, filtros, paginação server-side, export Excel, colunas configuráveis), FormDrawer, StatusBadge, ApprovalBar (aprovar/rejeitar/desaprovar com motivo), KPICard (com a Faixa), FilterBar, MoneyText, EmptyState (sempre com ação), ImportDialog (planilha), ConfirmDialog (exclusão/desaprovação exige motivo), Trilha (linha do tempo de auditoria e cadeia de documentos), TabNav.

Regra de ouro: **nenhuma tela inventa componente novo se um canônico resolve**. É isso que garante o padrão único que você exigiu.

---

## 8. Roadmap por fases

Cada fase = branch + PR + preview na Vercel + critério de pronto. Uma fase só começa com a anterior aprovada por você.

| Fase | Entrega | Critério de pronto |
|------|---------|--------------------|
| **0. Fundação** | Repo, CI, Supabase, Auth com convite, layout AppShell, design system com componentes canônicos, permissões (catálogo, matriz, RLS), auditoria, lixeira, framework de importação por planilha | Login funciona, admin cria usuário e configura matriz de permissões, aba some sem permissão de ver, audit_log gravando |
| **1. Cadastros** | Todas as abas de cadastro + árvore de centros de custo + importação em massa | Você importa por planilha obras, CC, insumos, equipamentos, fornecedores e colaboradores reais |
| **2. Compras** | Pedido > cotação > OC > recebimento, com aprovações e anexos | Fluxo completo rodando com pedido real, incluindo desaprovação com motivo |
| **3. Financeiro** | Lançamentos (de OC + avulsos), aprovação, pagamentos, contas a receber, contas bancárias, OFX e conciliação, relatórios | OC recebida vira a pagar sozinha; OFX dos 3 bancos importando; fluxo de caixa e DRE gerencial saindo corretos |
| **4. Estoque e Combustível** | Movimentos, saldos, custo médio, tanques, ajustes de inventário, alertas editáveis | Consumo lança custo no CC certo; abastecimento registra horímetro; alerta dispara abaixo do mínimo |
| **5. Manutenção** | OS, peças via almoxarifado, preventivas, checklists, painel de frota | OS fechada com custo total caindo em Manutenção > Equipamento; checklist reprovado abre OS |
| **6. Medição** | Planilha contratual, medições, reajuste, boletim PDF/Excel, fatura automática | Medição aprovada gera fatura no contas a receber; boletim exportado confere com a tela |
| **7. RH** | Colaboradores completo, ponto, férias, EPI, ASO, ocorrências, adiantamentos, diaristas, folha gerencial com export, banco de horas opcional | Folha do mês fecha, aloca custo por CC e exporta planilha pro contador |
| **8. Gestão (BI)** | Painéis empresa/obra/custos/equipamentos com drill-down até o documento | Você abre o painel e responde "essa obra está dando lucro?" em menos de 10 segundos, e cada número abre sua origem |
| **9. Fiscal e desligamento do Mais Controle** | Levantamento do que ainda vive no Mais Controle (emissão de NF, obrigações), decisão entre módulo próprio e integração com emissor, importação de XML de NF-e de entrada | Mais Controle desligado |

Ritmo realista com Claude Code trabalhando bem orientado: fases 0 e 1 são a base e merecem capricho extra; a partir da fase 2 o padrão estabelecido acelera tudo.

---

## 9. Operação do projeto com Claude Code

- **CLAUDE.md na raiz do repo** (entregue junto deste plano): contexto, regras e convenções que o Claude Code segue em toda sessão.
- Este plano vive em `docs/PLANO-ERP-EMT.md`. Decisões novas entram em `docs/decisoes.md` (registro de decisão com data, contexto e escolha).
- **Skills/plugins a usar durante a construção**: frontend-design (toda tela nova), engineering:architecture (decisões estruturais), engineering:code-review (antes de cada merge), engineering:testing-strategy (fluxos críticos), data:build-dashboard e data:data-visualization (módulo Gestão), supabase MCP (migrations e advisors de segurança/performance após cada mudança de schema).
- **Fluxo por fase**: abrir branch da fase > Claude Code implementa em blocos pequenos > preview na Vercel > você valida com dado real > code-review > merge. Nunca duas fases abertas ao mesmo tempo.
- Após cada migration: rodar advisors do Supabase (segurança e performance) e corrigir antes de seguir.

## 10. Riscos e como o plano os trata

| Risco | Tratamento |
|-------|-----------|
| Recadastro manual de tudo (decisão de não migrar nada) | Importação por planilha em todos os cadastros desde a fase 1 |
| Permissão furada expondo aba sensível | Enforcement triplo com RLS como camada final; teste automatizado de permissão por recurso |
| Conciliação OFX com formatos diferentes por banco | Parser por banco (Caixa, BB, Sicredi) com arquivos reais de teste antes de dar por pronto |
| Folha gerencial divergir do contador | Folha é gerencial e declarada como tal; export em formato combinado com o contador na fase 7 |
| Escopo do fiscal (fase 9) maior que o previsto | Levantamento do uso real do Mais Controle antes de decidir construir x integrar |
| Sistema antigo e novo confundirem o time | ERP-EMT tem identidade visual própria; comunicação clara de qual processo roda onde durante a transição |
