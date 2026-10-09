# Execução de Obras: desenho

**Data:** 09/10/2026 · **Status:** aprovado pelo Tiago em 09/10/2026 ("pode seguir"), com as recomendações da seção 14 · **Código:** nenhum até este spec e o plano da Fase 1 serem aprovados.

Pedido: `vault/projects/erp-emt/prompt-cronograma-obras.md` (itens 1 a 15). Este documento segue o mesmo padrão da Medição de Contratos (`2026-09-25-medicao-contratos-design.md`): decisões numeradas, modelo de dados, regras no banco, telas, provas, fases e perguntas em aberto. O que está marcado **[proposta]** é regra que eu escrevi para fechar o desenho e que você precisa confirmar ou corrigir na revisão; não é decisão sua.

## 1. Objetivo

Um módulo para todas as obras da EMT, para sempre, que dê visão total do que está sendo executado: o que está planejado, o que está rodando, onde, com quem, com quais máquinas e materiais, o que parou e por quê, e quando vai terminar. Mais fácil de alimentar do que planilha, visual e interativo, e legível e gravável por um agente pelo banco.

Fora do escopo, de propósito: nenhum cruzamento com a Medição de Contratos e nenhuma importação da planilha antiga de Mâncio Lima.

## 2. Decisões já tomadas (prompt de 09/10/2026)

| # | Decisão |
|---|---|
| D1 | Usuários: Tiago (todas as obras) e engenheiro residente (monta, reprograma, aponta). Encarregado não usa o sistema; recebe a programação da semana em PDF ou link. |
| D2 | Método: Gantt mestre com CPM **mais** plano semanal com PPC (Last Planner). Linha de balanço como visão adicional. |
| D3 | Tipos de obra: edificação, rodovia (km/estaca, lado, faixa) e obra pequena (sem burocracia). Um módulo só para os três. |
| D4 | % físico com ponderação configurável por cronograma: valor orçado, duração, homem-hora ou peso manual. |
| D5 | Materiais por composição (biblioteca da EMT) e por lista manual. |
| D6 | Estoque por obra completo: entrada de OC recebida (lê Compras, não altera) ou avulsa; saída por atividade; transferência entre obras; reserva; inventário. |
| D7 | Pessoas do RH (só leitura) e terceiros avulsos com cadastro leve no módulo. |
| D8 | Equipes-modelo, quem está livre, onde está cada um, anotações por funcionário, produtividade por equipe. |
| D9 | Equipamentos da frota do ERP, alocados em atividades, conflito entre obras, máquina em manutenção lida da Manutenção. |
| D10 | Planta: zonas coloridas com %, pinos de foto e nota, peça a peça, replay no tempo. Rodovia: diagrama linear e mapa a partir de KML/KMZ. |
| D11 | Relatórios: semanal da obra (PDF), programação da semana (PDF e link), lista de compras, cronograma em Excel. |
| D12 | Alertas só dentro do ERP (sininho e painel). Sem email, sem WhatsApp. |
| D13 | Sem IA dentro do módulo. O módulo é feito para um agente ler e escrever pelo banco: nomes claros, escrita por RPC, views prontas, guia para agentes. |
| D14 | Tudo vira modelo reutilizável, com a produtividade real aprendida. |
| D15 | Pasta por obra do cadastro de Obras do ERP, derivada: existe enquanto a obra tiver pelo menos um cronograma. Nenhuma tabela nova de obra. |
| D16 | Toda regra calculada mora no banco, uma vez só. O TypeScript formata e desenha, não recalcula (mesma regra D7 da Medição, decisoes.md L3094). |
| D17 | Sem modo offline no apontamento. |
| D18 | Migrations só aditivas, com rollback; RLS provada com `set local role authenticated` e linha de controle; plantas e fotos em bucket próprio, fora da faxina de `anexos`. |

## 3. O que o banco de hoje diz (e o que isso muda)

Levantado em 09/10/2026 nas 493 migrations e em `src/lib/database.types.ts`.

| Fato | Consequência no desenho |
|---|---|
| `obras` tem `nome` (com o número embutido, "001 - Carretas EMT"), `rodovia`, `lote`, `extensao_km`, `status`, mas **não tem tipo nem código**. | O tipo da obra (edificação, rodovia, pequena) e a configuração do módulo ficam em `ex_obras`, 1:1 com `obras` (chave = `obra_id`). Não é outra tabela de obra: não tem nome, cliente nem contrato, só a configuração do módulo. |
| `ordens_compra` **não tem obra**. A obra vem por item: `oc_itens.centro_custo_id` → `centros_custo.obra_id` (subindo a árvore). Status da OC: `rascunho, pendente_aprovacao, aprovado, rejeitado, cancelado, recebido, pago`. | A entrada de OC na obra lista os `oc_itens` cujo centro de custo pertence à obra. |
| `recebimentos` é **só cabeçalho**, um por OC (NF, valor, data), sem itens e sem quantidade recebida por item. | A quantidade que chegou na obra é registrada no módulo (por item da OC, com saldo a receber), sem tocar em Compras. Ver pergunta Q8. |
| O módulo Estoque (PEPS, depósitos, custo) foi **dropado** em `20260720120003_reforma_a_drop_estoque`. O almoxarifado da Manutenção (`almoxarifado_*`) existe, mas não tem obra e só sai para OS. | Ver seção 4. O estoque deste módulo não reaproveita nem toca o almoxarifado. |
| `colaboradores` tem `vinculo` (`clt, diarista, terceiro`), `funcao_id` → `funcoes`, `ativo`, `data_demissao`, e um `obra_id` fixo usado pela folha. | Pessoas = `colaboradores` (leitura) + `ex_terceiros`. A alocação diária fica em tabela própria e **não escreve** `colaboradores.obra_id`. Função vem do catálogo único `funcoes` (o mesmo do CLT e das diárias). |
| `rh_pontos` / `rh_apontamentos` já têm obra, dia, encarregado e horas por colaborador. | Não uso na Fase 6 (a regra de ponto é do RH). Fica anotado como fonte futura do efetivo real, se você quiser. |
| `equipamentos` tem `status` (`ativa, em_manutencao, fora_funcionamento`) sincronizado pela OS em execução, `tipo` em texto livre, e **nenhuma obra**. | Equipamento em manutenção é lido de `equipamentos.status` e das `ordens_servico` abertas. A alocação por obra fica no módulo. |
| `insumos` + `unidades_medida` + `categorias_insumo` (grupos material, mão de obra, equipamentos, outros); já tem itens SINAPI vindos do Mais Controle. | Composição e estoque usam `insumos` do cadastro. Nenhum catálogo de material paralelo. |
| **Não existe sininho** (nenhuma tabela, RPC ou ícone). Alertas hoje são páginas por módulo calculadas na leitura (`mc_v_alertas`, `rh.alertas`, Carretas). | O sininho é um canônico novo do AppShell (Fase 7), que lê alertas calculados; só a marca de "visto" é gravada. |
| **Não existe rota pública.** A decisão de 13/08/2026 recusou link com token para aprovação de pagamento ("o link é endereço, não credencial"). | O link do encarregado seria a primeira superfície sem login do ERP. Ver seção 6.3 e Q6. |
| Leaflet + react-leaflet já estão no projeto (mapa das Carretas, OSM e satélite Esri). | Planta e mapa da rodovia usam Leaflet. Nenhuma lib de mapa nova. |
| Não há lib de arrastar (dnd-kit) nem de Gantt. TanStack Table + Virtual, Recharts, exceljs, pdfmake e unpdf já estão. | Seção 10. |
| A marca primária hoje é o **verde** `#3E7744`. O âmbar `#F59E0B` é só "a Faixa" e nunca é texto. | O "âmbar, sinalização viária" do pedido vale como a Faixa e como cor de "em execução" no preenchimento das zonas e barras, com o texto escuro por cima (contraste ≥ 4,5:1 conferido pelo `contraste.test.ts`). |

