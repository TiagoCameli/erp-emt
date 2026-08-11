# Registro de decisões - ERP-EMT

Decisões estruturais tomadas durante a construção. Formato: data, contexto, decisão, consequência.

---

## 2026-06-11 - Next.js 16 em vez de 15

**Contexto:** O plano mestre cita Next.js 15 (era a versão estável quando o plano foi escrito). Ao iniciar o projeto, a versão estável corrente do create-next-app é a 16.2.x, com App Router idêntico e suporte ativo.

**Decisão:** Partir direto do Next.js 16.2.9. Evita migração futura e mantém o projeto na linha de suporte mais longa.

**Consequência:** Nenhuma mudança de arquitetura. Server Components, Server Actions e App Router seguem como no plano.

## 2026-06-11 - Projeto Supabase já criado pelo Tiago

**Contexto:** Projeto `erp-emt` (ref `vsesgvqjgqpapoxhnbqx`, região sa-east-1, Postgres 17) criado manualmente no dashboard em 11/06/2026, org EMT Construtora.

**Decisão:** Usar esse projeto como ambiente de produção da Fase 0. Migrations versionadas em `supabase/migrations/` e aplicadas via MCP/CLI, nunca pelo dashboard.

**Consequência:** O ref do projeto fica registrado em `supabase/config.toml` e nos env vars. Chave service role só em variável de ambiente do servidor.

## 2026-06-12 - Decisões da revisão adversarial da Fase 0

**Bootstrap do primeiro usuário como Admin.** O primeiro usuário criado em auth.users recebe a matriz completa do perfil Admin via trigger. Sem trava de identidade por decisão: sistema single-tenant, o projeto Supabase nasce vazio e o primeiro login é do dono. A janela de risco é zero na prática (o convite público não existe; só o service role cria usuários).

**Permissão administracao.usuarios editar equivale a root.** Quem edita a matriz de qualquer usuário consegue se dar qualquer permissão. É o desenho do sistema (matriz administrada por admins). Mitigação: a trava de auto-lockout impede remover a própria permissão de editar usuários, e toda mudança de matriz fica no audit_log com antes/depois.

**Desativar usuário = ativo false + ban na auth.** O RLS e o getUsuarioLogado cortam o acesso na request seguinte; o ban (876000h) impede login novo e renovação de sessão. Token de acesso já emitido vale por no máximo 1h, sempre filtrado pelo ativo nas policies.

