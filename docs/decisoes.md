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

## 2026-08-13 - Link de aprovação de pagamento é atalho, não credencial, e o login guarda o destino

A fila de aprovação passou a gerar um link para mandar no WhatsApp de quem aprova. A pergunta
que decidiu o desenho foi: o link carrega autoridade, ou só endereço?

1. **O link é endereço, não credencial.** `?parcela=<id>[,<id>]` na própria rota
   `/financeiro/aprovacao-pagamentos`. Sem token, sem expiração, sem tabela nova, sem rota
   pública, sem RPC fora da sessão. Quem abre precisa de sessão e de `aprovar`, igual a quem
   entra pelo menu. As três opções com token (público, público com PIN, e magic link do
   responsável) foram avaliadas e recusadas: nenhuma paga o custo de criar uma superfície de
   autorização de dinheiro paralela à que já existe, para um sistema de 20 a 30 usuários em
   que quem aprova já tem conta. **Consequência aceita:** quem não tem login não aprova por
   link, e isso é o ponto, não uma limitação a contornar depois.

2. **Copiar a mensagem não é ação de quem aprova.** O botão vive na coluna Ações e na barra de
   seleção, e aparece para quem tem só `ver`. Montar texto não muta nada, e o caminho real é o
   financeiro montar e o diretor aprovar. Por isso a coluna Ações e a de seleção deixaram de
   depender de `aprovar`/`desaprovar`: os botões que mutam seguem cada um atrás da sua
   permissão, dentro de uma coluna que agora sempre existe.

3. **O que fazia o link não funcionar era o login, não a fila.** O middleware mandava quem não
   tinha sessão para `/login` descartando a rota pretendida, e `entrar()` redirecionava sempre
   para `/`. Qualquer link para tela específica deste sistema já chegava quebrado no celular de
   quem não estava logado; o link de aprovação só tornou isso visível. Agora o middleware anexa
   `?destino=` e `entrar()` volta para lá.

4. **`destinoSeguro()` valida por lista de permissão, e a limpeza vem antes da checagem.**
   Recusa `//host`, `/\host`, esquema absoluto, caminho sem barra inicial e o próprio `/login`
   (laço, não ataque). Remove espaço e caractere de controle ANTES de checar, porque o navegador
   remove tab e quebra de linha por conta própria: validar o texto cru deixaria `/\n/evil.com`
   navegar para `//evil.com`. É a única entrada não confiável que a feature criou, e é a única
   coisa aqui com teste de segurança próprio. O valor cru aparece no payload RSC como string
   JSON escapada, nunca como markup ou href.

5. **Parcela que saiu da fila diz para onde foi.** `statusDasParcelas()` resolve aprovada, paga,
   em revisão, cancelada, sem acesso, e pendente travada por falta de conta bancária. Link fica
   dias parado no WhatsApp, então esse é o caso comum, não a exceção: "nenhum pagamento
   encontrado" numa tela de dinheiro faz quem abriu concluir que o lançamento foi perdido.

6. **Largura de coluna com botão novo precisa de `minSize`, não só de `size`.** `larguras` é
   preferência salva por usuário e o piso geral do DataTable é 60px, então `size` novo não
   alcança quem já arrastou a coluna. Sem `minSize`, os três ícones transbordam por cima do
   Valor: o mesmo defeito que a versão de dois botões com texto já causou em produção. Vale para
   qualquer coluna de ações que ganhar botão.

## 2026-08-13 - A conferência de pagamento virou tela inteira, e a linha da fila parou de clicar

Ajuste do bloco anterior depois de o Tiago usar a tela. Três sintomas, uma causa comum e uma
decisão de superfície.

1. **Linha inteira clicável e checkbox no meio dela não convivem.** A fila abria o painel de
   conferência no `onRowClick`, e o clique no checkbox subia para a linha: marcar uma parcela
   para aprovar em lote abria um painel por cima da seleção. Não é bug do checkbox, é o padrão
   "linha clicável" aplicado a uma tabela cujo trabalho principal é seleção múltipla. `onRowClick`
   saiu. **Regra:** tabela com seleção em lote não usa linha clicável; o caminho para o detalhe é
   botão ou link explícito.

2. **O painel lateral foi substituído por tela inteira, e não duplicado.** 480px para lançamento,
   datas, pagamento, N parcelas (57 em caso real), rateio, itens da OC, anexos e trilha era
   rolagem em coluna estreita, e pior no celular de quem recebe o link de aprovação. A tela
   inteira (`/financeiro/aprovacao-pagamentos/[parcelaId]`) mostra o mesmo conteúdo com a decisão
   numa coluna fixa à direita. `painel-conferencia.tsx` e a action `detalheDaFila` foram
   **apagados**: manter os dois seria duas telas de conferência com conteúdo igual divergindo com
   o tempo.

3. **Esta página não é a de lançamento que já existe.** `/financeiro/lancamentos/[id]` exige
   `financeiro.lancamentos:ver` e é tela de edição do lançamento. Quem aprova pagamento não
   necessariamente tem essa permissão e cairia em 404. A nova é a visão de aprovação de UMA
   parcela, com portão em `financeiro.aprovacao-pagamentos:ver`, e quem controla a leitura do
   lançamento por dentro é a RLS, a mesma que já deixa a fila fazer o join. Duas telas parecidas
   com portões diferentes é o correto aqui, e é o oposto do item 2: lá o conteúdo era igual, aqui
   a permissão é diferente.

4. **Tela alcançada por link não pode só esconder o botão.** `situacaoDaParcela` centraliza a
   regra de "esta parcela é aprovável" (a mesma de `listarParcelasPendentes` e de
   `fn_aprovar_parcela`) e devolve o motivo da recusa. A ordem das checagens é a ordem da pergunta
   de quem olha: o que aconteceu com a PARCELA antes do que falta no LANÇAMENTO, senão parcela já
   paga sem conta bancária aparece como "falta escolher a conta" e manda alguém mexer num
   lançamento resolvido. Isso NÃO é autorização: quem autoriza segue sendo a permissão na Server
   Action e a RLS.

5. **Link de uma parcela passou a apontar para a tela inteira dela.** Link de várias continua na
   fila recortada (`?parcela=a,b`), porque tela inteira é de uma parcela por definição.

6. **Posição de botão que mexe com dinheiro não se troca por conveniência.** Aprovar e Revisar
   ficaram onde estavam e os dois novos (Visualizar, Copiar mensagem) entraram à direita, mesmo
   sendo Visualizar hoje a ação de entrada. O caminho descobrível para o detalhe virou o número do
   lançamento, que é link de verdade (abre em nova aba, mostra destino na barra de status) em vez
   de linha clicável.

## 2026-08-13 - Cabeçalho de tabela centraliza sempre, e `alinharDireita` é regra só da célula

`meta.alinharDireita` mandava no `<th>` e no `<td>` juntos, então "Valor", "Parcelas" e "Ações"
eram os únicos rótulos fora do centro numa fila de dez colunas centralizadas, e a régua do
cabeçalho ficava torta. Agora o cabeçalho centraliza sempre, em toda tabela do app (mudança no
DataTable canônico, não em tela nenhuma).

**Isto não afrouxa a regra do dinheiro.** O teste que protege "dinheiro à direita" traz aviso de
não mudar, e o aviso continua valendo: a razão dele é a vírgula cair embaixo da vírgula, o que só
existe na CÉLULA. Rótulo não tem vírgula para alinhar. As asserções das células seguem intactas
(`text-right` + `tabular-nums`); só as do cabeçalho passaram para `text-center`, e um teste novo
trava isso nas duas colunas. Centralizar VALOR continua sendo regressão.

De passagem caiu o `flex-row-reverse` do botão de ordenação: ele existia para o ícone encostar no
texto quando o cabeçalho era à direita, e com tudo centralizado ele só produzia "⇅ Valor" contra
"Vencimento ⇅" na mesma régua. O ícone fica depois do rótulo em toda coluna.

## 2026-08-13 - Rótulo de cabeçalho quebra em vez de cortar, e altura e peso dele são preferência do usuário

Três mudanças no DataTable canônico, então valem para as tabelas de todo o app.

1. **O rótulo do cabeçalho QUEBRA, nunca corta.** Era `truncate`, e "Mês de referência" virava
   "Mês de referê…" numa coluna estreita: cortar o rótulo esconde qual coluna a pessoa está
   lendo, e rótulo é uma ou duas palavras. Agora é `whitespace-normal break-words` com `min-w-0`
   (sem o `min-w-0` o span é item de flex e cresce por cima da coluna vizinha em vez de quebrar),
   e o `h-9` da `th` virou `min-h-9` para a faixa poder crescer. O `whitespace-nowrap` que a
   `TableHead` do shadcn fixa é HERDADO, então a coluna sem ordenação também precisou do span:
   sem ele o rótulo continuava em uma linha só.

   **Efeito colateral a colher depois:** existem larguras declaradas hoje só para o rótulo caber
   (`size: 176` no mês, `size: 184` na forma de pagamento, com comentário dizendo isso). Elas
   deixaram de ser necessárias e podem encolher, mas não foi nesta entrega para não misturar.

2. **Altura da faixa do cabeçalho é preferência**, com preset no menu "Altura" e arraste na borda
   de baixo, guardada por usuário e por tabela. O gesto de arraste NÃO foi duplicado: ganhou um
   campo `alvo: "linha" | "cabecalho"` e o efeito escolhe qual preferência recebe o resultado.
   Limites próprios (28 a 96) porque no cabeçalho não mora botão: o piso é caber uma linha de
   rótulo, não a altura do `⋮` como na linha.

3. **Peso do rótulo é preferência**, com lista FECHADA (400, 500, 600, 700). Peso arbitrário faria
   o navegador sintetizar a fonte onde a Inter não tem o corte, e o resultado é rótulo borrado.
   O sanitizador RECUSA fora da lista em vez de aproximar, ao contrário do que faz com altura:
   aproximar 450 para 400 mudaria a escolha da pessoa sem ela pedir. "Padrão" grava `null`, não
   500, para a escolha seguir o design se o padrão mudar um dia.

Os três campos entraram **sem subir `VERSAO_PREFERENCIAS`**, pelo mesmo motivo do `alturaLinha`:
campo que só acrescenta se resolve na leitura, e subir a versão apagaria colunas, larguras e
filtros que todo mundo já configurou. Há teste travando isso para os dois campos novos.

De passagem, os três grupos de rádio do menu ganharam `aria-label`. Sem nome, o leitor de tela
anunciava "Automática" duas vezes sem dizer de quê, e o teste que varria o menu não tinha como
distinguir altura de linha de altura de cabeçalho.

## 2026-08-13 - A planilha de lançamentos leva o lançamento inteiro, e o rateio não vira linha

A exportação tinha 14 colunas e faltava o que mais importa num relatório de custo: **centro de
custo** e **observações**, mais forma e condição de pagamento, conta bancária e o número do
documento de origem. Duas decisões estruturais no caminho.

1. **Uma linha por lançamento, e o rateio em duas colunas de texto.** Centro de custo mora no
   rateio, e um lançamento pode ser dividido entre várias obras. "Centro de custo" lista os nomes
   e "Rateio" traz quanto foi para cada um (sem "R$", que repetido cinco vezes numa célula é
   ruído; a moeda está na coluna Valor, que é número e soma). A alternativa avaliada e **recusada**
   foi uma linha por rateio: ela repetiria o valor do lançamento em N linhas, e quem somasse a
   coluna Valor contaria o mesmo dinheiro várias vezes. Numa planilha de dinheiro, total errado
   que abre sem erro nenhum é o pior defeito possível. Parcela é 1-N pelo mesmo motivo e entra só
   como resumo: quantidade em "Parcelas" e conta bancária quando é a mesma em todas (contas
   diferentes viram "Várias contas", porque um nome só ali seria mentira).

2. **A listagem NÃO paga pela planilha.** Os campos novos não entraram em `listarLancamentos`: a
   tela é a mais usada do módulo, não mostra nenhum deles, e pendurar o rateio no select dela
   sairia caro em toda navegação para servir uma exportação ocasional. Quem enriquece é
   `detalharLancamentosParaPlanilha`, chamada **página por página** sobre os ids que a lista já
   devolveu. Página por página e não de uma vez porque o teto é 25.000 lançamentos, e um `in` com
   25 mil uuids é uma query que o Postgres aceita mas ninguém quer depurar.

`lerLancamentosEmPaginas` virou genérica em `T extends LancamentoLista` em vez de ganhar uma cópia:
a deduplicação por id (que é o que impede linha repetida entre páginas) vale igual para a linha
enxuta da tela e para a linha enriquecida da planilha.

**Coluna nova entra no fim, não no meio.** "Observações" é a última de todas: é a única com texto
de tamanho imprevisível, e no meio ela empurraria para fora da tela tudo que a pessoa abriu a
planilha para ver.

## 2026-08-13 - `in` do PostgREST tem limite de URL, e 1000 ids não cabem

A primeira versão da planilha completa subiu **quebrada em produção** e passou em 1102 testes e no
CI. O enriquecimento chamava `.in("id", ids)` com uma página inteira da exportação, e
`PAGINA_LEITURA` é 1000.

**Medido no projeto vivo (13/08/2026), batendo direto no PostgREST:**

| ids | tamanho da URL | resposta |
|-----|----------------|----------|
| 100 | 3,7 KB | passa |
| 500 | 18,5 KB | passa |
| 1000 | 37 KB | **HTTP 400 Bad Request** |

O `in` viaja na QUERY STRING de um GET, então cada uuid custa 37 caracteres. O 400 acontece ANTES
de qualquer checagem de permissão ou RLS, e do lado do app chega como erro genérico de consulta:
não se parece nem com falta de grant nem com RLS, que é o que faz perder tempo.

**Regra:** `.in()` com lista derivada de dados sempre em lotes de `LOTE_IDS_POSTGREST` (200,
~7,5 KB, abaixo dos 8 KB que proxy e CDN costumam cortar). O lote fica DENTRO da função de query,
não no chamador, para não depender de quem chama lembrar.

Três lições que valem além desta tela:

1. **Teste unitário não pega isso, por construção.** O teste roda com dois registros, e dois ids
   cabem em qualquer URL. Quem pega é rodar contra dado real. A exportação tem 5.848 lançamentos
   na base de hoje; nenhum teste chega perto disso.
2. **Engolir a mensagem do banco custa caro.** A query lançava
   `throw new Error("Não foi possível carregar o detalhe para a planilha")` e descartava `error`.
   Descobrir a causa virou eliminação de hipóteses (grant de coluna, FK ambígua, grant de tabela),
   todas erradas. Agora a mensagem do PostgREST vai anexada.
3. **Verificar no navegador com dado real não é opcional em exportação.** CI verde aqui provou
   apenas que compila.

## 2026-08-13 - Adiantamento parcelado: o vale do mês virou dívida amortizada, e quem protege o dinheiro é uma trava com condição de ordem

O adiantamento de salário passou a ser descontado em **N parcelas** na folha, com o dinheiro
saindo **inteiro na concessão**. Quinze migrations de schema, função e comentário, sete tarefas,
seis rodadas de correção. Três dos achados abaixo são bugs de dinheiro que existiram e foram
medidos, não riscos hipotéticos.

### 1. Mudou a natureza do adiantamento, não só a quantidade de parcelas

Antes, adiantamento era **vale do mês**: concedido em agosto, descontado inteiro na folha de
agosto, e a coluna `rh_adiantamentos.folha_id` amarrava um ao outro. Agora o desembolso e a
amortização vivem em **competências diferentes de propósito**: 6.000,00 concedidos em agosto
podem ser amortizados 1.404,15 em agosto, 1.404,15 em setembro e o resto depois.

Consequências que valem para quem lê qualquer número deste módulo:

1. **O caixa vê a despesa na CONCESSÃO.** A `fn_registrar_adiantamento` cria o lançamento
   `a_pagar` de origem `adiantamento` no ato, com o valor cheio, no centro de custo do
   colaborador. Para o Financeiro é despesa paga, não empréstimo a receber: não existe conta a
   receber neste sistema, e criar uma para isso significaria um módulo novo.
2. **A folha vê o custo na AMORTIZAÇÃO**, mês a mês, como redução do líquido.
3. **O saldo devedor não é uma coluna, é uma conta**: `valor concedido - soma(valor_descontado)`.
   Quem somar "adiantamentos não descontados" pelo valor concedido mente assim que existir uma
   parcela paga pela metade. Foi exatamente isso que a ficha do colaborador fazia, e ela
   escondeu **1.300,00** de dívida num cenário de 4 casos medidos.
4. **`rh_adiantamentos.folha_id` não existe mais.** O vínculo é `rh_adiantamento_parcelas.folha_id`,
   por parcela.

### 2. A identidade da folha trocou o terceiro termo

A conferência do custo da folha continua sendo

    soma(líquidos) + soma(guias) + soma(adiantamento) = folhas.custo_total

