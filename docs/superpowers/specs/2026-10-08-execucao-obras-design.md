# Execução de Obras: desenho

**Data:** 08/10/2026 · **Status:** rascunho para revisão do Tiago · **Código:** nenhum até o spec e o plano da F1 serem aprovados.

## 1. Objetivo

Um módulo para todas as obras da EMT, para sempre, que dê visão total do que está sendo executado: o que está planejado, o que está rodando, onde fisicamente, com quem, com quais máquinas e com qual material, o que parou e por quê, e quando vai terminar. Mais fácil de alimentar que qualquer planilha.

Atende três tipos de obra com o mesmo modelo: **edificação** (escola, prédio), **rodovia** (km/estaca, lado, faixa) e **obra pequena/manutenção** (sem burocracia: local opcional, sem baseline obrigatória, sem plano semanal obrigatório).

## 2. Decisões já tomadas (pedido de 08/10/2026)

| # | Decisão |
|---|---|
| D1 | Módulo novo e independente. **Nenhum cruzamento com a Medição de Contratos** e nenhuma importação de planilha antiga (o Excel da escola de Mâncio Lima foi só referência de formato). |
| D2 | Obra é a do **cadastro de Obras do ERP** (`obras`). Nenhuma tabela de obra nova. A pasta da obra é **derivada**: existe enquanto a obra tem pelo menos um cronograma. |
| D3 | Usuários: Tiago (todas as obras) e engenheiro residente (monta, reprograma, aponta). Encarregado não usa o sistema; recebe a programação em PDF ou link. |
| D4 | Método: Gantt mestre com CPM **mais** Last Planner (lookahead de 6 semanas com restrições, plano semanal, PPC e causas). Linha de balanço como visão adicional. |
| D5 | % físico com ponderação configurável por cronograma: valor orçado, duração, homem-hora ou peso manual. |
| D6 | Material por composição (biblioteca EMT) e por lista manual. Estoque por obra com entrada de OC ou avulsa, saída por atividade, transferência, reserva e inventário. |
| D7 | Pessoas: colaboradores do RH (só leitura) mais terceiros avulsos com cadastro leve. Equipamentos: frota do ERP (só leitura); máquina em manutenção vem da Manutenção (só leitura). |
| D8 | Alertas só dentro do ERP. Sem email, sem WhatsApp. **Sem IA dentro do módulo**; o módulo é feito para um agente ler e escrever pelo banco (seção 12). |
| D9 | **Toda regra calculada mora no banco, uma vez só** (dias trabalhados, folgas, caminho crítico, situação, % físico, desvios, PPC, saldos). O TypeScript formata e exibe. Mesmo princípio da Medição (D6/D7 de lá). |
| D10 | Migrations só aditivas, com rollback. Nunca revogar ou renomear coluna que o código em `main` usa (incidente de 27/08). |

## 3. O que o banco mostrou (lido em 08/10/2026, antes de desenhar)

Esses fatos mudam partes do pedido. Cada um vira pergunta na seção 16 quando a decisão é sua.

1. **O Compras não tem recebimento por item.** A reforma de 20/07 tirou estoque e recebimento ("OC continua item a item ligada ao insumo. Sem estoque, sem recebimento"). A tabela `recebimentos` que sobrou é por NF (número, valor, data), sem quantidade por item, e tem 3 linhas. Então "entrada puxada de OC recebida" **não existe para ler**. O que existe: `oc_itens` (insumo, quantidade, preço, `centro_custo_id`) em OC `aprovado` ou `pago`, e `centros_custo.obra_id` liga o item à obra. Proposta na seção 9.3.
2. **Por que o Estoque saiu do ERP** (pergunta do item 9 do pedido). Dois motivos registrados: (a) a reforma de 20/07 reduziu a operação a Compras, Financeiro e RH; (b) em 29/07 você decidiu que **custo de obra = lançamentos**, substituindo o modelo "base consumo" que dependia do estoque. **Conflito real:** se o estoque desta obra carregar valor (custo médio, PEPS) e o consumo virar custo, o mesmo cimento entra duas vezes no custo da obra, uma pela OC/lançamento e outra pelo consumo. **Proposta: estoque só físico** (quantidade, sem valor, sem custo, sem lançamento, sem centro de custo). Assim não conflita com nenhuma das duas decisões. O almoxarifado da Manutenção (peças, `almoxarifado_*`) é outro domínio e não é tocado.
3. **A obra 009 é uma só para os Lotes 09 e 10** ("009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10"). Os dois lotes viram cronogramas separados dentro da mesma pasta (ex.: "Lote 09 km 100-120"). Não mexo no cadastro de Obras.
4. **O RH já tem vínculo `terceiro` e `diarista`** em `colaboradores` (63 ativos, 32 funções). Ou seja, parte dos "terceiros avulsos" já pode estar no RH. O cadastro leve do módulo fica para quem **não** está no RH (seção 10.1).
5. **`obras` não tem tipo** (edificação/rodovia/pequena). Só `rodovia`, `lote`, `extensao_km`. O tipo fica numa tabela do módulo, 1:1 com a obra.
6. **Não existe sininho global.** Hoje cada módulo tem uma aba Alertas (`/medicao/alertas`, `/rh/alertas`). O sininho é evolução do `AppShell` canônico (regra 9), e passa a servir qualquer módulo depois.
7. **Não há `pg_cron` nem PostGIS** no projeto. Consequência: alerta é **view calculada na hora** (como `mc_v_alertas`), não job; km e estaca são número, não geometria; o KML é lido no navegador e guardado como GeoJSON.
8. **Buckets:** só `anexos` e `avatares`. Plantas e fotos vão para bucket novo, fora da faxina de órfãos do `anexos` (pedido do item 14.4).
9. **Equipamento:** `equipamentos.status` só tem `ativa | fora_funcionamento`. "Em manutenção" sai de OS aberta em `ordens_servico` (iniciada e não concluída).
10. **Já temos `leaflet`/`react-leaflet`, `@tanstack/react-virtual`, `recharts`, `exceljs`, `pdfmake`, `unpdf`.** Isso pesa na escolha de biblioteca (seção 14).