**Template de email do convite.** O fluxo /auth/confirm aceita token_hash+type (template customizado, recomendado pela doc do @supabase/ssr) E code (template padrão do Supabase, PKCE). Com o template padrão funciona sem customização; quando o SMTP próprio for configurado, customizar o template de convite para {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite é o caminho mais robusto.

**Matriz e permissões de perfil em RPC transacional.** salvar_matriz_usuario e salvar_permissoes_perfil fazem delete+insert numa transação só no Postgres. O padrão de duas requests do PostgREST podia deixar o usuário sem permissão nenhuma se o insert falhasse.

**Numeração de documentos sem RPC direto.** proximo_numero_documento não é mais executável por authenticated via API. Os módulos das próximas fases chamam por dentro das próprias funções security definer.

## 2026-06-12 - Grants explícitos em toda migration

**Contexto:** As tabelas criadas pelas migrations da Fase 0 nasceram sem GRANT pro papel authenticated (o caminho de criação via management API não herdou os default privileges do projeto). Resultado: o Postgres negava todo acesso com "permission denied" antes mesmo do RLS avaliar, e o app mostrava "Conta desativada" pra qualquer usuário.

**Decisão:** Toda migration que cria tabela declara os grants explicitamente (migration 7 corrigiu as existentes). Só se concede o que as policies permitem: tabela sem policy de DELETE não recebe grant de DELETE. anon não recebe nada. Tabelas de acesso exclusivo por função (documento_sequencias) não recebem grant nenhum.

**Consequência:** Camada dupla: o grant define o teto, o RLS decide linha a linha. Verificado com simulação de JWT: usuário sem permissão não vê nenhuma linha e não muta nada; admin enxerga o que a matriz autoriza.

## 2026-06-18 - Escopo da Fase 2 (Compras)

**Adianta o financeiro (decisão do Tiago).** OC aprovada gera um lançamento financeiro PREVISTO; o recebimento confirma o lançamento (vira a_pagar com vencimento). A tabela `lancamentos` nasce na Fase 2 com a estrutura base do fluxo de compras (origem, fornecedor, valor, status previsto/a_pagar, centro de custo, vencimento). A Fase 3 (Financeiro) estende: parcelas, rateios por centro de custo, aprovação de pagamento, pagamento, conciliação OFX, relatórios. Na Fase 2 não há tela de Financeiro: o lançamento aparece na Trilha/detalhe da OC e do recebimento, e somado no Painel de Compras.

**Estoque NÃO é adiantado.** O recebimento registra o destino (depósito ou consumo direto no centro de custo) por item, mas o movimento de estoque (saldos, custo médio móvel) fica para a Fase 4, que conecta o recebimento ao estoque.

**Anexos via Supabase Storage (decisão do Tiago).** Bucket privado `anexos`, tabela genérica `anexos` (tabela + registro_id + path + metadados). Políticas de Storage e RLS espelham a permissão da aba de origem (ex: anexo de recebimento segue compras.recebimentos). Primeira vez que o projeto usa Storage. NF em PDF/foto no recebimento, documentos no pedido e na cotação.

**Status machine de compras.** Segue o padrão (rascunho > pendente_aprovacao > aprovado > efeito). Efeito da OC é "recebido". Pedido aprovado alimenta cotação/OC. Aprovação por quem tem a permissão de aprovar no recurso, sem alçada por valor na v1. Cotação aceita 1+ fornecedor, não bloqueia. Divergência NF x OC usa a config `tolerancia_divergencia_nf_percentual` (já semeada na Fase 0).

## 2026-06-19 - Escopo e modelo da Fase 3 (Financeiro)

Decisões do Tiago: incluir conciliação OFX dos 3 bancos já nesta fase; conjunto completo de relatórios; construção via workflow multi-agente na fase inteira.

**Modelo de lançamento (estende a base da Fase 2).** `lancamentos` é o cabeçalho (fornecedor/cliente, categoria, descrição, valor total, tipo a_pagar/a_receber, origem, competência). Toda movimentação financeira tem:
- `lancamento_parcelas`: 1..n parcelas, cada uma com vencimento, valor, status (pendente > aprovado > pago/recebido), data de pagamento, conta bancária e comprovante. Aprovação de pagamento e pagamento operam por PARCELA. Lançamentos da Fase 2 (de OC, valor único) ganham 1 parcela automática na migration.
- `lancamento_rateios`: distribuição do valor por centro de custo (1..n). O `centro_custo_id` direto do lançamento da Fase 2 é migrado para um rateio único; a tabela passa a ser a fonte de verdade do custo por CC.

**Categorias financeiras (plano de contas gerencial).** `categorias_financeiras` (nome, tipo receita/despesa, hierarquia simples por pai_id, ativo). Base da DRE gerencial por categoria.

**Contas a receber.** Reusa `lancamentos` com tipo a_receber e parcelas; a baixa é o recebimento (conta + data). Faturas de medição entram na Fase 6 e geram lançamento a_receber automático.

**Contas bancárias.** `contas_bancarias` (nome, banco caixa/bb/sicredi/outro, agência, conta, saldo inicial, ativo). Caixa, Banco do Brasil e Sicredi (decisão 11 do plano).

**Conciliação OFX.** `extratos_ofx` (conta, período, arquivo), `extrato_transacoes` (data, valor, memo, fitid, tipo, conciliada), `conciliacoes` (transação x parcela). Parser server-side dos campos OFX padrão (STMTTRN/DTPOSTED/TRNAMT/FITID/MEMO), tolerante às variações de Caixa, BB e Sicredi. Matching automático por valor + data com tolerância, confirmação manual, transação sem par permite criar lançamento.

**Pagamento por função transacional.** fn_aprovar_parcela, fn_pagar_parcela, fn_baixar_recebimento (security definer, checagem de permissão, transição de status, anexo de comprovante). Editar lançamento aprovado/pago é proibido (desaprova primeiro).

**RLS de lancamentos.** A policy de select passa a aceitar financeiro.lancamentos ver OU o vínculo de origem (compras.ordens ver, para o bloco financeiro da OC continuar visível).

## 2026-06-19 - Escopo e modelo da Fase 4 (Estoque e Combustível)

Decisões do Tiago: recebimento dá entrada no estoque automaticamente; método de custo PEPS; construção via workflow.

**Custo PEPS (primeiro que entra, primeiro que sai).** O estoque NÃO usa custo médio. Cada entrada cria uma CAMADA (`estoque_camadas`: insumo, depósito, quantidade_inicial, quantidade_restante, custo_unitario, data, sequência). A saída/consumo consome as camadas mais antigas primeiro, e o custo da saída é a soma de (quantidade consumida de cada camada x custo daquela camada). O saldo e o valor do estoque saem da soma das camadas com quantidade_restante > 0.

**Modelo.** `estoque_movimentos` (tipo entrada/saida/consumo/transferencia/ajuste, depósito, insumo, quantidade, custo, centro de custo no consumo, origem+origem_id, responsável); `estoque_camadas` (PEPS); `estoque_saldos` (materializado insumo+depósito: quantidade, valor); `estoque_minimos` (mínimo por insumo+depósito, alertas); `abastecimentos` (saída de tanque para equipamento, com horímetro/km/operador). Funções definer: entrada, saída (consome FIFO), transferência (saída origem + entrada destino com mesmo custo), ajuste de inventário, abastecimento.

**Recebimento → entrada de estoque (automático).** `fn_registrar_recebimento` (Fase 2) passa a gerar a entrada no estoque para os itens com depósito de destino, com o custo unitário do recebimento.

**Custo gerencial por centro de custo (tensão a resolver na Fase 8 Gestão).** O plano (4.1) diz: material que entra em depósito é ATIVO (sem custo em obra); o custo só cai no CC no CONSUMO. Mas as Fases 2/3 já rateiam a COMPRA por CC no lançamento. Para não criar dupla contagem, NÃO altero a Fase 3 agora: o consumo de estoque registra custo + CC no movimento (visão de custo por consumo), e a reconciliação final (compra-como-caixa x consumo-como-custo) fica para o módulo Gestão (Fase 8). Registrado para decisão do Tiago.

**Plano dizia "custo médio móvel"; mudamos para PEPS.** Decisão do Tiago. PEPS rastreia o custo real de cada lote, melhor para combustível/betuminoso e auditoria.

**Correções da revisão adversarial da Fase 4.** (1) Saída/consumo trava as camadas com `for update` e checa o saldo após consumir: serializa saídas concorrentes do mesmo insumo+depósito e devolve "Saldo insuficiente" em vez de violar o CHECK cru. (2) Transferência passou a REPLICAR as camadas consumidas no destino com o mesmo custo unitário e a mesma data (PEPS puro), eliminando o drift de centavos do antigo `round(custo/qtd, 4)`; verificado em banco que o valor total do estoque se conserva. (3) Abastecimento agora EXIGE centro de custo do equipamento (igual à saída manual): sem CC não lança, porque o objetivo é apurar o diesel por equipamento. (4) A entrada vinda de transferência some da aba Entradas (aparece só em Transferências). De quebra, corrigido um validador de casas decimais (`ateCasas`) que era no-op (`Number.isInteger(Math.round())` é sempre verdadeiro); agora valida via `toFixed`.

## 2026-06-20 - Fase 5 (Manutenção)

Construção via workflow (subagentes paralelos). 4 abas: Ordens de serviço, Planos preventivos, Checklists, Painel de frota.

**Modelo da OS.** `ordens_servico` (status aberta > em_execucao > concluida, ou cancelada; numeração OS-AAAA-NNNN). Linhas: `os_pecas` (baixa do almoxarifado por PEPS via função, imutável), `os_mao_obra` (mecânico x horas x valor/hora, custo gerencial, sem caixa — folha fica no RH), `os_terceiros` (serviço externo). `os_transicoes` registra o histórico. Custo total = peças + mão de obra + terceiros, congelado na conclusão e caindo no centro de custo Manutenção > Equipamento (etapa criada no cadastro do equipamento).

**Peça baixa estoque na hora; terceiro vira financeiro na conclusão.** Adicionar peça consome o almoxarifado imediatamente (PEPS, custo no CC do equipamento). Os serviços de terceiro só viram lançamento a_pagar (origem 'os' + rateio no CC) quando a OS é concluída. Mão de obra é só custo gerencial (não gera caixa). Cancelar OS é bloqueado se já houver peça baixada (a baixa de estoque não é revertida; corrige-se por inventário).

**Preventivas.** `planos_preventivos` + `plano_atividades` (intervalo por horímetro/km/dias) atribuídos a equipamento (`equipamento_planos`, com base de cálculo). `leituras_equipamento` (de OS, checklist e manual) alimentam a previsão; a aba mostra o que está vencido e gera a OS preventiva, resetando a base. (Abastecimento ainda grava em `abastecimentos`, não em `leituras_equipamento` — folga conhecida para unificar depois.)

**Checklists.** Modelos com perguntas; execução mobile-first responde ok/nok/na por pergunta; item reprovado (nok) abre OS corretiva automática quando quem executa também tem permissão de abrir OS. Permissão 'criar' do recurso = executar; 'editar' = gerenciar o modelo.

**Correções da revisão adversarial da Fase 5.** (1) Mão de obra e terceiros só podem ser adicionados/removidos com a OS aberta ou em execução: guarda na RLS (insert/delete checam o status da OS) e na Server Action (erro amigável), evitando desincronizar o custo congelado e terceiro fantasma sem lançamento. (2) O lançamento do terceiro passou a criar `lancamento_rateios` no CC do equipamento, senão o custo sumia do relatório de custo por centro de custo (verificado em banco). (3) `fn_executar_checklist` valida que cada pergunta pertence ao checklist executado.

## 2026-06-21 - Fase 6 (Medição)

Construção via workflow (subagentes paralelos). 3 abas: Planilha contratual, Medições, Faturas geradas.

**Modelo.** `planilhas_contratuais` (uma por obra) + `planilha_itens` (código, descrição, unidade, quantidade contratada, preço). `medicoes` (período + reajuste, status rascunho > aprovada > cancelada; numeração MED-AAAA-NNNN) + `medicao_itens` (quantidade do período por item) + `medicao_anexos` (Storage). `faturas` (gerada na aprovação) espelha um lançamento a receber.

**Saldo contratual e validação.** O saldo de um item = quantidade contratada menos o acumulado das medições já aprovadas. A medição valida que o medido não passa do saldo, tanto na tela quanto na aprovação (regra dura). `medicao_itens` só é editável com a medição em rascunho (RLS).

**Aprovação gera fatura no contas a receber.** `fn_aprovar_medicao` calcula bruto (soma item x preço) + reajuste (percentual ou valor fixo, informado no fechamento) = total, cria a fatura e um lançamento `a_receber` (origem 'fatura') + parcela, com a competência e o vencimento. Faturas de medição decididas na Fase 3 ficaram para cá.

**Boletim em Excel** (exceljs). PDF ficou de fora (pdfmake não instalado) — folga conhecida.

**Correções da revisão adversarial da Fase 6.** (1) Desaprovar uma medição agora volta ela para RASCUNHO (não cancelada), revertendo a fatura e o a receber, pra poder corrigir e reaprovar (antes prendia o usuário). (2) `fn_aprovar_medicao` serializa por obra com advisory lock: duas aprovações concorrentes da mesma obra não furam o saldo contratual. (3) Triggers de integridade no banco garantem que a planilha pertence à obra da medição e que o item medido pertence à planilha (Server Action não era barreira suficiente). (4) Permissão de remover item da planilha alinhada entre action e RLS (ambas 'editar').

## 2026-06-21 - Fase 7 (RH) - espinha (PR #7)

Decisão do Tiago: RH (10 abas) construído em dois cortes. Espinha primeiro (onde está o valor de fechar a folha): Ponto e apontamentos, Adiantamentos, Diaristas, Folha gerencial. As abas de RH-admin/alerta (Férias, EPI, Documentos/ASO, Ocorrências, Banco de horas) ficam para o PR seguinte.

**Colaborador completou no RH.** O cadastro (Fase 1) ganhou `salario` e `valor_diaria` (ALTER em colaboradores). A aba Colaboradores rica fica no segundo corte; a espinha usa o cadastro existente.

**Modelo da espinha.** `rh_pontos` (dia por obra/equipe) + `rh_apontamentos` (horas por colaborador, só editável com o ponto aberto; aprovar o dia trava). `rh_adiantamentos` (descontado na folha; trava ao entrar numa folha). `rh_diarias` (diaristas; fechar gera um lançamento a_pagar + rateio no CC, origem 'diaria'). `folhas` + `folha_itens` (folha gerencial mensal).

**Folha é GERENCIAL, não oficial.** `fn_gerar_folha` consolida os CLT ativos: salário + horas extras dos apontamentos APROVADOS (só tipo 'normal') + encargos (percentual configurável). Estimativas declaradas: hora = salário/220, hora extra a 50% (1,5x). custo_total = salário + extras + encargos (custo da empresa), alocado no centro de custo da obra onde o colaborador mais apontou no mês; valor_liquido = salário + extras − adiantamentos. Exporta planilha Excel para o contador fechar a folha oficial. Não posta no financeiro nem faz eSocial.

**Correções da revisão adversarial da Fase 7.** (1) `fn_gerar_folha` reseta o centro de custo a cada colaborador: um CLT sem apontamentos herdava o CC do anterior (SELECT INTO com GROUP BY sem linha não zera a variável), alocando custo na obra errada. (2) `fn_fechar_diarias` trava as diárias com `for update` (fechamentos concorrentes geravam pagamento dobrado) e filtra pela competência (campo), casando com o painel. (3) A folha soma só horas de dias tipo 'normal' (falta/folga/atestado não pagam extra). Folga conhecida: adiantamento de diarista não entra na folha (diarista é pago por diária).

## 2026-06-21 - Fase 7 (RH) - 2o corte (PR #8)

Completa o RH com as abas de RH-admin/alerta (CRUD, sem funções transacionais): Férias, Ausências e ocorrências, EPI, Documentos e ASO, Banco de horas. Tabelas: `rh_ferias`, `rh_ocorrencias`, `rh_epis`, `rh_documentos`, `banco_horas_movimentos`. RLS + grants + auditoria; CRUD direto por recurso.

**Alertas calculados na leitura (sem regra fiscal inventada).** Férias: limite de gozo = fim do período aquisitivo + 12 meses; vencida/a vencer destacadas. Documentos/ASO: vencido (data_vencimento < hoje) e a vencer (<= 30 dias), com KPIs no topo. Banco de horas: saldo = créditos − débitos por colaborador.

**Folgas conhecidas:** banco de horas entregue como aba normal (o plano previa "ativável por configuração" — o gate por flag ficou de fora); upload de arquivo de documento/EPI não implementado (só metadados + vencimento).

## 2026-06-21 - Fase 8 (Gestão / BI) - a vitrine

Módulo SOMENTE LEITURA: agrega os dados dos outros módulos, sem tabelas novas (só semeia permissões). 5 painéis: Painel da empresa, Painel por obra, Custos, Equipamentos, Alertas. Recharts pros gráficos.

**Modelo de custo unificado, base CONSUMO (resolve a tensão da Fase 4).** O custo gerencial por obra/CC soma: consumo de estoque (material/combustível/peças) + folha (folha_itens) + lançamentos a pagar rateados de origem 'os'/'diaria'/'manual'. A COMPRA (lançamento origem 'oc') é caixa/ativo e NÃO entra como custo, e a receita ('fatura') também não, evitando dupla contagem. Verificado em banco: consumo 800 + folha 500 + terceiro 300 = custo 1600, com a OC de 1000 fora. Margem da obra = medido (medições aprovadas) − custo. CC->obra resolvido subindo a árvore de centros de custo até a raiz.

**BI respeita o RLS (sem bypass).** Os painéis leem as tabelas com a sessão do usuário, então cada um vê no painel o que pode ver nos módulos. Admin vê tudo; o perfil Gestor recebe 'ver' nos módulos via seeds. Escolha deliberada: BI que respeita permissão não vaza dado por agregação. Para um usuário ver o consolidado completo, o perfil precisa de 'ver' nos módulos de origem.

**Folgas conhecidas:** custo de equipamento (manutenção + combustível) ainda NÃO é rateado pra obra (fica no painel de Equipamentos / CC de Manutenção); os grupos combustível/manutenção do painel por obra refletem só o que cai direto no CC da obra. os_mao_obra (mão de obra interna de OS) não entra no custo unificado (gerencial, fora de lançamento/folha/estoque). Drill-down dos painéis leva à lista do módulo de origem (ainda não abre a composição exata número a número). Alertas "inteligentes" do plano (margem caindo X pontos, custo sem medição no período) ficaram de fora; os alertas entregues são os concretos (estoque crítico, documentos/férias vencendo, faturas vencidas, OS abertas).

**Onboarding por senha provisória (sem email).** O cadastro de usuário não depende mais de SMTP: o admin cria o usuário e o sistema gera uma senha provisória, guardada em `usuario_senha_provisoria` (texto puro) e visível SÓ para admin de `administracao.usuarios` via RLS. A flag `senha_temporaria` no metadata força a troca no 1º acesso (trava no layout do app); ao definir a própria senha, a linha da provisória é apagada. O admin pode redefinir a senha de qualquer usuário a qualquer momento (gera nova provisória). A senha DEFINITIVA nunca é armazenada nem exibida: é impossível (hash) e inseguro (impersonação por admin, vazamento expõe a senha real, reúso). **Exceção à auditoria universal:** `usuario_senha_provisoria` não tem trigger `fn_audit` para nunca gravar o valor da senha em `audit_log`; o evento de gerar/redefinir é auditado na ação sobre o usuário, sem o valor.

## 2026-07-29 - Pagamento por forma de pagamento (a nota fiscal para de travar dinheiro)

**A regra anterior estava errada para o negócio.** O lançamento de OC nascia `previsto` e só virava pagável no recebimento da nota fiscal (`fn_registrar_recebimento`). Na EMT isso não fecha: fornecedor de peça, pneu e material de fora do Acre cobra antes de entregar. Tiago definiu a regra nova: lançamento completo vai direto para a aprovação de pagamento, **exceto** dinheiro e cartão de crédito.

**Quem decide o caminho é o TIPO da forma de pagamento, nunca o nome.** `formas_pagamento.tipo` (`bancario`, `dinheiro`, `cartao_credito`, `cheque`) é o classificador; o catálogo de nomes é livre (o usuário cria "PIX", "Cartão de Crédito") e amarrar regra em texto digitado quebra no primeiro sinônimo. A regra vive em UM lugar, `fn_aplicar_regra_pagamento(lancamento)`, chamada por `fn_aprovar_ordem_compra`, `fn_definir_parcelas_lancamento`, `fn_salvar_lancamento` e pelo recebimento:

| Tipo | Lançamento | Parcelas | Onde aparece |
|---|---|---|---|
| bancario, cheque | `a_pagar` | `pendente` | Fila de aprovação |
| dinheiro | `a_pagar` | `aprovado` | Direto em Pagamentos, sem fila |
| cartao_credito | `pago` | `pago`, sem conta bancária | Histórico de pagas |

`lancamentos.forma_pagamento_id` é novo: a forma só existia na OC, e sem ela no lançamento o financeiro não teria como aplicar a regra (e lançamento manual ficaria sem regra nenhuma). Herdada da OC na aprovação, escolhida no formulário manual.

**Cartão de crédito não debita conta bancária** (`conta_bancaria_id` nulo, `data_pagamento` = emissão): o dinheiro sai na fatura, que este ERP ainda não controla. Debitar uma conta que não pagou nada falsificaria o saldo. Consequência aceita: compra em 3x no cartão aparece inteira no mês da compra.

**`previsto` mudou de significado.** Era "esperando nota fiscal"; agora é "incompleto ou previsão" (sem parcela, ou parcelas que não somam o valor). A trava de `previsto` na fila e em `fn_aprovar_parcela` continua de pé — é o que garante que ninguém aprova pagamento de lançamento que não fecha.

**A nota fiscal virou documento e controle de divergência.** `fn_registrar_recebimento` parou de exigir lançamento `previsto` (dinheiro e cartão já pagaram quando a nota chega, e a busca por status derrubava o recebimento), só promove status quando ainda é previsto, e **nunca reescreve parcela aprovada ou paga**: sem parcela em aberto para absorver a diferença, a divergência é gravada em `recebimentos.divergencia_valor`. Dinheiro que já saiu não se reescreve, se explica. OC quitada que recebe a nota fecha em `pago`.

**Cadastro de formas de pagamento (aba nova, `cadastros.formas-pagamento`).** O tipo precisava de um lugar mantido pelo dono do processo — sem isso, corrigir um tipo errado exigiria migration. Escrita por `fn_salvar_forma_pagamento` (security definer, sem grant direto). Sem 'excluir': forma usada em documento é desativada, não apagada. Forma criada na hora pelo combobox da OC nasce `bancario` de propósito: o default seguro é PASSAR pela aprovação.

**Prova:** `supabase/provas/pagamento_por_forma.sql`, 25 asserções contra o banco vivo (3 caminhos, lançamento incompleto, definir parcelas aplicando a regra, forma ausente caindo em bancário, recebimento de OC já quitada, divergência registrada sem reescrever parcela paga).

**Pendência do dono, não do código:** todas as contas bancárias estão com saldo inicial R$ 0,00 e `fn_pagar_parcela` recusa pagamento que deixe saldo negativo. Sem lançar o saldo inicial, nenhum pagamento passa.

## 2026-07-29 - Três datas com papéis distintos na OC e no lançamento (PR #32)

**O problema.** Um campo `data_emissao` fazia dois papéis conflitantes: na OC era data digitada pelo usuário (o fato), no lançamento era `default now()` que ninguém escrevia (data de sistema). E `competencia` era data completa, opcional, preenchida com "hoje" na aprovação da OC, o que jogava o custo no mês da aprovação em vez do mês em que a obra usou o material.

**O modelo agora.** `created_at` é "Criada em" (data de sistema, imutável por trigger `fn_fixa_created_at`, que ignora UPDATE); `data_compra` é o fato (editável, sem futuro, aviso acima de 90 dias); `mes_competencia` é o mês em que o custo entra, DATE normalizado no dia 1 com check `extract(day) = 1`. **Não criei `data_criacao`:** `created_at` já existia e já era auditado, e uma segunda fonte de verdade para a mesma coisa só cria divergência.

**Migração sem cópia de dado.** `ordens_compra.data_emissao` foi RENOMEADA para `data_compra` (o valor digitado continua lá, sem janela de inconsistência); `lancamentos.data_compra` nasceu herdando a data da OC de origem; `lancamentos.competencia` foi renomeada para `mes_competencia` e normalizada no dia 1; `lancamentos.data_emissao` saiu (era data de sistema disfarçada de campo de negócio, e o valor foi preservado em data_compra).

**O mês de referência é um só, visto de dois lugares.** `fn_alterar_mes_competencia(entidade, id, mes)` muda a OC e o lançamento dela juntos, nos dois sentidos (regra do Tiago: mudar no lançamento tem que refletir na OC). A tela confirma antes, porque isso move custo entre meses.

**A trava é o pagamento, não o status da OC.** O mês de referência muda até o pagamento ser aprovado ou pago; depois disso a função recusa com a instrução exata ("Desaprove o pagamento antes" / "Estorne o pagamento antes"). Isso vale também no `fn_salvar_lancamento`. Consequência conhecida: forma dinheiro nasce aprovada e cartão nasce paga (ver 20260729140001), então nesses dois o mês já nasce travado e mexer nele exige desaprovar ou estornar.

**Piso do vencimento das parcelas passou a ser `data_compra`** (era a data de emissão, que agora é data de sistema). Regime de caixa (fluxo de caixa, aging) continua por vencimento e pagamento; regime de competência (DRE) passou a usar só `mes_competencia`, sem o `coalesce(competencia, data_vencimento, data_emissao)` que misturava os dois quando a competência estava vazia. Cada relatório diz na descrição qual data usa.

**Custo de obra = lançamentos.** Decisão do Tiago: como toda OC vira lançamento e existem lançamentos avulsos, o gasto da obra é o que está nos lançamentos (rateio por centro de custo, agrupado por `mes_competencia`). Isso substitui o modelo "base CONSUMO" da Fase 8, que dependia do módulo de Estoque (fora do escopo atual, então nunca teria dado de consumo). **O ajuste do painel de custos do módulo Gestão é o bloco 3 deste trabalho e ainda não foi feito.**

**Prova:** `supabase/provas/datas_competencia.sql`, 17 asserções no banco vivo (imutabilidade da criação, normalização e check do dia 1, herança das duas datas, avulso exigindo, alteração nos dois sentidos, trava por aprovado e por pago, piso do vencimento, DRE pelo mês de referência). Rollback em `supabase/rollbacks/`.

**Blocos pendentes:** 2) competência fechada (`competencias_fechadas`, trava nas funções de escrita, aba para fechar e reabrir); 3) relatórios e BI de custo por competência.