mas o terceiro termo **não é mais "os adiantamentos concedidos nesta competência"**: é
`sum(rh_adiantamento_parcelas.valor_descontado)` das parcelas com `folha_id` = esta folha, ou
seja, o que esta folha de fato amortizou. Somar o concedido faria agosto responder por dinheiro
que não descontou, e setembro por nada.

A consulta gravada no `obj_description` da `fn_aprovar_folha` traz `concedido_no_mes` ao lado,
fora da identidade, porque com parcelamento os dois números **são diferentes e isso é o normal**:
na prova de aceite final, 10.000,00 concedidos contra 3.646,92 descontados, com `explicado` em
`0.00`.

Uma pré-condição da identidade **caiu**: era "todo item tem `valor_liquido > 0`". Com o desconto
limitado ao disponível, líquido negativo virou inalcançável por construção. O termo
`liquidos_nao_positivos` **ficou na consulta mesmo valendo 0,00**, como detector de regressão
desse limite: se ele voltar a ser diferente de zero, é bug ainda que `explicado` feche.

### 3. Cascata: ordem declarada, limite no disponível, e a sobra vai para o mês seguinte

O desconto de cada parcela é `least(valor_previsto, greatest(disponível - já descontado, 0))`,
com `disponível = greatest(salário - INSS - IRRF, 0)`. A ordem é
`(rh_adiantamentos.data, rh_adiantamento_parcelas.numero)`, do adiantamento **mais antigo** para
o mais novo, e é conferível: na prova final, com 1.842,77 disponíveis, o adiantamento de 03/08
leva 1.200,00 e o de 20/08 leva 642,77. Na ordem invertida os mesmos dados dariam 800,00 e
1.042,77, então os números provam a ordem, não a suposição.

O que não couber vira parcela nova **na próxima competência livre depois da que está sendo
processada**, não "no fim do plano": depender do `max(competencia)` das outras linhas fazia a
sobra **pular um mês** ao regerar um mês anterior, e o mês pulado saía sem desconto nenhum
(medido: 3.357,23 de dívida invisível duas competências à frente).

Parcela que não coube **nada** fecha na folha com `valor_descontado = 0`, e o check
`rh_adiant_parcelas_descontado_com_folha` admite esse estado de propósito. Se ela ficasse aberta,
ela e a sobra (que nasce com o valor inteiro dela) somariam duas vezes o mesmo dinheiro.

### 4. A forma correta da invariante do plano, e por que a simples superconta

Para cada adiantamento, em todo estado estável:

    soma(valor_descontado) + soma(valor_previsto das parcelas ABERTAS) = valor concedido

**Não** `soma(valor_previsto)` de todas as parcelas. A parcela fechada guarda o previsto
**inteiro** e a sobra nasce com a diferença, então a forma simples conta a diferença duas vezes
sempre que uma folha descontou parcela pela metade. Medido três vezes, com dados diferentes:
1.150,00 contra 1.000,00 concedidos; 6.400,00 contra 5.200,00; e 10.753,08 contra 10.000,00 na
prova de aceite final. A forma errada estava nos meus próprios briefs até a Task 5, e é a que
qualquer um escreve primeiro.

A invariante vale em **estado estável**. Entre regerar um mês do meio da cadeia e regerar o mês
seguinte ela fica quebrada de propósito, porque apagar a sobra daquele mês deixa órfã a sobra que
a folha seguinte derivou dela. Ela se cura ao regerar o mês de origem, não o mês anterior.

Desde 13/08 essa consulta está **gravada e executável** no `obj_description` da `fn_gerar_folha`,
com a forma errada ao lado, na última coluna, para quem confere ver a diferença em vez de ler
sobre ela.

### 5. O cerco de travas, e o `delete` que NÃO deve ser filtrado

Três travas independentes protegem a cadeia, e elas cobrem janelas diferentes:

| trava | onde | recusa |
|---|---|---|
| regeneração | `fn_gerar_folha` | regerar uma folha cuja sobra já foi descontada por outra folha que não está em rascunho **ou que é anterior a esta** |
| folha desatualizada | `fn_guarda_status_folha` | enviar para aprovação uma folha cujo desconto de adiantamento não bate com os itens dela |
| piso da competência | `fn_quitar_adiantamento` e `fn_antecipar_adiantamentos_colaborador` | mover sobra aberta para antes do mês da folha que a gerou |

**A proteção do dinheiro depende inteiramente da primeira, e da condição de ordem dela.** Sem o
`f.competencia < v_ini`, a isenção "folha posterior em rascunho não trava" passa a valer para uma
folha **anterior**, e regerar apaga parcela já fechada: medido, 1.842,77 cobrados do colaborador
sem registro nenhum no plano, com a folha que cobra a mais aprovando sem atrito. Quem for
relaxar essa trava por conveniência operacional (o ciclo de desaprovar e refazer é chato) tem que
reler os quatro pontos do `comment on function` da `fn_gerar_folha` antes.

**O `delete` de sobras não filtra `folha_id`, e isso é deliberado.** Ele desfaz a **subárvore** que
aquela geração criou, e precisa ser total: manter uma sobra já fechada enquanto a causa dela é
recalculada faz o mesmo dinheiro ser representado duas vezes. Eu instruí duas vezes a "consertar"
isso filtrando `folha_id is null`, e as duas vezes a medição derrubou a instrução: com o filtro, o
plano de 5.200,00 vai a 8.557,23 ao regerar o mês anterior e a 10.071,69 depois de refazer a
cadeia em ordem, e o colaborador termina cobrado em **328,31 a mais** do que o concedido. **A
mudança feita para proteger dinheiro cobrava a mais.** Depois da condição de ordem, ela não tem
caso restante.

A trava do trigger é **por folha** e não protege o plano: a folha diretamente corrompida fica
bloqueada, mas uma folha mais adiante na mesma cadeia, internamente consistente sozinha, envia e
aprova sem atrito. Uma versão anterior do comentário afirmava o contrário, e garantia falsa em
comentário é pior que comentário nenhum. Quem contém o estrago é a trava de regeneração, que
força o ciclo desaprovar, regerar em ordem, reaprovar. Nesse ciclo nenhum valor é perdido nem
cobrado em dobro: o lançamento renasce uma vez só e com o mesmo valor.

### 6. A antecipação no desligamento não desconta nada hoje, e é decisão do dono

Inativar um colaborador com saldo junta as parcelas em aberto numa competência válida (respeitando
o piso), e o toast promete que o saldo será descontado. **A folha itera `where ativo and vinculo =
'clt'`, e a inativação acontece antes.** Medido na prova final: 3.191,70 antecipados para 12/2026,
folha de 12/2026 gerada, **zero item do inativo e zero descontado**; a parcela fica aberta para
sempre.

A premissa da feature caiu: se a pessoa saiu, não existe folha futura dela, e o desconto sai da
rescisão, que é o Bloco 9 e não existe. **Três saídas foram apresentadas ao dono do sistema e
nenhuma foi escolhida ainda.** A recomendação é deixar o mecanismo pronto valendo no Bloco 9 e
corrigir a mensagem para não prometer. Enquanto isso, o **alerta de inativo com saldo em aberto**
no painel de RH não é enfeite: é a única coisa no sistema que mostra essa dívida.

### 7. Consulta gravada em comentário passa a ter marca e verificação automática

A consulta de diagnóstico gravada no `obj_description` da `fn_aprovar_folha` **ficou quebrada em
silêncio por quatro tarefas**: ela lia `rh_adiantamentos.folha_id` e a migration `20260812215337`
dropou a coluna. A ferramenta que o dono do sistema usaria para separar "bug" de "configuração
faltando" respondia `42703 column "folha_id" does not exist`, e nada acusou, porque consulta
gravada em comentário não é compilada, não é testada e não aparece em portão nenhum.

**Decisões**

1. **Toda consulta executável gravada em comentário carrega uma marca fixa**, a linha literal
   `-- DIAGNOSTICO EXECUTAVEL v1`, e termina em ponto e vírgula. Hoje são duas: a identidade da
   folha (`fn_aprovar_folha`) e a invariante do plano (`fn_gerar_folha`).
2. **`public.fn_verificar_diagnosticos_gravados()`** varre `pg_proc` / `obj_description` atrás da
   marca, extrai cada consulta e roda **`explain`** nela. `explain` não precisa de dado nenhum
   (produção tem zero folha) e já pega o modo de falha real, que é coluna ou tabela que sumiu. Ela
   também denuncia marca sem consulta, consulta sem terminador, marca em objeto que a varredura
   não lê, e **o caso de não achar marca nenhuma**: varredura que passa por não encontrar nada é a
   mesma cegueira que ela existe para fechar. Não tem grant para `authenticated` nem `anon`.
3. **Toda migration que faça `drop column`, `rename column` ou `drop table` chama essa função no
   fim e falha se ela devolver linha.** É isso que fecha a lacuna de verdade, porque passa a valer
   para qualquer migration de schema, não só para quem lembrou de conferir aquele comentário. O
   script `supabase/provas/diagnosticos_gravados_executaveis.sql` roda a mesma varredura, com
   controle negativo (três defeitos plantados, um deles a consulta velha de verdade), e entra no
   portão de qualquer task que toque schema.
4. **A prova de "extrair e executar" só vale no instante em que roda**, e o comentário quebra por
   causa de uma migration que ninguém relacionou com ele. Por isso a verificação virou código
   chamável em vez de um item de checklist. **Ela ainda NÃO é automática**, e vale dizer o que
   falta: hoje são uma função pronta no banco e um script em `supabase/provas/` que **alguém
   precisa chamar**. Não há event trigger, não há job, e o `ci.yml` nem enxerga esses arquivos
   (`paths-ignore: supabase/provas/**`, e o job roda com credencial placeholder, sem banco). Para
   ser automática de verdade seriam necessários um event trigger `ddl_command_end` no banco (pega
   qualquer DDL, inclusive de outra sessão) ou um passo de CI com credencial de banco. Enquanto
   não for, o que segura é a regra 3 acima: a chamada dentro da migration que mexe em schema.
5. **A verificação não pega DERIVA SEMÂNTICA, e isso é limitação declarada, não esquecimento.**
   Ela prova que a consulta **resolve** contra o schema, não que ela ainda mede a coisa certa.
   Medido no review: trocando `valor_descontado` por `valor_previsto` na consulta gravada, o
   `explain` resolve, a varredura passa, e o número muda de significado. Consulta que **compila e
   mente** continua sendo pega só por prova de aceite com números esperados, como a de
   `supabase/provas/adiantamento_parcelado_aceite_final.sql`.

### 8. Uma lição de processo que se repetiu três vezes nesta frente

Comentário e código se descolaram três vezes, e nas três o comentário era o único lugar onde a
intenção estava escrita. Na terceira, o comentário estava **certo** e o código errado: a Task 3
atualizou o texto de `resumoAdiantamentos` para "nenhuma parcela descontada" e deixou a linha
seguinte filtrando pela semântica antiga. Ao mudar a semântica de um conceito (aqui, "está na
folha"), procure **todos** os agregadores que dependem dele, não só as telas do módulo em que se
está mexendo.

### 9. Dois gaps que o review amplo achou, os dois pendentes de decisão do dono

**a) Parcela que chega ABERTA depois da folha gerada não é pega por trava nenhuma.**

O trigger `fn_guarda_status_folha` compara `sum(valor_descontado)` das parcelas com `folha_id` = a
folha contra `sum(folha_itens.adiantamentos)`. **Parcela aberta não entra em nenhum dos dois
lados**: ele pega desconto que **diminui** (regeneração de mês anterior que soltou parcela já
descontada) e não pega dívida que **chega** depois da folha gerada. O `comment on function` da
`fn_quitar_adiantamento` afirmava que essa era "a rede desse caso"; não era, e o texto foi
corrigido na migration `20260813230316`.

Três caminhos levam ao mesmo estado, todos medidos:

| caminho | medido |
|---|---|
| conceder adiantamento novo numa competência já gerada | somas `400,00 vs 400,00`, envio passa, folha aprova com R$ 900 concedidos e R$ 0 descontados |
| quitar na competência da folha já gerada | R$ 800,00 abertos na competência da folha aprovada |
| inativar colaborador (antecipação) | R$ 1.000,00 abertos |

Consequência: **aquele mês desconta menos do que deveria**, e o saldo fica aberto numa competência
que já passou. Não há valor perdido nem cobrado em dobro (a invariante do plano continua
fechando), e a correção é **desaprovar e regerar** aquela folha.

Fechar de verdade exige uma **condição nova no trigger**, comparando também as parcelas abertas da
competência, e ela tem que espelhar **exatamente** a iteração da `fn_gerar_folha` (`ativo`,
`vinculo = 'clt'`, e o `continue` de salário zero sem horas). Uma condição mais larga travaria o
envio por parcela que a folha nunca descontaria, e como o único jeito de destravar é regerar,
viraria beco sem saída. **Não foi feita no último passo da frente de propósito:** mudança de trava
de dinheiro sem ciclo próprio de review é exatamente como nasceram os piores erros desta frente.

O que já foi feito para tirar o caso do caminho padrão, que é barato e não muda trava: o
`QuitarSaldoDialog` passou a abrir no **mês seguinte** (o corrente normalmente já tem folha
gerada), e a tela avisa que quitar numa competência com folha gerada exige regerar aquela folha.

**b) Adiantamento a colaborador ativo NÃO-CLT nunca é descontado.**

`listarColaboradores` oferece todos os vínculos no formulário e a `fn_registrar_adiantamento` não
checa vínculo, mas a `fn_gerar_folha` itera `where ativo and vinculo = 'clt'`. Medido em transação
revertida, com um CLT de controle na mesma folha: diarista ativo, R$ 1.500,00 em 3x, lançamento
`a_pagar` de 1.500,00 criado normalmente e plano com 3 parcelas; folha de agosto gerada com **1
item, nenhum dele**; saldo **0,00 descontado e 1.500,00 em aberto**, para sempre. E o alerta de
"inativo com saldo em aberto" **não pega**, porque ele está **ativo**: a dívida não aparece em
lugar nenhum.

É **pré-existente** (o vínculo sempre foi filtro da folha), mas esta frente criou o conceito de
saldo e a rede tem esse buraco. **Decisão do dono**, porque muda quem pode receber adiantamento:
ou o formulário passa a oferecer só CLT, ou o alerta passa a cobrir "saldo aberto sem folha futura
possível" (que cobriria os dois casos de uma vez, o inativo e o não-CLT).

## 2026-08-14 - A planilha exportada volta editada, e a linha se identifica por assinatura porque `numero` não é único

O Tiago exportou a tela de Lançamentos (`lancamentos-2026-08-14.xlsx`, 5.848 linhas), reclassificou
centro de custo na mão e devolveu o arquivo para ser aplicado. Aplicado na migration
`20260814120000_reclassifica_centro_custo_planilha_131`. Dois fatos estruturais saíram daí.

**a) `lancamentos.numero` NÃO é único nesta base, e nada pode usar ele como chave.**

Medido: 5.848 lançamentos, **587 números distintos**. A carga do Mais Controle repetiu o mesmo
`LAN-2026-xxxx` em até **10 lançamentos completamente diferentes** (fornecedor, valor e data
distintos). Não há unique constraint em `numero`, e `fn_numerar_documento` só age no INSERT pela
tela, não na carga. Consequência prática: qualquer conferência, deduplicação, importação ou
relatório que agrupe por "Número" mistura lançamentos alheios, e a planilha exportada — que traz
`Número` mas **não** traz o `id` — não é reconciliável por ele.

**b) Round-trip de planilha se faz por assinatura das colunas que não mudaram, não por posição.**

A ordem também não serve de chave: o Excel reordenou as 5.848 linhas por Data da compra ao abrir, e
o desempate dentro de cada data não sobreviveu (nenhuma combinação de `created_at`/`id` reproduz a
ordem do arquivo). O método que funcionou, e que vale para a próxima planilha que voltar editada:

1. Hash **por coluna, como multiset** (ordem-independente), dos dois lados. Isola o que mudou sem
   depender de alinhamento: das 21 colunas, 19 bateram byte a byte e só `Centro de custo` divergiu
   de verdade. `Rateio` divergiu só na **ordem dos nomes dentro da célula** (o embed do PostgREST
   não garante ordem), então comparar essa coluna exige normalizar a ordem antes.
2. Assinatura md5 das colunas provadas iguais como identificador da linha. Casou 1:1 nas 5.848,
   **zero órfãs dos dois lados** — o que ao mesmo tempo prova que nada foi inserido nem removido.
3. Escrever com trava de contagem exata (`row_count <> N` levanta exceção) e o estado de origem no
   `where`, para o arquivo aplicar duas vezes não reclassificar nada por engano.

Colação importa no passo 1: `order by ... collate "C"` no Postgres para bater com a ordenação por
code point do outro lado. Sem isso os multisets de coluna com acento não fecham e a comparação
acusa mudança onde não houve.

## 2026-08-14 - Provisão de 13º e férias: custo do mês sem caixa, e o quarto termo da identidade da folha

