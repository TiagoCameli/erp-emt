# Medição de Contratos: desenho

**Data:** 25/09/2026 · **Status:** rascunho para revisão do Tiago · **Código:** nenhum até o plano ser aprovado e o PR #320 ser mergeado.

## 1. Objetivo

Controlar as medições de todos os contratos da EMT (DNIT, estado, prefeitura, privado) sem perder histórico. Hoje a planilha guarda só a coluna da medição atual e sobrescreve a anterior.

Fluxo:

1. Cadastrar o contrato dentro do módulo.
2. Importar a planilha contratual (v0). Ela vale até o fim do contrato; só muda por aditivo, que entra como versão nova sem apagar a anterior.
3. Lançar o executado no dia a dia e acompanhar a medição do período enquanto ela acontece.
4. No fechamento de cada medição, calcular o reajuste a receber daquela medição.

Tudo por contrato e consolidado: previsto, executado por medição, acumulado, % executado, saldo a medir, reajuste por medição e acumulado, e quanto já está medido no período corrente, em R$.

Contrato de referência para validar o desenho: **Lote 09 da BR-364, CT 00615/2025 (DNIT)**, previsto R$ 243.927.483,49, 10 medições. Nenhuma regra pode ser específica do DNIT: o que muda de contrato para contrato é configuração do contrato.

## 2. Decisões já tomadas (25/09/2026)

| # | Decisão | Origem |
|---|---|---|
| D1 | O módulo **não gera nada** em outro módulo: nenhum lançamento, parcela, conta a receber, NF, rateio, movimento de estoque, obra ou centro de custo. | Pedido |
| D2 | O contrato é cadastrado **dentro do módulo** e não se vincula nem cria obra do cadastro geral. Guarda os próprios dados (nome da obra, local, contratante). Sem FK para `obras`, `clientes`, `centros_custo` ou `lancamentos`. | Tiago, 25/09 |
| D3 | Acesso por contrato é **só por lista**: todo usuário, Admin inclusive, precisa estar marcado no contrato para vê-lo. | Tiago, 25/09 |
| D4 | A v0 do Lote 09 é a **planilha de medição** (R$ 243.927.483,49), não a proposta 066/2025 (R$ 243.927.498,02). A diferença de R$ 14,53 fica registrada no contrato como observação. | Tiago, 25/09 |
| D5 | Spec e plano agora; a Fase 1 só abre depois do merge do PR #320 (Aplicações financeiras). Uma fase aberta por vez. | Tiago, 25/09 |
| D6 | Só se digita **quantidade e valor de índice**. Valor, acumulado, %, saldo, total de grupo e reajuste saem de view ou função SQL, nunca de coluna gravada. | Pedido |
| D7 | O cálculo de dinheiro existe **só no banco**. O TypeScript formata e exibe, não recalcula. Um cálculo só, sem risco de a tela e o banco divergirem (decisoes.md L3094). | Proposta |
| D8 | O módulo antigo (Fase 6, removido na reforma de 20/07) **não volta**. Dele fica só a lição: gerar fatura e a receber automaticamente foi o que a reforma teve de desfazer. | Pedido + git |

## 3. Nomes

`medicoes`, `equipamento_medicoes`, `fn_registrar_medicao` e o recurso `manutencao.medicoes` já existem na Manutenção (horímetro/km). Para não confundir:

- Tabelas, views e funções do módulo usam o prefixo **`mc_`** (medição de contrato): `mc_contratos`, `mc_medicoes`, `fn_mc_aprovar_medicao`.
- Módulo `medicao`, rota `/medicao`, recursos `medicao.*`.
- Nome no menu: **Medição**.

## 4. Permissões

### 4.1 Recursos, com as ações que já existem

O ERP fixou `ACOES = ver, criar, editar, excluir, aprovar, desaprovar` e decidiu não criar ações novas: uma ação nova abre coluna na matriz de **todos** os recursos e obriga reconceder todos os perfis (decisoes.md L2019). Por isso as ações que você pediu viram **recursos separados**, um por aba:

| Recurso | Aba | Ações | Sua ação |
|---|---|---|---|
| `medicao.painel` | Painel de contratos | ver | ver |
| `medicao.contratos` | Contratos | ver, criar, editar, excluir | cadastrar |
| `medicao.planilha` | Planilha contratual | ver, criar, excluir, aprovar, desaprovar | importar (criar), tornar versão vigente (aprovar) |
| `medicao.boletim` | Boletim | ver | ver |
| `medicao.lancamentos` | Lançamentos | ver, criar, editar, excluir | lançar |
| `medicao.medicoes` | Medições | ver, criar, editar, aprovar, desaprovar | abrir (criar), fechar e conferir (editar), aprovar, revisar aprovada (desaprovar) |
| `medicao.reajuste` | Reajuste | ver, editar | reajuste (configuração e vínculo item-índice) |
| `medicao.indices` | Índices | ver, criar, editar, excluir | reajuste |
| `medicao.alertas` | Alertas | ver | ver |

No começo, só os 4 Admins. **Migration de backfill** no padrão do Frete: insere em `perfil_permissoes` (perfil Admin) e em `usuario_permissoes` (Admins ativos e não excluídos), e termina com `do $confere$` que aborta se não forem exatamente 4 usuários e o número esperado de linhas.

`desaprovar` em `medicao.medicoes` **não desfaz a aprovação**. Ele abre uma revisão pós-aprovação (seção 7.4). A medição aprovada continua imutável.

### 4.2 Acesso por contrato (D3)

- Tabela `mc_contrato_usuarios (contrato_id, usuario_id)`. A linha existir **é** o acesso, sem coluna "pode", no mesmo padrão de `usuario_conta_saldo`.
- `fn_mc_acessa_contrato(contrato_id)`: `security definer`, `stable`. Verdadeiro se existe a linha para `auth.uid()` e o usuário está ativo.
- **Toda** policy de SELECT do módulo é `tem_permissao(recurso,'ver') and fn_mc_acessa_contrato(contrato_id)`. As tabelas filhas carregam `contrato_id` (com FK composta para o pai, ver 5.1), para a policy não precisar de join.
- Toda RPC de escrita confere as duas coisas: a ação no recurso e o acesso ao contrato.
- Quem cria o contrato entra na lista na mesma transação. Sem isso, o contrato nasce invisível para quem o criou.
- Gerir a lista exige `medicao.contratos/editar` **e** estar na lista do contrato. Tirar o último usuário da lista é recusado.
- A carga do Lote 09 põe os 4 Admins na lista.
- Índices de reajuste (`mc_indices`, `mc_indice_valores`) não pertencem a contrato: valem para todos, protegidos só por `medicao.indices`.

### 4.3 Anexos

Usa a infraestrutura de `arquivos` + `anexo_vinculos` e o bucket `anexos`. Tipos de entidade novos: `mc_contrato`, `mc_aditivo`, `mc_planilha_versao`, `mc_lancamento`, `mc_medicao`, `mc_indice_valor`.

**Ponto de atenção:** hoje a visibilidade do anexo deriva só do recurso (`fn_recurso_da_entidade`). Isso deixaria a foto de um lançamento da BR-364 visível para quem tem `medicao.lancamentos/ver` mas não está no contrato. A Fase 1 estende a regra: para as entidades `mc_*`, o anexo também exige `fn_mc_acessa_contrato`. A mudança é aditiva: para os outros tipos, nada muda. Ela se aplica relendo a definição viva da função e da policy, nunca de cópia (decisoes.md L1750). A prova da Fase 1 cobre esse caso.

## 5. Modelo de dados

Convenções do repo: `created_at`, `updated_at`, `created_by`; `fn_audit` em todas as tabelas; RLS com policy só de SELECT e `grant select` para `authenticated`; **toda escrita por RPC `security definer`** com `revoke from public, anon` e `grant execute to authenticated`; soft delete com colunas `excluido_em`, `excluido_por`, `motivo_exclusao` (padrão do Frete); transições e motivos em `mc_medicao_eventos` (decisoes.md L244).

### 5.1 Contrato