## 2026-07-29 - Competência fechada e custo por competência (blocos 2 e 3, PR #35)

**Bloco 2: fechamento de competência.** Fechar um mês congela o custo dele: sem isso, um lançamento criado depois com mês de referência antigo muda um relatório que já foi olhado. Tabela `competencias_fechadas` (uma linha por mês, dia 1) e a trava `fn_exigir_competencia_aberta` chamada nos cinco caminhos que escrevem mês de referência: criar OC, aprovar OC, salvar lançamento, alterar o mês e fechar diárias.

**Quem lança em mês fechado.** Não existe flag de admin no projeto, existe permissão por recurso, então a exceção é de quem pode REABRIR o mês (`financeiro.competencias:desaprovar`). Ele passa, e a exceção fica registrada. Aba nova `financeiro.competencias` com ver/aprovar (fechar) /desaprovar (reabrir), semeada para quem já aprova pagamento.

**A trilha ganhou tabela própria, e isso foi um erro corrigido pela prova.** A primeira versão gravava fechamento, reabertura e exceção no `audit_log` com ação própria; a prova estourou no primeiro lançamento em mês fechado porque `audit_log_acao_check` só aceita INSERT, UPDATE e DELETE. Em vez de afrouxar o check de uma tabela central, criei `competencia_eventos` (mes, tipo fechou/reabriu/excecao, motivo, documento), auditada normalmente. O painel mostra quantas exceções e reaberturas cada mês teve, porque mês fechado que mudou depois não pode ficar escondido.

**Bloco 3: custo por competência.** `fn_rel_custo_centro_custo` ganhou período e passou a filtrar por `mes_competencia` (antes somava tudo, sem recorte de mês). `fn_rel_custo_por_mes` nova, para a série dos últimos meses. O relatório Custo por centro de custo ganhou seletor de mês, e o painel de Gestão ganhou a seção "Custo por mês de referência" (mês atual, mês anterior, acumulado de 6 meses).

**Isso substitui formalmente o modelo "base CONSUMO" da Fase 8**, que somava consumo de estoque + folha + lançamentos de origem os/diaria/manual e deixava a compra de fora para não contar duas vezes. Com Estoque fora do escopo, nunca haveria consumo registrado e o custo apareceria menor que a realidade. Decisão do Tiago: o gasto da obra é o que está nos lançamentos, porque toda OC vira lançamento e existem lançamentos avulsos. Folha continua fora deste número (a folha é gerencial e não posta no financeiro): o custo de mão de obra própria aparece no painel de RH, não no custo por centro de custo.

**Prova:** `supabase/provas/competencia_e_custo.sql`, 14 asserções no banco vivo (fechar, não duplicar, mês futuro, exceção registrada, barrar sem permissão, reabrir exigindo permissão e motivo, painel com exceções e reaberturas, custo pelo mês de referência e acumulado sem período).

## 2026-07-29 - Categorias de insumo em 2 níveis: 4 grupos fixos + subcategorias (PR #36)

**O problema.** 3.351 insumos importados do Mais Controle em 6 categorias planas, sendo que duas concentravam 91% da base ("Materiais de construcao" com 1.951 e "Pecas e componentes" com 1.104). Não existia leitura de custo por natureza (material x mão de obra x equipamento).

**Modelo.** `insumo_grupos` com 4 registros semeados (material, mao_de_obra, equipamentos, outros), slug com check, cor como TOKEN do design system (não hex) e trigger `fn_grupos_sao_fixos` recusando INSERT e DELETE: grupo só aceita UPDATE de rótulo, ordem e cor. `categorias_insumo` ganhou `grupo_id NOT NULL` e virou a subcategoria; a UNIQUE `(nome, tipo)` virou `(nome, grupo_id)`, o que permite "A classificar" nos 4 grupos. **A coluna `tipo` morreu**: com grupo + subcategoria ela seria um terceiro nível dizendo a mesma coisa (era 1:1 com as 6 categorias antigas). O insumo aponta só para a categoria; o grupo vem por join, com índice em `categorias_insumo(grupo_id)`. Sem coluna denormalizada no insumo.

**Mapeamento (aprovado com o levantamento na mão).** 84% dos 3.351 caíram automaticamente por palavra-chave no nome (sem acento, primeira regra que casa ganha, com o que não é insumo de obra saindo antes: rancho, alojamento, frete, taxa). Decisões do Tiago: peça de máquina é **Equipamentos** (991 insumos, e não Material como no rascunho inicial dele, senão Material vira 2.300 itens e Equipamentos fica vazio); rancho e alojamento (113 itens, incluindo `Frango 18KG`, `COBERTOR`, `TV 32 SMART`) vão para **Outros**; limpeza e escritório ficam em Material; 10 subcategorias em Material.

**16% (522 insumos) ficou em "A classificar" de propósito.** O que sobra é abreviação de catálogo ("TORN MILENI BEBED" é torneira, "DISJ SOPRANO" é disjuntor). Classificação errada é invisível; fila visível é trabalho. A reclassificação em lote (checkbox + "Alterar categoria" + atalho "Ver A classificar") é o que faz a fila andar.

**Momento certo.** Só 1 insumo havia sido usado em OC e 2 em cotação, então a reclassificação não distorceu histórico nenhum. Em seis meses isso teria custo.

**Custo por grupo (o motivo de tudo).** A dimensão de insumo existe em `oc_itens`, não em `lancamento_rateios`. Então `fn_rel_custo_por_grupo` soma os itens da OC cujo LANÇAMENTO caiu no mês de referência, e o que não tem insumo (lançamento avulso, diária) entra na linha **"Sem insumo (lançamento avulso)"**. Sem essa linha a soma por grupo não fecharia com o custo total. Fecha porque o rateio de um lançamento de OC nasce dos próprios `oc_itens` na aprovação: `sum(oc_itens) = sum(rateios)`. Drill-down em 3 níveis (`fn_rel_custo_por_subcategoria`, `fn_rel_custo_por_insumo`), com o nível de insumo carregado sob demanda.

**Achados do levantamento que não estavam no pedido:** a importação trouxe **136 nomes duplicados** (152 linhas excedentes, tipo `ARMADOR (HORISTA)` + `Armador (horista)_1` + `_2`), que é dedup e ficou fora deste bloco; e o "!EM PROCESSO DE DESATIVACAO!" era **1 insumo**, não uma praga (nome normalizado, e o `&quot;` da importação virou `"`).

**Prova:** `supabase/provas/insumo_grupos.sql`, 12 asserções no banco vivo (4 grupos, criar e apagar grupo recusados, rótulo editável, nenhuma categoria sem grupo, nenhum insumo sem categoria, apagar categoria com vínculo recusado, "A classificar" nos 4, grupo por join, reclassificação trocando o grupo, soma por grupo igual ao custo total, nome sem marca de desativação).

## Revisão no lugar de rejeição, e a data de pagamento definida na aprovação

**Data:** 30/07/2026 · **Contexto:** aba Aprovação de pagamentos

Ao ler o código para o pedido, apareceram dois defeitos no que estava sendo
substituído. O botão "Rejeitar" **nunca funcionou**: a fila lista parcela
`pendente` e a `fn_desaprovar_parcela` exige `aprovado`, então todo clique
devolvia "So da para desaprovar uma parcela aprovada e ainda nao paga". E o
motivo era **descartado**: a função validava que não estava vazio e não gravava
em lugar nenhum, porque não existia coluna de motivo e o `audit_log` é diff de
trigger, não aceita texto livre. O diálogo prometia "fica registrado na
auditoria" e não ficava.

**Decisões**

1. **Não existia status "Rejeitado" para migrar.** O check da tabela sempre foi
   `pendente, aprovado, pago, cancelado`. Entrou `em_revisao`; nenhuma linha
   precisou de migração de dado.

2. **Motivo, autor e data vão para `parcela_eventos`**, no padrão de
   `competencia_eventos`. Coluna solta guarda o último motivo, não o ciclo, e o
   que se quer é o ciclo (pedido, motivo, correção, reenvio, reprogramação).

3. **"Programação vencida" é derivado, não status gravado**
   (`aprovado` + `data_programada < hoje`). Status gravado precisaria de um job
   para virar à meia-noite e sairia de sincronia com o banco. Só existe na janela
   "exata": em "a partir da data", data passada é justamente o que libera pagar.

4. **A invariante mora no banco**, não na tela: check
   `status <> 'aprovado' or data_programada is not null`. Parcela aprovada é
   parcela pagável, e pagável sem data autorizada é furo. Não vale para `pago`
   porque parcela de cartão de crédito nasce paga sem nunca ter tido janela, e
   inventar data para o histórico seria mentira.

5. **`fn_cancelar_programacao` foi removida.** Ela zerava a data programada, o
   que agora quebra a invariante. Virou "Reprogramar", com motivo obrigatório e
   permissão de **aprovar pagamento** em vez de editar programados: a data deixou
   de ser agendamento e passou a ser autorização, então mudá-la é mudar a
   autorização.

6. **Pagamento em dinheiro também nasce com data programada.** A
   `fn_aplicar_regra_pagamento` põe a parcela de dinheiro direto em `aprovado`
   sem passar pela aprovação; sem preencher a data ali, o check recusaria o
   lançamento em dinheiro inteiro.

7. **Feriado não é avisado.** Fim de semana é calculado; feriado exigiria
   calendário que o sistema não tem, e chutar (só os fixos, sem Carnaval, Páscoa
   e Corpus Christi, sem estadual e municipal) avisa errado em dia útil e cala em
   feriado real. Fica para quando houver cadastro de feriados.

8. **A projeção de caixa passou a usar a data programada** quando ela existe
   (`fn_rel_fluxo_caixa`). Data autorizada é a melhor estimativa de quando o
   dinheiro sai; vencimento é só o limite contratual.

**Prova:** `supabase/provas/revisao_e_janela_pagamento.sql`, 18 asserções em
transação com rollback, incluindo o ciclo aprovar → desaprovar → reaprovar que
faltava na prova de pagamento e deixou passar o bug do custo dobrado.

## Fila de aprovação: colunas configuráveis e painel de conferência

**Data:** 30/07/2026 · **Contexto:** blocos C e D da aba Aprovação de pagamentos

**Decisões**

1. **Rótulo da parcela virou função canônica** (`rotuloParcela` em
   `financeiro/_shared/formato.ts`). A fila mostrava a primeira parcela só como
   `LAN-2026-0015` e as outras como "parcela 2", "parcela 3": quem batia a lista
   com o documento não sabia se a primeira linha era a parcela 1 ou o lançamento
   inteiro. Agora é "LAN-2026-0015 · parcela 1 de 3" em todas, e parcela única
   não ganha sufixo (ali "1 de 1" é ruído).

2. **A consulta traz mais do que a tela mostra.** As colunas são configuráveis,
   então o dado precisa existir para o usuário poder ligar a coluna. Continua
   sendo consulta por página, não por linha: os complementos (número da OC,
   contagem de anexos, total de parcelas) são consultas agregadas por lista de
   ids, não N+1.

3. **Sem embed cíclico.** Partindo de `lancamento_parcelas`, pedir
   `lancamentos(lancamento_parcelas(...))` para contar as parcelas irmãs fecha um
   ciclo na mesma tabela, e ciclo no PostgREST é convite para ambiguidade de
   embed que só apareceria em produção com dado que a fila hoje não tem. Virou
   consulta separada.

4. **O painel de conferência é read-only por desenho, não por falta de tempo.**
   Quem aprova precisa conferir sem risco de mexer no documento no meio da
   conferência. Não há campo editável nem botão de salvar; as ações são as mesmas
   da linha (Aprovar e Revisar) mais o atalho para o lançamento completo, para
   quem tem permissão de editar. A carga é sob demanda: seriam N lançamentos
   completos (parcelas, rateio, itens da OC, anexos e trilha) para uma fila em
   que se abre um ou dois.

5. **"Em revisão" na lista de Lançamentos é filtro de status de PARCELA numa
   lista de LANÇAMENTOS.** Não cabia no `status` (que é do lançamento), então vem
   por uma consulta dos ids e um `in`, previsível, e o rótulo diz "Com parcela em
   revisão" para não virar ambiguidade. Fica no mesmo seletor porque para quem
   usa é a mesma pergunta: o que está travado.