Bloco 8b do RH. A folha passou a provisionar 13º e férias como **custo do mês**, e essa é a
primeira coisa no sistema que entra em `folhas.custo_total` **sem virar conta a pagar**. Todos os
números abaixo foram medidos na prova de aceite da Task 6, em `begin; ... rollback;` contra o banco
vivo, com produção zerada antes e depois. O cenário é o parcial, não o extremo: 3 colaboradores CLT
de 5.000,00, 1.518,00 e 2.000,00 em centros de custo distintos, em três faixas de INSS, com IRRF
apenas no primeiro; 2 encargos ativos (8% com grupo `FGTS`, 10% **sem** grupo, soma 18%); 2
provisões cadastradas, uma **ativa** de 11,111% e uma **inativa** de 8,333%; `folha_parametros`
completo; e um adiantamento parcelado cuja parcela de 2.000,00 **não cabe** no disponível de
1.404,15.

### 1. A provisão mora em tabela separada dos encargos, e cadastrar como encargo é erro

`folha_provisoes` (cadastro de percentuais) e `folha_item_provisoes` (snapshot por item) são tabelas
próprias, não linhas de `folha_encargos`. O motivo não é organização: **encargo e provisão têm
destino financeiro oposto**. Encargo com grupo de recolhimento vira guia; encargo **sem** grupo
entra no custo e não vira guia, e é essa segunda forma que parecia servir para 13º e férias. Até
14/08/2026 o próprio `comment on function` da `fn_aprovar_folha` mandava fazer isso, e a orientação
está **morta**.

Três razões pelas quais a tabela separada não é preferência:

1. **Encargo multiplica salário; provisão multiplica salário E depois arrasta encargo.** Uma linha
   de provisão vale `principal + encargos que vão incidir quando o 13º e as férias forem pagos`,
   com `v_pct_total` (a mesma base de encargos do mês). Medido: A 555,55 + 100,00 = 655,55; B
   168,66 + 30,36 = 199,02; C 222,22 + 40,00 = 262,22. Encargo não tem esse segundo andar.
2. **O snapshot é de outra natureza.** `folha_item_provisoes` guarda nome, percentual,
   `valor_principal` e `valor_encargos` como estavam na geração. Desativar, reajustar ou excluir a
   provisão depois não mexe em folha já gerada.
3. **Cadastrar 13º ou férias como encargo ativo sem grupo HOJE conta o custo duas vezes**, uma em
   `folha_item_encargos` e outra em `folha_item_provisoes`, e o `explicado` da consulta de
   diagnóstico continua fechando 0,00 nas duas contagens. A duplicidade **não aparece** na
   conferência: aparece no custo da obra e no resultado do mês. Encargo sem grupo segue legítimo
   para custo patronal que de fato não tem guia neste sistema; para 13º e férias, não.

### 2. A identidade da folha tem QUATRO termos, e a provisão não é causa de resíduo

A identidade passou de três para quatro termos:

    soma(líquidos) + soma(guias) + soma(adiantamento descontado) + soma(provisões) = folhas.custo_total

O quarto termo nasceu porque a provisão **não tem contrapartida no contas a pagar**. Sem ela do lado
esquerdo, a soma dos lançamentos fica menor que o custo total em exatamente `folhas.valor_provisoes`.

**Termo da identidade e causa de resíduo são coisas diferentes, e as duas contagens não se
misturam.** Na identidade são quatro termos; na explicação do resíduo nada mudou: continuam as
**mesmas duas causas** de sempre (encargo sem grupo e retido sem grupo) mais **um detector** de
regressão (o líquido não positivo, que vale 0,00 por construção). São três termos na conta do
`explicado` porque o detector entra nela de propósito, não porque exista uma terceira causa.

Medido por contraste, na mesma folha, com a consulta **extraída do `obj_description` e executada**
(2.804 caracteres, mesmo md5 nas três leituras):

| | líquidos | guias | descontado | provisões | custo_total | resíduo | encargos sem grupo | explicado |
|---|---|---|---|---|---|---|---|---|
| sem provisão cadastrada | 5.620,28 | 1.775,01 | 1.804,15 | 0,00 | 10.051,24 | −851,80 | 851,80 | **0,00** |
| com provisão ativa | 5.620,28 | 1.775,01 | 1.804,15 | **1.116,79** | 11.168,03 | −851,80 | 851,80 | **0,00** |

O **resíduo é idêntico nas duas linhas**, e é isso que prova que a provisão não é causa de resíduo:
ela cresce do lado esquerdo exatamente o quanto o `custo_total` cresce do lado direito. Se alguém
contar a provisão nos dois lados, o `explicado` volta a acusar bug em folha certa, com o sinal
trocado. E qualquer cópia da consulta anterior a 14/08/2026 soma só três termos e devolve
`explicado = -folhas.valor_provisoes` em folha perfeita.

**Provisão não vira caixa, e isso foi medido pela contagem de lançamentos**, não por leitura de
código. A mesma folha foi aprovada, desaprovada, teve a provisão cadastrada, foi regerada e
reaprovada: **5 lançamentos (2 de líquido e 3 de guia) antes e 5 depois**, soma total dos
lançamentos **idêntica ao centavo**, `valor_liquido` **5.620,28 nas duas**, e 3 guias (`FGTS`,
`INSS`, `IRRF`) e nenhuma a mais. Só o `custo_total` mudou, de 10.051,24 para 11.168,03, delta
1.116,79, exatamente `valor_provisoes`.

### 3. O custo_total do BI da Gestão VAI SUBIR no mês em que a config for cadastrada

Config vazia é deploy seguro: com zero linha em `folha_provisoes` o `custo_total` é o de antes, ao
centavo. **No mês em que a primeira provisão for cadastrada, o custo da folha sobe, e nada
piorou.** No cenário medido, 8.518,00 de salário viram 11.168,03 de custo em vez de 10.051,24: 13%
a mais, sem nenhum centavo novo saindo do caixa.

Quem olha o painel de Gestão vai ver o custo da obra subir de um mês para o outro sem ordem de
compra nova e sem contratação. **O custo estava sendo subestimado antes**, porque 13º e férias são
obrigação que nasce mês a mês e só era vista quando paga. A provisão por centro de custo se soma
por `folha_itens.centro_custo_id`, nunca por `lancamento_rateios`, porque provisão não tem
lançamento e portanto não tem rateio.

### 4. Dependência do Bloco 8c: a provisão acumula e NADA a consome hoje

Hoje a provisão só cresce. Não existe nenhum caminho no sistema que a abata. **Quando o 13º for
pago (Bloco 8c), o valor pago tem que abater a provisão acumulada, senão o custo conta duas
vezes**: uma vez espalhada pelos meses em que foi provisionada, outra vez inteira no mês do
pagamento.

Não há trava impedindo isso hoje, e não há como haver, porque o pagamento do 13º não existe. É
dependência declarada, não esquecimento: quem abrir o 8c precisa ler esta entrada antes de escrever
a primeira linha.

### 5. O percentual de provisão cadastrado JÁ EMBUTE o terço constitucional (regra do dono, 14/08/2026)

Regra fornecida pelo Tiago em 14/08/2026, não inventada aqui: **o percentual que se cadastra em
`folha_provisoes` já vem com o terço constitucional de férias somado dentro dele.** "Férias
11,111%" é 8,333% de férias mais 2,778% de terço, já somados na hora de cadastrar. **O sistema não
modela o terço em lugar nenhum**: não há coluna, não há campo, não há cálculo. Ele existe apenas
dentro do número que a pessoa digita.

**Consequência para o Bloco 8d**, e é a parte fácil de errar: ao pagar as férias e abater a
provisão acumulada, o valor provisionado **já é férias com terço**. Somar o terço de novo na hora
do pagamento conta o custo duas vezes. Quem for implementar o pagamento de férias precisa tratar o
saldo provisionado como valor final, não como base sobre a qual aplicar 1/3.

### 6. O teto de 100% é na SOMA, é por TABELA e é INCLUSIVO

Cada percentual já era conferido isolado (`folha_provisoes`: > 0 e <= 100; `folha_encargos`: >= 0 e
<= 100), mas **a soma, que é o que de fato multiplica o salário, não era conferida por nada**. Duas
provisões de 60% somavam 120% do salário e nada reclamava. Agora há um trigger `before insert or
update` por tabela (`fn_trava_soma_provisoes` e a gêmea `fn_trava_soma_encargos`), com
`pg_advisory_xact_lock` para serializar sessões concorrentes, e linha inativa fora da conta (para
**desativar nunca ser recusado**, medido: com a soma em 100%, desativar uma passa e a soma cai para
80%).

As duas são `SECURITY DEFINER` de propósito: as policies de SELECT exigem
`tem_permissao('rh.encargos','ver')`, então com invoker um perfil com `criar` sem `ver` leria soma
zero e **a trava falharia ABERTA**. Definer lê a soma inteira e falha fechada.

Junto veio o piso de zero no salário (`colaboradores_salario_nao_negativo`, `salario is null or
salario >= 0`). O motivo é a provisão: antes dela, salário −1.000,00 gerava um item com
`custo_total` −1.200,00, lixo silencioso de um colaborador só; depois dela, a folha **inteira**
aborta no check de `folha_item_provisoes.valor_encargos` e nenhum item de nenhum colaborador é
gravado. Um cadastro errado bloquearia a folha dos outros 199. Nulo segue permitido (diarista,
terceiro), medido.

**O que a trava NÃO barra, e é limite honesto, não descuido:** o limite é **inclusivo** e **por
tabela**. Medido depois de aplicada: **cinco provisões de 20% somam exatamente 100% e passam de
propósito**; a sexta, de 0,001%, é recusada com a mensagem em português citando a soma das outras.
Com 100% de provisão e 20% de encargo ao mesmo tempo, o custo de um colaborador de 3.000,00 vai a
**7.200,00**, e isso passa. **Teto agregado entre as duas tabelas é decisão pendente do dono**, e
apertar o número sem ele pedir seria inventar regra de negócio. 100% é sanidade de cadastro, não
regra fiscal: encargo patronal real soma perto de 37%, provisão de 13º mais férias perto de 20%.

### 7. `fn_recurso_do_cadastro` perdeu cinco casos numa recriação, e recriar de cópia é A armadilha

A migration `20260810130444` (`excluir_obras_e_centros_custo`, **está no ledger e não tem arquivo
no repo**) recriou `fn_recurso_do_cadastro` para acrescentar `obras` e `centros_custo`, mas
**partiu de uma cópia incompleta** e derrubou cinco casos que a última definição versionada
(`20260727130001_folha_faixas_parametros.sql`) tinha: `funcoes`, `jornadas`, `folha_encargos`,
`folha_inss_faixas`, `folha_irrf_faixas`.

Efeito em produção, de 10/08 até esta frente: **exclusão e restauração quebradas** para esses
cinco. O dispatcher é usado por `fn_excluir_cadastro` e, como whitelist, por
`fn_restaurar_cadastro`. Excluir a função ou a jornada cadastrada, ou qualquer faixa de INSS/IRRF,
caía em "Tabela X nao pode ser excluida por esta funcao", e restaurar recusava igual. Ninguém
percebeu por dois blocos.

Hoje ela tem **quinze `when` e catorze casos vivos**, conferidos no banco em 14/08/2026:
`unidades_medida`, `categorias_insumo`, `clientes`, `fornecedores`, `insumos`, `colaboradores`,
`obras`, `centros_custo`, `funcoes`, `jornadas`, `folha_encargos`, `folha_provisoes`,
`folha_inss_faixas`, `folha_irrf_faixas`.

O décimo quinto `when` é `depositos`, e é **caso morto**: a tabela `depositos` caiu em
`20260720120003_reforma_a_drop_estoque` e `cadastros.depositos` não existe no catálogo de recursos,
então esse `when` não resolve para nada nem nunca vai. Ele ficou aqui de arrasto das recriações e
**não conta**. Entre 14/08/2026 e a primeira leitura desta entrada, "quinze casos" era contagem
errada num ponto que ensina justamente a contar os casos antes e depois: corrigido em 14/08/2026,
na rodada de correção do review amplo do Bloco 8b. Quem for mexer na função conta `when` **e**
confere `to_regclass` de cada tabela, senão herda o mesmo erro.

**A armadilha, escrita explicitamente: recriar essa função a partir de uma cópia é o modo de falha
dela.** É um `case` grande de uma linha por tabela, um `create or replace` a partir de qualquer
texto desatualizado apaga casos em silêncio, e nada acusa: não há erro, não há teste, não há
advisor. **Não existe teste travando isso.** Quem precisar mexer nela deve partir da definição
**viva** (`pg_get_functiondef` / `prosrc` no banco), nunca de um arquivo do repo nem de uma
migration anterior, e contar os casos antes e depois. Foi assim, e só assim, que os cinco voltaram.
Isso vale para o **comportamento**: o arquivo do repo pode estar à frente do `prosrc` em
**comentário**, e por isso o raciocínio se lê nos dois (ponto 8, limite 3).

### 8. Quatro limites honestos das ferramentas de conferência desta frente

Quem vier depois vai confiar nelas se estes limites não estiverem escritos.

1. **O teto de 100% é por tabela e inclusivo** (detalhado no ponto 6): cinco provisões de 20% somam
   exatamente 100% e passam. Teto agregado entre as duas tabelas é decisão pendente do dono.
2. **`fn_verificar_diagnosticos_gravados()` só roda `explain`, então é CEGA para conta errada.** Ela
   prova que a consulta gravada em comentário **resolve** contra o schema, não que ela ainda mede a
   coisa certa. **O erro desta frente não seria pego por ela**: a consulta de três termos compilava
   perfeitamente e devolvia `explicado = -749,98` numa folha perfeita. Quem pegou foi **medição
   humana** por contraste, comparando o `explicado` com `-folhas.valor_provisoes`. Consulta que
   compila e mente continua sendo pega só por prova de aceite com números esperados.
3. **A receita de conferência arquivo × ledger é cega para payload de comentário dentro de
   dollar-quote.** Ela normaliza removendo `--[^\n]*` antes do `md5`, exatamente para tolerar o
   cabeçalho "não rode `db push`" e a quebra de linha final. Consequência: qualquer coisa escrita
   como comentário **dentro** de um `$$ ... $$`, inclusive o `comment on function` inteiro, é
   apagada da conferência e pode divergir entre arquivo e ledger sem a receita acusar. Isso importa
   porque `fn_aprovar_folha` tem um `obj_description` de mais de 20 mil caracteres, que é onde a
   consulta de diagnóstico vive. **Quem cobre isso de fato é a trava de `md5(prosrc)`** dentro da
   própria migration, e a receita de md5 de função é `md5(prosrc)`, **não**
   `md5(pg_get_functiondef)`: por `functiondef` os hashes são outros, e isso já causou falso alarme
   nesta frente.

   **Consequência que troca a regra de leitura do ponto 7: o arquivo do repo pode estar À FRENTE do
   `prosrc` em comentário, e está.** Porque a receita é cega a comentário, corrigir comentário num
   `.sql` já aplicado é permitido e não gera migration, então o arquivo acumula raciocínio que a
   definição viva não tem. Medido em 14/08/2026 nas duas travas da migration `20260814183909`: corpo
   vivo de `fn_trava_soma_provisoes` com 1.610 caracteres contra 2.254 no arquivo, e
   `fn_trava_soma_encargos` com 640 contra 867, com o SQL executável **idêntico dos dois lados** (md5
   normalizado `9ed20d8dad8a5df0c4b87e7cc01dfb65` e `7143172054258151925bf124bd705f58` no arquivo e
   no banco). O que só existe no arquivo inclui o parágrafo do **upsert contar a própria linha duas
   vezes** e a qualificação de que a exclusão da própria linha vale para **UPDATE puro**. Então o
   ponto 7 continua valendo para comportamento (parta do `prosrc`), mas quem for mexer numa função
   **lê os dois**: o `prosrc` para o que a função faz, o arquivo do repo para o porquê. Ler só o
   `prosrc` de uma dessas duas travas é abrir o primeiro upsert nessas tabelas sem saber do risco.

4. **A correção do `paraNumero` foi por cópia, e ainda sobra uma.** O percentual digitado era
   convertido por três cópias da mesma função. A extração para `rh/percentual.ts` (Task 1) achou e
   consertou um furo de dinheiro: `"0.5"` virava **5** caladamente, porque o ponto era tratado como
   separador de milhar sem conferir o agrupamento, e o `casasDecimais` antigo contava 0 casas em
   notação exponencial (`(1e-7).toString()` é `"1e-7"`, sem ponto). Dez vezes o valor pretendido,
   **aprovado pelo teto de 100% e pelo check da coluna**: com 20 CLT a 3.000,00, 300,00/mês de
   encargo viram 3.000,00/mês. O conserto foi na cópia do formulário, e as outras duas seguiram com
   a versão antiga até a rodada de correção do review amplo, em 14/08/2026, que fez
   `rh/encargos/importacao.ts` importar `paraNumero` e `casasDecimais` de `rh/percentual.ts` — era a
   cópia que alimenta `folha_encargos.percentual`, a coluna que depois desta frente multiplica o
   salário **e** a provisão (`v_prov_encargos := round(v_prov_principal * v_pct_total / 100.0, 2)`),
   e o caminho de planilha é exatamente onde `0.5` chega, copiado de Excel em locale inglês.
   **Sobra uma cópia, de propósito:** `rh/parametros-folha/schemas.ts`, onde `"0.5"` ainda vira 5. É
   parâmetro fiscal digitado por uma pessoa numa tela, não planilha importada, e a divergência está
   escrita nos dois comentários do arquivo. Unificar é conserto de uma linha para quem passar ali.