## 4. Estoque por obra x a decisão de 20/07/2026

**Por que o Estoque saiu.** A reforma de 20/07 deixou o app só com Compras, Financeiro e RH e tirou Estoque, recebimento por item e depósitos ("OC continua item a item ligada ao insumo. Sem estoque, sem recebimento"). Em 29/07 veio a consequência: **custo de obra = lançamentos** (decisoes.md L191 e L207). O modelo antigo "base consumo" (o custo cai na obra quando o material é consumido, com PEPS) foi abandonado porque, sem estoque, nunca haveria consumo e o custo sairia menor que a realidade; e porque contar compra e consumo juntos dobraria o custo.

**O desenho deste módulo conflita?** Não, **desde que o estoque seja físico, sem valor**:

1. Só quantidade. Nenhuma coluna de custo, nenhum PEPS, nenhum custo médio, nenhum valor de estoque.
2. Não gera lançamento, parcela, rateio nem custo por centro de custo. O custo da obra continua sendo o dos lançamentos, como decidido em 29/07.
3. Não altera Compras: não muda status de OC, não cria `recebimentos`, não volta `oc_itens.deposito_id`. Só lê `ordens_compra` e `oc_itens`.
4. Não usa nem altera o almoxarifado da Manutenção.

**Onde passaria a conflitar** (e por isso fica fora): valorizar o estoque, apurar custo por consumo, ou fazer o recebimento de Compras depender da entrada na obra. Se um dia você quiser custo por consumo, é a decisão de 29/07 que precisa ser revista, não este módulo.

Isso precisa da sua confirmação (Q9).

## 5. Nome, prefixo e menu

- **Nome no menu: "Execução"** (módulo `execucao`, rota `/execucao`, recursos `execucao.*`). "Obras em Execução" fica comprido na sidebar e "Obras" já é a aba do cadastro. Se preferir "Obras em Execução" ou "Planejamento", só muda o rótulo.
- **Prefixo `ex_`** em tabelas, views (`ex_v_*`) e funções (`fn_ex_*`), como o `mc_` da Medição: um agente filtra o módulo inteiro com `like 'ex\_%'`.
- Celular: `/m/execucao` (grupo `(campo)`, sem fila offline, D17).

## 6. Acesso e permissões

### 6.1 Recursos

As 6 ações de sempre (`ver, criar, editar, excluir, aprovar, desaprovar`); ação nova é proibida (decisoes.md L2019). Cada ação pedida vira recurso por aba:

| Recurso | Aba | Ações | Fase |
|---|---|---|---|
| `execucao.obras` | Pastas (início) e painel da obra | ver | F1 |
| `execucao.cronogramas` | Cronogramas, locais, EAP, grade, importação | ver, criar, editar, excluir | F1 |
| `execucao.modelos` | Sequências, calendários, cronogramas-modelo, restrições típicas | ver, criar, editar, excluir | F1 |
| `execucao.baselines` | Linha de base e reprogramação | ver, criar, aprovar, desaprovar | F2 |
| `execucao.avanco` | Apontamento, pausas, diário de obra | ver, criar, editar, excluir | F3 |
| `execucao.programacao` | Lookahead, restrições, plano semanal, PPC | ver, criar, editar, excluir | F3 |
| `execucao.planta` | Pranchas, zonas, peças, pinos, traçado da rodovia | ver, criar, editar, excluir | F4 |
| `execucao.materiais` | Composições, necessidade, lista de compras | ver, criar, editar, excluir, aprovar | F5 |
| `execucao.estoque` | Entradas, saídas, transferências, reservas, inventário | ver, criar, editar, excluir | F5 |
| `execucao.equipes` | Pessoas, terceiros, equipes, alocação, equipamentos | ver, criar, editar, excluir | F6 |
| `execucao.anotacoes` | Anotações por funcionário | ver, criar, editar, excluir | F6 |
| `execucao.relatorios` | Relatórios, links da programação | ver, criar, excluir | F7 |
| `execucao.alertas` | Alertas e limites | ver, editar | F7 |
| `execucao.portfolio` | Todas as obras, pessoas e máquinas lado a lado | ver | F7 |

Cada recurso entra no catálogo na fase dele, com o backfill dele (padrão Medição: `perfil_permissoes` do Admin + `usuario_permissoes` dos Admins ativos + `do $confere$` contando as linhas).

### 6.2 Acesso por obra [depende de Q1]