**`mc_contratos`**
- Identificação: `codigo` curto único (ex.: `L09-BR364`), `nome_obra`, `local`, `objeto`, `numero_contrato`.
- Contratante: `contratante_nome`, `contratante_tipo` (`federal | estadual | municipal | privado`), `contratante_documento` (CNPJ/CPF, opcional).
- Valores e datas: `valor_inicial` numeric(14,2), o valor escrito no contrato, **informativo**, porque o previsto vem da planilha. `data_assinatura`, `data_ordem_servico`, `prazo_meses`, `inicio_prazo` (`assinatura | ordem_servico`, porque cada contrato conta de um jeito).
- Período: `dia_inicio_periodo` (1 a 28). O valor 1 é mês civil; o DNIT com corte 26 a 25 é 26. Isso só **sugere** o período da próxima medição; o período de cada medição fica gravado nela (a 1ª costuma começar na OS).
- Localização: `tipo_localizacao` (`rodovia | texto`). Rodovia pede km e estaca; texto é para escola, prédio, rede.
- `regra_arredondamento` (seção 6.2), `status` (`ativo | paralisado | encerrado`), `observacoes`.
- Alerta se `valor_inicial` for diferente do previsto da v0 (no Lote 09: R$ 14,53, já explicado em D4).

**`mc_contrato_usuarios`**: seção 4.2.

**`mc_aditivos`**: `contrato_id`, `numero`, `data_assinatura`, `data_vigencia`, `tipos` (conjunto de `quantidade | valor | prazo | inclusao_item`), `prazo_acrescido_meses` (quando é de prazo), `motivo`, documento em anexo. O aditivo de prazo não mexe em planilha. O aditivo de quantidade, valor ou inclusão gera uma versão nova da planilha.

Fim da vigência = início do prazo + `prazo_meses` + soma dos `prazo_acrescido_meses`. Sai de view, não é coluna.

### 5.2 Planilha contratual

**`mc_planilha_versoes`**: `contrato_id`, `numero` (0 = licitada), `aditivo_id` (nulo na v0), `vigente_desde` (data), `status` (`rascunho | vigente`), `arquivo_origem` (anexo do xlsx importado, com hash), `motivo`.
- Importar cria em `rascunho`. Aprovar (`medicao.planilha/aprovar`) torna vigente. Desaprovar só se nenhuma medição usa a versão.
- Versão vigente é imutável (trigger).

**`mc_itens`**: a **identidade estável** do item no contrato (`id`, `contrato_id`). O acumulado soma por essa identidade, atravessando as versões. Sem isso, cada aditivo zeraria o histórico.

**`mc_planilha_itens`**: uma linha da planilha numa versão.
- `versao_id`, `contrato_id`, `item_id` (→ `mc_itens`), `ordem` (posição na planilha).
- `codigo` (ex.: `02.07.04`), `pai_id` (linha pai na mesma versão), `descricao`, `unidade`.
- `preco_unitario`, `quantidade_prevista`: `numeric` **sem escala** (seção 6.1).
- `tipo` (`titulo | servico`).
- Chave: `unique (versao_id, ordem)`. **O código não é único**: o `02.02` aparece 3 vezes no Lote 09.
- Integridade: FK composta `(versao_id, contrato_id)` → `mc_planilha_versoes (id, contrato_id)` e `(item_id, contrato_id)` → `mc_itens (id, contrato_id)`, para o `contrato_id` denormalizado nunca mentir.

**Hierarquia.** O pai é resolvido na importação pela posição: a linha anterior mais próxima cujo código é prefixo do código da linha. Se o prefixo casar com mais de uma linha (código duplicado), a importação **para, mostra as linhas e pergunta**. Nada é resolvido por chute.

**Linha com preço é serviço.** Um item com preço pode ter filhos com preço (ex.: `02.07.05` Imprimação, com `02.07.05.01` Aquisição CM-30 e `02.07.05.02` Transporte). Cada linha com preço é um serviço próprio, lançável e medível. O total de um grupo é a soma de **todas as linhas com preço da subárvore**, cada uma contada uma vez.

**Aditivo.** A importação de uma versão nova casa cada linha com um `mc_itens` da versão anterior por código + descrição + unidade, mostra a prévia (igual, mudou quantidade, mudou preço, item novo, item que saiu) e deixa o usuário resolver o que não casou sozinho. Item que saiu continua na versão anterior e no histórico.