### 9. Dois achados da prova de aceite que a frente NÃO fechou, os dois pendentes de decisão do dono

Nenhum dos dois mexe em dinheiro, e nenhum dos dois foi criado por esta frente. Os dois tornam o
conserto do ponto 7 **inalcançável pela tela**, e por isso ficam registrados em vez de silenciados.

**a) `rh.encargos` nunca teve a ação `excluir`, então excluir provisão ou encargo é inalcançável
hoje.** `src/config/recursos.ts` declara `rh.encargos` com `acoes: CRUD` (inclui `excluir`), mas a
migration `20260727110002_perm_encargos` semeou a matriz **copiando as ações de `rh.folha`**, que
são `ver, criar, editar, aprovar, desaprovar` e não incluem `excluir`. Medido em produção: os dois
usuários ativos têm `rh.encargos` com `criar, editar, ver` e **zero `excluir`**, enquanto as irmãs
`rh.parametros-folha`, `cadastros.funcoes` e `cadastros.jornadas` têm `excluir` sincronizado nos
dois. `provisoes/actions.ts` exige `exigirPermissao('rh.encargos','excluir')`, então a exclusão
recusa antes de chegar ao banco. É **pré-existente** (desde 27/07), mas esta frente consertou o
dispatcher justamente para esse caminho funcionar. **Decisão do dono**, porque define quem pode
apagar um percentual que multiplica salário.

**b) `TABELAS_RESTAURAVEIS` tem 6 tabelas e o dispatcher do banco tem 14 casos vivos.**
`src/modules/administracao/lixeira/restauravel.ts` lista `unidades_medida`, `categorias_insumo`,
`clientes`, `fornecedores`, `insumos`, `colaboradores`. Faltam **oito** (medido em 14/08/2026,
contra os catorze vivos do ponto 7, não contra os quinze `when`): `obras`, `centros_custo`,
`funcoes`, `jornadas`, `folha_encargos`, `folha_provisoes`, `folha_inss_faixas`,
`folha_irrf_faixas`. `lixeira-tabela.tsx` usa essa lista para decidir se mostra o botão Restaurar:
para as oito, ele aparece **desabilitado**, com o tooltip "Este tipo de registro não pode ser
restaurado pela lixeira". Medido em transação revertida que **o banco restaura a provisão sem
reclamar**: `fn_excluir_cadastro` move para a lixeira e `fn_restaurar_cadastro` reinsere. **É a UI que está errada, não o banco**, e o comentário do arquivo ainda diz "Obras,
equipamentos e centros de custo não entram", que deixou de ser verdade em 10/08. É o **mesmo modo
de falha do ponto 7**, uma allowlist duplicada que envelhece em silêncio, só que do lado do
TypeScript, e também **sem teste** casando os dois lados. O conserto barato e durável é um teste
que leia os casos de `fn_recurso_do_cadastro` e case com a constante, ignorando `when` de tabela que
não existe mais (hoje só `depositos`), senão ele nasce falhando por um caso morto.

## 2026-08-14 - Relatório clicável: o total da lista tem que fechar com a célula, e isso custou um campo novo

Os seis relatórios do Financeiro viraram becos sem saída: a tela dizia que o 009 - BR-364
custou R$ 3,23 mi em julho e não havia o que fazer com o número. Agora clicar em qualquer
dimensão abre, em aba nova, os lançamentos daquela fatia com o mesmo filtro.

A decisão que governa o resto: **o total da lista que abre é igual à célula que foi
clicada.** Sem isso o recurso é decorativo — quem confere vê dois números diferentes,
conclui que um está errado e para de usar os dois.

**Por que isso exigiu um campo novo (`valorRecorte`).** Cada relatório soma um GRÃO
diferente, e a listagem soma o valor do documento:

| relatório | grão | fecha com a lista? |
|---|---|---|
| DRE | lançamento | sim |
| Custo por centro de custo | **rateio** | não: 121 lançamentos são rateados entre obras |
| Fluxo de caixa | **parcela**, pelo líquido | não |
| Aging | **parcela aberta** | não |
| Posição bancária | **parcela paga**, pelo líquido | não |
| Custo por grupo de insumo | misto (item de OC ou rateio) | por identidade, hoje |

`LancamentoLista.valorRecorte` (null = sem recorte) e `resumirLancamentos` somando
`valorRecorte ?? valor` resolvem os cinco. Zero é fatia de zero e é diferente de null.

**A fatia de parcela viaja num parâmetro só (`recorte`), e pela chave da dimensão, não
por uma reconstrução dela.** Medido: **694 parcelas foram pagas em mês diferente do
vencimento**. O fluxo de caixa agrupa o realizado pelo mês do PAGAMENTO, então mandar
`venc_de`/`venc_ate` num clique de barra realizada erraria nessas 694 — hoje, na base
real. No aging o mesmo vale nas bordas de faixa e na parcela sem vencimento (que ele
conta como "a vencer" e um filtro de data descartaria). Por isso existe a
`fn_lancamentos_do_recorte`, que reusa a classificação de `fn_rel_aging` e
`fn_rel_fluxo_caixa` em vez de copiá-la para o TypeScript.

**Centro e parcela ao mesmo tempo: o centro ganha, e não é o produto dos dois.** Ratear
o valor da parcela pela proporção do centro é uma conta que nenhum relatório pede, e ela
apareceria na tela com aparência de verdade. Precedência declarada e travada por teste.

**Previsto continua DENTRO por padrão.** O relatório sempre incluiu previsto (só exclui
cancelado). Fazer "incluir previsto" um opt-in mudaria o número sem ninguém pedir, e como
a base tem 0 previsto hoje a mudança não apareceria na tela e só morderia no primeiro
previsto lançado. O filtro é o EXCLUDE (`sem_previsto`), desligado por padrão.

**A prova constrói o caso; não confere o dado de hoje.** A base tem 0 cancelados, 0
previstos e 0 parcelas sem vencimento, então o caminho errado daria o mesmo número do
certo e um teste sobre o retrato de hoje passaria sem provar nada.
`supabase/provas/drill_fecha_com_a_celula.sql` insere um rateado 60/40, um cancelado, um
previsto e uma parcela paga fora do mês, numa transação revertida. Rodada em 14/08: as
seis conferências deram 0,00, e a linha de CONTROLE (a mesma conta de propósito sem a
exclusão de cancelado) deu R$ 50.000,00 — o valor exato do cancelado. É o controle que
prova que a prova funciona.

**Não vira link, e o motivo importa:** "Sem centro de custo" e "sem categoria" (não há o
que filtrar, e um link que abrisse a lista inteira mentiria sobre o que mostra), faixa de
aging zerada (abriria lista vazia), grupo COM insumo (soma item de OC; `drillGrupoInsumo`
LANÇA em vez de abrir, para o dia da primeira OC não virar um total que não fecha), e
tudo isso para quem não tem `financeiro.lancamentos` `ver`, que cairia num 404.

## 2026-08-14 - Duas sobrecargas de uma `fn_rel_*` quebram em runtime, e o build não vê

`fn_rel_custo_centro_custo` ficou com duas sobrecargas no banco vivo: a de 4 parâmetros do
painel de Gestão, aplicada enquanto este trabalho estava em curso, e a de 6 que a migration
`20260814140000` criou sem saber dela.

Com duas sobrecargas de mesmo prefixo e **todos os argumentos com default**, a chamada por
nome que o PostgREST faz fica ambígua:

```
ERROR 42725: function fn_rel_custo_centro_custo(unknown, unknown) is not unique
HINT: Could not choose a best candidate function.
```

O relatório quebrou em produção com `tsc`, lint, testes e build todos verdes — é o mesmo
feitio do embed ambíguo do PostgREST (HTTP 300) já registrado aqui.

Conserto na `20260814150000`: **uma função só, com a união dos parâmetros**, na ordem da de
4 primeiro, para não quebrar chamada posicional nem por nome de nenhum dos dois lados.

Duas lições, e a segunda é a que pega de novo:
1. `create function` com assinatura diferente **cria sobrecarga**, não substitui. `drop`
   antes, com a assinatura EXATA, e conferir depois com `pg_get_function_identity_arguments`
   que sobrou uma só.
2. **O banco vivo se move enquanto se trabalha nele.** Ler a definição de uma função no
   começo da sessão não garante que ela é a mesma na hora de aplicar. Reler antes do
   `apply_migration` quando houver outra frente aberta no mesmo projeto.

## 2026-08-13 - A listagem de lançamentos ordena no servidor, e coluna que o banco não sabe ordenar não ganha seta

Descoberto ao investigar "a coluna de fornecedor tem que ser parecida com a da aprovação":
**nenhuma coluna da listagem de lançamentos ordenava.** Não era detalhe do fornecedor.

A causa: a listagem passa `total` para o DataTable, o que liga o modo servidor, e nesse modo o
canônico só habilita ordenação se receber `onSortingChange` (`enableSorting: !modoServidor ||
onSortingChange !== undefined`). A tela não passava, então a tabela inteira ficava sem seta. Na
aprovação de pagamentos funciona porque ela carrega tudo e ordena no cliente.

1. **Ordena no SERVIDOR, sobre o filtro inteiro.** São 5.906 lançamentos paginados de 25 em 25:
   ordenar a página carregada mostraria o maior valor DA PÁGINA quando a pessoa pede o maior valor.
   Numa tela de dinheiro isso não é limitação, é resposta errada com cara de certa. Medido depois
   de pronto: por Valor desc o topo é R$ 3.249.275,31, e antes a página 1 tinha R$ 878,00.

2. **Coluna que o banco não sabe ordenar NÃO ganha seta.** `ordenacao.ts` tem a lista fechada das
   oito colunas que existem em `lancamentos`. Ficam de fora Fornecedor e Categoria (join), Revisão
   e os valores pago/aberto/vencido (calculados no app a partir das parcelas) e a coluna do recorte
   (somada no app). Elas são `enableSorting: false`: melhor não oferecer do que oferecer e ordenar
   só a página. **Um teste amarra as duas pontas** (`ordenaveis()` da tabela === chaves de
   `COLUNA_DO_BANCO`), porque seta sem suporte no servidor é clique que não faz nada, e suporte sem
   seta é recurso escondido.

3. **A ordem mora na URL, como os filtros.** Link compartilhado abre na mesma ordem, e a exportação
   para Excel lê os MESMOS filtros, então a planilha sai na ordem da tela. O padrão (data da compra
   desc) não vai para a URL, para o link ficar limpo. Ordem inventada na URL cai no padrão em vez de
   erro: a URL é editável e nada cru chega no `order` do banco.

4. **O desempate por `id` fica MAIS importante, não menos.** Ordenar por status empata quase tudo
   (3 status distintos em 5.906 linhas). Medido: páginas 1 e 2 por status têm 0 id em comum com o
   desempate. Sem ele, a página 2 repetiria linha e sumiria com outra — ver a entrada da paginação
   sem desempate.

## 2026-08-13 - "Limpar filtros" em todo lugar, e por que ele é UMA escrita e não N

Todo lugar do app que tem filtro ganhou botão "Limpar filtros", que só aparece quando algum filtro
está preenchido. São dois hosts canônicos de filtro, não um: o `filtros` do **DataTable** (45 telas)
e a **BarraFiltrosConfiguravel** (relatório de custo por centro de custo e painel de Gestão, que não
têm tabela). Levantamento inicial que dizia "nenhum filtro vive fora do DataTable" estava errado:
procurava por `<FilterBar>`, e a segunda barra tem outro nome.

1. **Limpar é UMA escrita, não uma por filtro.** A primeira versão chamava o `onLimpar` de cada
   filtro em sequência. Funciona para filtro em estado local (cada `setState` é independente e o
   React agrupa), e **quebra** para filtro que vive na URL: cada `onLimpar` chama `setMuitos`, que
   monta a URL a partir do `searchParams` da renderização, e essa referência não muda no meio de um
   laço síncrono. A segunda escrita parte da URL antiga e desfaz a primeira. Medido na tela: limpar
   busca e status limpava a busca e o status voltava.

   Por isso o canônico aceita `onLimparFiltros`, que a tela implementa como uma escrita só
   (`limparTodos` do `useFiltrosUrl`), e cai no laço apenas quando a tela não passa nada — o caso do
   filtro em estado local, onde o laço está correto.

2. **Acumular dentro do `setMuitos` foi tentado e recusado.** Guardar as mudanças num ref e adiar a
   navegação para o fim do tick fez o clique parar de ter efeito nenhum no navegador, sem erro no
   console. Não vale enfeitar o funil de escrita para contornar quem chama errado; o contrato passou
   a ser explícito ("uma chamada por interação") e há teste que DOCUMENTA a limitação.

3. **`limparTodos` apaga por exclusão, não por lista.** São 16 telas com filtro na URL, algumas com
   dezesseis filtros: uma lista de chaves por tela sairia de sincronia no primeiro filtro novo, e o
   sintoma seria o botão limpando quase tudo — pior que não limpar. Sobrevivem só `tamanho`, `ordem`
   e `direcao`, que não mudam QUAIS linhas entram na lista. `pagina` é apagada, o que a leitura
   entende como primeira página.

4. **O campo de busca entra no "limpar".** 36 telas declaravam a busca sem `temValor`/`onLimpar`
   (eles existiam só para limpar filtro escondido no menu). Sem isso, o botão limpava os seletores e
   deixava o texto filtrando, com a tela dizendo que tinha limpado.

**Não verificado no navegador.** A tentativa de validar ponta a ponta caiu em ambiente instável
(página servida sem hidratar, bundle velho depois de Fast Refresh, e por fim renderer congelado), e
o que eu media não era o código novo. Os testes cobrem o comportamento, mas quem confirma que o
clique limpa é a tela.

## 2026-08-13 - Espelho impresso: rota no servidor, sem ação nova de permissão, e por que os ids validam por guid

Lançamento, ordem de compra e pagamento ganharam um espelho impresso: uma folha por documento, com
tudo que a tela de detalhe mostra (dados, parcelas, rateio por centro de custo, trilha, anexos),
acessível pela barra de seleção da listagem e pelo próprio detalhe. Quatro decisões de desenho
valem registro, mais o que as revisões corrigiram.

1. **Rota renderizada no servidor, uma por documento, e não um dialog como o do holerite.** O
   holerite imprime de DENTRO do app: abre um dialog, `window.print()` roda com a tela ainda atrás,
   e `.holerite-print`/`visibility: hidden` no `globals.css` escondem tudo que não é o holerite
   daquele dialog. O espelho vive no grupo `(espelho)`, sem `AppShell`, e a PÁGINA INTEIRA é o
   documento — nada para esconder. Um dialog foi cogitado e recusado: com os até 50 documentos que
   `MAX_ESPELHOS` permite, um dialog listando 12 ou 30 documentos é inutilizável, e o truque de
   `visibility: hidden` sobre `body *` fica frágil quando o conteúdo mora dentro de um portal de
   dialog. Rota por documento também é a convenção do projeto (Server Component lendo dado), a
   permissão vem das MESMAS queries e do RLS que a tela de detalhe usa, N documentos em um trabalho
   de impressão só saem com quebra de página no CSS (`.espelho-documento { break-after: page }`), e
   listagem e detalhe compartilham o mesmo componente `EspelhoImpresso` sem chance de divergir.

2. **Nenhuma ação `imprimir` nova em `ACOES`.** `ACOES` é `ver, criar, editar, excluir, aprovar,
   desaprovar` (`src/config/recursos.ts`) e continua assim. O espelho não mostra nenhum dado que o
   usuário não leia já na tela de detalhe — é o MESMO dado, só formatado para papel — então uma
   permissão de imprimir seria teatro: um `print screen` da tela de detalhe reproduz o mesmo
   "vazamento" sem passar por permissão nenhuma. Em troca, `imprimir` no catálogo abriria uma coluna
   NOVA na matriz de permissão de TODOS os recursos do sistema (não só os três que têm espelho hoje)
   e obrigaria reconceder todos os perfis existentes para não quebrar quem já usa o recurso. Custo
   largo, controle real nenhum. A permissão que protege continua sendo a de sempre: `ver` no
   recurso, checada antes de qualquer busca (primeira coisa em cada `page.tsx` do grupo
   `(espelho)`).