Recomendação: **lista por obra, igual à Medição** (`ex_obra_usuarios (obra_id, usuario_id)`, a linha é o acesso). O engenheiro residente só vê a obra dele; você entra na lista de todas. Toda policy de SELECT: `tem_permissao(recurso,'ver') and obra_id in (select fn_ex_minhas_obras())`; toda tabela filha carrega `obra_id` com FK composta para o pai, para a policy não precisar de join. Quem cria o primeiro cronograma da obra entra na lista na mesma transação. Anexos `ex_*` passam pela mesma trava (`fn_anexo_entidade_visivel`, mudança aditiva lida da definição viva).

Exceção: tabelas globais (biblioteca de serviços, composições, calendários-modelo, equipes-modelo, feriados, terceiros) não pertencem a obra e ficam só no recurso.

### 6.3 Link da programação para o encarregado [depende de Q6]

Primeira rota sem login do ERP. Desenho proposto, para não virar superfície de escrita:

- `ex_links_programacao`: `obra_id`, `semana_id`, `token_hash` (sha256 do token; o token só aparece uma vez, na criação), `expira_em`, `mostra_fotos`, `revogado_em`, `criado_por`, `acessos`, `ultimo_acesso_em`.
- Rota `/p/[token]` em `ROTAS_PUBLICAS`, só leitura, renderizada no servidor. Ela chama **uma** RPC `fn_ex_programacao_publica(token)`, `security definer`, com grant só para o papel do servidor, que devolve a programação daquela semana daquela obra e nada mais. Sem sessão, sem cookie, sem navegação para outras rotas.
- Token de 32 bytes aleatórios, revogável na hora, expiração obrigatória, contador de acessos visível para quem criou.
- Fotos (se ligadas) por URL assinada de 5 minutos, geradas a cada abertura.

## 7. Modelo de dados

Convenções do repo em todas as tabelas: `created_at`, `updated_at`, `created_by references usuarios(id) default auth.uid()`; `fn_audit`; RLS com policy só de SELECT e `grant select` para `authenticated`; **toda escrita por RPC** `security definer set search_path = ''`, `revoke from public, anon`, `grant execute to authenticated`; soft delete na linha (`excluido_em`, `excluido_por`, `motivo_exclusao`) nas transacionais; ids `uuid` (no app, `idSchema`, nunca `z.uuid()`); quantidade digitada `numeric(_,4)` (`CASAS_TAXA`); dinheiro `numeric(14,2)`; datas de calendário como `date` (dia de obra, fuso de Rio Branco).

### 7.1 Obra, cronograma, locais (F1)

**`ex_obras`** (1:1 com `obras`, PK = `obra_id`): `tipo_obra` (`edificacao | rodovia | pequena`), `calendario_id` (padrão dos cronogramas novos), rodovia: `km_inicial`, `km_final`, `metros_por_estaca` (padrão 20), `ppc_limite` (padrão 80%), `observacoes`. Nasce com o primeiro cronograma.

**`ex_v_pastas`** (view): obras com pelo menos um cronograma não excluído e que o usuário pode ver, com saúde, % previsto x real, término tendência, PPC da última semana, atrasos e material faltando (as colunas entram conforme a fase que as calcula).

**`ex_obra_usuarios`**: seção 6.2.

**`ex_cronogramas`**: `obra_id`, `codigo` (curto, único na obra), `nome` (ex.: "Fundação", "Trecho km 100-120"), `status` (`rascunho | ativo | concluido | arquivado`), `calendario_id`, `criterio_peso` (`valor | duracao | homem_hora | manual`), `data_inicio`, `data_corte` (data de status do CPM; padrão hoje), `origem_modelo_id`, `observacoes`.

**`ex_locais`** (por obra, compartilhados entre os cronogramas da obra): `obra_id`, `pai_id`, `tipo` (`bloco | pavimento | ambiente | peca | segmento | outro`), `codigo`, `nome`, `ordem`. Rodovia: `km_inicial`, `km_final` (`numeric(10,3)`; a estaca é calculada por `metros_por_estaca`), `lado` (`LD | LE | eixo | ambos`), `faixa` (texto curto). Obra pequena: local opcional. Hierarquia por `pai_id` com trava contra ciclo.

### 7.2 Biblioteca e atividades (F1)

**`ex_servicos`** (global): `codigo`, `nome`, `unidade_id` → `unidades_medida`, `produtividade_padrao` + `base_produtividade` (Q7), `ceu_aberto` (bool, para o alerta de chuva), `cor` (token), `ativo`.

**`ex_atividades`** (EAP e atividades na mesma árvore):
- `cronograma_id`, `obra_id` (denormalizado com FK composta), `pai_id`, `tipo` (`resumo | atividade | marco`), `codigo` (1, 1.1, 1.1.2; único no cronograma), `nome`, `ordem`.
- `servico_id`, `quantidade`, `unidade_id`, `produtividade`, `modo_duracao` (`por_produtividade | digitada`), `duracao_dias` (inteiro, dias úteis; na `por_produtividade` é preenchida pelo banco), `peso_manual`, `valor_orcado` numeric(14,2) (só para o critério `valor`; informativo, não liga com a Medição).
- `restricao_data` (`nenhuma | inicio_nao_antes | fim_nao_depois`) + `restricao_data_em` (só para o CPM).
- `responsavel_id` → `usuarios`, `observacao`.
- Real: `inicio_real`, `fim_real` (gravados pelo apontamento; nunca sobrescrevem o previsto).
- Resumo e marco não têm quantidade; marco tem duração 0.

**`ex_atividade_locais`** (`atividade_id`, `local_id`): uma atividade pode cobrir mais de um local. A linha de balanço e a matriz usam isto.

**`ex_dependencias`**: `cronograma_id`, `predecessora_id`, `sucessora_id`, `tipo` (`TI | II | TT | IT`), `atraso_dias` (inteiro, pode ser negativo). Digitável na grade como `3TI+2` (predecessora pelo código da linha, ou pelo número da linha). O banco recusa ciclo e dependência entre cronogramas diferentes [proposta: dependência entre cronogramas da mesma obra fica para depois].

**`ex_atividade_recursos`** (planejado): `atividade_id`, `tipo` (`funcao | equipamento`), `funcao_id` ou `tipo_equipamento` (texto, o mesmo `equipamentos.tipo`), `quantidade`. É daqui que saem o histograma planejado e a necessidade de equipe.

### 7.3 Calendário (F1)