## 4. Nome e prefixo

- Menu: **Execução** (módulo `execucao`, rota `/execucao`, recursos `execucao.*`). "Obras" já é aba de Cadastros e confundiria no menu; "Obras em Execução" é longo para a sidebar. Se preferir "Obras em Execução" ou "Planejamento", é só trocar o rótulo, o resto não muda.
- Tabelas, views e funções com prefixo **`ex_`** (`ex_cronogramas`, `ex_v_situacao_obra`, `fn_ex_apontar_avanco`), pelo mesmo motivo do `mc_` da Medição: `medicoes`, `equipes`, `locais` são nomes que colidem fácil.
- Campo no celular: `/m/execucao`.

## 5. Permissões e acesso

### 5.1 Recursos (só as 6 ações que existem, sem ação nova)

| Recurso | Aba | Ações |
|---|---|---|
| `execucao.obras` | Pastas das obras (tela inicial) e acesso por obra | ver, editar (gerir lista de acesso e tipo da obra) |
| `execucao.cronogramas` | Cronogramas, EAP, grade, Gantt, dependências, calendário | ver, criar, editar, excluir |
| `execucao.baselines` | Linha de base e reprogramação | ver, criar (propor), aprovar, desaprovar |
| `execucao.locais` | Estrutura de locais, planta, traçado | ver, criar, editar, excluir |
| `execucao.apontamentos` | Avanço, pausas, diário de obra | ver, criar, editar, excluir |
| `execucao.planejamento` | Lookahead, restrições, plano semanal, PPC | ver, criar, editar, aprovar (fechar a semana) |
| `execucao.materiais` | Composições, necessidade, lista de compras | ver, criar, editar, excluir, aprovar (aplicar versão da composição) |
| `execucao.estoque` | Estoque por obra | ver, criar, editar, excluir |
| `execucao.equipes` | Pessoas, terceiros, equipes, alocação, equipamentos | ver, criar, editar, excluir |
| `execucao.anotacoes` | Anotações por funcionário | ver, criar, editar, excluir |
| `execucao.modelos` | Modelos reutilizáveis e biblioteca de serviços | ver, criar, editar, excluir |
| `execucao.painel` | Painel da obra, portfólio, relatórios | ver |
| `execucao.alertas` | Alertas | ver |

Backfill no padrão da Medição: só os Admins no começo, com `do $confere$` contando linhas. Cada recurso entra no catálogo na fase dele.

### 5.2 Acesso por obra (depende da Q1)

Proposta: igual à Medição. `ex_obra_usuarios (obra_id, usuario_id)`, a linha existir é o acesso. `fn_ex_acessa_obra(obra_id)` `security definer stable`. Toda policy de SELECT é `tem_permissao(recurso,'ver') and fn_ex_acessa_obra(obra_id)`; toda tabela filha carrega `obra_id` com FK composta para o pai, para a policy não fazer join e o `obra_id` denormalizado nunca mentir. Quem cria o primeiro cronograma entra na lista na mesma transação. Catálogos globais (serviços, composições, modelos, feriados, causas) são protegidos só pelo recurso.

### 5.3 Escrita

Padrão do repo: RLS com policy só de SELECT e `grant select` ao `authenticated`; **toda escrita por RPC `security definer`** que confere ação no recurso e acesso à obra; `revoke from public, anon`; `fn_audit` em toda tabela; soft delete (`excluido_em`, `excluido_por`, `motivo_exclusao`) nas transacionais. Isso também é o que deixa o módulo seguro para o seu Claude escrever (seção 12).

## 6. Modelo de dados

Convenções: `created_at`, `updated_at`, `created_by` em tudo. Quantidade, produtividade, coeficiente e horas são TAXA (`CASAS_TAXA`, 4 casas). Único dinheiro do módulo: `valor_orcado` da atividade (VALOR, 2 casas), usado só como peso do % físico. **Nenhuma tabela do módulo grava em `lancamentos`, `oc_*`, `colaboradores`, `rh_*`, `equipamentos`, `ordens_servico` ou `mc_*`.**