3. **`print-color-adjust: exact` é obrigatório, e nenhum dado impresso depende de cor.** O navegador
   remove cor de fundo ao imprimir por padrão; sem a regra (declarada em `.espelho-raiz`, no
   `globals.css`) a Faixa âmbar do cabeçalho sai branca. Mas a regra sozinha não basta: o usuário
   pode desligar "gráficos de fundo" no diálogo do sistema operacional, e o espelho não tem como
   saber se ele desligou. Por isso NENHUM dado do documento pode depender de cor para ser lido:
   status de lançamento, de OC e de parcela saem sempre como TEXTO (`rotuloStatusLancamento`,
   `infoStatusOC(...).rotulo`, `STATUS_PARCELA[...].rotulo`), nunca como `StatusBadge`. Se um
   `StatusBadge` aparecer dentro de um espelho no futuro, é sinal de que a regra foi contrariada.

4. **Os ids da rota (`?ids=`) validam por `z.guid()`, e não pelo `z.uuid()` do Zod — de propósito.**
   `z.uuid()` no Zod 4 exige os bits de versão e variante do RFC 9562; a coluna `uuid` do Postgres não
   exige nada disso. A importação da BR-364 (`fn_importar_br364_lote09`, migration
   `20260804140000`) derivou ids determinísticos com `md5(...)::uuid` para poder rodar duas vezes
   sem duplicar, e md5 devolve 32 hex crus: os dígitos de versão e variante saem qualquer coisa (ex.
   real em produção: `c4e0f922-3aec-8c72-7089-225523e04557`, variante 7, quando o RFC só aceita 8, 9,
   a ou b). São milhares de lançamentos, parcelas e rateios assim — id legítimo para o banco, e
   exatamente o histórico que o espelho existe para poder imprimir. `z.uuid()` recusaria esses ids
   com "Identificador inválido" **e passaria em todo teste escrito com uuid novo** (`crypto.randomUUID()`
   já sai na variante certa), porque o teste nunca usa um id real da BR-364. `src/lib/id.ts`
   (`idSchema`) documenta isso desde o fix da tela de detalhe (#77); o espelho só reusa o mesmo
   schema. O papel da validação aqui é barrar lixo antes do banco (vazio, texto solto, tentativa de
   injeção); quem garante que o id existe e que o usuário pode vê-lo é a FK e a RLS.

**O que as revisões pegaram, porque é a parte que serve para a próxima vez:**

- Um lançamento a receber em aberto imprimia o código cru `"a_pagar"` como status: `"a_pagar"` é o
  código genérico de pendência tanto de um lançamento a pagar quanto a receber, e sem o `tipo` do
  lançamento no `select`, `rotuloStatusLancamento` não tinha como inverter o rótulo. Um recebível
  saía com cara de dívida. Corrigido levando `tipo` ao `select` dos dois espelhos que citam status de
  lançamento (lançamento e pagamento) — fix `59f5a1d`.
- O rateio por centro de custo da OC agrupava por NOME do centro, não por id. `centros_custo` é uma
  árvore (Obra > Etapa > Item) sem unicidade de nome: dois nós de nível 3 em obras diferentes podem
  se chamar "Diesel". Agrupar por nome mesclava, em silêncio, o custo de dois centros diferentes numa
  linha só do papel — exatamente o tipo de erro que um documento de auditoria não pode cometer.
  Corrigido agrupando por `centro_custo_id` — fix `56b2d5b`.
- Os cinco valores de `tipo` de `parcela_eventos` escritos no plano de implementação estavam todos
  errados. O valor real, conferido contra o `CHECK` da migration `20260730120001` (linha 90), é
  `aprovou, revisou, reenviou, desaprovou, reprogramou` — sem `pagamento`, porque `fn_pagar_parcela`
  só atualiza a parcela e propaga anexos, sem gravar trilha própria. Rótulo de evento errado no
  código não quebra `tsc` nem lint: só aparece como texto errado (ou o `tipo` cru, sem tradução) na
  Trilha do espelho de pagamento, e só contra o banco de verdade.

**O que a revisão do branch INTEIRO pegou, e as doze revisões por task não:**

As doze revisões olharam cada task contra o seu próprio plano, e o plano estava errado em dois
pontos. Revisão por task não tem como pegar isso: ela confirma que o código faz o que o plano
mandou. Os dois achados abaixo são de coisa que atravessa arquivos que nenhuma task tocou junto.

- **Todo espelho imprimia folha em branco.** `globals.css` tem `body * { visibility: hidden }`
  dentro de um `@media print`, e o único `visibility: visible` do projeto inteiro era o do
  `.holerite-print`. A spec deste branch leu essa regra como se fosse escopada ao holerite. Não é:
  `globals.css` entra uma vez só, pelo layout raiz; o grupo `(espelho)` é layout ANINHADO e
  renderiza dentro do MESMO `<body>`; e `body *` bate em tudo. As três rotas montavam a página
  inteira e o navegador imprimia nada. Corrigido reacendendo a árvore do espelho
  (`.espelho-raiz, .espelho-raiz *`, especificidade 0,1,1 contra 0,0,1 de `body *`, então vence por
  ter uma classe a mais, não por ordem no arquivo), e os dois blocos de `@media print` ganharam
  comentário dizendo que a regra é global — a próxima superfície imprimível precisa revertê-la de
  propósito ou cai no mesmo buraco. **Nenhum dos 1490 testes dizia nada sobre isso: jsdom não avalia
  CSS de impressão.** É exatamente o que o e2e de Playwright dispensado neste branch teria pego, e
  fica registrado como o custo daquela decisão.
- **`@page` removido, não ajustado.** O branch tinha declarado `@page { size: A4; margin: 12mm }`.
  `@page` não tem como ser escopado a uma subárvore: ele mudaria também a geometria do holerite,
  num branch que declarou não tocar nele. Removido em vez de "verificar se o holerite aguenta":
  a geometria do espelho já vem do próprio documento (`max-w-[190mm]` e padding), que É escopável,
  e assim o risco de regressão desaparece em vez de depender de conferência manual.
- **O espelho da OC imprimia dois números diferentes com o mesmo rótulo.** A migration
  `20260817160000`, de 17/08 e já na base quando este branch começou, mudou o que `valor_total`
  significa: passou a ser `round(soma dos itens + frete + outras + impostos - desconto, 2)`. O plano
  leu o comentário da migration ANTIGA (`20260618210002`), onde o total era só a soma dos itens.
  Resultado no papel: o cabeçalho imprimia o total geral rotulado "Total dos itens", o rodapé da
  tabela imprimia a soma real dos itens com o MESMO rótulo, e nenhum campo dizia quanto vale a
  ordem. Seis das dezessete OCs carregadas do Mais Controle têm ajuste; na 2592 os dois números
  diferem em R$ 3.835,95. Corrigido, e corrigido reusando o que a tela de detalhe já usava
  (`LINHAS_DE_AJUSTE` e `temAjuste`, em `calculo.ts`), em vez de inventar rótulo novo no papel:
  as duas superfícies agora imprimem a mesma conta, com os mesmos rótulos e os mesmos sinais.

  **A causa raiz de isso sobreviver a doze revisões foi uma fixture mentirosa.** `LINHA`, em
  `espelho.test.ts`, tinha `valor_total` 100.000 com 500 de frete e 100.000 de itens. Essa OC não
  pode existir: `trg_total_oc_cabecalho` é BEFORE e recalcula em todo INSERT e UPDATE. A fixture
  encarnava a crença errada do autor, e dois testes travavam o invariante falso por cima dela — de
  modo que o teste "provava" o que o código fazia de errado. **Fixture de dinheiro tem que ser
  aritmeticamente possível sob as triggers vivas**, senão ela vira prova da crença do autor em vez
  de prova do sistema. Vale para todo o projeto, não só para este espelho.
- **Célula de tabela vazia saía em branco onde a regra pede travessão.** `EspelhoTabela` usava
  `linha[chave] ?? "—"`, e `??` não pega string vazia — mas `formatarData(null)` devolve `""`.
  Parcela em aberto não tem `dataPagamento`, então a coluna "Pago em" saía vazia, e vazio não
  distingue "não tem" de "esqueceram de imprimir" num papel que serve de prova. `EspelhoCampos` e
  `EspelhoDinheiro` já tratavam `""`; só a tabela ficou para trás. Como o defeito É a divergência
  entre três cópias da mesma regra, ela virou um helper único que os três chamam. `0` e `false`
  continuam sendo valor de verdade, nunca travessão, e a linha de totais segue de fora de propósito.
- **O espelho afirmava um pagamento que não aconteceu.** A tela de aprovação oferecia "Imprimir
  espelho" sem olhar o status, e ali a parcela ainda NÃO foi paga. Agrava que `valor_liquido` é
  coluna calculada: vem preenchida mesmo em parcela em aberto. O papel saía dizendo "Saiu da conta
  R$ 1.000,00" para dinheiro que não saiu de conta nenhuma. Corrigido nas DUAS camadas — o botão só
  existe com status `pago` (a mesma regra que a listagem já aplicava), e a página degrada sozinha se
  receber o id de uma parcela não paga (título "Parcela" em vez de "Pagamento", primeira seção
  acompanhando o título, "Saiu da conta" e "Pago em" em travessão, resto do documento intacto).
  **As duas camadas porque o link do espelho é colável**: a regra "o papel não mente" não pode
  depender de o botão estar escondido. "Está paga" é por STATUS, nunca por "tem `dataPagamento`" —
  `fn_pagar_parcela` grava os dois juntos e `fn_estornar_pagamento` limpa os dois juntos, e a conta
  bancária impressa vem da parcela (que o estorno limpa), não do lançamento.
- **Linha de total tem que reduzir sobre as linhas impressas, nunca ecoar o documento pai.** Apareceu
  três vezes neste branch: no total dos itens da OC, no total do rateio da OC e no total do rateio do
  pagamento (este ecoava `lancamentoValor`). Ecoar o pai esconde a divergência exatamente no lugar
  onde ela apareceria. E o rótulo tem que nomear o que o número é: quando o total do rateio passou a
  somar as linhas, "Total do lançamento" virou "Total do rateio", senão seria o mesmo defeito do
  espelho da OC — um número com o nome de outro. O valor do pai continua no papel, em campo próprio,
  para o leitor comparar.

**A regra geral que sai deste branch, e que vale para qualquer documento impresso do ERP:** o papel
não pode afirmar mais do que o sistema sabe. Todo campo que AFIRMA um fato (um pagamento, uma
entrega, uma aprovação) precisa de guarda de estado no servidor, porque a URL é colável; todo total
tem que ser derivado das linhas que o próprio papel imprimiu; e todo rótulo tem que nomear o número
que está embaixo dele.

---

## 2026-08-18 - Barra de filtros em trilhos, com rótulo em cima, e as ações fora da fileira

**Contexto:** a aba de Lançamentos mostra até dezesseis filtros, e a barra dela era uma escada. Três
coisas somadas produziam isso:

- **Largura pelo conteúdo.** `FiltroSelect` era `w-fit`, então "Todos os tipos" e "Todos os centros
  de custo" nasciam de tamanhos diferentes e nada da segunda linha caía embaixo da coluna da
  primeira. Pior: o gatilho media o texto da opção ESCOLHIDA, então o mesmo filtro mudava de largura
  ao ser preenchido e empurrava para o lado todos os filtros seguintes da linha.
- **Dois idiomas de rotulagem.** Seletor punha o nome da dimensão DENTRO do controle, como valor
  ("Todos os status"); data, mês e faixa punham FORA, numa palavra cinza solta à esquerda do campo.
- **Ações no meio do fluxo.** "Filtros/Altura/Colunas" eram irmãs dos filtros num `justify-between`,
  então grudavam no fim da PRIMEIRA linha e os filtros iam quebrando por baixo delas. O resultado com
  onze filtros visíveis era um buraco no fim da última linha, com três botões pendurados acima dele.

**Decisão:**

1. **Todo filtro mede um trilho (13rem) ou dois, nunca o próprio texto.** Quem declara a largura é o
   filtro canônico, não a tela: busca, período e faixa de valor pedem dois trilhos; seletor e mês,
   um. Como cada item é múltiplo de trilho + `gap-2`, o `flex-wrap` alinha as linhas sozinho, sem
   grid e sem a tela precisar saber quantas colunas caberiam. 13rem é o que cabe o rótulo mais longo
   do app ("Todos os centros de custo") sem cortar com reticência.

2. **O rótulo vem do host, por contexto.** O `rotulo` que o DataTable e a BarraFiltrosConfiguravel
   já exigiam para o menu "Filtros" passou a ser desenhado em cima do controle. Vai por contexto
   (`ContextoRotuloFiltro`) porque o host recebe o filtro JÁ MONTADO no `elemento` e não tem como
   injetar prop em elemento pronto: assim os cinco canônicos ganharam rótulo sem nenhuma das 43 telas
   mudar uma linha, e elemento que não é canônico (o Switch da Lixeira) simplesmente não lê o
   contexto e continua com o Label dele.

   O ganho não é só de alinhamento: filtro PREENCHIDO passou a dizer de que dimensão ele é. Antes, o
   seletor de status filtrado mostrava só "A pagar", sem nenhuma pista de que aquilo era status.

3. **As ações saem da fileira dos filtros** para uma linha própria: "Limpar filtros" à esquerda (é
   ação sobre o filtro) e os menus de vista à direita, colados na tabela que eles governam. O
   `toolbar` da tela ("Importar OFX") vai com o grupo da esquerda.

4. **Um único `BlocoFiltros` desenha a barra** para os dois hosts de filtro do app. Eles desenhavam a
   mesma barra em dois lugares, e barra igual em tela diferente é metade do que "harmonizado" quer
   dizer.

**Consequência:** a altura da barra não cresceu apesar do rótulo novo, porque a linha das ações
devolveu o espaço que o buraco desperdiçava: em Lançamentos com onze filtros são as mesmas duas
linhas de antes. Tela com poucos filtros ganha uma linha de 32px, que é o preço de a barra ser igual
em todo lugar.

**De brinde, um defeito que a captura de tela denunciou:** os cinco KPICards da mesma fileira
terminavam em alturas diferentes. O `h-full` que existia no cartão para garantir altura igual era
justamente o que a impedia: altura de 100% num item de flex DESLIGA o `align-items: stretch`, e a
porcentagem passa a medir contra a altura da grade, que é indefinida porque ela cresce pelo conteúdo.
Cada cartão voltava a ter a altura do próprio texto, e o de detalhe em duas linhas descia mais que os
vizinhos. O `h-full` ficou só dentro do `Link` do cartão clicável, onde o item de flex é o Link e a
altura já está definida.

**Verificação:** seis testes de layout com as peças reais (DataTable e os cinco filtros canônicos) e
dois de altura de cartão, cada um conferido por mutação: desligar o rótulo, devolver o `w-fit`,
devolver a palavra solta do período, devolver as ações para a fileira dos filtros, devolver a cópia
do campo de busca e devolver o `h-full` derrubam exatamente o teste que os acusa. Confirmado também
no navegador, nos três hosts: Lançamentos (DataTable com onze filtros), Centros de custo
(BarraFiltrosConfiguravel) e Lixeira (filtro que não é canônico).

---

## 2026-08-18 - Número de documento repetia a cada dez a partir de 10.000, e o culpado era o `lpad`

**Contexto:** o Tiago viu vários lançamentos com o mesmo número. A leitura fácil seria culpar a carga
histórica, e ela estaria errada: quatro lançamentos criados **hoje** pelo app, minutos um do outro,
saíram todos como LAN-2026-1900.

Estado medido antes: **5.911 lançamentos ocupando 594 números**, todos entre LAN-2026-1307 e
LAN-2026-1900. A distribuição entregou o padrão: 581 números com exatamente dez lançamentos, cinco
com nove, cinco com oito. Repetição regular assim não é corrida nem carga desastrada, é aritmética.

**A causa é uma linha:** `proximo_numero_documento` formatava com `lpad(v_num::text, 4, '0')`, e o
`lpad` do Postgres **corta** quando o texto é maior que o tamanho pedido:

```
lpad('9999',  4, '0') = '9999'
lpad('10000', 4, '0') = '1000'
lpad('10009', 4, '0') = '1000'
lpad('19004', 4, '0') = '1900'
```

`documento_sequencias` marcava 19.005 para LAN/2026. Enquanto a sequência esteve abaixo de 10.000 o
número foi único; ao passar disso, cada dez valores consecutivos colapsaram no mesmo texto. É o único
`lpad` do banco, e ele numera os três tipos de documento que existem hoje (LAN, OC, COT): ordens de
compra estão em 31 e cotações em 0, então elas ainda não tinham sido atingidas.

**Decisão:**

1. **O tamanho virou piso, não teto** (`greatest(4, length(v_num::text))`). Quatro dígitos continuam
   sendo o padrão; número com cinco dígitos cresce em vez de perder o último. Recortar número para
   caber num formato é trocar identidade de documento por alinhamento de coluna.

2. **Renumerar TODOS os 5.911, e não só as repetições.** Não existe "o primeiro de cada grupo" para
   preservar: todos os 594 números eram compartilhados, então manter um seria escolher no palpite
   qual dos dez documentos fica com o número. E o resultado seria pior de ler, porque os renumerados
   começariam em 19.005 (onde a sequência estava) e conviveriam com 594 de quatro dígitos sem
   nenhum significado na diferença. Renumerando tudo, a numeração volta a 0001 em diante, contígua.

   Seguro porque `numero` não é chave de nada: nenhuma FK aponta para ele, nenhuma outra coluna de
   texto do schema guarda 'LAN-2026-' (varredura em todas), e o app só EXIBE, busca por ilike e
   ordena. Quem abre o lançamento clica no id.

3. **A ordem é `created_at`, não `data_compra`.** As compras vão de 2024-10-29 a 2026-08-18 porque
   são história importada, mas o número é o registro do documento NO ERP, e é isso que a sequência
   continua fazendo: lançamento novo com compra antiga vai receber número alto de qualquer forma.
   Numerar pela data da compra criaria uma correlação que o próximo lançamento já quebraria.

4. **`lock table ... in exclusive mode` antes de renumerar.** Um insert que entrasse no meio levaria
   número da sequência antiga (19.005 em diante), que ficaria plantado no caminho futuro da sequência
   reiniciada: daqui a treze mil documentos o índice único recusaria uma gravação legítima e ninguém
   ligaria o erro à renumeração.

5. **Índice único em `numero` e `not null`.** É o que impede a volta do problema por qualquer caminho
   (numerador com defeito, carga que passe número na mão, insert direto). O trigger já preenchia
   sempre; agora o banco exige.

**Consequência conhecida:** ordenar por número é ordenação de TEXTO, então quando a sequência passar
de 9.999 o LAN-2026-10000 vai aparecer antes do LAN-2026-9999 na lista ordenada por número. Fica
registrado aqui em vez de consertado agora: são uns 4.000 documentos de folga, e a correção pede
ordenar pelo sufixo numérico dentro de `fn_listar_lancamentos`.

**Verificação:** `supabase/provas/numero_de_documento_e_unico.sql`, 12 asserções em 6 casos, rodando
contra o banco vivo dentro de `begin ... rollback`. Ela **reproduz o defeito** reinstalando o
numerador antigo dentro da transação (caso 2: o segundo documento repete o primeiro), prova que o
numerador de hoje não repete (caso 3), que o índice único recusa insert repetido (caso 6), e tem
linha de controle (caso 4: abaixo de 9.999 o formato de quatro dígitos NÃO mudou, senão trocar tudo
para cinco dígitos passaria nos outros casos e estragaria todo número já impresso). Depois do
rollback, conferido no banco que a função voltou a ser a corrigida e que não sobrou nada da prova.

O de/para de cada linha ficou em `lancamentos_numero_reparo` (RLS ligada, sem policy e sem grant: é
material de reparo, ninguém lê pelo app), que é o que o rollback usa e pode ser derrubada depois de
conferido.

## 2026-08-19 - A identidade da EMT entra no app e em todo papel que ele emite

O espelho impresso saía sem a marca: uma barra âmbar, o tipo do documento e as palavras "EMT
CONSTRUTORA" em caixa alta no canto. O documento que o Tiago usa hoje como padrão (o espelho de
pagamento do Mais Controle) traz a logo, o título no centro da folha e o rodapé com razão social,
CNPJ, endereço, telefone e email. O pedido foi nivelar por cima disso, e estender: **todo relatório
que o sistema emite** carrega a marca, e **o app** também.