- **`ex_calendarios`**: `nome`, `modelo` (bool; o padrão da empresa é um modelo), `pai_id` (herda do modelo), `horas_seg` ... `horas_dom` (`numeric(4,2)`; ex.: 9, 9, 9, 9, 9, 5, 0), `chuvoso_inicio_mes`, `chuvoso_fim_mes` (opcional; no Acre, nov a abr).
- **`ex_feriados`** (global): `data`, `nome`, `abrangencia` (`nacional | AC | municipal`), `municipio`. Pré-carregados nacionais e do Acre de 2026 a 2030; os móveis (Carnaval, Sexta-feira Santa, Corpus Christi) calculados na carga e conferidos por você antes de gravar.
- **`ex_calendario_excecoes`**: `calendario_id`, `data`, `horas` (0 = parado), `tipo` (`feriado | paralisacao | extra`), `descricao`.
- **`fn_ex_dias_uteis(calendario, de, ate)`** e **`fn_ex_somar_dias_uteis(calendario, data, n)`**: a única fonte de "dia útil" do módulo. Dia útil = dia com `horas > 0` depois de exceções e feriados [proposta; Q7 decide se o sábado de 5 h vale 1 dia].

### 7.4 CPM, baseline, pausas (F1 banco; F2 telas)

- **`fn_ex_cpm_calcular(cronograma_id, cenario jsonb default null)`**: função pura, devolve por atividade `inicio_cedo, fim_cedo, inicio_tarde, fim_tarde, folga_total, folga_livre, critica`. Respeita calendário, os 4 tipos de vínculo com atraso, restrições de data, o real (atividade iniciada parte do `inicio_real`; concluída é fixa) e a `data_corte` (trabalho restante não começa antes dela). Resumo = envelope dos filhos. O `cenario` aplica alterações sem gravar (modo "e se").
- **`ex_atividade_datas`**: cache gravado **só** por `fn_ex_cpm_recalcular(cronograma_id)`, que chama a mesma função. Toda RPC que muda duração, vínculo, calendário ou real recalcula na mesma transação. A tela lê o cache; ninguém mais calcula datas.
- **`fn_ex_simular(cronograma_id, cenario)`**: modo "e se". Cenário = lista de mudanças (`atraso` em atividade, `produtividade` nova num serviço ou atividade, `equipe_extra` que multiplica a produtividade [proposta: equipe extra = produtividade × (n+1)/n], `duracao` nova). Devolve as datas novas, o término novo e o histograma novo. Não grava nada.
- **`ex_baselines`**: `cronograma_id`, `numero` (0 = original), `motivo` (obrigatório a partir da 1), `status` (`rascunho | pendente_aprovacao | aprovada | substituida`), `aprovada_por`, `aprovada_em`. Fluxo e aprovação dependem de Q2.
- **`ex_baseline_atividades`**: congela por atividade `inicio`, `fim`, `duracao_dias`, `quantidade`, `peso`, `codigo`, `nome`. Imutável por trigger quando aprovada. Comparar baselines = view sobre duas versões.
- **`ex_pausas`**: `atividade_id`, `obra_id`, `inicio`, `fim` (nulo = aberta), `motivo` (`chuva | material | equipamento | mao_de_obra | projeto | fiscalizacao | outro`), `observacao`. Pausa aberta tira os dias do trabalho restante no CPM [proposta].

### 7.5 Real, diário, Last Planner (F3)

- **`ex_avancos`**: `atividade_id`, `obra_id`, `local_id` (opcional), `data`, `quantidade` **ou** `percentual_acumulado` (exatamente um, conforme a atividade tem quantidade ou não), `origem` (`apontamento | diario | peca | importacao`), `nota`, soft delete. Foto como anexo `ex_avanco`. O primeiro avanço grava `inicio_real`; chegar a 100% propõe `fim_real` (confirmação na tela) [proposta].
- **`ex_diarios`**: `obra_id`, `data` (único por obra), `clima_manha`, `clima_tarde` (`sol | nublado | chuva_fraca | chuva_forte | impraticavel`), `chuva_mm` (opcional), `ocorrencias`, `status` (`aberto | fechado`). Efetivo confirmado: `ex_diario_efetivo` (pessoa, presente, horas); equipamentos: `ex_diario_equipamentos` (equipamento, horas, situação). Os avanços do dia **não** são copiados: o diário mostra os `ex_avancos` da obra naquela data, e o avanço lançado pelo diário é o mesmo registro (`origem = diario`). Dia de chuva sugere pausa nas atividades `ceu_aberto` em execução; sugere, não grava.
- **`ex_restricoes`**: `atividade_id`, `obra_id`, `tipo` (`material | projeto | equipe | equipamento | frente | outro`), `descricao`, `responsavel_id`, `data_limite`, `status` (`aberta | removida | cancelada`), `removida_em`. Atividade com restrição aberta = "não liberada".
- **`ex_semanas`**: `obra_id`, `inicio` (segunda-feira), `status` (`planejando | comprometida | fechada`).
- **`ex_compromissos`**: `semana_id`, `atividade_id`, `equipe_id` (opcional, F6), `quantidade_prevista`, `dias` (seg a dom), `concluido` (bool, nulo até fechar a semana), `causa` (mesma lista das pausas mais `planejamento | clima | terceiro`), `nota`. Comprometer atividade não liberada exige confirmação e fica marcado [proposta: alerta, não trava].
- **PPC** = compromissos concluídos / compromissos da semana fechada. View por obra, equipe, semana; Pareto das causas por view.

### 7.6 Planta e rodovia (F4)