**Índice por item.** O vínculo **não** fica na linha da planilha, porque a versão vigente é imutável e o vínculo precisa poder ser ajustado depois. Fica em `mc_item_indices (contrato_id, item_id, indice_id)`, na configuração do reajuste (`medicao.reajuste/editar`), pela identidade estável do item, e por isso atravessa aditivos. Item sem vínculo herda do pai; se ninguém acima tem, vale o índice padrão do contrato. A resolução sai de view recursiva (`mc_v_item_indice`). Configurar no grupo cobre os filhos. Mudar o vínculo não altera medição já fechada: o fechamento grava o índice usado por item (abaixo).

### 5.3 Medição

**`mc_medicoes`**: `contrato_id`, `numero` (1, 2, ...), `periodo_inicio`, `periodo_fim`, `status` (`aberta | em_conferencia | enviada | aprovada`), `versao_id` (versão da planilha usada), `aprovada_em`, `aprovada_por`, `origem` (`app | carga`).
- Períodos do mesmo contrato **não se sobrepõem**: `exclude using gist (contrato_id with =, daterange(periodo_inicio, periodo_fim, '[]') with &&)`.
- Número sequencial por contrato, sem buraco.

**`mc_medicao_revisoes`**: `medicao_id`, `numero` (0 = REV00), `fase` (`antes_aprovacao | pos_aprovacao`), `motivo` (obrigatório a partir da REV01), `status` (`em_aberto | enviada | aprovada | substituida`).

**`mc_revisao_itens`**: congela, **no envio**, a quantidade medida de cada item naquela revisão. Isso permite comparar REV00 com REV01 depois. Guarda quantidade (dado de entrada derivado de lançamentos), nunca dinheiro.

**`mc_aprovacoes_item`**: `revisao_id`, `item_id`, `quantidade_aprovada`. Digitada ao aprovar, com botão "Aprovar tudo como medido", que grava a quantidade explicitamente. Campo vazio vira zero: item sem linha tem aprovada = 0, e a tela mostra isso antes de aprovar. **Glosa = medida − aprovada**, calculada.

**`mc_medicao_eventos`**: cada transição, com usuário, data e motivo.

### 5.4 Lançamento diário e ajuste

**`mc_lancamentos`**
- `contrato_id`, `item_id`, `data`, `quantidade` (4 casas, `CASAS_TAXA`, porque é digitada).
- Localização: `km_inicial`, `km_final`, `estaca` ou `local_texto`, conforme o `tipo_localizacao`.
- `observacao`, `motivo_excesso` (seção 8), fotos por anexo, `created_by`, soft delete.
- `medicao_id` é **preenchido pelo banco**: a medição do contrato cujo período contém a data. Se ela não existe ou não está `aberta`, o banco recusa com mensagem clara: "Não há medição aberta para 14/10/2026 no contrato L09-BR364. A 11ª medição (26/09 a 25/10) está em conferência."
- O item precisa ser `servico` na versão da medição.

**`mc_ajustes`**: `medicao_id`, `revisao_id`, `item_id`, `quantidade` (pode ser negativa), `motivo` obrigatório, `tipo` (`manual | carga`). É o único jeito de a quantidade medida diferir da soma dos lançamentos. A soma nunca é editada na mão.

**Quantidade medida** do item na medição = Σ lançamentos da medição + Σ ajustes da revisão corrente e anteriores. Sai de view.

### 5.5 Reajuste

**`mc_reajuste_config`** (1 por contrato; alterações passam pela auditoria):
- `tem_reajuste`, `data_base` (mês do I0), `periodicidade_meses` (12 por padrão), `defasagem_meses` (0 = mês da medição; 1 = mês anterior).
- `modo_indice_i` (seção 12, Q2), `casas_fator` (casas do fator I/I0), `indice_padrao_id`.
- `formula` fixa em `padrao` por CHECK. Fórmula nova só depois de perguntar (seção 12).
- `regra_aniversario` (`medicao_inteira | proporcional_por_data`), **nula até você decidir**. Enquanto for nula, a medição cujo período contém o aniversário não fecha, com mensagem dizendo o porquê.
- Cláusula de reajuste em anexo.