6. **A procedência da data aparece no detalhe do lançamento**, junto da parcela
   ("definida na aprovação", "vencimento da parcela", "reprogramada"), e não no
   painel da fila: na fila a parcela ainda é `pendente` e a data só nasce na
   aprovação, então ali o campo seria sempre o mesmo texto.

## Relatórios financeiros: função de módulo "use client" chamada do servidor

**Data:** 30/07/2026 · **Contexto:** `/financeiro/relatorios` quebrada em produção

A tela inteira de relatórios caía em produção, nos **sete** relatórios, com o mesmo
digest (`2025016743`). A causa:

```
Attempted to call normalizarRelatorio() from the server but normalizarRelatorio
is on the client. It's not possible to invoke a client function from the server.
```

`normalizarRelatorio` morava em `relatorios-nav.tsx`, que é `"use client"`, e a
página (Server Component) **chamava** a função. Importar um client component do
servidor é permitido para renderizar; chamar uma função exportada por ele não é.

**Por que passou por tudo:** é violação de fronteira de **runtime**, não de tipo.
tsc, lint, testes e build passaram limpos; a rota só quebra quando renderiza de
verdade. Em produção o Next esconde a mensagem e mostra só o digest, e o digest
do Next 16 não distingue erro (os sete relatórios, com queries completamente
diferentes, davam o mesmo número), o que apontou para a direção errada por duas
sessões.

**O que fechou o diagnóstico:** uma página de diagnóstico local, pública e sem
dado, que montava só as peças daquela tela e chamava as funções uma a uma. O erro
acontece antes de qualquer consulta, então não precisava de sessão nem de dado.
Antes disso eu havia eliminado, com medição: permissão do usuário, ACL das dez
`fn_rel_*`, cache do PostgREST, prerender de build, duplicatas do iCloud e o
grafo de imports (que sobe limpo em Node, porque **importar** o módulo é válido;
só **chamar** através da fronteira falha).

**Decisões**

1. Ids, padrão e normalização foram para `relatorios/relatorios.ts`, módulo
   neutro. O client component ficou só com rótulo, ícone e a navegação.
2. Teste guarda a invariante: o módulo não pode ganhar a diretiva `"use client"`.
3. Varredura no app inteiro (189 módulos `"use client"`, 6 com export chamável em
   minúscula): nenhum outro arquivo de servidor importa função de módulo client.

## A janela de pagamento tem que ser conferida contra hoje, não contra o campo

**Data:** 30/07/2026 · **Contexto:** teste ponta a ponta em produção

A primeira versão da trava comparava a data programada com a **data digitada** no
campo "Data do pagamento". Bastava digitar a data autorizada para pagar hoje uma
parcela liberada só para o mês seguinte, e o pagamento ficava registrado com
`data_pagamento` no futuro: o dinheiro sai em julho e aparece como realizado em
agosto no fluxo de caixa. Aconteceu de verdade no teste (parcela autorizada para
27/08 paga em 30/07 com data 27/08).

**Decisões**

1. A janela é conferida contra **hoje** (America/Rio_Branco). O item 9 fala de
   quando o pagamento acontece, não de um campo que o usuário preenche.
2. `data_pagamento` no futuro é recusada: ninguém registra pagamento que ainda
   não aconteceu. Data no passado continua valendo (pagou ontem, registra hoje).
3. Parcela de lançamento **cancelado** não é pagável, nem no banco nem na lista.
   A fila de aprovação já se defendia disso; a de pagamento não.
4. A **data autorizada aparece na tela** de Pagamentos (coluna, com selo
   "Aguarda" quando a data não chegou e "Vencida" quando passou) e no drawer de
   pagamento. Sem isso, quem paga clica em Pagar e leva um bloqueio que não tinha
   como prever, o que faz a trava parecer defeito.

## Consulta sem `.limit()` não é consulta sem limite

**Data:** 30/07/2026 · **Contexto:** Combobox de insumo na OC e na cotação

O PostgREST corta a resposta em **1.000 linhas** por padrão (`db-max-rows`), e o
corte é **silencioso**: a consulta não dá erro, só devolve menos. A EMT tem 3.349
insumos ativos, então o Combobox da ordem de compra recebia 1.000 e os outros
2.349 ficavam **inalcançáveis, nem digitando**, porque o filtro da tela roda sobre
o que chegou. Na prática, 70% do catálogo não podia ser comprado.

**Decisões**

1. Helper `todasAsLinhas` em `lib/supabase/`: pagina de mil em mil até o lote vir
   menor que a página, com trava de 100 páginas. Usado em insumos (OC e cotação).
2. Lista com mais de mil linhas no cadastro passa a usar o helper por padrão.
   Hoje só insumos passa de mil (fornecedores estão em 658), mas o teto vale para
   qualquer uma, e o próximo a cruzar não vai avisar.
3. O Combobox continua renderizando 100 opções por vez e dizendo "Mostrando 100
   de 3.349. Digite para refinar a busca". Renderizar 3.349 nós de uma vez trava a
   tela; o que estava errado era o universo ser 1.000, não a janela ser 100.

## Excluir ordem de compra tem que levar todos os lançamentos dela

**Data:** 30/07/2026 · **Contexto:** lançamentos órfãos aparecendo na lista

`fn_excluir_ordem_compra` pegava o lançamento da ordem com **`limit 1`**. A
OC-2026-0032 tinha quatro lançamentos (herança do bug de duplicação de 29/07,
quando desaprovar deixava o lançamento vivo e reaprovar criava outro), então
excluir a ordem levou um e deixou **três órfãos** apontando para uma ordem que não
existe mais. Na tela eles apareciam como "Cancelado" e "Previsto", sem ordem e sem
como sair: `fn_excluir_lancamento` recusava qualquer lançamento de origem `oc`
dizendo "exclua pela ordem de compra", e a ordem já tinha ido.

**Decisões**

1. Excluir ordem apaga **todos** os lançamentos dela, não o primeiro.
2. A regra de exclusão passou a ser a que o Tiago definiu: **pagamento aprovado
   ou pago não exclui**. Antes o guard olhava só `pago`, ou seja, dava para
   apagar dinheiro que já estava autorizado a sair.
3. Lançamento de ordem **viva** continua saindo pela ordem: excluir só o
   lançamento deixaria a ordem aprovada sem registro financeiro e sem como
   regerar. Se a ordem não existe mais, o lançamento é órfão e sai por ele mesmo.
   É o que destrava o caso que apareceu.
4. Ação "Excluir" na **lista** de lançamentos (o detalhe já tinha), com a mensagem
   do banco indo direto para o toast: a tela não repete a regra, para não existir
   uma segunda versão dela que possa divergir.
5. Os três órfãos foram apagados na própria migração, conferindo por número, que
   a ordem sumiu, que não havia parcela paga e que nada estava conciliado.

## A parcela 1 é sempre a de vencimento mais próximo, em todos os caminhos

**Data:** 31/07/2026 · **Contexto:** o mesmo lançamento tinha duas numerações

Três funções gravam parcela e só duas numeravam igual. `fn_salvar_parcelas_oc` e
`fn_definir_parcelas_lancamento` renumeram por `row_number() over (order by
data_vencimento, valor)`. `fn_salvar_lancamento`, que é o formulário de novo
lançamento, gravava `coalesce((p->>'numero_parcela'), 1)`, e o app mandava
`indice + 1`: o número era a **posição da linha no formulário**. Quem digitasse
30/09 na primeira linha ficava com a parcela 1 vencendo depois da parcela 2, e o
mesmo lançamento trocava de numeração ao ser reaberto no diálogo "Definir
parcelas", que renumera.

**Decisões**

1. `fn_salvar_lancamento` renumera por vencimento, com o critério **copiado tal e
   qual** das outras duas (`order by data_vencimento, valor`), em vez de inventar
   um terceiro. Vale para criar e para editar, e vale também para o a receber, que
   passa pela mesma função.
2. Única diferença, obrigatória: `nulls last`. A OC e o diálogo exigem vencimento
   em toda parcela; este caminho aceita parcela sem vencimento
   (`lancamento_parcelas.data_vencimento` é nullable e o formulário deixa o campo
   em branco). Parcela sem data vai para o **fim** da numeração, quem tem data é
   que disputa o número 1.
3. Quem numera é o banco, então o app **parou de mandar** `numero_parcela`
   (Financeiro > Lançamentos e Financeiro > Contas a receber), e o campo saiu dos
   schemas de servidor. Mandar a posição da linha seria ruído que faria alguém
   achar que a ordem em que as parcelas foram digitadas decide a numeração.
4. O desempate por valor ordena o valor como **texto** (`x->>'valor'`), herança de
   `fn_salvar_parcelas_oc`: no mesmo vencimento, R$ 500,00 vem antes de R$ 90,00.
   Foi copiado assim de propósito, porque o objetivo era ter **um** critério nos
   três caminhos e o desempate só decide a ordem entre parcelas que vencem no
   mesmo dia. Trocar para ordenação numérica é uma mudança das três funções de uma
   vez, não desta.

## Vencimento e Parcelas são excludentes no formulário de lançamento

**Data:** 31/07/2026 · **Contexto:** print com "Vencimento 31/07" no topo e parcela sem data embaixo

O formulário mostrava ao mesmo tempo o campo "Vencimento" (nível do lançamento,
marcado como opcional) e a tabela de Parcelas com o vencimento de cada uma. Duas
fontes de verdade para a mesma informação, e elas divergiam na cara do usuário.

**Decisões**

1. Quem decide qual dos dois aparece é a **quantidade de parcelas no formulário**,
   sem campo novo de "número de parcelas": 0 ou 1 mostra o Vencimento e esconde a
   tabela; 2 ou mais mostram a tabela e escondem o Vencimento.
2. Com uma parcela, **quem manda é o cabeçalho**: a parcela é montada no envio a
   partir dos campos Valor e Vencimento. Isso é o que garante que a soma feche por
   construção e que não exista mais parcela com data vazia embaixo de um cabeçalho
   com data.
3. Os dois controles (`Adicionar parcela` e `Gerar pela condição`) vivem no
   cabeçalho da seção, que continua visível em parcela única. Escondendo a seção
   inteira, quem começasse com uma parcela ficaria preso nela.
4. Nas transições a informação não se perde: indo de uma para várias, a primeira
   linha da tabela nasce com o valor e a data do cabeçalho; voltando para uma, a
   data da parcela que sobrou sobe para o cabeçalho. O valor da linha que sobra é
   descartado de propósito, porque com uma parcela ela vale o total.
5. `lancamentos.data_vencimento` passou a acompanhar as parcelas: com uma, é o
   campo do cabeçalho; com várias, é o vencimento **mais próximo**, que é a parcela
   1 depois da renumeração. A lista nunca mais mostra um vencimento que não existe
   em parcela nenhuma. Continua sendo o formulário que manda esse valor, então
   `fn_definir_parcelas_lancamento` (que recalcula o mínimo no banco) segue sendo o
   outro caminho, e os dois agora concordam.
6. A validação do cliente acompanhou: com menos de duas parcelas o schema não
   cobre a soma nem exige valor na linha, porque a linha está escondida e é
   derivada. Com duas ou mais, as duas exigências voltam, a de valor apontando a
   linha errada da tabela. Coberto por teste em `schemas.test.ts`.
7. Condição de pagamento "Boleto 30 dias" **desativada** (`ativo = false`), a
   pedido do Tiago. Não foi apagada: `condicoes_pagamento` é referenciada por
   ordens, cotações, lançamentos e pela própria divisão em parcelas, e desativada
   ela sai dos dropdowns (todos filtram `ativo = true`) sem levar histórico junto.

## Editar lançamento com pagamento aprovado é recusado

**Data:** 31/07/2026 · **Contexto:** a edição apagava a aprovação em silêncio

No caminho de edição, `fn_salvar_lancamento` apaga e regrava **todas** as
parcelas. As guardas eram duas e deixavam um furo no meio: recusava se alguma
parcela estava `pago`, e recusava mudança do mês de referência se alguma estava
`aprovado` ou `pago`. Com uma parcela `aprovado` e o mês **inalterado**, a edição
passava: as parcelas eram recriadas como `pendente` e `aprovado_por`,
`aprovado_em`, `data_programada`, `data_programada_origem` e `conta_bancaria_id`
iam embora sem aviso. Dinheiro já autorizado a sair voltava a não aprovado sem
ninguém pedir, e a parcela reaparecia na fila de aprovação. A prova
`supabase/provas/editar_lancamento_aprovado_recusado.sql` reproduz o furo (caso 6,
que reconstrói a versão antiga a partir da definição viva) antes de provar o
conserto.

**Decisões**

1. Vale a regra 8 da status machine, que já estava escrita: **editar aprovado é
   proibido, desaprova, edita, reaprova**. Nada de regra nova. A guarda de `pago`
   ganhou a irmã de `aprovado`, e a mensagem diz o caminho de volta: "Desaprove o
   pagamento em Financeiro > Aprovação de pagamentos, edite e aprove de novo."
2. A guarda de mudança de mês **fica onde está**, mesmo virando redundante para
   `aprovado`: ela é a que cobre `pago` com mês diferente e a que dá a mensagem
   específica do mês. Guarda de dinheiro não se apaga por economia de linha.
3. A trava é dupla, como manda a regra da permissão tripla: o banco recusa
   (barreira final) e o detalhe do lançamento deixa de oferecer o botão Editar
   quando há parcela aprovada, com o texto dizendo o que fazer. `editavel` passou
   a usar `temParcelaFechada` (aprovado **ou** pago), o mesmo critério que
   `podeDefinirParcelas` já usava.
4. Não foi preciso mexer nos outros dois caminhos, e isso foi verificado, não
   suposto: `fn_definir_parcelas_lancamento` (diálogo "Definir parcelas") já
   recusava `aprovado` e `pago` juntos, sem depender do mês, e
   `fn_excluir_lancamento` também. Contas a receber só cria, não edita.