- Bucket **`execucao`** (privado, fora da faxina de `anexos`), com `ex_arquivos` próprio (path, hash, tamanho, tipo). Upload no mesmo padrão de 3 passos (token assinado, navegador sobe direto, servidor confere hash).
- **`ex_pranchas`**: `obra_id`, `nome`, `ordem`. **`ex_prancha_versoes`**: `prancha_id`, `numero`, `arquivo_id` (PDF ou imagem original), `imagem_id` (PNG gerado), `largura_px`, `altura_px`, `vigente`. PDF vira imagem de alta resolução no navegador (pdf.js) na hora do upload, uma vez.
- Coordenadas em pixels da imagem da versão. Versão nova **não move nem apaga** marcação: as marcações continuam ligadas à versão antiga até você mandar "trazer para a versão nova" (copia, com ajuste de escala/deslocamento por 2 pontos de referência) [proposta].
- **`ex_zonas`**: `versao_id`, `obra_id`, `local_id`, `atividade_id` (opcional), `geometria` (jsonb: polígono ou retângulo), `camada_servico_id`. Cor e % saem de view (situação do local/atividade na data pedida).
- **`ex_pecas`**: `versao_id`, `obra_id`, `tipo` (`estaca | bloco | pilar | sapata | viga | outro`), `codigo`, `geometria` (ponto ou forma), `local_id`, `atividade_id`, `quantidade` (quanto da atividade a peça vale; padrão 1). Marcar executada é RPC que grava `ex_peca_execucoes` (`peca_id`, `data`, `por`) **e** o `ex_avanco` da atividade (`origem = peca`), na mesma transação. Desmarcar apaga os dois.
- **`ex_pinos`**: `versao_id`, `obra_id`, `x`, `y`, `tipo` (`foto | nota | problema`), `texto`, `status` (`aberto | resolvido`), `atividade_id`/`local_id` opcionais, fotos por anexo.
- **Replay**: `fn_ex_situacao_em(obra, data, base)` devolve situação e % de cada local/atividade/peça numa data, pelo real (avanços até a data) ou pelo previsto (cronograma atual ou uma baseline). A tela só pinta.
- **Rodovia**: `ex_tracados` (`obra_id`, `arquivo_id` do KML/KMZ, `geojson` da linha, `km_no_inicio`, `marcos` jsonb opcionais (km → ponto) para calibrar). Posição de um km = interpolação ao longo da linha a partir dos marcos [proposta]. O diagrama linear não precisa do traçado; o mapa precisa.

### 7.7 Materiais e estoque (F5)

- **`ex_composicoes`**: `servico_id`, `versao`, `status` (`rascunho | vigente | substituida`), `referencia` (texto: "SINAPI 94965 03/2026", "SICRO 4011463"), `unidade_id`, `observacao`. **`ex_composicao_insumos`**: `composicao_id`, `insumo_id` → `insumos`, `coeficiente`, `perda_pct`. Montar a partir de uma referência colada (texto) e ajustar; nada é buscado na internet.
- **`ex_atividade_materiais`**: `atividade_id`, `obra_id`, `insumo_id`, `origem` (`composicao | manual`), `composicao_id` (a versão aplicada), `quantidade` (gravada ao aplicar a composição, ou digitada na manual). Versão nova de composição **não muda** atividade já calculada: aparece "composição nova disponível" e você aplica por atividade, por serviço ou no cronograma.
- **`ex_insumo_antecedencias`**: `insumo_id`, `obra_id` (nulo = padrão), `dias` (ex.: aço 20, cimento 7).
- **Necessidade** (view): quantidade de cada insumo por atividade, distribuída pelos dias úteis previstos da atividade, com **data limite de chegada** = início previsto − antecedência.
- **`ex_estoque_movimentos`**: `obra_id`, `insumo_id`, `data`, `tipo` (`entrada_oc | entrada_avulsa | consumo | transferencia_saida | transferencia_entrada | inventario`), `quantidade` (com sinal), `atividade_id` (consumo), `oc_item_id` (entrada de OC; só leitura de Compras), `fornecedor_id`, `nota_fiscal`, `motivo` (obrigatório no inventário), `transferencia_id` (amarra o par), soft delete. Fotos e NF por anexo.
- **`ex_reservas`**: `obra_id`, `insumo_id`, `atividade_id`, `quantidade`, `status` (`ativa | consumida | cancelada`).
- **Saldo, reservado, disponível, OC em aberto, falta, perda real** = views. Sem coluna de saldo gravada, sem valor em R$ (seção 4). Saldo negativo depende de Q5.
- **Sugestão de baixa** (view): avanço apontado × composição − consumo já lançado, por atividade e insumo. Confirmar grava o `consumo`.
- **Entrada de OC**: lista os `oc_itens` de OCs `aprovado | recebido | pago` (Q8) cujo centro de custo pertence à obra, com quantidade da OC, já entrada na obra e a receber. Entrada parcial permitida; total entrado por item nunca passa da quantidade da OC.
- **Lista de compras** (view + export): falta por insumo, quantidade e data limite, mais o que está em OC em aberto.

### 7.8 Pessoas, equipes, equipamentos (F6)

- **`ex_terceiros`** (global): `nome`, `funcao_id` → `funcoes`, `empresa`, `contato`, campos de Q4, `colaborador_id` (preenchido se virar colaborador), `ativo`.
- **`ex_v_pessoas`** (view): `colaboradores` ativos + `ex_terceiros`, com `pessoa_tipo` (`colaborador | terceiro`) e `pessoa_id`. Toda tabela que fala de pessoa usa o par (`colaborador_id` ou `terceiro_id`, exatamente um, por CHECK), para manter FK de verdade.
- **`ex_pessoa_habilidades`**: pessoa + `funcao_id` (habilidades além da função principal, ex.: armador que também é carpinteiro).
- **`ex_equipes_modelo`** + **`ex_equipe_modelo_funcoes`** (`funcao_id`, `quantidade`).
- **`ex_equipes`** (por obra): `obra_id`, `nome`, `modelo_id`, `encarregado` (pessoa). **`ex_equipe_membros`**: pessoa, `desde`, `ate`.
- **`ex_alocacoes`**: `data`, pessoa, `obra_id`, `local_id`, `atividade_id`, `equipe_id`, `horas`. Pessoa em duas obras no mesmo dia: **alerta**, não trava (pode ser meio período em cada) [proposta]. "Quem está livre" = pessoas ativas sem alocação na data, filtráveis por função/habilidade, com o que falta para fechar a equipe-modelo.
- **`ex_anotacoes`**: pessoa, `obra_id`, `data`, `tipo` (`desempenho | ocorrencia | habilidade | observacao`), `texto`. Visibilidade por Q3.
- **`ex_equipamento_alocacoes`**: `equipamento_id` → `equipamentos`, `obra_id`, `atividade_id` (opcional), `inicio`, `fim`. Conflito entre obras e "em manutenção" (`equipamentos.status` ou OS aberta) são alertas.
- **Produtividade** (view): por serviço, obra, equipe e período, quantidade avançada / homem-hora alocado (e / dia). Alimenta o modelo e a previsão de término.

### 7.9 Modelos (F1 sequências e calendários; os demais na fase de cada um)