**`mc_indices`**: `nome`, `sigla`, `fonte`, `observacao`.

**`mc_indice_valores`**: `indice_id`, `mes`, `valor` (numeric sem escala), `situacao` (`provisorio | definitivo`), `fonte`, `data_publicacao`. `unique (indice_id, mes, situacao)`: o provisório não é sobrescrito, o definitivo entra ao lado. Valor efetivo = definitivo se existe, senão provisório. Nada é buscado na internet sem você pedir.

**`mc_reajuste_aplicado`**: no fechamento, grava **os índices usados** por medição, revisão e índice: `i0`, `i`, `mes_i`, `fator` (arredondado em `casas_fator`), `situacao` do I, `aplicado_em`. **`mc_reajuste_aplicado_itens`** grava qual índice cada item usou naquele fechamento. Guarda a entrada do cálculo (os índices), não o dinheiro. Quando entra o definitivo, uma linha nova `definitivo` entra ao lado da provisória, sem reabrir a medição.

**Cálculo (fórmula padrão):** reajuste do item = valor do item na medição × (fator − 1), com fator = arred(I / I0, casas_fator). Somado por grupo, medição e contrato. Antes do aniversário (`data_base + periodicidade`), fator = 1 e reajuste = 0. Reajuste **pode ser negativo** se o índice cair.

**Diferença de reajuste** = reajuste com o fator definitivo − reajuste com o fator provisório aplicado. Positiva é a receber, negativa é a devolver. Sai de view. A medição com fator provisório fica na lista de pendências até entrar o definitivo.

**O reajuste fica separado do valor da medição**: não altera preço unitário nem planilha.

## 6. Precisão (o ponto crítico)

### 6.1 Casas escondidas

- Importar **só do xlsx oficial**. A leitura usa o valor numérico da célula (`cell.value`, ou `result` quando é fórmula) e nunca o texto formatado. O número vem como double do Excel, até 17 algarismos. Ele vai para o banco como texto na representação mais curta que volta ao mesmo double, sem arredondar.
- `preco_unitario`, `quantidade_prevista` e índice: `numeric` **sem escala**. Isso é uma **exceção à regra 3 do CLAUDE.md** (taxa com 4 casas), e fica registrada em decisoes.md. O motivo é medido: no `02.07.04`, 17.057,717 × 580,86 dá R$ 9.908.145,50, e o previsto oficial é R$ 9.908.218,84 (preço real ≈ 580,8643). Com 4 casas, o preço vira 580,8643 e o previsto erra em centavos.
- Quantidade **digitada** (lançamento, ajuste, aprovada): 4 casas, pelo `CASAS_TAXA`.
- Dinheiro: arredondado a 2 casas **no ponto que a regra do contrato manda** e somado depois, ou seja, soma de centavos inteiros. Nunca float.

### 6.2 Regra de arredondamento do valor

`mc_contratos.regra_arredondamento` é configuração, porque cada planilha arredonda num lugar. Opções previstas; só entra no CHECK a que a planilha oficial provar:

| Regra | Valor do item na medição | Acumulado do item |
|---|---|---|
| `item_por_medicao` | arred(qtd_med × preço, 2) | Σ dos valores por medição |
| `item_por_acumulado` | arred(qtd_acum_até_N × preço, 2) − arred(qtd_acum_até_N−1 × preço, 2) | arred(qtd_acum × preço, 2) |
| `sem_arredondar` | qtd × preço exato | arredondado só no total exibido |

Para o Lote 09, a regra **tem de ser descoberta na planilha oficial e reproduzida até o centavo**. O centavo dos grupos (Σ grupos = R$ 36.541.661,76 contra R$ 36.541.661,77 no total) é o teste: cada hipótese é rodada contra todas as células do boletim (item × medição, acumulado, grupo, total). As diferenças vão para você antes de qualquer escolha. Se nenhuma fechar, eu paro e mostro.

## 7. Ciclo da medição

### 7.1 Estados

```
aberta ──fechar──▶ em_conferencia ──enviar (REVnn)──▶ enviada ──aprovar──▶ aprovada
   ▲                    │                               │                    │
   └─reabrir (motivo)───┘      ◀──nova REV (motivo)─────┘           revisão pós-aprovação
                                                                     (motivo, nova REV)
```