### 6.1 Obra, calendário e locais

- **`ex_obras`** (1:1 com `obras`): `obra_id` PK, `tipo` (`edificacao | rodovia | pequena`), `km_referencia_inicial/final`, `estaca_metros` (padrão 20), `calendario_padrao_id`, `municipio` (para feriado municipal). Nasce com o primeiro cronograma.
- **`ex_obra_usuarios`**: seção 5.2.
- **`ex_feriados`**: `data`, `nome`, `abrangencia` (`nacional | estadual_ac | municipal`), `municipio`. Carga com nacionais (fixos e móveis calculados pela Páscoa) e estaduais do Acre, **lista mostrada para você conferir antes de gravar**. Municipais você cadastra.
- **`ex_calendarios`**: `nome`, `obra_id` (nulo = da empresa), `herda_de_id`, `considerar_feriados` (nacional/estadual/municipal).
- **`ex_calendario_jornadas`**: `calendario_id`, `dia_semana` 0..6, `horas` (ex.: seg a sex 9, sáb 5, dom 0).
- **`ex_calendario_excecoes`**: `calendario_id`, `inicio`, `fim`, `tipo` (`paralisacao | dia_extra | periodo_chuvoso`), `horas` (para dia extra), `descricao`. Período chuvoso **não tira dia útil**: só alimenta o alerta de serviço a céu aberto.
- **`ex_v_dias_uteis`** (view/função): para cada calendário e data, horas trabalháveis. É a única fonte de "dia útil" do módulo.
- **`ex_locais`**: árvore por obra. `obra_id`, `pai_id`, `tipo` (`bloco | pavimento | ambiente | peca | segmento | outro`), `codigo`, `nome`, `ordem`; para rodovia `km_inicial`, `km_final`, `estaca_inicial`, `estaca_final`, `lado` (`LD | LE | eixo | ambos`), `faixa`. Constraint: segmento exige km inicial e final. Ordem é o eixo da linha de balanço (na rodovia, o km).

### 6.2 Cronograma, EAP e atividade

- **`ex_cronogramas`**: `obra_id`, `codigo`, `nome`, `status` (`rascunho | ativo | concluido | arquivado`), `calendario_id`, `ponderacao` (`valor | duracao | homem_hora | manual`), `data_inicio`, `data_status` (data de corte do avanço), `unidade_produtividade` (Q11).
- **`ex_atividades`**: árvore única para EAP e atividade (mesmo desenho da planilha da Medição).
  - `cronograma_id`, `obra_id`, `pai_id`, `ordem`, `codigo` (1, 1.1, 1.1.2), `nome`, `tipo` (`grupo | atividade | marco`).
  - `local_id` (**um** local por atividade: é o que permite linha de balanço e matriz local x serviço; "a mesma atividade em vários locais" vira uma atividade por local, que é o que o gerador da seção 7.3 faz).
  - `servico_id`, `unidade_id`, `quantidade`, `produtividade`, `modo_duracao` (`calculada | digitada`), `duracao_digitada`.
  - `equipe_modelo_id`, `responsavel_id`, `peso_manual`, `valor_orcado` numeric(14,2), `ceu_aberto` (herda do serviço), `nao_iniciar_antes_de`, `observacao`.
  - Real: `inicio_real`, `termino_real` (gravados só por RPC de apontamento ou de status).
  - `unique (cronograma_id, codigo)`; código é a chave de casamento na reimportação.
- **`ex_dependencias`**: `predecessora_id`, `sucessora_id`, `tipo` (`TI | II | TT | IT`), `lag` (dias úteis, pode ser negativo). Ciclo recusado pelo banco. A notação `3TI+2` é só forma de digitar: o parser em TS monta as linhas e o banco valida.
- **`ex_atividade_calculo`**: resultado do CPM (início/fim mais cedo e mais tarde, folga total e livre, crítica, duração em dias úteis, horas). **Tabela de cache escrita só por `fn_ex_recalcular`**, nunca por tela ou agente. É derivado, mas CPM não cabe em view barata com 3.000 atividades; a regra continua num lugar só.

### 6.3 Baseline, real e pausa

- **`ex_baselines`**: `cronograma_id`, `numero` (0 = original), `motivo` (obrigatório a partir da 1), `status` (`rascunho | pendente_aprovacao | aprovada | substituida`), `aprovada_por/em`.
- **`ex_baseline_atividades`**: congela por atividade início, fim, duração, quantidade, peso e a curva prevista. Imutável por trigger depois de aprovada. O real nunca sobrescreve a baseline; comparar baselines é comparar duas destas.
- **`ex_apontamentos`**: `atividade_id`, `obra_id`, `data`, `quantidade` **ou** `percentual` (um dos dois, pela unidade da atividade), `diario_id`, `peca_id`, `origem` (`desktop | celular | diario | planta | grade`), `nota`, soft delete. Avanço acumulado nunca passa de 100% sem motivo (mesmo padrão do `MCEXC` da Medição).
- **`ex_pausas`**: `atividade_id`, `inicio`, `fim` (nulo = aberta), `motivo` (`chuva | falta_material | equipamento | mao_de_obra | projeto | fiscalizacao | outro`), `observacao`, `diario_id`.

