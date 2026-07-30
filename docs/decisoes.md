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