- `aberta`: recebe lançamento e ajuste.
- `em_conferencia`: recusa lançamento, aceita ajuste com motivo. Reabrir exige motivo.
- `enviada`: congela a revisão (`mc_revisao_itens`) e grava os índices do reajuste (`mc_reajuste_aplicado`). Nova revisão (REV01, REV02...) volta para `em_conferencia` com motivo.
- `aprovada`: lança a quantidade aprovada e grava os índices de novo, se mudaram desde o envio. **Imutável por trigger no banco**: recusa insert, update e delete em lançamentos, ajustes, aprovações e revisões dessa medição, e na própria linha.

"Fechamento", para o reajuste, é o envio (seção 12, Q6).

### 7.2 Abrir medição

Sugere o período seguinte pelo `dia_inicio_periodo`. O usuário pode ajustar as datas, respeitando a regra de não sobreposição. Usa a versão da planilha vigente (seção 12, Q4).

### 7.3 Mais de uma medição viva

Enquanto a 10ª está em conferência, a 11ª já pode estar aberta: os períodos não se sobrepõem, então o lançamento cai sempre em uma só.

### 7.4 Revisão pós-aprovação

`medicao.medicoes/desaprovar` cria uma revisão `pos_aprovacao` com motivo obrigatório. As linhas antigas continuam intactas. A revisão nova recebe ajustes e quantidades aprovadas próprias e, ao ser aprovada, passa a ser a vigente da medição; a anterior fica `substituida`. Tudo auditado e visível na trilha.

## 8. Travas e alertas

**Travas (banco recusa):**
- Mexer em medição aprovada ou em versão de planilha vigente.
- Lançamento com data fora de medição aberta.
- Lançamento em título ou em item que não está na versão da medição.
- Período sobreposto.
- Fechar medição que atravessa o aniversário do reajuste sem `regra_aniversario` definida.
- Acumulado do item passando do previsto da versão vigente **sem motivo**: a RPC recusa e a tela mostra o alerta forte com o campo de motivo (é sinal de que precisa de aditivo). Com motivo, grava em `motivo_excesso`.

**Alertas (view `mc_v_alertas`, calculada, sem tabela):**
- Acumulado acima do previsto (mesmo com motivo, até entrar aditivo).
- Contrato perto do fim do prazo; valor executado perto do previsto. O limite é configurável no contrato (padrão: 90 dias e 90%).
- Medição com índice provisório.
- Item sem índice em contrato com reajuste.
- **Serviço sem insumo vinculado.** Precisa de configuração: `mc_item_vinculos (item_id, item_vinculado_id)`, cadastrada por você (ex.: CBUQ → CAP, DOPE, transporte). O alerta sai quando a medição tem quantidade no serviço e zero no vinculado. É alerta, não trava. Não crio vínculo nenhum por conta própria.
- `valor_inicial` diferente do previsto da v0.

**Alertas da importação (prévia, antes de gravar):** linha de serviço sem preço, código duplicado, unidade com espaço sobrando (`"un "`, gravada aparada, com aviso), hierarquia ambígua, célula vazia (vira zero e é listada, nunca misturada com zero digitado).

## 9. Telas

Todas em `/medicao/*`, desktop, com os canônicos (`FilterBar`, `DataTable`, `FormDrawer`, `KPICard`/`GradeKpis`, `MoneyText`, `ImportDialog`, `Trilha`, `Anexos`). Só aparecem os contratos da lista do usuário.