### 6.4 Last Planner

- **`ex_restricoes`**: `atividade_id`, `tipo` (`material | projeto | equipe | equipamento | liberacao_frente | outro`), `descricao`, `responsavel_id`, `data_limite`, `status` (`aberta | removida | cancelada`), `removida_em`. Atividade com restrição aberta é "não liberada" (view).
- **`ex_planos_semanais`**: `obra_id`, `cronograma_id`, `semana_inicio` (segunda), `status` (`rascunho | comprometido | fechado`). Fechar = `execucao.planejamento/aprovar`.
- **`ex_plano_compromissos`**: `plano_id`, `atividade_id`, `equipe_id`, `dias` (date[]), `quantidade_prometida`, `cumprido` (bool, no fechamento), `causa_id`, `observacao`. Comprometer atividade não liberada exige motivo (alerta, não trava: a decisão é do engenheiro).
- **`ex_causas`**: catálogo editável (começa com as 7 da pausa mais "programação", "tarefa anterior", "planejamento").
- **PPC** = compromissos cumpridos ÷ compromissos da semana. Definição Last Planner clássica: cumprido é 100% do prometido, parcial conta como não cumprido. View `ex_v_ppc` por obra, equipe e semana; Pareto de causas na mesma view.

### 6.5 Diário de obra

- **`ex_diarios`**: `obra_id`, `data` (único por obra), `clima_manha`, `clima_tarde`, `chuva` (bool + período), `observacoes`, `status` (`aberto | fechado`).
- **`ex_diario_efetivo`**: pessoas presentes. Nasce da alocação do dia (F6) e é confirmado; antes da F6, é contagem por função digitada.
- **`ex_diario_equipamentos`**, **`ex_ocorrencias`** (texto, tipo, foto, local).
- Avanço lançado no diário **é** o `ex_apontamentos` com `diario_id`: uma linha só, nada digitado duas vezes. Dia com chuva marcada sugere pausa nas atividades `ceu_aberto` em execução; a pausa só é gravada com a sua confirmação.

### 6.6 Planta e rodovia

- Bucket **`execucao`** (privado), tabela **`ex_arquivos`** (path, hash, mime, tamanho, `tirada_em`, lat/long da foto). Fora da faxina do `anexos`.
- **`ex_plantas`** (obra, nome da prancha), **`ex_planta_versoes`** (número, arquivo PDF/imagem, imagem renderizada, largura/altura em px, `ativa`). Versão nova não apaga nada: as marcações ficam na versão em que nasceram, e "levar para a versão nova" é ação explícita sua.
- **`ex_zonas`**: `versao_id`, `geometria` (jsonb: polígono em coordenadas da imagem), `local_id`, `camada` (serviço). Cor e % saem da view de situação.
- **`ex_pecas`**: `obra_id`, `local_id`, `tipo` (`estaca | bloco | pilar | viga | outro`), `codigo`, `geometria`, `versao_id`. **`ex_peca_execucoes`**: `peca_id`, `atividade_id`, `data`, `por`. Marcar peça gera o apontamento da atividade (1 peça = 1 unidade, ou a quantidade da peça).
- **`ex_pinos`**: `versao_id`, `x`, `y`, `tipo` (`foto | nota | problema`), `status` (`aberto | resolvido`), texto, fotos.
- **`ex_tracados`** (rodovia): KML/KMZ original no bucket, GeoJSON da linha, e pontos de amarração km ↔ coordenada (para pintar os trechos sobre o mapa).
- **Replay no tempo**: função `fn_ex_situacao_em(obra_id, data)` devolve a situação de cada zona/peça/trecho naquela data, prevista (baseline) e real. A tela só pinta.

### 6.7 Materiais e estoque