5. O botão Excluir continua aparecendo e a recusa continua vindo do banco, por
   decisão anterior já registrada no código: a regra de quem pode sair mora em
   `fn_excluir_lancamento`, e a mensagem dela vai direto ao toast para a tela não
   manter uma regra paralela que possa divergir.

## Condição de pagamento é um catálogo só, criável de qualquer tela

**Data:** 31/07/2026 · **Contexto:** o campo do lançamento avulso prometia mais do que fazia

O Combobox de condição de pagamento do lançamento avulso não recebia `onCriar`.
O canônico mostra o placeholder "Buscar ou digitar" sempre, então o campo
convidava a digitar e digitar não criava nada: só a OC e a cotação criavam. E a
lista vinha de uma **terceira cópia** da mesma consulta (`compras/ordens`,
`compras/cotacoes` e `financeiro/lancamentos` tinham uma cada, idênticas), o que
mantinha as três telas iguais só enquanto ninguém filtrasse diferente num lado.

**Decisões**

1. O catálogo é um só: `condicoes_pagamento` já era a mesma tabela para OC,
   cotação e lançamento, então a leitura passou a ser uma só função em
   `src/modules/_shared/condicao-pagamento/queries.ts`. Os três módulos
   **reexportam** ela, então as páginas seguem importando do próprio módulo e
   nenhum módulo passou a depender do outro (Financeiro não importa de Compras).
   Três consultas iguais não são redundância inofensiva: são três lugares para
   divergir sem ninguém perceber, e o pedido era justamente "mostra as mesmas que
   mostram na OC".
2. `criarCondicaoPagamento` saiu de `compras/_shared/pagamento-actions.ts` para
   `_shared/condicao-pagamento/actions.ts`, com a heurística `parcelasDoNome`
   junto. Criar do lançamento e criar da OC passam pelo mesmo código, mesma
   dedução de parcelas pelo nome e mesmo `ilike` que devolve a existente em vez de
   duplicar.
3. `criarFormaPagamento` **ficou** em Compras: `fn_criar_forma_pagamento` exige
   permissão de criar em `compras.ordens` ou `compras.cotacoes`, então mover para
   `_shared` faria parecer neutro o que não é.
4. A permissão de criar condição é do cadastro, não do módulo:
   `salvar_condicao` exige `cadastros.condicoes-pagamento / criar`, e é o banco
   que recusa (provado). Quem não tem o cadastro continua escolhendo da lista, só
   não cria, e recebe a mensagem do banco no toast. Nenhuma migration foi
   necessária.
5. `parcelasDoNome` ganhou teste (`regras.test.ts`) porque agora serve três
   telas e porque o risco real dela é aritmético: `salvar_condicao` recusa se a
   soma não fechar 100,00 exatos, e "30/60/90" daria 99,99 se a última parcela não
   absorvesse a sobra. A prova
   `supabase/provas/condicao_pagamento_catalogo_unico.sql` testa os dois lados: a
   soma quebrada é recusada pelo banco (caso 7) e a que a heurística gera é aceita
   (caso 8).

## Tabela centralizada, dinheiro à direita, altura de linha por usuário

**Data:** 31/07/2026 · **Contexto:** o pedido foi "centraliza o texto de todas as tabelas" e "deixa eu ajustar a altura das linhas"

O DataTable canônico passou a nascer centralizado (cabeçalho e célula) e ganhou
altura de linha ajustável por arraste e por preset, guardada por usuário no mesmo
blob de preferência das colunas. As duas coisas têm exceção deliberada, e é a
exceção que precisa ficar registrada: quem vier depois vai olhar "centralizado é
o padrão" e achar que dinheiro e altura fixa foram esquecidos.

**Decisões**

1. **Dinheiro, quantidade e contagem continuam à direita, com `tabular-nums`.**
   Centralizar tudo era o pedido literal; o Tiago viu o mockup lado a lado e
   escolheu manter a coluna de valor à direita, porque é a vírgula embaixo da
   vírgula que faz "R$ 512.340,00" saltar aos olhos ao lado de "R$ 1.940,50".
   Coluna centralizada embaralha a ordem de grandeza justamente na tela em que ela
   é a informação. Isso não é preferência estética, é a regra 3 do CLAUDE.md
   (dinheiro alinhado à direita) e vale também para quantidade, percentual, horas
   e contagem. O mecanismo é um só: `meta.alinharDireita: true` na coluna, que os
   helpers `colunaDinheiro` e `colunaNumero` já declaram. Nenhuma tela alinha na
   mão: `text-right` dentro de `cell` foi varrido do app e só sobrou em coluna de
   ação (o menu ⋮), onde não é alinhamento de texto e sim posição de botão.
   Centralizar valor monetário depois disso é regressão, não melhoria, e existe
   teste em `data-table.test.tsx` cuja função é ficar vermelho se alguém tentar.
2. **A altura padrão é automática (`alturaLinha: null`), não uma altura fixa.**
   "Todas as linhas iguais" só se consegue clipando: altura em `<tr>` funciona
   como mínimo, então a célula alta continuaria empurrando a linha, e por isso o
   conteúdo passa a ser limitado por `maxHeight` + `overflow-hidden` dentro da
   célula quando há altura escolhida. Isso corta a segunda linha das células de
   duas linhas (`CelulaDescricaoCategoria`: descrição em cima, categoria embaixo,
   em oito listagens). Cortar é aceitável quando a pessoa pediu; não é aceitável
   como padrão para 20 a 30 usuários que nunca pediram nada. Então automática é o
   estado inicial, é o que a preferência antiga lê, é o que uma preferência
   corrompida lê, e é um item nomeado "Automática" no menu "Altura" para existir
   caminho de volta. O menu existe além do arraste porque arrastar não funciona no
   teclado: sem ele, quem clipou por acidente sem mouse ficaria preso.
3. **Campo novo no formato da preferência NÃO sobe `VERSAO_PREFERENCIAS`.** Ela
   continua 2, com teste travando o número. `lerPreferenciasTabela` descarta tudo
   quando a versão não bate, então subir de 2 para 3 apagaria colunas visíveis,
   ordem, larguras e filtros de todos os usuários para acrescentar um campo
   opcional. Compatibilidade nos dois lados resolve sozinha: blob v2 sem
   `alturaLinha` lê como automática, e blob novo lido por código velho tem o campo
   ignorado. Só mude a versão se o significado de um campo existente mudar.

## Cabeçalho com o módulo e painel de Gestão que responde perguntas

**Data:** 31/07/2026 · **Contexto:** varredura das 51 telas no navegador, com o pedido "a UI tem que estar toda em um padrão premium, veja se os painéis estão bons e também cabeçalho de todas as abas"

Duas mudanças estruturais saíram dessa varredura: o `PageHeader` passou a dizer de
que módulo a aba é, e a única tela de Gestão deixou de ser uma parede de KPIs para
virar um painel com gráficos, tabela e estados vazios que ensinam.

**Decisões**

1. **A sobrancelha do módulo mora no `PageHeader`, não num breadcrumb novo.** A
   sidebar é só de ícones e o submenu de cada módulo é um flyout que só existe
   enquanto o mouse está em cima: parada numa aba qualquer, a pessoa não tem
   nenhuma pista permanente de onde está, e "Lançamentos", "Categorias" e
   "Relatórios" existem em mais de um módulo. Em vez de inventar uma trilha, o
   canônico ganhou um `<p>` acima do `<h1>` com a pele do rótulo do KPICard
   (`text-legenda`, caixa alta, `tracking-wide`, cor secundária), que informa sem
   competir com o título. O texto vem de `MODULOS` em `config/recursos.ts`, o mesmo
   catálogo que alimenta a sidebar: se a sidebar diz "RH", a sobrancelha diz "RH",
   e nunca "Recursos humanos".
2. **A prop `modulo` é opcional de propósito, e isso não é preguiça de migração.**
   Nem toda tela que usa o `PageHeader` é aba de módulo: "Minha conta" não pertence
   a módulo nenhum, e a ficha do colaborador e os detalhes de OC, lançamento, ponto
   e folha são telas de registro, onde o cabeçalho já carrega botão de voltar e
   status. Tornar a prop obrigatória forçaria essas telas a inventar um valor. O
   contrato ficou: **toda aba registrada em `RECURSOS` passa `modulo`; tela de
   detalhe e tela fora de módulo não passam.** As 43 abas do catálogo já passam.
3. **Título da aba é o `nome` do recurso, sem repetir o módulo.** Com a sobrancelha
   existindo, "Conciliação bancária" embaixo de "FINANCEIRO" e "Relatórios
   financeiros" embaixo de "FINANCEIRO" passaram a dizer a mesma coisa duas vezes,
   e ainda discordam do rótulo do menu. Quem encurtar esses dois títulos precisa
   encurtar junto o `nome` em `config/recursos.ts`, num diff só, senão o item do
   menu e o `<h1>` divergem.
4. **Grade de KPI é `GradeKpis`, não `grid-cols-3`.** Num grid de colunas fixas o
   cartão solitário fica pendurado com dois terços da linha vazios, que era o que
   se via em Pagamentos, Contas a receber e Contas bancárias. A grade canônica é
   flex-wrap com base de 16rem e `flex-1`: um cartão ocupa a linha, dois dividem,
   três ou quatro viram grade, e o que não cabe quebra e volta a preencher. Não
   existe mais motivo para uma tela montar grade de KPI na mão.
5. **O painel de Gestão passou a responder perguntas, não a listar números.** Antes
   eram doze KPIs soltos. Agora são cinco KPIs de decisão do dia (custo do mês, a
   pagar em aberto, vencendo em 7 dias, pagamentos a aprovar, pago no mês) e cinco
   blocos que respondem, nesta ordem: **quanto a obra custou por mês**, **quanto o
   caixa precisa suportar por prazo de vencimento**, **para qual centro de custo o
   dinheiro foi**, **em que grupo de insumo ele virou custo** e **quais foram os
   maiores lançamentos**. Cada bloco traz o total âncora, o link para a tela do
   detalhe e um estado vazio que diz o que precisa acontecer para encher.
6. **Um painel, uma janela.** Os quatro cortes de custo usam a mesma janela de seis
   meses de competência (`janelaPainel`), com `fim` exclusivo (primeiro dia do mês
   seguinte), que é a mesma semântica do `mes_competencia < p_fim` das RPCs
   `fn_rel_*`. É isso que faz os totais dos blocos fecharem entre si na tela; sem
   isso o painel mostra três números diferentes para a mesma pergunta e perde a
   confiança do leitor. O contrato compartilhado entre Gestão e os relatórios do
   Financeiro é a função do banco, não o TypeScript: os dois módulos calculam por
   conta própria em cima das mesmas RPCs.

## O teto de 1.000 linhas vale para RPC, e agregar por faixa é o que o resolve

**Data:** 01/08/2026 · **Contexto:** `fn_rel_aging`, gráfico do painel de Gestão e
relatório de Aging do Financeiro

A decisão de 30/07 ("Consulta sem `.limit()` não é consulta sem limite") tratou de
tabela. O mesmo teto de 1.000 linhas do PostgREST vale para **RPC**, e ali ele é
mais traiçoeiro: a função "já agrega", então parece imune. `fn_rel_aging` agregava
por `(tipo, data_vencimento)`, ou seja, devolvia **uma linha por data de vencimento
em aberto**. Parcela de OC e de lançamento avulso se acumulam ano a ano; passando
de mil datas distintas, as duas telas passariam a mostrar menos dívida do que
existe, caladas. Com 1.201 datas na prova, R$ 20.100,00 sumiram do caminho antigo.

**Decisões**

1. **A pergunta certa não é "a RPC agrega?", é "o número de linhas cresce com o
   tamanho da empresa?".** Uma linha por documento, por data ou por parcela cresce;
   uma linha por mês, por centro de custo, por grupo ou por faixa não. Toda `fn_rel_*`
   nova tem que cair no segundo grupo, e o teto deixa de existir como assunto.
2. **`fn_rel_aging` agrega por faixa, e devolve as DUAS faixas na mesma linha.** As
   duas telas usam recortes diferentes da mesma base: `faixa_prazo` olha para a
   frente (quanto o caixa precisa suportar: vencido, até 7, 8-15, 16-30, 31-60,
   +60, sem vencimento) e `faixa_aging` olha para trás (há quanto tempo venceu: a
   vencer, 1-7, 8-15, 16-30, 31-60, +60). Os dois recortes se encaixam ("vencido" é
   a união das cinco faixas de atraso), então uma linha por combinação serve as
   duas exatamente, sem nenhuma delas reclassificar a faixa da outra. São no máximo
   11 linhas por tipo.
3. **Classificação por data mora no banco, não no TypeScript.** `classificarPrazo`,
   `classificarFaixa`, `faixaDaParcela`, `diasAte` e `diasEntre` saíram: com o banco
   classificando, mantê-las seria duas definições de borda esperando divergir. O que
   ficou em `calculo.ts` é montar a lista ordenada com rótulo e zero onde falta.
   Faixa desconhecida vinda do banco **lança erro**: somar na faixa errada ou
   descartar a linha é o mesmo dinheiro sumindo em silêncio que se veio consertar.
4. **A data de corte é o hoje de America/Rio_Branco, e a tela manda a dela.** `p_hoje`
   nulo cai no fuso de Rio Branco, nunca no UTC do servidor, que às 21h locais já é
   o dia seguinte e mudaria a faixa de tudo que vence amanhã.

---

## 2026-08-06 - `supabase db push` é proibido, e o motivo é medido

O `CLAUDE.md` dizia "migrations versionadas via Supabase CLI", o que convida ao
`db push`. Rodar `db push` aqui derruba o banco de produção. Medição de
06/08/2026, com `supabase migration list --linked` contra o projeto
`vsesgvqjgqpapoxhnbqx`:

| | linhas |
|---|---|
| total no ledger | 331 |
| nos dois lados (arquivo no repo E versão no banco) | **12** |
| só no repo, o banco não registra | **155** |
| só no banco, sem arquivo no repo | **164** |

**Decisões**

1. **Aplicar migration é pelo MCP `apply_migration`, nunca por `db push`.** O
   ledger do banco (`supabase_migrations.schema_migrations`) não é o índice dos
   arquivos do repo: o `apply_migration` grava uma versão própria, com o
   timestamp de quando rodou, e não o nome do arquivo. Por isso 155 arquivos
   aparecem como "não aplicados" quando o efeito deles está no banco há semanas.
   Um `db push` leria esses 155 como pendentes e tentaria aplicar tudo de novo:
   `create table` em tabela que existe, índice duplicado, trigger recriado,
   `revoke` reaplicado. Não é conflito de merge, é incidente de produção.
2. **O ledger não é fonte de verdade sobre o schema. O schema é.** Antes de mexer
   em função, policy ou grant, ler a definição real no banco
   (`pg_get_functiondef`, `information_schema`), não o `.sql` do repo. Os 164
   registros que existem só no banco são a prova de que o repo não conta a
   história inteira.
3. **A rota de leitura do banco por CLI é `supabase migration list --linked`.**
   Conecta direto e **não precisa de Docker**. Já `supabase db dump` roda
   `pg_dump` em container e **exige Docker**, que não existe na máquina do Tiago:
   dump de schema ou de grant por CLI não é opção aqui, é MCP ou nada.
4. **Migration que mexe em privilégio termina com trava `do $$` fail-closed.**
   Foi o que permitiu conferir o revoke de TRUNCATE (versão `20260805205011`)
   sem ler grant: a trava estoura exceção se sobrar privilégio, exceção aborta a
   transação, e transação abortada não grava versão no ledger. Logo, versão no
   ledger = trava passou. Padrão a repetir em toda migration de privilégio.

## 2026-08-08 - A identidade de conferência da folha é condicional, e custo sem centro de custo não chega ao BI

A aprovação da folha (`fn_aprovar_folha`, Bloco 8a Task 4) gera um `a_pagar` por
colaborador com o líquido e um por grupo de recolhimento com a guia. A conferência
que um contador faz é bater `folhas.custo_total` contra o contas a pagar gerado:

```
soma(líquidos) + soma(guias) + soma(adiantamentos) = folhas.custo_total
```

Ela fecha porque os retidos e o adiantamento se cancelam: `Σ(salário − inss − irrf
− adiant) + Σ(encargos + inss + irrf) + Σ(adiant) = Σ(salário) + Σ(encargos)`.
Medido em banco com 2 colaboradores em 2 centros de custo e 1 adiantamento:
líquidos 6202,50 + guias 3237,50 + adiantamentos 800,00 = 10240,00 = `custo_total`,
diferença **0,00**. A revisão repetiu com um cenário próprio (3 colaboradores em 3
centros de custo, 4 encargos em 3 grupos, INSS retido caindo no mesmo grupo dos
patronais) e também fechou em 0,00.

**Só que ela é condicional, e a primeira redação não dizia isso.** Duas situações
normais deixam resíduo, e nenhuma das duas é bug:

| situação | efeito | medido |
|---|---|---|
| encargo ativo com `grupo_recolhimento` nulo | entra em `custo_total`, não vira guia | resíduo −678,94 com 678,94 de encargo sem grupo |
| item com `valor_liquido <= 0` | fica na folha, não vira lançamento | resíduo +275,00 com líquido −275,00 |

Nos dois casos o resíduo é **exatamente** a soma da causa, sem componente
escondido e sem centavo de arredondamento:

```
diferença = soma(encargos sem grupo de recolhimento) + soma(valor_liquido <= 0)
```

O caso do encargo sem grupo passou perto de não ser descoberto porque o teste de
"config vazia" foi feito com **todos** os grupos nulos: 100% de buraco lê como
"não configurado, zero guia, tudo certo". O caso perigoso é o **parcial**, um
encargo com grupo e outro sem, que gera guia e resíduo ao mesmo tempo.

O segundo achado é de rateio. O rateio da guia é exato, não proporcional: cada
centavo nasce ligado a um `folha_itens` e o item tem centro de custo, então
`soma(rateios) == valor` por construção. Mas item com `centro_custo_id` nulo fica
fora do rateio (mesmo `if v_cc is not null` que a `fn_fechar_diarias` já tem).
Medido com um colaborador sem centro de custo:

| | valor |
|---|---|
| lançamentos gerados | 9562,71 |
| soma dos rateios | 8014,60 |
| **custo sem centro de custo** | **1548,11** |

E o buraco se espalha por **todas** as guias, não fica isolado num lançamento (na
guia do GPS: lançamento 2238,88, rateios 1905,55, buraco 333,33). A identidade
global continua 0,00 e o total a pagar está certo; o que não acontece é o custo
chegar ao centro de custo. O `CLAUDE.md` declara "nenhum custo existe sem centro
de custo" como espinha dorsal, e o painel de Gestão sub-reporta esse valor.

**Decisões**

1. **A identidade é documentada com a condição, não sem ela.** O texto completo
   mora no `obj_description` da própria `fn_aprovar_folha` (migration
   `20260808173430`), porque é lá que quem confere o número vai olhar, e não no
   `.sql` do repo. Inclui a consulta que separa as duas causas do resíduo por
   folha. Afirmar a identidade sem condição, em comentário ou relatório, é
   convidar alguém a tratar um resíduo legítimo como erro de arredondamento e
   "consertar" a função de dinheiro.
2. **Encargo ativo sem `grupo_recolhimento` é provisão, não erro de cadastro.**
   Entra no custo do empregador e de propósito não gera guia, porque não existe
   para onde recolher. É o desenho que o Bloco 8b vai usar para 13º e férias.
   Nenhuma trava deve exigir grupo em todo encargo.
3. **Item sem centro de custo deixa o rateio incompleto, e isso fica pendente de
   decisão de cadastro.** As duas saídas possíveis não são de código: exigir
   `centro_custo_id` no colaborador CLT (decisão do dono do sistema, muda o
   cadastro e pode travar folha existente) ou criar um centro de custo padrão
   para o que sobra (inventaria regra contábil). Enquanto não houver decisão, o
   comportamento fica como está, medido e registrado aqui. **Não inventar rateio
   proporcional para fechar o buraco**: distribuir 1548,11 entre centros de custo
   que não gastaram esse dinheiro é pior que não distribuir.
4. **Achado latente que a Task 7 vai encostar:** `lancamentoSchema`
   (`src/modules/financeiro/lancamentos/schemas.ts:158-162`) e
   `lancamentoFormSchema` (`:284-294`) exigem
   `|soma(rateios) − valor| <= 0,005` **quando existe rateio**. O lançamento de
   guia com buraco tem rateio não vazio e soma menor, então **viola essa
   invariante**. Hoje não estoura porque editar lançamento de origem diferente de
   `manual` é bloqueado nos três níveis (drawer em
   `lancamento-form-drawer.tsx:161`, Server Action em `actions.ts:114`, e a RPC
   `fn_salvar_lancamento` com `if v_origem <> 'manual' then raise`). Quem for
   mexer no Financeiro, ou afrouxar esse bloqueio, precisa saber que a guia da
   folha não passa por esses dois schemas. (O relatório de revisão chamou o
   segundo de `lancamentoEdicaoSchema`; esse nome não existe no arquivo, os
   exports são `lancamentoSchema` e `lancamentoFormSchema`.)

   **Correção de registro (onda de correção do review amplo, 2026-08-08):** o
   parágrafo acima descrevia o bloqueio de três níveis como se ele cobrisse toda
   escrita em lançamento de origem do RH, e **não cobria**. `fn_salvar_lancamento`
   e `fn_excluir_lancamento` estavam fechadas; **`fn_definir_parcelas_lancamento`
   e `fn_alterar_mes_competencia` estavam abertas**, e o revisor executou os dois
   ataques como usuário do Financeiro: moveu o vencimento da guia de INSS de
   2026-12-20 para 2027-06-30 dividida em duas parcelas, e moveu um lançamento de
   salário para a competência 2027-03 com `folhas.competencia` parada em 2026-11.
   Nos dois casos a identidade de conferência continuou reportando
   `explicado 0.00` (o total é preservado, e ela agrupa por `folha_id`, não por
   mês) e a tela da folha não mostrava nada. A migration `20260808221920` fechou
   as duas com a mesma guarda da `fn_excluir_lancamento`. **Agora o bloqueio é
   verdade; antes deste parágrafo ser escrito, não era.** A lição que fica: "está
   bloqueado nos três níveis" tem que ser afirmado por função de escrita, não por
   tela — o inventário certo é *todas* as funções que escrevem na tabela, e
   `origem` `diaria` segue fora da guarda nessas duas (gap registrado, decisão do
   dono do sistema).

## 2026-08-08 - Fechamento do Bloco 8a: portão de competência de mão única, tela de RH que lê tabela do Financeiro, e adiantamento congelado

Três achados do Bloco 8a (aprovação da folha e a ponte com o Financeiro) que não são
sobre folha: valem para o projeto inteiro.

### 1. O portão de competência contábil está montado só na entrada

`fn_exigir_competencia_aberta` é a trava que impede lançar dinheiro em mês fechado.
Medido no banco vivo em 08/08/2026, lendo `pg_proc.prosrc`:

| chama `fn_exigir_competencia_aberta` | funções |
|---|---|
| **sim (7)** | `fn_alterar_mes_competencia`, `fn_aprovar_folha`, `fn_aprovar_ordem_compra`, `fn_criar_ordem_compra`, `fn_fechar_diarias`, `fn_registrar_adiantamento`, `fn_salvar_lancamento` |
| **não, e apagam `lancamentos` (4)** | `fn_desaprovar_folha`, `fn_desaprovar_ordem_compra`, `fn_excluir_lancamento`, `fn_excluir_ordem_compra` |

As 7 que chamam são, todas, caminho de **criar ou mover** dinheiro. As 4 que **apagam**
lançamento não chamam nenhuma. (A sétima entrou neste bloco: `fn_registrar_adiantamento`.
Até a Task 6 eram 6.)

Efeito reproduzido pela revisão da Task 5: quem tem `rh.folha:desaprovar` **sem**
`financeiro.competencias:desaprovar` apaga as contas a pagar de um mês já fechado, sem
gerar uma linha em `competencia_eventos`, **e não consegue recolocá-las**, porque a
aprovação chama o portão e barra lançar em mês fechado. É porta de mão única: o mês
fechado passa a mostrar menos despesa do que teve, e o caminho de volta está trancado.
Vale igual para desaprovar OC e para excluir lançamento solto.

**Decisões**

1. **Fechar isso é decisão do dono do sistema, não do implementador.** A pergunta é de
   regra contábil: apagar despesa de mês fechado exige reabrir a competência (com
   evento e permissão), ou é permitido com registro? Ninguém deve inventar a resposta.
2. **Quando for fechado, é nas 4 de uma vez.** Travar só a folha faria dela a única das
   quatro com trava, e a assimetria só trocaria de lugar: quem quisesse apagar despesa
   de mês fechado usaria a exclusão de lançamento. Meia trava aqui é pior que trava
   nenhuma, porque dá falsa sensação de cobertura.

### 2. Tela de RH que lê tabela do Financeiro fica silenciosamente vazia se a RLS não conhecer a permissão de RH

Este bloco foi o **terceiro** caso do mesmo padrão. O sintoma é o pior possível: não dá
erro, a tela mostra "nada encontrado", e quem olha conclui que **o dado não existe**.

| caso | o que a tela mostrava | correção |
|---|---|---|
| painel de alertas (Bloco 1) | "nenhum EPI a recolher", com EPIs a recolher (o join com `colaboradores` era zerado pela RLS) | `fn_epis_a_recolher`, definer gateada por `rh.epis:ver` |
| trava de adiantamento (Task 6) | deixava editar adiantamento já pago, porque o predicado não via a parcela | predicados definer gateados |
| lançamentos gerados da folha (Task 7) | "Esta folha foi aprovada sem gerar lancamentos", numa folha que TEM lançamento | policy de `lancamentos` estendida, restringindo por origem |

**Decisões**

3. **Dois padrões, e a escolha é pelo que a tela precisa ler.**
   - A tela precisa de um **agregado, um bit ou uma lista derivada**: função
     `security definer` **gateada por permissão no corpo** (`fn_epis_a_recolher` é o
     precedente). O gate tem que ser **fail-closed**: em `language sql` não existe
     `raise`, então retornar `true` (= "comprometido", = nega) no lugar de deixar o
     `where` devolver `false`. Predicado gateado por `and tem_permissao(...)` no `where`
     é fail-**open** disfarçado.
   - A tela precisa da **linha inteira** da tabela do outro módulo: estender a policy
     de SELECT **restringindo por origem**. Foi o que a Task 7 fez
     (`20260808205001`): `rh.folha:ver` passa a ver `origem in ('folha','folha_guia')`
     e `rh.adiantamentos:ver` só `origem = 'adiantamento'`. **Não** usar um `OR` solto
     com o recurso de RH: isso daria ao RH o contas a pagar inteiro, incluindo nota de
     fornecedor. Custo medido: o `exists()` correlacionado vira hashed subplan com
     `loops=1` via `idx_lancamentos_origem`, 9,3 ms para 3000 linhas, não nested-loop
     por linha.
4. **Toda tela que cruza módulo tem que ser testada com o perfil mínimo, não com o
   Admin.** Os três casos passaram no olho de quem implementou porque quem testou tinha
   permissão dos dois lados. O teste que pega é: derrubar as permissões do outro módulo
   em transação e conferir que a tela ainda mostra o dado (ou dá erro honesto), nunca
   "nada encontrado".

### 3. Editar adiantamento deixou de existir, por desenho