1. **Painel de contratos** (`/medicao/painel`): por contrato, previsto, acumulado, % executado, saldo, medição corrente em R$, reajuste acumulado e pendências. Linha de total consolidado. Filtro por status e tipo de contratante.
2. **Contratos** (`/medicao/contratos`): cadastro, período, localização, acesso (lista de usuários), aditivos, anexos. A configuração do reajuste fica numa seção própria, visível com `medicao.reajuste`.
3. **Planilha contratual** (`/medicao/planilha`): importar v0, versões, importar aditivo com prévia de comparação, vínculo de índice por item/grupo.
4. **Boletim** (`/medicao/boletim`): Item, Discriminação, Unid., Preço Unitário, Qtd Prevista Total, Valor Previsto Total, 1ª a Nª Medição (quantidade), Valor Executado na Medição corrente, Valor Executado Acumulado, % Executada, Saldo a Medir (R$), % a Medir. Grupos recolhíveis, filtro por grupo, busca, `tabular-nums`. Cartões: Previsto, Acumulado, % executado, Saldo, **Medição corrente em R$ (até hoje)**, Reajuste acumulado.
   - O `DataTable` não agrupa linhas hoje (só tem linha expandida). A Fase 3 **evolui o canônico** com linhas em árvore (`getSubRows` do TanStack), sem criar tabela paralela (regra 9).
   - O Lote 09 tem centenas de linhas × 10 medições, acima do teto silencioso de 1.000 linhas do PostgREST. O boletim vem por RPC que devolve a árvore já montada, por contrato.
5. **Lançamentos** (`/medicao/lancamentos`): lista filtrável por contrato, data, item e medição, mais formulário. **Colar do Excel**: bloco com data, item, quantidade e local, prévia linha a linha com erros, grava tudo ou nada. **Campo** (`/m/medicao`): lançar no celular com foto (`BotaoTirarFoto` + carimbo de data/hora/GPS).
6. **Medições** (`/medicao/medicoes`): abrir, fechar, enviar, revisar, aprovar, quantidade aprovada, glosa por item, comparação entre revisões, demonstrativo de reajuste.
7. **Índices** (`/medicao/indices`): índices, valores mensais provisórios e definitivos, importação por planilha, lista de diferenças de reajuste.
8. **Alertas** (`/medicao/alertas`): tudo o que está pendente, por contrato.
9. **Exportar xlsx**: boletim no layout da tela 4, com o cabeçalho de marca, e o demonstrativo de reajuste por medição.

## 10. Carga inicial

- **Lote 09 primeiro.** Fontes: o xlsx oficial da planilha (v0) e o do boletim com as 10 medições. **Nada digitado.**
- As 10 medições entram `aprovada`, `origem = carga`, com a quantidade do boletim como `mc_ajustes` do tipo `carga` ("Carga inicial do boletim oficial"). Aprovada = medida. Não há lançamento diário histórico.
- Padrão das cargas da Manutenção e do Frete: script extrai do xlsx → `esperado.json` → staging → migration de carga sem dado, que confere e aborta se não bater → ensaio em 3 rodadas (ENSAIO OK; CONTROLE com um alvo desviado em R$ 0,01 tem de ser recusado; ROLLBACK volta a zero) → prova pós-carga.
- Alvos: a tabela de grupos do pedido (previsto e acumulado até a 10ª), a 10ª medição (R$ 680.738,27; 02 = 3.312,02; 04 = 660.861,19; 08 = 16.565,06), % executado 14,981%, saldo R$ 207.385.821,63, **e toda célula do boletim**, não só os totais.
- A carga só é aplicada com o seu ok.
- Depois: Lote 10 (CT 184/2026) e as demais obras, uma de cada vez, pelo mesmo importador.

## 11. Testes e provas

- **Prova SQL por fase** em `supabase/provas/mc_faseN_*.sql`, estilo atual: `do $prova$`, impersonando o usuário com `set local role authenticated`, casos de recusa com `exception when others`, **linha de controle que tem de dar diferente**, terminando em `raise exception 'PROVA %'` + `ABORTO GARANTIDO`. Nada fica gravado.
- A Fase 1 cobre: cálculo por item, grupo e contrato em números feitos à mão (inclusive linha com preço e filhos com preço, e código duplicado); versões e acumulado atravessando aditivo; lançamento caindo na medição certa e recusado fora dela; imutabilidade da aprovada; acesso por contrato (usuário com o recurso e fora da lista não vê nada, anexo inclusive); backfill com 4 Admins.
- **Mutação manual** (o repo não tem ferramenta): quebrar de propósito cada regra de cálculo (trocar o ponto do arredondamento, contar a linha pai duas vezes, errar o fator em 1 casa) e mostrar que a prova ou o teste falha; depois desfazer. Teste que sobrevive à mutação não prova nada.
- **Vitest** no que é TypeScript: leitura do xlsx (valor da célula, fórmula, vazio), montagem da hierarquia, colar do Excel, layout do export (ida e volta).
- **Portão de cada PR:** `tsc`, lint, testes, build, CI verde, prova SQL rodada no banco vivo e advisors do Supabase limpos. O status do projeto (`vault/projects/erp-emt/status.md`) e o `docs/decisoes.md` são atualizados no fim de cada fase.
- Migration vai direto para produção: só mudança **aditiva** até o código que usa estar no ar. Aplicada por `apply_migration`, com o `.sql` versionado no repo.