- **`ex_servicos`**: biblioteca de serviços da EMT (`nome`, `unidade_id`, `categoria`, `ceu_aberto`, `produtividade_referencia`).
- **`ex_composicoes`** (`servico_id`, `versao`, `status` `rascunho | vigente | substituida`, `referencia` texto: SINAPI/SICRO + código) e **`ex_composicao_insumos`** (`insumo_id` do cadastro de Insumos do ERP, `coeficiente`, `perda_percentual`). Coeficiente é `numeric` **sem escala**: SICRO tem coeficiente com 5 a 7 casas, e 4 casas erra o material (mesma exceção à regra 3 que a Medição registrou para preço). Vai para decisoes.md.
- **`ex_atividade_composicao`**: qual versão da composição a atividade usa. Versão nova **não** muda atividade já calculada: aplicar é ação sua (`execucao.materiais/aprovar`).
- **`ex_atividade_materiais`**: lista manual quando não há composição.
- **`ex_insumo_antecedencias`**: `insumo_id`, `dias` (ex.: aço 20, cimento 7), opcional por obra.
- **`ex_estoque_movimentos`** (só físico, sem valor, ver 3.2): `obra_id`, `insumo_id`, `data`, `tipo` (`entrada_oc | entrada_avulsa | saida_atividade | transferencia_saida | transferencia_entrada | ajuste_inventario`), `quantidade`, `atividade_id`, `oc_item_id`, `fornecedor_id`, `nota_fiscal`, `transferencia_id`, `motivo`, foto. Soft delete.
- **`ex_reservas`**: `obra_id`, `insumo_id`, `atividade_id`, `quantidade`, `status`. Reserva não é movimento: não muda saldo físico, muda o disponível.
- **`ex_sugestoes_baixa`**: o apontamento gera a sugestão (quantidade × composição); vira `saida_atividade` só quando você confirma.
- Views: `ex_v_estoque_saldos` (físico, reservado, disponível), `ex_v_necessidade_material` (por insumo e data, com data limite de chegada = data prevista − antecedência), `ex_v_painel_insumo` (necessário, consumido, em estoque, reservado, comprado e não recebido, falta, data limite, perda real), `ex_v_lista_compras`.

### 6.8 Pessoas, equipes, equipamentos

- **`ex_terceiros`**: cadastro leve (campos na Q4), `colaborador_id` nulo até virar colaborador do RH.
- **`ex_v_pessoas`**: união de `colaboradores` ativos com `ex_terceiros`. Toda tabela abaixo aponta para pessoa por **duas FKs nulas com check "exatamente uma"** (`colaborador_id` ou `terceiro_id`), sem id polimórfico solto.
- **`ex_habilidades`** e **`ex_pessoa_habilidades`**. Função vem de `funcoes` (RH) para colaborador e do cadastro leve para terceiro.
- **`ex_equipes_modelo`** + **`ex_equipe_modelo_composicao`** (função/habilidade, quantidade).
- **`ex_equipes`** (por obra, `modelo_id`) + **`ex_equipe_membros`** (pessoa, de/até).
- **`ex_alocacoes`**: `data`, pessoa, `obra_id`, `local_id`, `atividade_id`, `horas`. Pessoa em duas obras no mesmo dia **é alerta, não trava** (acontece de verdade: manhã numa, tarde noutra).
- **`ex_anotacoes`**: pessoa, `obra_id`, `tipo` (`desempenho | ocorrencia | habilidade | observacao`), texto. Recurso próprio (`execucao.anotacoes`).
- **`ex_equipamento_alocacoes`**: `equipamento_id`, `obra_id`, `atividade_id`, `inicio`, `fim`. Conflito entre obras e máquina com OS aberta são alertas.
- Produtividade: `ex_v_produtividade` = avanço real ÷ homem-hora alocado, por equipe, serviço e obra. Alimenta a previsão de término e a produtividade aprendida dos modelos.

### 6.9 Modelos

- **`ex_modelos_sequencia`** + **`ex_modelo_passos`** (ordem, serviço, dependência com a anterior e lag, produtividade sugerida).
- Cronograma inteiro como modelo: `ex_cronogramas` com `obra_id` nulo e `status = modelo`.
- Equipes-modelo, calendários da empresa e listas de restrições típicas (`ex_modelos_restricoes`) já são reutilizáveis por desenho.
- **Produtividade aprendida**: `ex_v_produtividade_servico` agrega o real de todas as obras concluídas por serviço; o modelo mostra a referência e a aprendida, e sugere a aprendida.

### 6.10 Alertas e link do encarregado

- **`ex_v_alertas`**: view calculada (sem tabela, sem job): atividade que devia ter começado e não começou, restrição vencendo em N dias, material que não chega a tempo, produtividade abaixo do planejado por N dias, pausa aberta há mais de N dias, conflito de pessoa ou máquina, PPC abaixo do limite, atividade a céu aberto no período chuvoso, estoque negativo (se a Q5 permitir). Limites em **`ex_config_alertas`** por obra.
- **`alertas_lidos`** (`usuario_id`, `chave`): o que o sininho já mostrou. Genérica de propósito, para outros módulos usarem depois.
- **`ex_links_publicos`**: `plano_id`, `token_hash` (o token nunca é gravado), `expira_em`, `revogado_em`, `mostra_fotos`, contagem de acessos. A rota pública lê pelo servidor só o retrato daquele plano e nada mais.

## 7. Entrada de dados

### 7.1 Grade estilo planilha
Edição inline, Tab/Enter/setas, colar bloco do Excel, arrastar para reordenar e recuar (muda `pai_id` e código), editar várias linhas. Cada edição vai para uma RPC que valida e chama o recálculo; a tela mostra as datas que o banco devolveu.

### 7.2 Importação Excel genérica
Assistente: subir o arquivo (direto para o Storage, o servidor lê, como na Medição), escolher aba, detectar cabeçalho, mapear colunas com sugestão pelo nome, hierarquia por código ou por recuo, dependências em texto, datas ou durações, prévia com erro por linha. Modelo .xlsx para baixar. Reimportar casa pelo código e mostra o diff (igual, mudou, novo, saiu) para você aprovar. Gravação exige o hash do arquivo da prévia.