Todo adiantamento agora nasce com lançamento no Financeiro
(`fn_registrar_adiantamento`, Task 6), e o registro é **congelado** quando tem
lançamento vinculado: a policy `rh_adiantamentos_update` exige `lancamento_id is null`
nos **dois** lados (`using` e `with check`), espelhando `rh_diarias`, que congela desde
junho. Corrigir digitação passa a ser **excluir e recriar**, que é atômico
(`fn_excluir_adiantamento` apaga o lançamento junto).

**O que NÃO é verdade sobre isso, e o registro anterior dizia (corrigido na onda
de correção do review amplo):** que `editarAdiantamento` virou "código morto por
desenho". O congelamento é real, mas o gate da UI é `lancamentoId === null`, e uma
linha criada **antes** desta branch tem `lancamento_id` nulo: ela mostraria
"Editar" normalmente e só falharia na policy. O que torna o caminho inalcançável
hoje é produção ter **zero** `rh_adiantamentos` — um fato de dado, não de desenho.
Manter o código continua certo (ele falha fechado, com mensagem limpa, e remover
mexeria em 3+ arquivos fora do escopo), mas a justificativa é "inalcançável porque
a tabela está vazia", não "impossível por construção".

O que isso fechou, provado por execução na revisão da Task 6: um usuário só de RH
(`rh.adiantamentos` editar/excluir, zero permissão em `financeiro.lancamentos`)
repontava `rh_adiantamentos.lancamento_id` para a nota de um fornecedor de R$ 5.000 e
apagava a nota chamando a exclusão do adiantamento de R$ 100, com parcelas e rateios.
Contornava `fn_excluir_lancamento` inteira. A variante branda (`lancamento_id = null`)
deixava um `a_pagar` fantasma que `fn_excluir_lancamento` se recusa a apagar.

**Decisões**

5. **Sincronizar não é resposta; congelar é.** Editar o registro de RH sem sincronizar o
   Financeiro produz divergência silenciosa (RH 999,99 contra lançamento 100,00, e
   também centro de custo, rateio, descrição e `mes_competencia`). Nem `rh_diarias` nem
   a OC sincronizam: as duas congelam. Divergência silenciosa não é resposta aceita em
   nenhum lugar deste código.
6. **Coluna que aponta para dinheiro não é escrivível pelo usuário.** `lancamento_id`,
   `origem`, `origem_id`: quem escreve é a função definer. Grant de UPDATE de tabela
   inteira em transacional com vínculo financeiro é o mesmo furo duas vezes (Critical da
   Task 2 em `folhas`, Critical da Task 6 em `rh_adiantamentos`). Grant por coluna, e a
   policy fixando a coluna de vínculo nos dois lados.

### 4. O espelho da migration é o SQL executável, não o byte

A Global Constraint pedia "arquivo homônimo no repo com o mesmo SQL". A Task 8 conferiu
as **18** migrations `20260808*` do bloco e mediu que **1** é byte-idêntica ao ledger e
**17** não são, sempre e só em comentário:

| causa da divergência | quantas | tamanho |
|---|---|---|
| só a quebra de linha final do arquivo | 4 | +1 char |
| cabeçalho "Aplicada em produção pelo MCP, não rode `db push`" e/ou acento posto depois de aplicar | 13 | +230 a +1290 chars |
| nenhuma (byte-idêntica) | 1 | 0 |

**Decisões**

7. **A conferência é por SQL executável, com comentário removido e espaço em branco
   normalizado**, não por `md5` do arquivo cru. Byte-exatidão é inalcançável de propósito:
   arquivo de texto termina em quebra de linha (o ledger não guarda a última), e 13
   arquivos carregam de propósito o aviso de que **não se roda `db push` neste projeto**,
   que é justamente a informação que salva o banco. A receita, aplicada dos dois lados:
   `regexp_replace(txt, '--[^\n]*', '', 'g')`, depois `regexp_replace(..., '\s+', ' ', 'g')`,
   depois `btrim`, depois `md5`. Nos 18 arquivos do bloco o resultado bate com
   `md5(array_to_string(statements, E'\n'))` do ledger.
8. **Regex do Postgres não tem `\b`.** A fronteira de palavra é `\y`; `\b` é backspace, e
   uma varredura de `prosrc` com `\b` devolve zero linha em silêncio. Foi o que quase fez
   a Task 8 registrar "nenhuma função apaga lançamento" no item 1 desta entrada.

## 2026-08-08 - Onda de correção do review do Bloco 8a: a terceira pré-condição da identidade, e guarda de origem em toda função que escreve

Quatro achados Important do review amplo, nenhum Critical. Dois deles são de projeto,
não de folha, e valem para qualquer módulo que ganhe uma origem nova de lançamento.

### 1. Config vazia que não bloqueia precisa aparecer nas três leituras: função, tela e diagnóstico

`folha_parametros` está vazia em produção (zero linha). Nesse estado a folha aprova sem
erro e o INSS e o IRRF **retidos do trabalhador não viram conta a pagar**, porque
`grupo_recolhimento_inss` / `_irrf` chegam nulos na `fn_aprovar_folha` e as duas linhas da
fonte da guia que dependem deles têm `v_grupo_* is not null` no `where`. O desconto continua
no holerite e no líquido; a guia que a empresa recolhe não existe no Financeiro.

O dano real não era a guia faltando (isso é config): era a **auto-conferência acusando bug
onde falta configuração**. A consulta gravada no `obj_description` da `fn_aprovar_folha`
tinha duas causas de resíduo, e o texto ao lado dizia "se `explicado` NÃO der 0.00, aí sim é
bug". Medido em transação com rollback, cenário de 5 colaboradores e `folha_parametros`
vazia:

| consulta | residuo | explicado |
|---|---|---|
| gravada antes (2 causas) | −4860,72 | **−3649,31** (falso sinal de bug) |
| gravada agora (3 causas) | −4860,72 | **0,00**, com `retidos_sem_grupo` 3649,31 |

E 3649,31 é exatamente `sum(inss) + sum(irrf)` dos itens. Conferido também com os dois
grupos configurados (resíduo −1211,41, retidos 0) e no caso **parcial**, só o INSS
configurado (resíduo −2798,62, retidos 1587,21): `explicado` 0,00 nos três.

**Decisões**

1. **Uma pré-condição que muda dinheiro tem que estar declarada nos três lugares onde
   alguém olha:** no `obj_description` da função (para quem confere o número), na coluna da
   consulta de diagnóstico (para a ferramenta não mentir) e na tela (para quem opera).
   Faltava nos três. A identidade da folha agora tem **três** condições, não duas, e a
   terceira é "`folha_parametros` existe e tem os dois grupos de recolhimento preenchidos".
2. **Config vazia continua não recusando a aprovação.** "Config vazia é deploy seguro" é
   premissa do bloco, e o dono do sistema pode legitimamente querer a folha só como custo
   gerencial por um tempo. O aviso é na tela do detalhe da folha (`folha-detalhe.tsx`,
   mesmo padrão visual do aviso de faixas de INSS/IRRF ausentes), mostrado **já no
   rascunho** para chegar antes de alguém aprovar, com o valor em reais e a rota
   `/rh/parametros-folha`. Regra pura em `calculo.ts` (`retidoSemGrupoDeRecolhimento`), com
   Vitest, porque é regra de dinheiro e não pode viver só no JSX.
3. **A terceira causa é medida contra a config ATUAL, e isso está escrito no comentário.**
   Não existe snapshot do grupo do retido (existe o do encargo patronal, em
   `folha_item_encargos.grupo_recolhimento`). Quem configurar os grupos **depois** de
   aprovar tem que desaprovar e reaprovar antes de concluir que a diferença é bug. Derivar
   a terceira causa do próprio resíduo faria a identidade fechar sempre, por construção, e
   destruiria a capacidade dela de detectar bug de verdade: por isso ela lê a config, que é
   a única medida independente disponível.

### 2. "Bloqueado nos três níveis" se conta por função de escrita, não por tela

O bloco fechou `fn_salvar_lancamento` e `fn_excluir_lancamento` para as origens novas
(`folha`, `folha_guia`, `adiantamento`) e **deixou duas funções de escrita abertas**. O
revisor executou os dois ataques, como usuário do Financeiro sem nenhuma permissão de RH:

| função | ataque | por que a identidade não pegou |
|---|---|---|
| `fn_definir_parcelas_lancamento` | guia de INSS de 2026-12-20 para 2027-06-30, em 2 parcelas | o **total** é preservado, e é o total que a identidade soma |
| `fn_alterar_mes_competencia` | salário para competência 2027-03 com `folhas.competencia` em 2026-11 | ela agrupa por **`folha_id`**, não por mês |

Nos dois casos `explicado` continuou 0,00 e a tela da folha não mostrou nada. Guia de
imposto tem prazo legal, e competência errada é erro contábil silencioso.

**Decisões**

4. **A guarda de origem é por função que escreve, e o inventário é `pg_proc`, não a UI.**
   O erro de raciocínio foi contar "níveis" (drawer, Server Action, RPC) em vez de contar
   **funções de escrita** na tabela. Antes de declarar uma origem fechada, listar todas as
   funções que fazem `insert`/`update`/`delete` em `lancamentos` e `lancamento_parcelas` e
   conferir uma por uma. Migration `20260808221920` fechou as duas, espelhando exatamente o
   critério e a forma de mensagem que a `fn_excluir_lancamento` já usava
   (`in ('folha', 'folha_guia')` numa mensagem, `= 'adiantamento'` em outra, cada uma
   dizendo onde a pessoa resolve). Recriação cirúrgica com md5 fixado e replace reverso,
   mesmo método da `20260808165352`.
5. **`origem = 'diaria'` segue FORA da guarda nessas duas funções, e isso é gap registrado,
   não decisão tomada.** A `fn_excluir_lancamento` barra `diaria` desde a `20260730192937`;
   `fn_definir_parcelas_lancamento` e `fn_alterar_mes_competencia` aceitam. É o mesmo defeito
   de classe, **pré-existente** (não foi este bloco que o criou), e fechar é uma linha em
   cada função. Decisão do dono do sistema, porque muda o que o Financeiro pode fazer com
   uma diária já fechada.
6. **Tela que autoriza dinheiro sair não pode chamar tudo de "Manual".** A fila de aprovação
   de pagamentos rotulava líquido de folha, guia de imposto e adiantamento como "Manual",
   e o filtro de origem tinha duas opções com "Manual" significando `origem !== 'oc'`. Agora
   as três telas do módulo usam `rotuloOrigemLancamento` e o catálogo `ORIGENS_LANCAMENTO`,
   e o filtro casa por igualdade exata. Rótulo de origem é informação de auditoria na tela
   onde se libera pagamento: derivar de catálogo único, nunca escrever literal.

## 2026-08-10 - Obra e centro de custo raiz são um par: nascem juntos, morrem juntos

Pedido do Tiago: poder excluir obra e centro de custo que não têm nada atrelado. Até aqui os
dois só **desativavam**; a migration 11 os deixou fora da allowlist `fn_recurso_do_cadastro`
com o comentário "tem triggers/auto-referencia".

O comentário escondia um impasse real, não preguiça. O trigger `trg_obra_cria_centro_custo`
faz **toda obra nascer com um centro de custo raiz**, e `centros_custo.obra_id` tem FK para
`obras`. Ao pé da letra do pedido, portanto, **nenhuma obra jamais estaria "sem nada
atrelado"**: sempre tem o centro dela pendurado, e a FK barra o delete. A exclusão genérica
falharia sempre, com um 23503 traduzido como "Este registro está em uso" — mensagem verdadeira
no código e mentirosa para o usuário.

**Decisões**

1. **A obra e o centro raiz dela são excluídos juntos, numa transação.** É o simétrico do
   trigger. `fn_excluir_obra` apaga o centro e depois a obra, e só quando nada aponta para
   nenhum dos dois. Não existe "excluir a obra e deixar o centro órfão": todo centro tipo obra
   pertence a uma obra.
2. **Centro de custo exclui só folha, de baixo para cima.** Nó com filho é barrado; para apagar
   uma etapa com 3 itens, apaga os 3 itens primeiro. Escolha do Tiago entre isso e apagar a
   subárvore de uma vez. Mais cliques, e nenhuma exclusão em massa acidental na espinha dorsal.
   Nível 1 nunca sai sozinho: é ou centro de sistema ou raiz de obra.
3. **A lixeira guarda o par numa entrada só.** Restaurar uma obra reinsere a linha e o trigger
   **cria um centro raiz novo**; reinserir também o centro antigo daria dois centros na mesma
   obra. Então `fn_excluir_obra` grava uma única entrada, de `obras`, com o snapshot do centro
   na chave `centro_custo_raiz` (o `jsonb_populate_record` ignora chave que não é coluna), e
   `fn_restaurar_cadastro` aplica `codigo`/`orcamento`/`ativo` sobre o centro recém-criado. Sem
   desabilitar trigger, sem duplicata, e o par volta sempre junto. O `id` do centro muda ao
   restaurar, e isso é inofensivo porque a exclusão só era permitida quando nada referenciava
   aquele id.
4. **Abrir a allowlist para restauração obriga a fechar a porta genérica.** `fn_recurso_do_cadastro`
   passou a mapear `obras` e `centros_custo` (a restauração usa essa allowlist), o que de graça
   faria `fn_excluir_cadastro` aceitá-las e furar todas as validações novas. A função ganhou
   guarda explícita rejeitando as duas e apontando para as específicas. **Toda vez que uma
   allowlist serve a dois propósitos, abrir para um abre para o outro.**
5. **A regra devolve código, não frase.** `fn_obra_bloqueio` e `fn_centro_custo_bloqueio` são a
   fonte única e devolvem NULL ou um código (`tem_filhos`, `em_uso`, `raiz_de_obra`, ...). O
   texto pt-BR acentuado é montado em `_shared/dependencias.ts`, testado em Vitest. Motivo: as
   mensagens SQL deste repo são sem acento (885 `raise exception` assim) e a UI precisa de
   acento; com código a regra fica num lugar e o texto noutro, sem duplicar.