- **`ex_modelos_sequencia`** (`nome`, `tipo_obra`) + **`ex_modelo_etapas`** (`ordem`, `servico_id`, `nome`, vínculo com a etapa anterior: tipo e atraso). "Gerar por modelo × locais" = RPC que cria uma atividade por etapa e por local, com as dependências dentro do local e entre locais (a mesma etapa no local seguinte depende da anterior: ritmo), deixando a quantidade para você.
- **Cronograma inteiro como modelo**: `ex_modelos_cronograma` com o conteúdo congelado (jsonb das atividades, vínculos e recursos) e RPC de aplicar em outra obra, remapeando locais por código.
- **Restrições típicas**: `ex_restricoes_tipicas` (`servico_id`, `tipo`, `descricao`, `antecedencia_dias`): sugeridas ao programar o lookahead.
- **Produtividade aprendida**: view com a mediana da produtividade real do serviço nas obras concluídas; o modelo mostra ao lado da padrão e sugere a duração. Nunca troca sozinho.

### 7.10 Alertas e sininho (F7)

- **`ex_v_alertas`** (view, calculada, sem tabela): atividade que devia ter começado e não começou; restrição vencendo em N dias; material que não chega a tempo; produtividade abaixo do planejado por N dias; pausa aberta há mais de N dias; pessoa ou máquina em conflito; máquina alocada em manutenção; PPC abaixo do limite; período chuvoso com serviço a céu aberto programado.
- **`ex_alerta_limites`**: `obra_id` (nulo = padrão), `tipo`, `n`.
- **Sininho canônico** no AppShell: lê os alertas visíveis ao usuário (só os do módulo, por enquanto) e grava só **`alertas_vistos`** (`usuario_id`, `chave`, `visto_em`). Desenhado genérico para outros módulos plugarem depois, sem mexer neles agora.

## 8. Regras no banco [proposta onde marcado]

- **Duração por produtividade**: `duracao_dias = ceil(quantidade / produtividade)` na base escolhida em Q7; a grade mostra a conta.
- **Situação da atividade** (view, uma regra só): `concluida` (tem `fim_real`); `pausada` (pausa aberta); `nao_liberada` (restrição aberta e não iniciada); `atrasada` (não concluída e: fim do cronograma atual < hoje, ou início < hoje sem `inicio_real`); `em_execucao`; `nao_iniciada`. [proposta]
- **% físico da atividade**: Σ avanço / quantidade, limitado a 100%; sem quantidade, o último percentual. **Do cronograma**: Σ(peso × %) / Σ peso, com peso pelo `criterio_peso`. **Previsto numa data**: distribuição linear da atividade pelos dias úteis entre início e fim (do cronograma atual ou da baseline escolhida) [proposta]. Curva S = essa conta dia a dia.
- **SPI** = % real / % previsto da baseline vigente na mesma data.
- **Desvio** = datas atuais ou reais contra a baseline vigente, em dias úteis.
- **Tendência de término**: cada atividade em execução termina pelo ritmo real dos últimos 10 dias úteis com avanço [proposta]; essas durações entram no `fn_ex_simular` e o término do cronograma sai do CPM. Uma conta só, a mesma do "e se".
- **Linha de balanço** (view): por serviço e local, início e fim (previsto e real), com o local na ordem do eixo (ordem dos locais ou km).

## 9. Telas

Desktop com os canônicos (`FilterBar`, `DataTable`, `FormDrawer`, `KPICard`/`GradeKpis`, `StatusBadge`, `ImportDialog`, `Trilha`, `Anexos`, `ConfirmDialog`); telas de campo no celular primeiro. Navegação entre abas pela sidebar (`config/recursos.ts`), nunca abas dentro da página. As visualizações de um cronograma (grade, Gantt, linha de balanço, matriz, curva S, histograma, kanban, calendário) são um seletor "Ver como" dentro da tela do cronograma, não abas do módulo.

1. **Pastas** (`/execucao`): card por obra com saúde (verde/âmbar/vermelho), % previsto × real, término tendência, PPC, atrasos, material faltando.
2. **Obra** (`/execucao/obras/[obraId]`): painel (seção 11 do pedido), cronogramas, locais, equipes da obra.
3. **Cronograma** (`/execucao/cronogramas/[id]`): grade estilo planilha (edição inline, Tab/Enter/setas, colar bloco do Excel, arrastar para reordenar e recuar, editar várias linhas), Gantt, demais visões, "e se", baselines.
4. **Importar Excel** (assistente): arquivo, aba, cabeçalho, mapeamento sugerido pelo nome, hierarquia por código ou recuo, dependências em texto, datas ou durações, prévia com erros linha a linha, modelo .xlsx. Reimportar casa pelo código e mostra o diff para aprovar. Leitura no servidor a partir do Storage (padrão Medição).
5. **Gerar por modelo × locais**.
6. **Programação** (`/execucao/programacao`): lookahead de 6 semanas com restrições, plano semanal dia a dia, fechamento com causa, PPC e Pareto.
7. **Diário** (`/execucao/diario` e `/m/execucao/diario`).
8. **Apontamento rápido** (`/m/execucao`): "o que avançou hoje", toca na atividade ou na planta, quantidade ou %, foto.
9. **Planta** (`/execucao/planta` e no celular): zonas, peças, pinos, camadas, replay, previsto × real lado a lado, exportar imagem para o relatório. Rodovia: diagrama linear e mapa.
10. **Materiais**, **Estoque**, **Lista de compras**.
11. **Pessoas e equipes**, **Quadro de alocação** (pessoa × dia), **Onde está cada um hoje**, **Equipamentos**.
12. **Relatórios**, **Alertas**, **Portfólio**.

## 10. Bibliotecas e performance (trade-off para você decidir comigo)

Meta: Gantt, linha de balanço e planta fluidos com 3.000 atividades e 1.000 peças, inclusive no celular.

**Gantt e linha de balanço**