### 7.3 Gerar por modelo x locais
Escolhe o modelo de sequência e os locais (Blocos A a J, ou km 100 a 140 de 2 em 2 km, que já cria os segmentos). Gera uma atividade por passo por local, com as dependências do modelo dentro do local e entre locais (o passo N no local B começa depois do passo N no local A, a equipe anda). Pede só as quantidades, numa grade.

### 7.4 Apontamento rápido no celular (`/m/execucao`)
"O que avançou hoje": lista das atividades em execução e liberadas da obra, ou toque na planta; quantidade ou %, foto com carimbo (data, hora, GPS, `BotaoTirarFoto`), nota. Precisa de sinal, sem fila offline (mesma regra do Abastecer e da Medição): grava com internet, foto que falha vira aviso e não desfaz o apontamento.

### 7.5 Diário de obra
Seção 6.5.

## 8. Planejamento e controle

- **Motor CPM no banco** (`fn_ex_recalcular(cronograma_id)`): ordenação topológica, ida (mais cedo) e volta (mais tarde) em horas de calendário, folga total e livre, caminho crítico, respeitando calendário, `nao_iniciar_antes_de`, real já apontado (atividade com início real ancora) e pausas abertas. Roda a cada mudança que afeta datas.
- **"E se"** (`fn_ex_simular(cronograma_id, alteracoes jsonb)`): mesmo motor, em memória, devolve novo término, caminho crítico e histograma **sem gravar**. Alterações: atrasar atividade, mudar produtividade, mais uma equipe (divide a duração), mudar lag.
- **Previsão pelo ritmo real**: duração restante = quantidade restante ÷ produtividade real (média móvel dos últimos N dias apontados); recalcula o término tendência sem mexer no planejado.
- **Situação da atividade** (view, única definição): `nao_iniciada`, `em_execucao`, `pausada`, `concluida`, e o marcador `atrasada` (devia ter começado ou terminado na data de status pela baseline vigente e não começou ou terminou).
- **% físico**: atividade = quantidade apontada ÷ quantidade (ou % apontado); grupo e cronograma = Σ(peso × %) ÷ Σ peso, com o peso pela ponderação do cronograma. Previsto na data = curva da baseline distribuída nas horas úteis. **SPI físico** = % real ÷ % previsto na data (não é SPI de valor agregado, porque o módulo não cruza com dinheiro).
- **Lookahead, plano semanal, PPC, linha de balanço**: seções 6.4 e 9.

## 9. Visualizações

Gantt interativo (arrastar, esticar, desenhar dependência, zoom dia/semana/mês, previsto x real, sombra da baseline, linha de hoje, crítico, pausa hachurada, agrupar por local, serviço, equipe); linha de balanço (locais x tempo, uma linha por serviço; na rodovia o eixo é o km); matriz local x serviço (mapa de calor com %); curva S (prevista, real, baseline); histograma de pessoas por função e equipamentos por semana; kanban por situação; calendário semanal da programação. Planta (edificação) e diagrama linear com mapa (rodovia), com replay no tempo.