**As cores são medidas no arquivo da logo, não estimadas.** Verde das letras `#3E7744`, cinza do
asfalto `#45464B`, amarelo do eixo da pista `#CF943A`. A `brand-config` do Tiago trazia `#3C7A4E`,
`#3F4248` e `#D9A441`, que eram aproximações de quem olhou o logo; com o logo e o app abertos lado a
lado a diferença aparece. Os hexes vivem em dois lugares que precisam concordar: os tokens `--emt-*`
do `globals.css` (a tela) e `src/config/marca.ts` (o exceljs e o pdfmake, que não leem CSS).

**Verde é a cor primária; o âmbar continua sendo a Faixa.** O design system nasceu "âmbar rodoviário"
com ação primária `#B45309`, o que não é cor nenhuma da empresa. Agora `--primary` é o verde EMT. Mas
a Faixa (a barra de 3px no item ativo da sidebar, na aba ativa e na borda dos KPICards) **fica
âmbar**: ela é o eixo da pista do logo, ou seja, era a única peça do desenho do app que já era marca.
Trocá-la por verde apagaria isso e deixaria a tela monocromática.

**`--status-aprovado` NÃO virou o verde da marca.** Continua `#15803D`, mais saturado e mais frio.
Fundir os dois faria o badge de "aprovado" ter a mesma cor de um botão primário, e a cor perderia a
função de dizer "isto passou pela aprovação" — que é informação, não decoração.

**A logo é SVG inline (`LogoEmt`), não `<img>` de `/public`.** Dois motivos que valem mais que bytes:
o espelho e o holerite vão pra impressora, e imagem externa que não chegou a tempo sai como
retângulo vazio num papel que vai pro contador e pro processo; e a variante `mono` recolore a marca
com `currentColor`, o que arquivo raster não faz. Os paths saem de um traço do arquivo de marca
(contorno por arestas unitárias + Douglas-Peucker); a pista é geometria medida, porque retângulo
traçado só carrega a serrilha do JPEG. A variante `simbolo` só troca o `viewBox` e deixa de desenhar
o wordmark — é o que ainda se lê nos 36px da sidebar recolhida.

**A moldura é um canônico só (`marca-documento`), não um cabeçalho por relatório.** `CabecalhoDocumento`,
`PistaEmt`, `RodapeEmpresa` e `EmissaoDocumento` servem o espelho (três telas) e o holerite. A
exigência aqui é de IGUALDADE, não de estilo: no dia em que cada tela desenhar o seu próprio
cabeçalho, os documentos divergem, e um maço com dois CNPJs diferentes é problema de contabilidade.
Por isso os dados cadastrais saem de `EMPRESA`, nunca escritos na tela que imprime.

**Nada da marca carrega dado.** Quem imprime pode desligar "gráficos de fundo" no diálogo do sistema.
Então: a Pista são dois elementos com cor de fundo e não um `linear-gradient` (gradiente é o primeiro
a ser descartado nesse modo, e a divisória sumiria inteira em vez de sair sem cor); e o painel dos
campos, a tarja do cabeçalho da tabela e o verde dos títulos são decoração sobre um documento que já
se explica em texto. Conferido imprimindo de verdade (PDF do Chrome headless): a marca sai.

**Na planilha exportada a marca ocupa 5 linhas, e nenhuma linha é contada na mão.**
`escreverCabecalhoMarca` devolve em que linha o cabeçalho de COLUNAS cai, e filtro, congelamento e a
fórmula `SUBTOTAL` saem de `linhaHeader.number`. A planilha é conferida contra o banco: um total
apontando uma linha adiante somaria o intervalo errado **sem o arquivo dar erro nenhum**. O teste
também deriva a linha de `LINHAS_CABECALHO_MARCA` em vez de escrever 6, e há uma asserção de que a
logo viaja DENTRO do `.xlsx` (a planilha vai anexada em email; logo por URL abriria como moldura
vazia). Cabeçalho de colunas em verde chapado com texto branco aqui, e não o verde lavado do papel:
planilha é lida na tela, rolando, e o contraste é o que faz o cabeçalho aguentar 3.000 linhas.

**O favicon não é a logo.** Em 16px o "Construtora Ltda" desaparece, o tracejado vira borrão e as
letras, que no arquivo original encostam nas duas bordas, saem cortadas. `src/app/icon.svg` é um selo:
quadrado verde, EMT em branco com folga lateral e o eixo amarelo embaixo. Fidelidade trocada por
legibilidade no tamanho em que ele é visto.

**O modelo de importação leva a COR da marca e nada mais.** Ele é o único arquivo que sai e volta:
`lerEValidarXlsx` casa as colunas pelo `getRow(1)`. As cinco linhas do cabeçalho de marca empurrariam
o header e o sistema passaria a recusar o próprio modelo que entregou, com "Colunas obrigatórias não
encontradas" — erro que a pessoa não tem como consertar, porque ela baixou o arquivo certo. Fica o
cabeçalho verde com texto branco, que não desloca nada. Trancado por um teste de ida e volta
(`gerarModeloXlsx` -> `lerEValidarXlsx`), conferido aplicando a marca de propósito: com ela o teste
falha, o que é o que faz ele valer alguma coisa.

## 2026-08-19 - O espelho vira documento de uma folha, e diz quanto já foi pago

O espelho ganhou a marca da EMT na frente, mas continuava um empilhamento de seções: três a
cinco blocos de "rótulo: valor" em grade, um atrás do outro. O Tiago mandou um documento de
referência (espelho de conta a pagar da Amazônia Agroindústria) e o pedido foi: **este desenho, com
a nossa marca**; nos espelhos de lançamento, aprovação de pagamento e pagamento, **dizer quantas
parcelas já foram pagas, quanto já foi pago e quanto ainda falta**; e **caber inteiro numa A4**.

**A ordem da folha é a ordem em que a pergunta é feita.** De quem é (cabeçalho com logo e endereço),
o que é e em que situação está (tarja), quanto é e para quem (faixa verde de destaque), quando vence
e quanto já saiu (cartões), e só então o detalhe. O valor virou a maior coisa da página, porque num
maço de espelhos empilhados ele é o único jeito de achar o documento certo sem ler folha por folha.

**O endereço subiu para o cabeçalho e o rodapé virou uma linha.** É assim que se lê um papel que sai
de uma empresa: quem emitiu está no alto, junto da marca. O rodapé passou a dizer o que o papel é
("Documento interno — espelho de conta a pagar"), que é o que faltava. `CabecalhoDocumento` ganhou o
título OPCIONAL em vez de um segundo componente: sem título, a coluna do centro deixa de existir e a
da direita ocupa o resto — que é exatamente o que o bloco de endereço precisa. O holerite continua
usando a mesma função com título.

**A cor da tarja vem de `StatusPadrao`, o mesmo do `StatusBadge` da tela** (`tomDoStatus`). Sem isso
o papel teria um mapa próprio de status e passaria a discordar da tela sobre o mesmo lançamento; com
isso, status novo entra nos dois de uma vez. A cor nunca é a única portadora: a situação sai escrita
ao lado do ponto, porque quem imprime pode desligar "gráficos de fundo".

**Os três números que o Tiago pediu.** No espelho de lançamento eles são cartões (Parcelas pagas,
Já pago, Em aberto, mais Próximo vencimento). No de pagamento — que serve TAMBÉM a aba de aprovação,
porque as duas telas apontam para `/espelho/pagamentos` — eles saem numa FAIXA, sob o título "No
lançamento LAN-xxxx". Faixa, e não cartões, por duas razões: cartões dariam sete blocos de número na
mesma folha sem dizer qual é o dinheiro DESTA parcela, e a faixa devolveu os ~110px que faltavam
para a folha fechar. Escopo explícito no título é o que impede alguém de ler "R$ 159.201,53" como se
fosse o valor da parcela.

**O dado do resumo é o mesmo dos dois papéis.** `buscarPagamentosParaEspelho` passou a trazer as
parcelas do lançamento pai e chama a MESMA `resumirParcelas` do espelho de lançamento. Pagas somam o
LÍQUIDO (o dinheiro que saiu), em aberto somam o VALOR (a dívida) — bases diferentes de propósito,
iguais às dos KPIs da tela. A RLS de `lancamento_parcelas` é por PERMISSÃO, não por linha, e quem a
rota do espelho deixa entrar (`financeiro.pagamentos:ver` ou `financeiro.aprovacao-pagamentos:ver`)
enxerga todas: o resumo não sai pela metade em silêncio. E `resumoParcelas` é NULO quando não há pai,
nunca um bloco de zeros, porque zero em "já pago" e "em aberto" seria lido como afirmação.

**"Total das parcelas" ao lado de "Valor total".** É a única linha da folha onde a conta fecha
(pagas + em aberto + canceladas). Sem ela os cartões seriam três números soltos, e a divergência
entre o parcelamento e o cabeçalho do lançamento ficaria invisível — que é justamente o que um
espelho existe para não deixar acontecer.

**Caber em A4 foi medido, não estimado.** O primeiro corte mirou um caso inventado (8 linhas de
rateio) e me fez apertar o layout à toa. O banco respondeu o que é real: em 5.912 lançamentos o
MÁXIMO de linhas de rateio é 3 (mediana 1, p99 2); a OC tem no máximo 11 itens (mediana 1, p95 10) e
3 parcelas previstas; e as 60 parcelas do maior parcelamento já viravam resumo, não linhas. Com isso:
lançamento e pagamento fecham em uma folha no PIOR caso que existe (3 rateios, parcelamento de 60).
A OC fecha em uma folha até 6 itens; acima disso ela continua para a segunda folha **sem cortar
linha**, porque um papel que parece completo sem estar é pior que um papel de duas folhas. A mediana
de itens por OC é 1, então a segunda folha é exceção, não regra. Medido imprimindo de verdade (PDF do
Chrome headless) e contando `/Type /Page`, não olhando a tela.

**O que economizou altura, em ordem de ganho:** a faixa no lugar da segunda fileira de cartões
(~110px); a assinatura dividindo a linha com a nota de anexos, em vez de uma faixa própria (~55px);
anexo como linha de nomes em vez de tabela de três colunas (~90px); formação do total, rateio e
parcelas previstas da OC lado a lado numa fileira de três (~200px); e paddings e gaps apertados no
componente (~60px). Nenhum deles esconde dado.

**Sem emoji no papel.** O clipe do bloco de anexos era um emoji e depende da fonte de emoji do
sistema que abrir o PDF: sai como retângulo vazio ou borrão preto em impressora monocromática. Virou
um filete vertical, que imprime em qualquer lugar.

## 2026-08-19 - O a receber ganha formulário próprio, e a aba vira Recebimentos

**O caminho do a receber nunca funcionou, e o banco provava.** Zero lançamentos `tipo = 'a_receber'`
em 5.912 registros. A causa não era ninguém usar: a action de criar recebível chamava
`fn_salvar_lancamento`, que exigia `financeiro.lancamentos / criar`, e quem tinha só a aba de a
receber era recusado antes de gravar. Isso tornou esta mudança barata — não havia dado a preservar
nem tela a compatibilizar — e é o motivo de o rename ter ido até a chave de permissão.

**A receber não é a pagar com um campo a mais.** O formulário era o MESMO: fornecedor (quem paga é o
cliente), forma de pagamento (ela decide o caminho do *pagamento*, que aqui não existe) e nenhuma
pergunta sobre onde o dinheiro entra. Agora, quando o tipo é "A receber", o formulário troca: **quem
está pagando** (cadastro de clientes, criando na hora), **conta que vai receber**, **número do
documento** e a descrição do recebimento. Os três primeiros são obrigatórios nos três lugares (schema
do formulário, schema de servidor e `fn_salvar_lancamento`), porque a regra é de dinheiro.

**A conta de destino é gravada na PARCELA, e só no a receber.** `fn_salvar_lancamento` passou a
aceitar `conta_bancaria_id` em `p_dados` e a repassá-lo às parcelas — mas com guarda de tipo. No a
pagar aquela coluna é o portão da revisão, e é ela que `fn_aplicar_regra_pagamento` lê para decidir
se o lançamento já nasce aprovado (dinheiro) ou já quitado (cartão): aceitar o campo lá faria um
lançamento a pagar nascer aprovado sem ninguém revisar. A guarda é no banco, não na tela.

**A permissão passou a depender do TIPO, e na edição pergunta duas vezes.** `fn_pode_lancar_tipo`
existe como função própria porque a edição confere o tipo GRAVADO *e* o tipo do payload. Sem as duas
perguntas, quem tem só Recebimentos abriria um lançamento a pagar, mandaria `tipo = 'a_receber'` e
converteria uma despesa em receita passando pela checagem.

**O rename foi até a chave.** `financeiro.contas-receber` → `financeiro.recebimentos`, com rota
`/financeiro/recebimentos`. A permissão é texto no banco, então a migration faz `update` em
`usuario_permissoes` (13 linhas) e `perfil_permissoes` (7) e RECRIA as três policies e a função que
citavam a chave antiga. Policy que cita uma chave que não existe mais não dá erro: ela apenas nunca
libera, e a tela fica em branco sem mensagem. Foi por isso que a migration recriou em vez de deixar
para depois.

**Quem vê o documento lê o cadastro dele — de novo.** Seis policies de SELECT não liberavam para o
recurso novo (`contas_bancarias`, `clientes`, `centros_custo`, `categorias_financeiras`,
`condicoes_pagamento`, `lancamento_rateios`). O sintoma seria o mesmo de agosto: seletor vazio ou
UUID na tela, sem erro nenhum. Vale a regra: aba nova que referencia cadastro precisa da leitura do
cadastro na mesma migration.