| Opção | Licença | Prós | Contras |
|---|---|---|---|
| **A. Desenho próprio** (SVG nas linhas visíveis + TanStack Virtual, que já está no projeto; vínculos num canvas por cima) | nenhuma | Total aderência ao design system e ao celular; o CPM já está no banco (D16), então não precisamos do motor de agenda de lib nenhuma; linha de balanço, histograma e Gantt reaproveitam a mesma régua de tempo (`ReguaTempo` já existe) | Mais código nosso: arrastar, esticar, desenhar vínculo, zoom. Estimo o Gantt como o maior pedaço da F2 |
| B. Bryntum Gantt | comercial, paga por desenvolvedor | Pronta, rápida, completa | Traz o próprio motor de agenda, que **duplica e pode discordar** do CPM do banco (fere D16); pesada; visual difícil de alinhar |
| C. DHTMLX Gantt | GPL na versão livre; caminho crítico, auto-agendamento e recursos só na PRO paga | Madura | GPL contamina o código fechado do ERP; o que importa está na paga; mesmo problema do motor duplicado |
| D. SVAR React Gantt | MIT no básico, PRO paga | React nativo, leve | Recursos que precisamos (crítico, baseline) na PRO; motor duplicado |
| E. Frappe Gantt | MIT | Simples | Não virtualiza, não aguenta 3.000 linhas, sem baseline |

**Recomendação: A.** O argumento decisivo é D16: a lib só serviria para desenhar, e desenhar barras numa régua virtualizada é a parte mais simples; a parte difícil (CPM, calendário) já fica no banco de qualquer jeito.

**Planta e mapa**: **Leaflet** (já no projeto) com `CRS.Simple` para a planta (imagem como fundo, zonas e peças como camadas, renderizador canvas para 1.000+ peças, pinch-zoom e pan no celular) e com OSM/Esri para o traçado da rodovia. Dependências novas: **pdfjs-dist** (Apache 2.0) para transformar o PDF em imagem no upload, e **@tmcw/togeojson** (BSD) para ler KML/KMZ. Alternativa recusada: Konva/canvas próprio (refaz pan/zoom/toque que o Leaflet já resolve).

**Grade**: TanStack Table + Virtual (canônico `DataTable` evoluído com o modo edição, não tabela paralela). Arrastar para reordenar e recuar: **@dnd-kit** (MIT), dependência nova.

**PDF e Excel**: pdfmake e exceljs (já no projeto), com a moldura `marca-documento`.

## 11. Pronto para um agente (D13)

- Nomes em português, prefixo `ex_`, tipos em CHECK com valores legíveis.
- Escrita só por RPC `fn_ex_*` com validação e mensagem clara (errcode `P0001`), inclusive em lote (`fn_ex_atividades_salvar_lote`, `fn_ex_avancos_lancar_lote`) para o agente não precisar de 300 chamadas.
- Views de leitura: `ex_v_situacao_obra`, `ex_v_atividades` (com datas, folgas, situação, %), `ex_v_falta_material`, `ex_v_onde_esta_cada_um`, `ex_v_ppc_semanal`, `ex_v_alertas`, `ex_v_curva_s`.
- `comment on` em toda tabela, coluna não óbvia, view e RPC (o agente lê pelo catálogo).
- `docs/modulos/execucao-guia-para-agentes.md`: modelo, RPCs com exemplos, regras, consultas prontas, o que o agente nunca deve fazer (escrever direto em tabela, recalcular datas fora do banco). Começa na F1 e cresce em cada fase.

## 12. Testes e provas

- **Prova SQL por fase** em `supabase/provas/ex_faseN_*.sql`, estilo atual (`do $prova$`, `set local role authenticated`, recusas com `exception when others`, linha de controle que tem de dar diferente, `raise exception 'PROVA %'` + aborto garantido). Chama as RPCs, não insere direto.
- F1 cobre: acesso por obra (fora da lista não vê nada, anexo inclusive), pasta derivada (nasce e some), calendário (feriado, sábado, exceção), CPM contra um cronograma pequeno feito à mão com os 4 tipos de vínculo, atraso negativo e folga livre, ciclo recusado, importação e diff.
- **Mutação manual**: quebrar de propósito o CPM (trocar TI por II, esquecer o atraso, contar sábado errado) e mostrar que a prova falha.
- **Vitest**: leitor do Excel, parser de `3TI+2`, colar bloco, geometria da planta, mapeamento de colunas.
- **Performance**: cronograma sintético de 3.000 atividades e 5.000 vínculos: `fn_ex_cpm_recalcular` abaixo de 1 s no banco vivo [meta proposta]; Gantt a 60 fps rolando; planta com 1.000 peças no celular.
- **Portão de cada PR**: tsc, lint, testes, build, CI verde, prova SQL no banco vivo, advisors limpos, deploy `success`, telas conferidas em produção, nota do projeto e `docs/decisoes.md` atualizados.

## 13. Fases (1 PR por fase, você aprova cada uma)

Ajuste em relação ao pedido: o **motor CPM (banco) sobe para a F1**, porque a grade já precisa mostrar datas calculadas e, sem ele, a F1 entregaria datas digitadas que a F2 teria de desfazer. A F2 fica com as telas (Gantt, baseline, pausas, "e se"). A F1 é grande; se passar do razoável, divido em F1a (banco, pastas, cronogramas, locais, grade, calendário, CPM) e F1b (importação Excel e modelos × locais).

1. **F1**: banco base, acesso, pastas, cronogramas, locais, EAP, grade editável, calendário e feriados, motor CPM no banco, importação Excel genérica, modelos de sequência × locais, guia para agentes (início).
2. **F2**: Gantt interativo, baseline e reprogramação, pausas, "e se".
3. **F3**: apontamento (celular), diário de obra, lookahead com restrições, plano semanal e PPC, painel da obra, curva S, linha de balanço, matriz.
4. **F4**: planta (edificação) e diagrama linear com mapa (rodovia).
5. **F5**: composições, necessidade de material, estoque por obra, lista de compras.
6. **F6**: pessoas, terceiros, equipes, alocação, anotações, produtividade, equipamentos.
7. **F7**: relatórios PDF/Excel, link do encarregado, sininho e alertas, portfólio, guia para agentes completo.

## 14. Perguntas em aberto

Cada opção diz o que implica. A recomendação vem primeiro.