Cores de situação usam os tokens de status do design system: não iniciada cinza (`rascunho` #5F6673), em execução âmbar **em preenchimento com texto escuro** (âmbar nunca é texto, regra do CLAUDE.md), concluída `efeito` #166534, atrasada `rejeitado` #B91C1C, pausada hachurado. Toda cor vem com rótulo ou %, nunca só a cor.

## 10. Telas

Desktop em `/execucao/*`, campo em `/m/execucao`. Tela inicial: **pastas das obras** (card com saúde, % previsto x real, término tendência, PPC da última semana, atrasos e material faltando). Dentro da pasta: lista de cronogramas e as visões. As abas do módulo ficam no submenu da sidebar, sem barra de abas na página.

## 11. Relatórios

Todos com a moldura canônica `marca-documento` e os dados de `EMPRESA`:
- Relatório semanal da obra (PDF): avanço, planta colorida, fotos, atrasos e causas, próxima semana.
- Programação da semana para o encarregado (PDF e link sem login com expiração, Q6).
- Lista de compras (xlsx e PDF).
- Cronograma em Excel (ida e volta com a importação: o export reimporta sem perda).

## 12. Pronto para o seu Claude

- Nomes em português claro e estáveis, prefixo `ex_`, `comment on` em toda tabela, coluna não óbvia, view e RPC (o comentário é o que o agente lê primeiro).
- Toda escrita por RPC `fn_ex_*` com validação no banco; o agente nunca grava direto em tabela (as policies nem permitem).
- Views prontas: `ex_v_situacao_obra`, `ex_v_atividades` (com CPM, real, situação), `ex_v_falta_material`, `ex_v_onde_esta_cada_pessoa`, `ex_v_ppc`, `ex_v_estoque_saldos`, `ex_v_alertas`.
- `docs/modulos/execucao-guia-para-agentes.md`: modelo de dados, RPCs com exemplos, regras, consultas prontas. Cresce a cada fase (não espera a F7).
- Ponto de atenção: o agente via Supabase MCP roda como `postgres`/service role e **passa por cima da RLS**. Para a regra valer para ele também, o guia manda escrever só pelas RPCs e as RPCs aceitam um `p_usuario_id` só quando chamadas por service role, registrando na auditoria que foi o agente em nome de quem. Isso é decisão de segurança e está na Q10.

## 13. Pessoas que não estão no RH

Cadastro leve em `ex_terceiros`. O módulo nunca grava em `colaboradores`. Se o terceiro for contratado, o RH cadastra o colaborador normalmente e o módulo liga os dois (`ex_terceiros.colaborador_id`), mantendo o histórico de alocação, anotação e produtividade.

## 14. Biblioteca x próprio (item 14.5)

| Peça | Opções | Recomendação |
|---|---|---|
| Gantt | Bryntum e DHTMLX (completos, licença comercial paga por desenvolvedor, motor de agendamento próprio em JS); SVAR (núcleo MIT, caminho crítico e baseline na versão paga); Frappe (MIT, leve, sem virtualização, trava com milhares de linhas) | **Próprio em SVG + `@tanstack/react-virtual`** (já instalado). O motivo decisivo é D9: as bibliotecas completas trazem o próprio CPM em JS, e usar duas contas (a dela e a do banco) é exatamente o que o projeto proíbe. Sem licença, visual EMT total. Custo: arrastar, ligar barras e zoom são trabalho de uma fase inteira (F2). Só as linhas visíveis são desenhadas, então 3.000 atividades ficam fluidas. |
| Grade editável | AG Grid (colar intervalo e seleção de faixa só na versão paga); Glide Data Grid (MIT, canvas, rápido, mas foge do visual dos tokens) | **Canônico novo `GradeEditavel` sobre TanStack Table + react-virtual.** O `DataTable` é de leitura; editar célula com teclado é caso legítimo que ele não cobre, então nasce um canônico (regra 9), não um componente de tela. O colar do Excel da Medição já existe e é reaproveitado. |
| Planta | Canvas/SVG próprio com pan e zoom; Leaflet com `CRS.Simple` | **Leaflet `CRS.Simple` com renderer canvas** (já instalado). Pan e zoom com dedo no celular prontos, polígonos e pinos, milhares de formas no canvas, e é a mesma biblioteca do mapa do traçado. PDF da planta vira imagem na subida com `pdfjs-dist` (dependência nova, Apache 2.0). |
| Linha de balanço, matriz, diagrama linear | | **SVG próprio** (são gráficos de eixo simples, nenhuma lib entrega o eixo km). |
| Curva S, histograma, Pareto | | **Recharts** (já usado na Gestão). |
| Mapa do traçado | | **Leaflet** + leitura do KML/KMZ no navegador (`@tmcw/togeojson` + `jszip`, MIT/BSD). Sem PostGIS. |

Meta de desempenho medida na fase: Gantt e linha de balanço com 3.000 atividades, planta com 1.000 peças, recálculo do CPM abaixo de 1 s no banco. Um cronograma sintético desse tamanho entra na prova.

## 15. Fases (1 PR por fase, uma aberta por vez, você aprova cada uma)

Ajustei o seu roteiro em três pontos: o CPM sobe para a F1 (a grade precisa mostrar datas calculadas desde o primeiro dia; sem ele a F1 seria uma planilha de datas digitadas que a F2 jogaria fora); a F1 foi partida em duas porque sozinha seria o maior PR do projeto; histograma e alocação no "e se" ficam para depois da F6, porque dependem de equipe alocada.

- **F1a** Banco base, acesso por obra, `ex_obras`, pastas, cronogramas, locais (edificação e rodovia), calendário com feriados, EAP e atividades, dependências, **motor CPM**, grade editável. Guia para agentes v1.
- **F1b** Importação Excel genérica, export que reimporta, biblioteca de serviços, modelos de sequência x locais.
- **F2** Gantt interativo, baseline com reprogramação, pausas, "e se" (término e caminho crítico).
- **F3** Apontamento (desktop e celular), diário de obra, lookahead com restrições, plano semanal e PPC, painel da obra, curva S, linha de balanço, matriz, kanban, previsão pelo ritmo.
- **F4** Planta (versões, zonas, peças, pinos, camadas, replay) e rodovia (diagrama linear, mapa do KML, replay).
- **F5** Composições, necessidade de material, estoque por obra, lista de compras.
- **F6** Terceiros, habilidades, equipes, alocação, anotações, produtividade, equipamentos, histograma, efetivo do diário puxado da alocação.
- **F7** Relatórios PDF/Excel, link do encarregado, sininho e alertas, portfólio, guia para agentes completo.

Portão de cada fase: `tsc`, lint, testes, build, CI verde, prova SQL `supabase/provas/ex_faseN_*.sql` chamando as RPCs com `set local role authenticated` e linha de controle que tem de dar diferente, advisors limpos, `database.types.ts` regenerado sem perder edição manual, deploy `success` e telas conferidas em produção, decisoes.md atualizado.

## 16. Perguntas (nenhuma decidida por mim)

| # | Pergunta | Opções e o que cada uma implica | Minha recomendação | Bloqueia |
|---|---|---|---|---|
| Q1 | **Acesso**: lista por obra ou por perfil? | **Lista** (como a Medição): o residente da escola não vê a BR-364; você precisa estar em toda lista para ver no portfólio; obra nova exige incluir as pessoas. **Perfil**: quem tem o recurso vê todas as obras; mais simples, mas o residente vê tudo, inclusive anotações de funcionário de outra obra se tiver o recurso. | Lista por obra | F1a |
| Q2 | **Quem reprograma** (nova baseline) e se precisa da sua aprovação | **Residente propõe, você aprova**: a baseline é a régua do atraso; se quem atrasa move a régua sozinho, o atraso some. Custa um clique seu por reprogramação. **Residente livre com motivo**: mais rápido, a trilha mostra quem e por quê, mas o painel pode esconder atraso até você olhar. Obra pequena pode dispensar baseline. | Residente propõe, você aprova; obra pequena sem baseline obrigatória | F2 |
| Q3 | **Quem vê as anotações por funcionário** | **Só quem tem `execucao.anotacoes/ver`** (no começo, só você), e o autor sempre vê o que escreveu. **Todos da obra**: mais transparente, mas anotação de desempenho circula entre colegas. | Recurso próprio, só você no começo | F6 |
| Q4 | **Terceiro avulso**: campos mínimos e se vira colaborador | Mínimo proposto: nome, função, empresa/empreiteiro, telefone; CPF opcional (com CPF dá para detectar que já é colaborador do RH e evitar duplicata). Virar colaborador: o RH cadastra e o módulo liga (seção 13), sem cópia automática para o RH. | Nome, função, empresa, telefone obrigatórios; CPF opcional | F6 |
| Q5 | **Estoque negativo** | **Permitir com alerta**: o campo consome antes da NF ser lançada; o saldo fica negativo, vermelho, e some quando a entrada chega. **Bloquear**: saldo sempre verdadeiro, mas o engenheiro lança entrada falsa ou com data errada para destravar, e o dado fica pior. | Permitir com alerta | F5 |
| Q6 | **Link do encarregado**: validade e fotos | Validade proposta: até o domingo da semana programada + 2 dias, revogável. Fotos: **sem** por padrão (link sem login vaza por encaminhamento; foto de obra mostra gente e equipamento), com opção por link. Mostra só a programação daquela semana e a planta colorida. | 9 dias, sem fotos, revogável | F7 |
| Q7 | **Estoque só físico** (seção 3.2) | **Só quantidade**: sem valor, sem custo, sem lançamento; não conflita com "custo de obra = lançamentos". **Com valor**: dá custo por consumo, mas duplica o custo da obra no Gestão ou obriga a rever a decisão de 29/07. | Só físico | F5 |
| Q8 | **Entrada de OC** (seção 3.1), já que o Compras não registra recebimento por item | **(a) Confirmação na obra**: o módulo lista os itens de OC aprovada/paga cujo centro de custo é a obra; o engenheiro confirma a quantidade que chegou (parcial pode); "comprado e não recebido" = OC − confirmado. Não toca no Compras. **(b) Criar recebimento por item no Compras**: dado no lugar certo, mas é mudança no Compras, fora deste escopo. **(c) Só avulsa**: simples, perde o "comprado e não recebido". | (a) | F5 |
| Q9 | **Nome no menu** | "Execução" (curto, não colide com Cadastros > Obras), "Obras em Execução" ou "Planejamento". | Execução | F1a |
| Q10 | **Escrita do seu Claude** (seção 12) | **(a) Via RPC com usuário declarado**: o agente usa service role, a RPC exige `p_usuario_id` e grava na auditoria "agente em nome de Tiago"; você controla pelo guia. **(b) Usuário próprio do agente** (ex.: "Claude do Tiago") com permissões só deste módulo, logando como `authenticated`: a RLS vale para ele de verdade, mas exige o agente autenticar como usuário, não pelo MCP do Supabase. | (a) agora, (b) se o agente passar a escrever sem você olhando | F1a |
| Q11 | **Unidade da produtividade e da duração** | **Por hora** (un/h da equipe): sábado de 5 h rende menos que segunda de 9 h, a conta fica certa com a jornada que você pediu; duração mostrada em dias úteis. **Por dia** (un/dia): mais intuitivo para quem aponta, mas sábado conta como dia cheio e a jornada vira só informativa. | Por hora no cálculo, exibição em dias e por dia na digitação (o banco converte pela jornada) | F1a |

Quando você responder, as respostas entram aqui como emenda datada e em `docs/decisoes.md`, e eu trago o plano detalhado da F1a para aprovar antes de codar.