**Um formulário só para a tabela, não dois.** A aba tinha um "Novo a receber" simplificado próprio,
com schema e action próprios. Os dois divergiram: o da aba nunca mandou número de documento nem conta
de destino. Foi removido; a aba abre o MESMO formulário de lançamento com o tipo travado
(`tipoFixo`). Duas telas gravando na mesma tabela de dinheiro é um convite a divergir em silêncio.

**Centro de custo era "Opcional" na tela e obrigatório no banco.** `fn_salvar_lancamento` recusa
rateio vazio desde `lancamento_exige_centro_de_custo` (19/08), mas o formulário dizia "Opcional" e
deixava enviar: quem lançava sem centro levava o `raise` do Postgres num toast, sem campo apontado.
Agora é um campo único obrigatório, com botão para dividir em rateio, no MESMO padrão da parcela
única que já existia no arquivo (com um, a coluna de valor não aparece e ele vale o total; a partir
de dois, a tabela aparece e a soma tem de fechar). Duas fixtures de teste traziam `rateios: []` —
provavam um registro que o banco não aceita.

**Recebível quitado é "Recebido", não "Pago".** O status no banco é o mesmo (`pago`) para os dois
tipos, então o rótulo é a única coisa que os separa na tela. `rotuloStatusLancamento` já traduzia
`a_pagar` → "A receber"; passou a traduzir `pago` → "Recebido". A função é a mesma que a exportação
para Excel usa, senão a planilha contradiz a lista.

**A tela espelha Pagamentos, e a diferença de fundo é que não há fila de aprovação.** Quatro cards
que reagem à seleção (total a receber, a vencer, vencido, recebido no mês) e duas abas, "A receber" e
"Recebidos". No resumo do a receber, vencido e a vencer são COMPLEMENTARES e somam o total — diferente
do a pagar, onde "vencido" atravessa aprovado e aguardando e por isso não fecha. Parcela sem
vencimento conta como a vencer, nunca como vencida: não há data para dizer que atrasou.

**O saldo sobe, e isso foi PROVADO no banco vivo.** `fn_pagar_parcela` já somava `a_receber` no saldo
(e não checa saldo nem janela nesse tipo) — o que faltava era prova. Rodada dentro de transação
desfeita (`raise` no fim carrega os números e desfaz tudo), impersonando um usuário real via
`set_config('request.jwt.claims', ...)`: recusa sem documento, recusa sem conta, conta gravada na
parcela, saldo **inalterado** ao lançar (linha de controle) e saldo +R$ 1.234,56 exatos ao dar como
recebido. A linha de controle é a que importa: um recebível que ainda não foi recebido não move o
saldo. Total de lançamentos seguiu 5.912.

**Cuidado com o nome: existe uma tabela `recebimentos` no banco, e é outra coisa.** Ela é o
recebimento de MATERIAL de uma ordem de compra (a nota que chega com a mercadoria), do domínio de
Compras. Este módulo é recebimento de DINHEIRO: parcelas de lançamentos `a_receber`. Está comentado
no `queries.ts` do módulo, porque a colisão de nome é o tipo de coisa que faz alguém ler a tabela
errada com convicção.

**Duas frentes no mesmo arquivo, e o merge aceitou as duas.** `origin/main` recebeu "número do
documento na OC e no lançamento" no meio deste trabalho. O git auto-mergeou sem conflito e produziu
chave duplicada em seis arquivos e DOIS campos "Número do documento" com o mesmo `id` e o mesmo
`register` na tela do a receber. Quem pegou foi o `tsc` (TS1117), não a revisão. Ficou um campo só, na
fileira das datas, com `obrigatorio={aReceber}`. Lição: merge limpo em arquivo que a outra frente
também tocou não significa merge correto — rodar o typecheck logo depois do merge é o que separa os
dois.

## 2026-08-20 - Duas abas de Categoria em Cadastros, e a prova de RLS que não provava nada

**Categorias do Financeiro virou "Categorias financeiras", em Cadastros** (pedido do Tiago). Plano de
contas É cadastro: tabela de referência que classifica receita e despesa, do mesmo naipe de Unidades
de medida e Condições de pagamento. Rename até a chave, como no de Recebimentos:
`financeiro.categorias` → `cadastros.categorias-financeiras`, rota `/cadastros/categorias-financeiras`,
módulo em `modules/cadastros/`.

**O risco não era mover, era o nome.** Cadastros JÁ tinha uma aba "Categorias", e ela é outra coisa:
categoria de INSUMO (Material, Mão de obra, Equipamentos, Outros e as subcategorias). Duas abas
"Categorias" no mesmo submenu fazem escolher a errada, e aí um custo é classificado no lugar errado do
relatório. As duas ganharam sobrenome ("Categorias de insumo" e "Categorias financeiras") e as chaves
seguem SEPARADAS: fundi-las faria a permissão de uma abrir a outra. Há teste travando o par de nomes e
a distinção — nome duplicado no mesmo módulo é defeito, não estética.

**A ordem do submenu é a ordem de `RECURSOS`.** `abasVisiveis` só filtra por permissão, não reordena,
então mover o item no catálogo é o que move a aba na tela. Isso valeu também para Recebimentos, que foi
para logo depois de Pagamentos: é o par dele, o dinheiro que sai e o que entra. Os dois casos têm teste,
um enumerando a lista e outro exigindo só a vizinhança — o segundo sobrevive a uma aba nova entrar.

**Mover módulo entre módulos cria dependência que a convenção proíbe.** `categorias-tabela.tsx`
importava `usePaginacaoCliente` de `financeiro/_shared`; com o módulo em Cadastros isso virou
Cadastros dependendo de Financeiro. O arquivo foi para `modules/_shared/filtros-cliente.ts` (8
arquivos, todos troca de caminho). Regra que sai daqui: ao mover um módulo, os imports de `_shared` do
módulo ANTIGO viram dependência cruzada e precisam subir para o `_shared` de cima.

**`idTabela` é chave de preferência do usuário, e trocá-la reseta a escolha de colunas dele.** Aqui
custou zero porque `financeiro.categorias` não tinha nenhuma preferência salva (medido:
`preferencias_tabela` só tinha `cadastros.categorias`, de 1 usuário). E não podia herdar
`cadastros.categorias`, que é da tabela de insumo — aquela chave é compartilhada de propósito entre as
DataTables por grupo de insumo. Conferir a tabela de preferências antes de renomear um `idTabela` é
barato e evita reclamação de coluna que "sumiu".

**A prova de RLS passou nas duas linhas, inclusive na que tinha que falhar.** `set_config` de
`request.jwt.claims` muda o que `auth.uid()` devolve, mas NÃO subjuga a consulta à RLS: a conexão do MCP
roda como owner e passa por cima de policy. Resultado: o controle "uuid sem permissão nenhuma" leu as 57
categorias igual ao usuário autorizado. Só com `set local role authenticated` a prova virou real (0 e
57). Regra: prova de RLS exige troca de ROLE, não só de claims — prova de permissão via função definer
(que chama `tem_permissao` explicitamente e faz `raise`) é válida sem isso, prova de POLICY não é.

**E foi a linha de controle que denunciou.** Sem uma linha que TEM que dar diferente de zero, eu teria
reportado uma prova de RLS que não provava nada — o mesmo padrão registrado em 13/08, agora numa
segunda forma.

## 20/08/2026 — Custo por centro de custo soma a subárvore, não o nó exato

**O relatório mostrava uma ETAPA como se fosse um centro de primeiro nível.** "Caminhão Pipa L1318/50
MZO-4486 - 02" aparecia com R$ 326,50 ao lado das obras. O dado no banco estava certo: ele é nível 2,
com pai "Manutenção/Documentação de Equipamentos" — que é exatamente como o plano modela manutenção
(cada equipamento é uma etapa do centro de manutenção). O defeito era o `group by r.centro_custo_id`
cru, que mistura níveis. Agora o relatório sobe cada rateio até a raiz e agrupa por ela.

**O filtro por tipo era um buraco silencioso de dinheiro, e foi o achado maior.** Só a raiz tem `tipo`
preenchido; etapa tem `tipo` null. Então `cc.tipo = p_tipo_centro` DESCARTAVA todo rateio feito em
etapa: quem filtrasse "Manutenção" via R$ 4.353.614,09 em vez de R$ 4.353.940,59. Sem erro, sem aviso,
R$ 326,50 a menos — o tipo de defeito que só aparece quando alguém soma na mão. O tipo passou a ser lido
na raiz.

**A regra que sai daqui: filtrar por centro de custo é filtrar a SUBÁRVORE.** Escolher a obra tem que
trazer as etapas dela; escolher o centro de manutenção tem que trazer os equipamentos. Isso não é
preferência, é o que a espinha dorsal Obra > Etapa > Item significa. Valeu para as cinco RPCs que
filtravam `centro_custo_id = p_centro` (`fn_rel_custo_centro_custo`, `_serie`, `_vida`,
`fn_rel_custo_por_mes`, `fn_rel_custo_por_grupo`) e para o `valoresPorCentroCusto` do TS. Em
`fn_rel_custo_por_grupo` eram DOIS filtros, porque o grão muda: vindo de OC o centro está no item da OC,
no avulso está no rateio — trocar só um deixaria metade do painel respondendo a árvore e a outra metade
o nó.

**O drill tinha que fechar com o relatório, e essa era a parte que dava para errar.** A lista de
lançamentos filtrava `.eq("centro_custo_id", ...)`. Somar na raiz sem mexer nisso faria o card mostrar
R$ 4.353.940,59 e abrir uma lista que soma R$ 4.353.614,09 — o padrão "card leva para número diferente"
já registrado. Provado nos dois sentidos: drill e relatório dão 4.353.940,59, e a linha de controle (o
jeito antigo, `eq`) dá 4.353.614,09. Prova em que o controle TEM que diferir, senão não prova nada.

**O tamanho real da mudança hoje é uma linha, e é isso que a tornou segura de fazer inteira.** Existe UM
rateio abaixo da raiz (R$ 326,50) contra 6.052 na raiz (R$ 63,7 mi), e o total geral não se moveu:
R$ 63.777.075,05 antes e depois, com 12 linhas virando 11. Mas as 60 etapas de equipamento já estão
cadastradas e só uma foi usada — o buraco ia crescer a cada rateio por equipamento, e cresceria calado.

**Nenhuma assinatura mudou, então `create or replace` preservou os grants.** É o caminho oposto ao de
14/08 (parâmetro novo exige DROP+CREATE e re-grant, e sem o grant o painel fica em branco sem erro):
manter a assinatura idêntica é o que evita aquele problema.

**No gráfico, cor por POSIÇÃO era o defeito de fundo, não só o rótulo cortado.** As barras eram
verticais com rótulo girado -30°, e o navegador cortava o COMEÇO do nome — sobrava
"…-364/AC - Lote 09 & 10", justamente sem o "009 - " que identifica a obra. Deitando as barras o nome
corre na horizontal e cabe. Mas o pior era a cor: um ciclo de 5 cores atribuído pelo índice fazia a cor
significar "5º lugar" em vez de identificar o centro (filtrar repintava todos os outros), e o 5º slot
era o vermelho de status — a mesma cor de "rejeitado" e "vencido" — num centro que não tem nada de
errado. O que se compara ali é grandeza, e grandeza já está no comprimento da barra: uma cor só, com
cinza reservado para "Outros", que é agregado e não clica. O cinza é sobre o dado ser agregado, NÃO
sobre a barra clicar: quem não tem permissão de ver lançamentos recebe `destinos` vazio, e pintar por
`href` deixaria o gráfico inteiro cinza para essa pessoa.

**A altura do gráfico saiu do componente porque o Skeleton do `next/dynamic` não recebe props.** Com
barras horizontais a altura tem que crescer com o número de barras, e se o gráfico decidisse a própria
altura o carregamento mediria uma coisa e o gráfico outra — a página pularia na troca. Quem sabe quantos
centros existem é o wrapper, então é ele que reserva o espaço, lendo o mesmo `alturaDoGrafico` que tem
teste.

## 20/08/2026 — Filtro de centro na listagem sai da URL e vai para o embed

**O drill de custo por centro morria nos três maiores centros, e não era o `in.()` estourar: a
requisição não chegava a existir.** Clicar em Escritório Central abria "Algo deu errado ao carregar esta
tela" e **nada** aparecia nos logs do Postgres nem do gateway. O motivo: `.in("id", idsFiltrados)` viaja
na query string de um GET, e o Escritório Central tem 1.871 lançamentos — 69 KB de URL. Medido contra o
projeto vivo, sem autenticação (o corte é ANTES da auth, então é sobre tamanho, não permissão): 100 ids
= 401, 453 ids = 401, **1.115 = HTTP 400, 1.753 = HTTP 520, 1.871 = a requisição não completa**. É por
isso que os centros pequenos funcionavam e ninguém tinha percebido: só 3 dos 12 passam do limite.

**Não foi regressão da subárvore.** Escritório Central e 009 não têm filhos, então a subárvore devolve
exatamente a mesma lista de ids que o `.eq` antigo devolvia — o drill já estava quebrado para os três
maiores antes. O que a mudança de ontem fez foi me levar a olhar para ele.

**A correção é o par que a listagem de ordens de compra já usa: filtro no embed +
`not.is.null`.** `lancamento_rateios(centro_custo_id)` entra no select e o filtro cai nele, então o que
viaja é a SUBÁRVORE (61 ids no maior caso, ~2,3 KB), não os lançamentos do centro. O embed é subconsulta
lateral independente, então filtrá-lo não mexe no `count: "exact"` nem multiplica a linha do lançamento.

**Por que confiar nisso sem poder logar no app:** o padrão já roda em produção no caso que duplicaria.
`oc_itens` está sempre no select das OCs com `count: "exact"`, e existem **10 OCs com dois ou mais itens
no mesmo centro de custo, uma delas com 11** — se o embed duplicasse o pai, aquela OC apareceria 11
vezes com o total inflado. E a prova em SQL tem linha de controle que TEM que diferir: na subárvore da
Manutenção, ids distintos = 1.116, `EXISTS` = 1.116, e o join cru (que duplica) = **1.120**. Os 4 de
diferença são lançamentos já rateados entre dois equipamentos — o caso vai deixar de ser raro.

**A regra que sai daqui: lista de ids que cresce com o volume de dado não pode ser filtro de URL.** O
teto do `in.()` já tinha mordido quatro vezes neste repo por CORTE SILENCIOSO (mil linhas voltando de
uma consulta); esta é a quinta, e a mais desagradável, porque falha do outro lado — a requisição morre
sem log. Filtro que mora em tabela filha e pode casar muitas linhas vai no embed. Sobra a mesma dívida
em `idsPorContaBancaria`, `idsPorRevisao`, `idsPorAtraso` e `idsComSaldoAberto`: nenhum passa do limite
hoje, mas todos vão pelo mesmo caminho.

**O rateio podia ir para o embed e a parcela não, e a diferença é o que a tela LÊ.**
`lancamento_parcelas` alimenta a coluna "Revisão" e o dinheiro da linha, então filtrar aquele embed
esconderia parcela da conta. O embed de rateio existe SÓ para filtrar — ninguém lê o valor dele —, então
filtrá-lo não mexe em número nenhum. O comentário antigo dizia "não dá para filtrar pelo join embutido"
sem essa distinção, e foi corrigido.

**A subárvore é lida uma vez e serve ao filtro e ao recorte.** Eram a mesma leitura antes por um motivo
que continua valendo: filtrar por um conjunto e somar por outro é o defeito que ninguém confere.

## 2026-08-20 - Folha gerencial passa a ter terceiro, diarista, gratificação e encargo individual

**Pedido do Tiago, quatro coisas de uma vez:** terceiro e diarista aparecendo na folha; poder alterar
os valores da linha para lançar gratificação; encargo individual por pessoa; e gratificação salarial
que NÃO é afetada pelos encargos. As três primeiras são mecânica; a quarta é regra de negócio dele, e
está aplicada num lugar só (`fn_folha_aplicar_encargos_e_provisoes` recebe a base como parâmetro, e a
base é o salário base).

**Encargo individual é o que torna os outros vínculos possíveis.** Não é um requisito paralelo: um
terceiro não carrega o encargo patronal de um CLT, então incluir terceiro na folha com o `%` global da
config inflaria o custo da empresa em ~27% sobre gente que não gera encargo nenhum. `colaboradores.
encargos_percentual` nulo = usa os `folha_encargos` ativos discriminados (caminho histórico, com grupo
de recolhimento, o único que gera guia); preenchido = UMA linha "Encargos" sem grupo. **Sem grupo, a
`fn_aprovar_folha` não gera guia** — e é intencional: percentual próprio de uma pessoa é custo
gerencial, não guia que a empresa recolhe. Não existe "a guia dos encargos do João".