| # | Pergunta | Opções e o que implicam | Bloqueia |
|---|---|---|---|
| Q1 | **Acesso**: por lista de usuários de cada obra ou por perfil? | **(a) Lista por obra, como a Medição.** O engenheiro só vê a obra dele; você entra em todas; cada obra nova precisa de alguém pondo o engenheiro na lista. (b) Só por perfil: quem tem o recurso vê todas as obras; mais simples, mas o engenheiro de uma obra vê a outra (equipes, anotações, estoque). | F1 |
| Q2 | **Quem reprograma** (nova baseline) e se precisa da sua aprovação. | **(a) Engenheiro propõe com motivo, você aprova** (`execucao.baselines/criar` para ele, `aprovar` só para você); até aprovar, a baseline vigente continua sendo a anterior e os desvios são medidos contra ela. (b) Engenheiro reprograma sozinho, com motivo e trilha; mais rápido, mas a referência de atraso pode ser "zerada" sem você ver. | F2 |
| Q3 | **Quem vê as anotações por funcionário.** | **(a) Só quem tem `execucao.anotacoes/ver`** (no início só você); o engenheiro escreve (`criar`) mas não lê a dos outros nem de outras obras. (b) Engenheiro lê as da obra dele. (c) Todos com acesso à obra. Implicação: anotação de desempenho é dado sensível de RH; (a) é a mais segura. | F6 |
| Q4 | **Terceiro avulso**: campos mínimos e se pode virar colaborador do RH. | **(a) Nome, função, empresa/empreiteiro, contato; CPF opcional.** Virar colaborador = o RH cadastra normalmente e o terceiro é **vinculado** (`colaborador_id`), mantendo o histórico de alocação e produtividade; o módulo nunca cria colaborador. (b) CPF obrigatório: evita duplicidade, mas trava o cadastro rápido em campo. | F6 |
| Q5 | **Estoque negativo**: bloqueia ou deixa? | **(a) Deixa, com alerta** "saldo negativo" até entrar a entrada; reflete a obra real (consumiu antes de lançar) e não trava o apontamento. (b) Bloqueia: saldo sempre confiável, mas obriga lançar a entrada antes do consumo, e a baixa sugerida pelo avanço passa a falhar. | F5 |
| Q6 | **Link do encarregado**: existe mesmo sem login? Validade? Mostra fotos? | **(a) Link sem login, só leitura, válido até o domingo da semana programada +2 dias, revogável, sem fotos por padrão** (liga por link). Implica a primeira rota pública do ERP (seção 6.3), contra o espírito da decisão de 13/08 (que era sobre aprovar dinheiro, não sobre ler programação). (b) Só PDF, sem link: zero superfície pública; o encarregado recebe o arquivo no WhatsApp. | F7 |
| Q7 | **Base da produtividade e o sábado.** Com seg a sex 9 h e sáb 5 h: | **(a) Produtividade por dia, sábado conta 1 dia útil.** Simples, igual à planilha; superestima o sábado. (b) **Produtividade por hora**: duração em horas convertida pelo calendário; sábado rende 5/9 de um dia; mais preciso e casa com homem-hora, mas foge do jeito que a obra fala ("faço 40 m³ por dia"). (c) Por dia, sábado = meio dia. Não escolho sozinho: muda todas as datas. | F1 |
| Q8 | **Entrada de OC na obra**: de quais OCs? | **(a) OCs `aprovado`, `recebido` e `pago`**: material chega na obra antes de Compras registrar o recebimento (que é só cabeçalho, sem item). (b) Só `recebido`/`pago`: só entra o que Compras já recebeu; o engenheiro espera o escritório. Em ambas: entrada parcial por item, nunca acima da quantidade da OC, sem mexer em Compras. | F5 |
| Q9 | **Estoque físico sem valor** (seção 4) está certo? | **(a) Sim, só quantidade**: não conflita com "custo de obra = lançamentos" (29/07). (b) Quer valor/custo por consumo: aí é preciso rever a decisão de 29/07 antes, porque compra e consumo contariam duas vezes. | F5 |
| Q10 | **Nome no menu e prefixo**: "Execução" / `ex_`? | **(a) "Execução", rota `/execucao`, prefixo `ex_`.** (b) "Obras em Execução" (rótulo longo na sidebar). (c) "Planejamento". Só rótulo; o prefixo fica `ex_` em qualquer caso. | F1 |
| Q11 | **Obra piloto** da F1. | Sugiro a **Obra 012 (Escola de Mâncio Lima)** para edificação e um trecho do **Lote 10** para rodovia, montados por você na tela (sem carga da planilha antiga, como pedido). | F1 |

(emenda 09/10/2026, decisão do Tiago): "pode seguir" aceita a opção (a) de Q1 a Q11. Q1 lista por obra; Q2 engenheiro propõe, Tiago aprova; Q3 só quem tem `execucao.anotacoes/ver`; Q4 nome, função, empresa, contato, CPF opcional, vínculo posterior com colaborador; Q5 saldo negativo com alerta; Q6 link sem login, só leitura, até domingo + 2 dias, sem fotos por padrão; Q8 OCs aprovado, recebido e pago; Q9 estoque só de quantidade; Q10 "Execução", `/execucao`, `ex_`; Q11 Obra 012 e trecho do Lote 10. **Q7 é suposição, não resposta**: eu não tinha recomendado nenhuma opção, então a F1 segue com (a), produtividade por dia e todo dia com horas > 0 contando 1 dia útil (sábado de 5 h inclusive). Trocar depois do merge da F1 muda todas as datas; o Tiago pode trocar antes.

(emenda 09/10/2026): a F1 foi dividida em **F1a** (banco base, acesso, pastas, cronogramas, locais, calendário e feriados, motor CPM, grade editável, guia para agentes) e **F1b** (importação Excel e modelos × locais), um PR cada. Na F1a, reordenar e recuar na grade é por botão e atalho; arrastar com o mouse (@dnd-kit) entra na F1b. `ex_atividade_recursos` sai da F1 e entra na F3, com o histograma, que é quem a usa. Na Q1 (a), "você entra na lista de todas" vira regra: ao nascer a pasta, entram na lista quem criou e todos os usuários ativos do perfil Admin.

## 15. Fora do escopo

- Qualquer escrita em outro módulo: Compras, RH (folha, diárias, rescisão, `colaboradores.obra_id`), Manutenção, Medição, Financeiro.
- Valor do estoque, custo por consumo, lançamento financeiro (seção 4).
- Cruzamento com a Medição de Contratos; importação da planilha antiga.
- Email, WhatsApp, IA dentro do app, modo offline.
- Dependência entre cronogramas diferentes (pode entrar depois).
