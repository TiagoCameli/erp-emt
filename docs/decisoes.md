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