**Vazio e zero são valores DIFERENTES no percentual, e essa distinção atravessa quatro camadas.**
Vazio = "usa a configuração da folha"; zero = "esta pessoa não tem encargo". Se as duas colapsassem, ou
o terceiro carregaria encargo de CLT, ou cadastrar um terceiro sem encargo apagaria a config de todo
mundo. A distinção está no schema (dois testes), no default do formulário (0 NÃO vira campo vazio ao
carregar), na ficha ("Usa a configuração da folha" em vez de "-") e no banco (`null` não leva coalesce
no `paraLinhaBanco`, ao contrário da gratificação, que leva porque a coluna é `not null default 0`).

**Diarista entra pela soma das diárias, e isso criou um segundo pagador da mesma diária.** Antes havia
um só: o fechamento em `/rh/diaristas` (`fn_fechar_diarias`). Com o diarista na folha, a aprovação
também gera "Salário X". A coordenação é `rh_diarias.folha_id`, e ela existe por causa de um caso
específico: **`lancamento_id` sozinho não serve como marca de "já paga"**, porque um item de folha com
líquido zero (o adiantamento do mês comeu tudo) não gera lançamento nenhum, e a diária ficaria com
`lancamento_id` nulo — em aberto aos olhos do fechamento — mesmo tendo sido consumida pela folha. Por
isso o loop 1b da `fn_aprovar_folha` percorre TODOS os itens de diarista, não só os que geraram
lançamento. A desaprovação solta as duas colunas, e tem de fazer isso ANTES do `delete` dos
lançamentos: a FK `rh_diarias_lancamento_id_fkey` é simples, sem `on delete set null`.

**A linha de controle da aprovação: as diárias ainda batem com a folha?** Entre gerar e aprovar, alguém
pode lançar uma diária nova, excluir uma, ou fechar o mês em `/rh/diaristas`. Nesses casos o
`salario_base` do item deixou de ser a soma das diárias, e aprovar pagaria um valor que não corresponde
a nada. A conferência roda ANTES de criar lançamento nenhum, para uma folha desatualizada parar sem
deixar meio pagamento atrás de si. Item editado à mão fica fora dela: ali o valor é escolha declarada.

**Regerar preservando a edição manual, e por quê.** A gratificação é digitada NA FOLHA, e regerar apaga
os itens. Sem o snapshot, o Tiago digitaria a gratificação, clicaria em Regerar e o valor voltaria ao do
cadastro **em silêncio** — a única pista seria o total do rodapé ter mudado. `folha_itens.
editado_manualmente` marca a linha, e a `fn_gerar_folha` guarda `jsonb_object_agg` por
`colaborador_id` antes do `delete` (não por id do item, que morre no delete) e reaplica no loop.

**INSS/IRRF continuam só para CLT.** Retenção de terceiro e de diarista é regra fiscal que o Tiago
ainda vai declarar, e regra fiscal não se inventa. A base do desconto do CLT passou a incluir a
gratificação (gratificação habitual integra a remuneração do trabalhador); o que ela não afeta é o
encargo PATRONAL. Hoje isso não muda número nenhum, porque não há faixa de INSS/IRRF cadastrada — mas
muda no dia em que houver, e é a decisão que fica registrada. Mesmo raciocínio para o FGTS informativo
do holerite, que segue sobre o salário base.

**Editar valor de linha exigiu extrair as fórmulas do loop da geração.** Mexer em salário base ou
gratificação refaz INSS, IRRF, as linhas de encargo, as de provisão, o custo total, o líquido e os sete
totais do cabeçalho. Escrever isso de novo dentro da `fn_editar_item_folha` seria uma segunda cópia de
uma conta de dinheiro, e duas cópias divergem na primeira vez que uma das duas for corrigida. Saíram
quatro funções INTERNAS (`fn_folha_inss`, `fn_folha_irrf`,
`fn_folha_aplicar_encargos_e_provisoes`, `fn_folha_recalcular_totais`), com `revoke` de `public`,
`anon` E `authenticated` — `from public` sozinho não basta, porque as default privileges podem ter dado
EXECUTE nominal. Conferido: as quatro ficaram com `{postgres=X/postgres}` e nenhuma aparece no advisor
de função definer executável por anon.

**A edição NÃO recalcula o adiantamento, e recusa em vez de encolher.** A cascata de desconto atravessa
competências (o que não cabe vira parcela nova na próxima folha, marcada com a folha que a empurrou), e
refazer isso a cada edição de linha moveria dinheiro de OUTROS meses sem ninguém pedir. Quando o valor
novo não cobre o que a folha já descontou, a função para e manda regerar. Alternativa recusada: cortar o
adiantamento para caber, que cobraria do colaborador menos do que o plano diz sem registrar em lugar
nenhum que o plano mudou.

**A prova rodou no banco vivo, em transação desfeita, com linha de controle.** Dez verificações num
`DO` block que termina em `raise`: diarista com base 550,00 = soma de três diárias e alocado no centro
da obra DA DIÁRIA (não do cadastro); gratificação de 500,00 sobre base 2.000,00 gerando encargo de
400,00 — 20% de 2.000, não de 2.500, que é a regra provada em número; encargo individual 0% rendendo uma
linha e zero linhas com grupo; edição refazendo tudo; Regerar preservando; aprovação marcando 3/3
diárias; `fn_fechar_diarias` recusando depois disso; desaprovação soltando as 3; e o cabeçalho fechando
com a soma das linhas. **A linha de controle era um CLT sem gratificação e sem percentual próprio, cujo
encargo TINHA que dar 324,20 (20% de 1.621) e diferente de zero** — sem ela, uma config que não chegou a
ser aplicada faria as outras nove passarem sem provar nada.

**Um teste novo pegou um defeito real antes do commit:** `gratificacao` estava usando o schema de
dinheiro obrigatório, então campo vazio virava erro de validação em vez de zero — e vazio é o estado da
maioria das pessoas. Virou um schema próprio (`dinheiroComZeroSchema`) que trata vazio como 0. Salário
base continua obrigatório de propósito: apagar o salário e ele virar R$ 0,00 calado é como se paga
alguém a menos.

**Terceiro entrou em `VINCULOS_FOLHA_SALARIO` (alertas de cadastro incompleto).** Antes, terceiro sem
salário não era problema porque ele não entrava na folha; agora entra, e sem salário a linha dele
simplesmente não é criada pelo `continue when` — silenciosamente, que é exatamente o que o alerta existe
para evitar. Diarista continua fora: salário vazio nele é o estado normal.

**Fora de escopo, declarado:** a planilha de importação de colaboradores não recebeu as duas colunas
novas. Ela hoje importa nome, CPF, função, vínculo e obra — não importa nem `salario` nem
`valor_diaria`, então acrescentar gratificação sem salário seria incoerente. Expandir aquela planilha é
decisão separada.

## 2026-08-20 - Um lançamento pago por várias formas, e a aprovação por parte

**O que o Tiago pediu**: mais de uma forma de pagamento por OC ou lançamento, com o valor de cada
uma, e a aprovação gerando aprovações diferentes por método. **O modelo que ele escolheu**: duas
camadas — as formas com o valor de cada uma, e as parcelas morando DENTRO de uma forma. A alternativa
(forma na parcela, com o "quanto de cada forma" virando soma derivada) foi recusada por ele: o valor
por forma é um número que a pessoa digita e confere, e precisa de lugar próprio para existir.

**Entregue em dois blocos, e o corte não é arbitrário.** Bloco 1 é o lado do lançamento; bloco 2 é
dividir a OC. O que torna o corte seguro é que a OC continua com UMA forma e ela desce como um bloco
único — então o caminho do dinheiro está inteiro nos dois estados, nunca meio feito.

**A compatibilidade não custou um segundo caminho de código.** `fn_aplicar_regra_pagamento` monta a
lista de blocos com um `union all`: os blocos declarados, OU um pseudo-bloco do cabeçalho quando não
existe nenhum. O predicado `lancamento_forma_id is not distinct from bloco` serve os dois casos, porque
num lançamento sem blocos TODA parcela tem `lancamento_forma_id` nulo. Sem esse truque seriam dois
ramos com a mesma regra escrita duas vezes, e eles divergiriam no primeiro ajuste.

**O status do lançamento deixou de ser escrito e passou a ser derivado.** Com formas de tipos
diferentes ele pode ter parte quitada (cartão), parte aprovada (dinheiro) e parte esperando (boleto) ao
mesmo tempo, e nenhum ramo do código sabe dizer o que ele "é". Quem sabe é a contagem das parcelas, e
`fn_recalcular_status_lancamento` já fazia essa conta para pagamento parcial. O ramo que sobrou escrito
à mão é o `previsto`, que a função de recálculo não produz.

**A conta bancária continua sendo o portão do atalho, mas POR BLOCO.** Sem o recorte, uma parcela de
boleto sem conta travaria o atalho da parte em dinheiro — duas coisas que não têm nada a ver uma com a
outra passariam a depender uma da outra.

**Duas travas de soma, as duas como constraint trigger DEFERRABLE.** A soma das formas fecha com o
valor, e as parcelas de CADA forma fecham com o valor daquela forma. A segunda é o que faz o modelo de
duas camadas ser honesto: sem ela, "R$ 6.000 no boleto" poderia ter R$ 4.000 de parcelas e a tela
mostraria os dois números sem se contradizer em lugar nenhum. Deferido pelo mesmo motivo da trava do
rateio: apagar e reescrever as parcelas (que é o que a edição faz) estouraria no meio, num estado que
nem chegou a existir. E lançamento com ZERO formas nunca dispara nada disso, porque o gatilho é a linha
de forma — o que deu compatibilidade de graça aos 880 antigos.

**O gatilho da parcela confere o bloco ANTIGO e o NOVO.** Numa parcela que troca de forma, olhar só o
destino deixaria o bloco de origem curto e a trava passaria: os dois lados mudaram de soma. O
`where lf.id in (old.lancamento_forma_id, new.lancamento_forma_id)` resolve três casos de uma vez —
nulo (INSERT não tem old, DELETE não tem new, parcela do caminho antigo não tem bloco), forma apagada
em cascata, e os dois iguais.

**O cabeçalho `forma_pagamento_id` virou uma projeção, não uma segunda verdade.** Com UMA forma ele
guarda ela (as listas, filtros, relatórios e o RH continuam lendo dali, e são 46 arquivos). Com DUAS ou
mais ele vai NULO de propósito: não existe "a forma" desse lançamento, e gravar uma delas faria a lista
afirmar algo falso. Quem quer o detalhe lê `lancamento_formas`.

**O furo que esse nulo abriu, e que a leitura pegou antes de a tela mentir.** A aba "Pagamentos
diretos" filtrava por `lancamentos.formas_pagamento!inner` — join OBRIGATÓRIO com a forma do cabeçalho.
Com o cabeçalho nulo, o inner join descartaria o documento inteiro, e a parte em dinheiro de um
lançamento misto nunca apareceria ali, sem erro nenhum. Lição geral: **quando um campo passa a poder
ser nulo, todo `!inner` que passa por ele muda de significado em silêncio.** O conserto foi filtrar
pelo bloco da parcela (a granularidade certa: a aba lista parcelas, não documentos), o que exigiu a
aprovação de OC criar o bloco também — e isso deixou a invariante limpa: *tem forma no cabeçalho ⟺ tem
bloco*.

**Parâmetro novo em RPC entra com DEFAULT quando a migration precede o deploy.** `p_formas` tem
`default '[]'` porque a migration entra no banco antes de o app subir: sem o default, toda gravação de
lançamento quebraria na janela entre as duas coisas. E foi DROP+CREATE, não `create or replace` — com a
assinatura de 4 argumentos viva, o PostgREST veria duas sobrecargas e escolheria uma em runtime, com o
build verde. Uma função, um parâmetro opcional.

**`min(uuid)` não existe no Postgres, e o CREATE FUNCTION aceita.** Quebrou na primeira execução, e só
a prova pegou. É a mesma família de "Postgres aceita SQL embutido inválido" registrada em 13/08: o
corpo da função não é verificado na criação.

**Numeração da parcela continua sendo do lançamento inteiro**, e não por forma. "Parcela 2 de 4" já
significa isso em toda tela e em todo espelho; reiniciar por bloco faria dois documentos diferentes
chamarem a mesma coisa de "parcela 1".

**Duas recusas declaradas, em vez de dois palpites.** "Gerar pela condição" fica desabilitado com 2+
formas (um parcelamento plano não sabe quanto de cada forma cai em cada parcela), e o diálogo "Definir
parcelas" recusa em lançamento multi-forma e manda para o formulário. Recusa visível é melhor que
parcela nascendo sem bloco e a trava de soma acusando depois com uma mensagem sobre valores, que fala
de um sintoma e não da causa.

**Progressividade é a regra da tela, e já era o idioma do arquivo.** Uma forma → Combobox só, sem
coluna de valor. Um centro de custo → campo só. Uma parcela → sem tabela. Nos três, o segundo item é
que traz a tabela e a coluna de valor, e o primeiro herda o total. 5.050 dos 5.930 lançamentos têm
exatamente uma forma: cobrar duas digitações deles para servir o caso raro seria piorar o comum.

## 20/08/2026 — A observação da OC desce até o pagamento

**As telas já estavam prontas; o dado é que não descia.** Detalhe da OC, espelho da OC, detalhe do
lançamento, espelho do lançamento, Excel de lançamentos, fila de aprovação, drawer da parcela em
Pagamentos e espelho do pagamento — todos os oito já renderizavam "Observações". O elo quebrado era um
só: `fn_aprovar_ordem_compra` copiava descrição, categoria, número do documento e os anexos, e deixava
`observacoes` para trás. Lição de investigação: **antes de construir a superfície, verifique se ela já
existe.** O pedido chegou como "fazer aparecer em todo o caminho" e o trabalho real era uma linha de
`insert`, não oito telas.

**Não há risco de divergência depois da cópia, e é por isso que copiar basta.** OC aprovada não pode
ser editada (`editarOrdem` exige rascunho ou pendente), lançamento de origem `oc` é somente-leitura no
Financeiro, e desaprovar APAGA o lançamento — a reaprovação o recria com o texto novo. Sem essas três
travas, a escolha certa seria ler da OC por join, não copiar.

**`btrim(x)` corta só espaço, não `\n` nem `\t`.** A normalização ingênua deixava `E'   \n  \t '`
sobreviver como `E'\n  \t'`, que passa pelo `nullif` e chega na tela como conteúdo — e o front decide
desenhar a seção com `observacoes ? ... : null`, onde string de branco é **truthy**. Resultado seria uma
seção "Observações" visivelmente vazia. O padrão correto é `btrim(x, E' \t\r\n')` explícito, nos dois
lados de um backfill (no `set` e no `where`). Quem pegou isso foi a prova, porque ela tinha um caso de
whitespace puro além dos casos "tem texto" e "não tem nada".

**Presente mas ilegível não é presente.** Três telas exibiam a observação achatada numa linha só: o
`Dado` da OC é `flex items-center`, e a `Linha` do detalhe de pagamento alinha o valor à direita — num
bloco de várias linhas isso desalinha cada linha. A observação real traz "PAGAMENTO PARA DIA 19/08",
o CNPJ e a chave PIX em linhas **separadas**, e é conferida de olho antes de o dinheiro sair.
`whitespace-pre-line` em campo vindo de textarea é regra, não enfeite.

**O selo na lista é o que faz a observação existir.** Quem paga varre dezenas de linhas e não abre o
detalhe de cada uma: informação que só aparece no drawer só serve para quem já desconfiava que ela
existia. Novo canônico `SeloObservacoes` (balão + tooltip preservando quebras, corte anunciado em 600
caracteres) na fila de Pagamentos, na fila de Aprovação e em Pagamentos diretos.

**`CREATE OR REPLACE FUNCTION` apaga trabalho alheio sem conflito, sem erro e sem aviso.** A
`fn_aprovar_ordem_compra` foi sobrescrita TRÊS vezes nesta tarde, nos dois sentidos: eu apaguei o bloco
de forma da outra frente, mesclei, e depois a divisão por forma apagou a minha cópia. Não existe merge
de três vias em Postgres — o replace troca o corpo inteiro. **A checagem que não protege** é
`pg_get_functiondef(...) like '%a minha mudança%'`: ela só prova que a minha alteração não está lá, e
passa em silêncio por cima do trabalho de terceiros. **A que protege** é reler `pg_get_functiondef` na
chamada imediatamente anterior ao apply, guardar o `md5`, e conferir depois por TODAS as partes que a
função deveria ter, não só pela própria. Quando já aconteceu, `select array_to_string(statements, ...)
from supabase_migrations.schema_migrations where version = '<a apagada>'` devolve o SQL alheio inteiro
para mesclar.

**Pendência de ordem, declarada em vez de escondida.** A migration `20260820201951` referencia
`oc_formas`, cujas migrations de criação estão aplicadas no banco vivo mas ainda **não estão em main
nem em PR aberto** (frente paralela do multi-forma da OC). No banco vivo a função está correta e
provada; num replay do repo do zero, ela estouraria. Não reordenei nem embarquei migration de outra
frente. Quando o multi-forma da OC entrar em main a ordem se resolve sozinha (as dela são 2002xx,
anteriores). Se não entrar, o arquivo tem de ser reescrito sem os portões de forma.