6. **Contagem de dependência é `security definer`, e por isso exige `ver`.** Sob RLS o usuário
   pode não ver `folha_itens` ou `lancamentos`: a contagem sairia zerada e habilitaria um botão
   destrutivo que vai falhar. As funções de leitura contam por fora do RLS e checam
   `tem_permissao(recurso, 'ver')` antes.
7. **Lista pede o bloqueio em lote, não por linha.** As queries usam o client do Supabase, não
   SQL cru, então não há `LEFT JOIN LATERAL`; e uma chamada por linha seria N+1.
   `fn_obras_bloqueios(p_ids)` e `fn_centros_custo_bloqueios(p_ids)` devolvem o mapa numa
   chamada. Linha ausente do mapa é tratada como bloqueada, nunca como liberada: **omissão não
   habilita botão destrutivo.**

**Gap registrado, não resolvido:** equipamentos têm o mesmo problema (equipamento cria etapa no
centro Manutenção) e continuam fora. Mesma solução se aplica, é outro bloco.

**Efeito colateral avisado ao Tiago:** como não há custo lançado no sistema, as 16 obras ficaram
todas excluíveis. É o caso de uso pedido (limpar lixo de importação), mas o botão aparece
habilitado em toda a lista.

## 2026-08-10 - Grafia correta é mudança de contrato de importação, não só de texto

O Tiago pediu "Manutenção de equipamentos" com grafia correta e certeza de que o app todo
está certo. Varredura com 6 agentes em paralelo (966k tokens, 15 min) sobre código e
migrations, mais conferência manual do banco vivo.

**O que a varredura mostrou:** as strings de interface já estavam corretas. `src/components/`
e `src/modules/rh/` (106 arquivos, ~17,6 mil linhas) voltaram **zero** achado. O erro estava
em dois outros lugares: dado semeado nas migrations e **rótulo de coluna de planilha**.

**Decisões**

1. **Acentuar rótulo de importação exige dobrar acento no casamento primeiro, na mesma
   entrega.** Os rótulos ("Razao social", "Codigo", "Orcamento", "Funcao") não são só texto:
   `lerEValidarXlsx` casa o cabeçalho do arquivo enviado contra eles, e `normalizarRotulo` só
   fazia trim+lowercase. Acentuar sozinho **recusaria toda planilha que a obra já usa**.
   Agora `normalizarRotulo` usa `chaveNome` (dobra acento) e só então os rótulos ganharam
   acento. Regra geral: **rótulo que também é chave de casamento não é texto, é contrato.**
2. **`chaveNome` em TS espelha a `fn_chave_nome` do banco.** Já existia no Postgres desde a
   20260804140000, para o casamento da importação BR-364. Passou a existir em TS porque três
   importações casam em memória (centros de custo, insumos, cabeçalho de coluna). Um conceito,
   duas implementações, cada uma no lado onde o casamento acontece.
3. **Migration antiga não se edita; corrige-se o dado.** Os agentes reportaram os seeds errados
   apontando arquivo:linha das migrations aplicadas. Isso serve para **localizar** o dado, não
   para reescrever histórico. As correções foram por `update` em migration nova, casando pelo
   valor antigo exato para não sobrescrever rename que o Tiago tenha feito à mão (e ficar
   idempotente).
4. **Varredura de código não acha erro de grafia em dado vivo.** Conferindo o banco depois dos
   agentes, sobraram `Centimetro`, `Mes`, `Tonelada-quilometro` e `Cartão de Credito` — linhas
   cadastradas pela tela ou por importação, que não estão em migration nenhuma. Nenhum agente
   podia achar isso. **Auditoria de dado se faz no dado.**
5. **Antes de renomear qualquer catálogo, achar quem casa por nome.** Conferido um por um:
   `categorias_financeiras` já casava por `fn_chave_nome` (seguro), `unidades_medida` casa por
   **sigla** (seguro, sigla intacta), `formas_pagamento.nome` só é lido para exibir (seguro), e
   `categorias_insumo` casava por `toLowerCase` sem acento — esse virou `chaveNome`, senão
   planilha sem acento pararia de casar com "Peças e componentes".
6. **Um agente teve falso negativo, e foi o dado que denunciou.** A varredura leu
   `20260612210001` e reportou as unidades erradas, mas passou batido em `categorias_insumo`
   logo abaixo, no mesmo arquivo. Não custou nada porque o dado vivo daquela tabela já havia
   sido substituído por um conjunto acentuado, mas o aprendizado fica: **resultado de agente é
   pista, não inventário.** Conferir no dado antes de declarar varredura completa.

**Deixado de fora, de propósito, precisa de decisão do Tiago**

- **As ~885 mensagens `raise exception` em SQL são sem acento**, por convenção do repo, e várias
  chegam na tela pela Server Action. Corrigir é mudança grande e mecânica em função de banco,
  incluindo funções que mexem em dinheiro. Não faço isso numa passada de grafia sem combinar.
- **`lancamentos.descricao` gerada por função** nasce "Diarias ..." e "Salario ...", sem acento
  (`fn_fechar_diarias`, `fn_aprovar_folha`). Aparece no Financeiro. Corrigir é recriar duas
  funções que geram lançamento; vale, mas é entrega própria, não passada de grafia.

## 2026-08-11 — Filtro da listagem de lançamentos passou para o banco (RPC)

**Problema.** Os filtros de revisão, conta bancária e centro de custo não filtravam no banco: o
app resolvia a lista de `lancamento_id` em consultas auxiliares e mandava **todos** os ids num
`.in()` dentro da URL. Com a base vazia isso nunca apareceu. Depois da carga do histórico (7.253
lançamentos, 9.244 parcelas):

| filtro | ids no `.in()` | URL |
| --- | --- | --- |
| conta BANCO DO BRASIL 102.124-9 | 5.634 | ~220 KB |
| centro Escritório Central | 2.122 | ~83 KB |
| centro 009 - BR-364 | 1.963 | ~77 KB |
| centro Manutenção/Documentação | 1.728 | ~67 KB |
| conta CAIXINHA DE DINHEIRO | 899 | ~35 KB |
| revisão "não revisado" | 402 | 16,1 KB |

O cliente recusava: `HeadersOverflowError ... HTTP headers exceeded server limits (typically
16KB). Your request URL is 16073 characters`. Até o menor deles estourava, por 73 bytes. E antes
de estourar, resolver os ids lia as 9.244 parcelas em 10 requisições sequenciais: **11 segundos**
para desenhar 100 linhas.

**Decisão.** `fn_listar_lancamentos(p_filtros jsonb, p_pagina int, p_tamanho int)` devolve a
página, a contagem exata e a soma do valor filtrado. Uma ida ao banco no lugar de doze.

**Por que RPC e não um remendo no tamanho.** Nenhum teto resolve: a lista de ids cresce com a
base, então qualquer limite é uma data marcada para quebrar de novo. Medido: **48–75 ms** contra
11.400 ms, e o filtro que não abria voltou a abrir.

**Ganhos que vieram de graça.**

1. **Revisão calculada uma vez só.** O estado de revisão decidia duas coisas em dois lugares: o
   filtro (`idsPorRevisao`) e o selo da coluna (no `map` da listagem), com comentário no código
   avisando que precisavam casar. Agora é a mesma expressão SQL para os dois, e não há como
   discordarem. Conferido contra cálculo independente: `em_revisao` 0, `sem_conta` 328, `parcial`
   74, `revisado` 6.851, `nao_revisado` 402, idênticos.
2. **A soma do total filtrado virou agregação de verdade.** A agregação do PostgREST está
   desligada neste projeto (`PGRST123`), então o total da tela era somado no app buscando a
   coluna `valor` de milhares de linhas. Dentro da RPC é um `sum()`.

**SECURITY INVOKER de propósito.** A RLS de `lancamentos` continua valendo para quem chama.
`SECURITY DEFINER` aqui seria furo de permissão disfarçado de otimização.

**Aprendizado que custou caro: erro engolido é erro que volta.** `listarLancamentos` descartava o
erro do PostgREST e lançava "Não foi possível carregar os lançamentos". Diagnosticar virou
tentativa e erro contra o banco, e eu descartei a hipótese certa (URL) porque um teste com uuids
sintéticos mediu 15.234 B e passou raspando por baixo do limite. O erro real dizia o tamanho
exato e sugeria a solução. Agora vai no `cause`. **Erro de infraestrutura tem que chegar ao log
com a causa.**

## 2026-08-11 — O histórico financeiro veio do nível de parcela, não de lançamento

**O erro.** A primeira carga do histórico veio de uma planilha em nível de
**lançamento**, sem o valor de cada parcela, e a importação reconstruía o carnê
dividindo o total em partes iguais pelos vencimentos. Medido contra o export em
nível de parcela do maiscontrole:

| | ERP-EMT (estimado) | maiscontrole (origem) | diferença |
| --- | --- | --- | --- |
| Total | 64.541.696,82 | 61.432.852,10 | **+3.108.844,72** |
| Em aberto | 15.024.746,09 | 11.699.473,00 | +3.325.273,09 |
| Lançamentos | 7.253 | 5.817 | +1.436 |

**O mecanismo, que é a parte que interessa.** Quando o pagamento de UMA parcela
não casava com o total do lançamento, ele entrava como lançamento avulso pago e
a parcela original ficava aberta. O mesmo dinheiro duas vezes, e "sem conta"
onde já estava pago. Foi assim que o Tiago percebeu: a tela mostrava como
pendente o que ele sabia estar pago.

**A lição.** Divisão em partes iguais não é carnê, é estimativa. E estimativa
que entra no lugar de dado real não avisa que é estimativa: ela vira número na
tela, com duas casas decimais, com cara de conferido.

**O que passou a existir.** A importação aceita o carnê real: `valores_parcelas`
(com validação de que a soma fecha com o valor), `contas_parcelas` (77 carnês
pagos de contas diferentes), `centros_rateio`/`valores_rateio` (141 lançamentos
divididos entre obras, R$ 2,2 milhões) e datas de pagamento **posicionais**
(existe carnê com a parcela 3 paga e a 2 aberta). Sem essas colunas, planilha
escrita à mão continua funcionando igual.

**Erro silencioso, de novo.** No meio do caminho, 14 pagamentos (R$ 818.891,95)
não entraram e **nada acusou**. O maiscontrole traz algumas células com duas
datas juntas (`27/05/2025, 28/05/2025`, parcela quitada em dois pagamentos); o
conversor tratava a string como ISO, produzia `25//2/27/0`, e o parser da
importação descartava a data calada. Consertado em três lugares, e o do meio é o
que importa: **o gerador agora recusa data que não seja ISO em vez de fatiar às
cegas, e a autoconferência exige o formato de todas as datas.** Transformar erro
silencioso em erro que aparece vale mais que consertar o caso específico.

**A conferência que fecha.** Três cortes independentes contra a origem, todos
com diferença zero: 77 meses de vencimento (2025-01 a 2031-05), 5 contas
bancárias e 11 centros de custo. E um sinal externo: agosto 2026 em aberto deu
R$ 1.418.737,62, exatamente o rodapé que o maiscontrole mostra na tela.

**Resíduos conhecidos, que não afetam os totais.** R$ 31.599,01 de descontos e
R$ 788,71 de juros que o maiscontrole registra fora do valor da parcela (foram
para observações); 3 parcelas pagas de duas contas ao mesmo tempo (fica a
primeira, a outra em observações); 15 lançamentos sem favorecido na origem (vão
para OUTRAS); e R$ 29.998,67 de diferença entre o export e o rodapé da tela do
próprio maiscontrole — duas telas dele discordando, sendo R$ 4.000,00 de uma
parcela sem favorecido.

## 2026-08-11 — Juros na parcela, e o que `valor_liquido` significa

A carga do histórico trouxe R$ 788,71 de juros em 3 parcelas que não tinham onde
entrar. Poderia ficar como resíduo documentado, mas o problema não era a
diferença: **sem o campo, todo juros futuro entraria como zero em silêncio**, e a
posição bancária mentiria um pouco mais a cada boleto pago com atraso.

**`valor_liquido` passou a ser `valor − desconto + juros`.** Isso não é
conveniência: `valor_liquido` já era, pela própria definição e pelo comentário
dentro de `fn_pagar_parcela`, "o que de fato sai do caixa". Enquanto juros não
existia, `valor − desconto` era a resposta certa para essa pergunta; com juros,
deixou de ser. As 8 funções que leem `valor_liquido` — posição bancária, fluxo de
caixa, conciliação, resumo de gestão, folha, importação do lote 09 — passaram a
estar corretas **sem mudar uma linha**, porque todas querem exatamente isso.

Coluna gerada não aceita `ALTER` da expressão, então sai e volta. Conferido antes
que não havia índice nem view sobre ela, e função em plpgsql resolve o nome em
tempo de execução, então nada quebrou.

**A conciliação melhorou de graça:** ela casa extrato com parcela por valor, e o
extrato traz o que saiu com juros. Antes, boleto pago com multa nunca casava.

**Juros não tem teto contra o valor da parcela**, ao contrário do desconto.
Atraso longo pode passar do principal, e inventar um limite recusaria pagamento
legítimo. Só a recusa de negativo, nas três barreiras (Zod na Server Action,
`raise` na função, `check` na tabela).

**A versão de 4 argumentos de `fn_pagar_parcela` foi derrubada, não mantida.**
Mantida, o app poderia seguir chamando ela e o juros ficaria zero calado — que é
exatamente o defeito que esta entrega existe para fechar.

Resultado: o que saiu do banco no ERP-EMT passou a ser R$ 49.702.568,80, o mesmo
"Valor Total Pago" do maiscontrole, **sem resíduo**. A dívida segue
R$ 61.432.852,10 e as cinco contas seguem fechando em zero.