## 12. Perguntas em aberto

Não decido nenhuma destas sozinho. As que dependem da cláusula ou do xlsx ficam para a fase em que o documento chega.

| # | Pergunta | Depende de | Bloqueia |
|---|---|---|---|
| Q1 | **Período do Lote 09**: a 8ª aparece como 26/05 a 25/06 na página da medição e como 01/06 a 30/06 no resumo do DNIT/NF. Qual vale para o módulo? | Você + boletim | Fase 2 |
| Q2 | **I do reajuste**: é o índice do mês de cada medição (muda todo mês) ou o do mês do aniversário, fixo por 12 meses (ciclo anual)? | Cláusula | Fase 6 |
| Q3 | **Aniversário no meio do período**: proporcional por data do lançamento ou pela medição inteira? | Você + cláusula | Fase 6 |
| Q4 | **Aditivo no meio do período**: a medição usa a versão vigente no início ou no fim do período? | Você | Fase 5 |
| Q5 | **Regra de arredondamento do Lote 09** e a origem do centavo. | xlsx oficial | Fase 2 |
| Q6 | **O reajuste incide sobre a quantidade enviada ou a aprovada?** A proposta é calcular no envio sobre a medida e recalcular na aprovação sobre a aprovada. E o reajuste é arredondado por item ou por medição? | Cláusula + reajuste real recebido | Fase 6 |
| Q7 | **Data-base e índices do Lote 09.** A 9ª já teve reajuste (R$ 88.589,82 sobre R$ 4.802.025,99), menos de 12 meses depois da assinatura (01/10/2025), então a data-base não é a assinatura. | Cláusula | Fase 6 |

## 13. Fases (1 PR por fase, você aprova cada uma)

1. **Banco + cadastro + importador.** Migrations das tabelas, RLS, acesso por contrato, recursos com backfill, anexos com a trava por contrato. Telas de contratos e planilha (importar v0, versões, aditivo). Prova SQL da seção 11.
2. **Carga do Lote 09.** Descobrir a regra de arredondamento e mostrar (Q5, Q1), extrator, `esperado.json`, migration de carga, ensaio de 3 rodadas com rollback provado. Carga aplicada só com o seu ok.
3. **Painel + Boletim** (só leitura) + export xlsx conferido célula a célula contra a planilha oficial. Evolução do `DataTable` para linhas em árvore.
4. **Lançamento diário**: desktop, celular (`/m/medicao`, com foto) e colar do Excel.
5. **Ciclo da medição**: fechar, revisões, aprovar, glosa, revisão pós-aprovação, alertas, comparação de versões.
6. **Reajuste**: configuração, índices, cálculo no fechamento, provisório/definitivo com diferença, demonstrativo e export. Prova com: antes do aniversário (zero), depois do aniversário, índice por grupo, provisório trocado por definitivo e conferência contra um reajuste já recebido de verdade (ex.: a 9ª do L09).

As tabelas de reajuste (5.5) nascem na Fase 1, vazias, para a Fase 6 não precisar mexer em estrutura já em produção. As RPCs e telas só entram na Fase 6.

## 14. Fora do escopo

- Qualquer escrita em outro módulo (D1, D2).
- NF, retenção, ISS, fatura, recebimento. Isso continua no Financeiro, digitado lá.
- Buscar índice na internet sozinho.
- PDF do boletim (o pedido é xlsx; PDF pode entrar depois).
- Fórmula de reajuste diferente da padrão, até aparecer um contrato que peça.
