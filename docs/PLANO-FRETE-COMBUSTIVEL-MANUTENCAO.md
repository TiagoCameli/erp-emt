# Plano: Frete, Combustível e Manutenção entram no ERP-EMT

Criado em 22/09/2026. Dono: Tiago. Status: **aprovado em 22/09/2026, pronto para a Fase 0.** Única pendência: confirmar o fornecedor John Deere (tabela 6.1), que não trava o início.

Origem: app Gestão Obras (emtconstrutora.com, Vite + React, Supabase `gunyitwrbxbmnezokgjq`).
Destino: ERP-EMT (Next.js, Supabase `vsesgvqjgqpapoxhnbqx`).

Os números deste plano foram medidos nos dois bancos em 22/09/2026. Antes de cada fase, meça de novo.

---

## 1. O que o Tiago decidiu (22/09/2026)

1. **Só três módulos saem do Gestão Obras:** Frete, Combustível e Manutenção (com o almoxarifado de peças, que é parte da manutenção). O resto continua no emtconstrutora.com: Apontamento RH, Obras/Etapas, Depósitos de material e Medição/RodoTracker.
2. **Os cadastros são compartilhados.** O ERP é o dono de fornecedor, equipamento, obra/centro de custo, insumo, unidade e usuário. Nenhum módulo novo mantém cadastro próprio dessas coisas.
3. **Nada gera lançamento automático no Financeiro.** Os módulos não criam lançamento, parcela nem rateio. O pagamento de frete continua sendo registrado no módulo Frete, como é hoje. Se ele também for lançado no Financeiro, o lançamento é manual.
4. **Lote 09 e Lote 10 são uma obra só no ERP**, como já está cadastrado ("009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10"). Nada de etapa por lote.
5. **Os módulos novos trabalham com até 4 casas decimais também no valor** (conta corrente, abastecimento, frete, pagamento de frete, custo da OS). É exceção à regra 3 do CLAUDE.md para estes módulos, e vai registrada em `docs/decisoes.md` e na própria regra 3 na Fase 1. O Financeiro continua em 2 casas, porque boleto e extrato OFX são em centavo.
6. **Arla:** o insumo pode ser o galão de 20 L ou o litro, mas **o tanque sempre controla litro**. A entrada em galão converte na hora (galões × 20).
7. **Os fornecedores já existem no ERP com nome um pouco diferente.** Só a EMT TRANSPORTES é criada.

Consequência de 3, que precisa estar escrita: **os módulos novos não entram no painel de custo por centro de custo.** Isso está certo. O custo da obra no ERP é o que está nos lançamentos (decisão de 29/07/2026 em `docs/decisoes.md`). O diesel, a peça e o frete já chegam lá pela OC ou pelo lançamento manual. Os módulos novos dizem **para onde foi** o que foi comprado (qual equipamento, qual obra, qual etapa). Somar os dois no mesmo painel contaria o custo duas vezes.

---

## 2. O que existe hoje

### Gestão Obras (origem), contagem em 22/09/2026

| Módulo | Tabelas | Linhas |
|---|---|---|
| Frete | `fretes` 849, `pagamentos_frete` 114, `transportadora_movimentos` 2.641, `pedidos_material` 66, `localidades` 7, `frete_dashboard_cards_config` 1, `anomalias_frete_checks` 1 | ~3.680 |
| Combustível | `depositos` 8 tanques (2 externos), `entradas_combustivel` 62, `saidas_combustivel` 3.083, `transferencias_combustivel` 5, `esvaziamentos_tanque` 4, `consumos_lote` 2.454 (FIFO), `saidas_sem_suprimento` 1, `anomalias_checks` 87 | ~5.700 |
| Manutenção | `ordens_servico` 172, `os_pecas` 306, `os_oleos` 58, `os_terceiros` 38, `tipos_oleo` 18, `depositos_material` (almoxarifado), `entradas_material` 332, `insumos` (249 peças), `medicoes_equipamento` 1, `documentos_equipamento` 98, `especificacoes_equipamento` 47, `historico_status_equipamento` 1 | ~1.300 |

Regras que moram em trigger no banco de origem e **precisam ser portadas uma a uma**:

- **Combustível:** FIFO autoritativo (`trg_recompute_fifo_*`, `registrar_saida_combustivel_fifo`), guarda de saldo (`trg_guard_saldo_*`), trava de ciclo (`trg_lock_ciclo_*`), validação de capacidade, bloqueio de entrada e de transferência em tanque externo, data não pode ser futura, recálculo de nível, sincronização da medição (horímetro) no abastecimento, e geração do débito da transportadora (`fn_saidas_combustivel_movimentos`).
- **Frete:** geração de crédito (`fn_fretes_movimentos`) e de débito de pagamento (`fn_pagamentos_frete_movimentos`) na conta corrente, preenchimento automático de `transportadora_id`, e soft delete do movimento.
- **Manutenção:** soma de custo da OS (peças, óleos, terceiros), validação de saldo do almoxarifado para peça e óleo, e sincronização do status do equipamento com a OS.

Mobile: rotas `/m/*` com leitura do QR do equipamento. Fila offline existe só para **medição (horímetro)** e **OS aberta pelo celular**. A saída de combustível pelo celular funciona só com internet, e continua assim.

### ERP-EMT (destino)

- Módulos: Gestão, Cadastros, Compras, Financeiro, RH, Administração.
- Já existem e serão reaproveitados: `fornecedores` (977), `equipamentos` (65, cada um com etapa própria no centro "Manutenção/Documentação de Equipamentos", criada pelo gatilho `fn_equipamento_cria_etapa_manutencao`), `equipamento_documentos` (vazia), `obras` (15, com o gatilho que cria o centro de custo), `centros_custo`, `insumos` (3.448, incluindo Diesel S10 `10093`, Diesel S500 `10259` e Arla `1335M186`), `unidades_medida`.
- As fases 4 (Estoque e Combustível) e 5 (Manutenção) já foram construídas uma vez e **removidas na Reforma A** (`20260720120002_reforma_a_drop_manutencao`, `20260720120003_reforma_a_drop_estoque`). O desenho de lá (PEPS, `os_pecas`, `os_terceiros`, `abastecimentos`) serve de referência. **Não é para reaplicar aquelas migrations**: elas geravam lançamento no Financeiro quando a OS era concluída, e isso contraria a decisão 3.

---

## 3. Onde cada coisa vive no ERP

Três módulos novos na sidebar, logo depois de Compras. Ordem proposta de `MODULOS`: Gestão, Cadastros, Compras, **Frete**, **Combustível**, **Manutenção**, Financeiro, RH, Administração.

Cadastros que entram ou crescem no módulo Cadastros:

| Cadastro | Mudança |
|---|---|
| `fornecedores` | 3 colunas novas: `eh_transportadora boolean`, `eh_dona_de_tanque boolean`, `taxa_litro_padrao numeric(_,4)` (é TAXA pela regra 3 do CLAUDE.md). Editadas em Cadastros > Fornecedores, sem recurso novo. |
| `equipamentos` | colunas novas: `status` (ativa, em_manutencao, fora_funcionamento), `propriedade` (propria, alugada, consorcio), `medicao_inicial numeric(_,4)`, `numero_serie`, `data_aquisicao`, `data_venda`. `controle_por` (horímetro ou km) já existe e substitui `tipo_medicao`. As especificações técnicas viram tabela 1:1 `equipamento_especificacoes`. |
| `equipamento_documentos` | já existe e está vazia. Recebe os 98 documentos da origem. |
| `localidades` | **cadastro novo**, recurso `cadastros.localidades` (CRUD). Origem e destino do frete. |
| `tipos_oleo` | cadastro novo, mas **fica dentro de Manutenção** (`manutencao.tipos-oleo`), porque só a manutenção usa. |

---

## 4. Permissões

O ERP trabalha com **permissão tripla**: RLS com `tem_permissao(recurso, acao)`, checagem na Server Action e UI escondendo o que o usuário não pode ver. As ações são fixas (`ver, criar, editar, excluir, aprovar, desaprovar`). O Gestão Obras tem 250 chaves soltas (`criar_frete`, `esvaziar_tanque`, `ajustar_saldo_transportadora`...). **Nenhuma chave solta entra no ERP.** Toda operação especial vira um recurso próprio com as ações do catálogo.

### 4.1 Recursos novos em `src/config/recursos.ts`

| Recurso | Nome no menu | Ações | Observação |
|---|---|---|---|
| `frete.painel` | Painel | ver | cards de saldo configuráveis (hoje em `frete_dashboard_cards_config`). Configurar os cards pede `frete.painel/ver` + `frete.pagamentos/criar`, como regra de tela. Se o Tiago quiser separar, vira recurso próprio. |
| `frete.fretes` | Fretes | ver, criar, editar, excluir | |
| `frete.pedidos-material` | Pedidos de material | ver, criar, editar, excluir | saldo na pedreira |
| `frete.conta-corrente` | Conta corrente | ver | extrato por transportadora, só leitura |
| `frete.pagamentos` | Pagamentos de frete | ver, criar, editar, excluir | débito na conta corrente, **sem lançamento** |
| `frete.ajustes` | Ajustes de saldo | ver, criar, aprovar, desaprovar | hoje `ajustar_saldo_transportadora` + `aprovar_lancamento_manual`. Ajuste só mexe no saldo depois de aprovado. |
| `frete.anomalias` | Anomalias | ver, editar | `editar` = marcar como conferido |
| `combustivel.painel` | Visão geral | ver | |
| `combustivel.tanques` | Tanques | ver, criar, editar, excluir | |
| `combustivel.entradas` | Entradas | ver, criar, editar, excluir | |
| `combustivel.saidas` | Abastecimentos | ver, criar, editar, excluir | equipamento próprio e carreta de transportadora. É o mesmo recurso da tela do celular. |
| `combustivel.transferencias` | Transferências | ver, criar, editar, excluir | |
| `combustivel.esvaziamentos` | Esvaziamentos | ver, criar, excluir | perda com valor, ação separada de propósito |
| `combustivel.anomalias` | Anomalias | ver, editar | inclui "sem suprimento" |
| `combustivel.relatorios` | Relatórios | ver | |
| `manutencao.painel` | Painel | ver | |
| `manutencao.servicos` | Caderno de serviços | ver, criar, editar, excluir | a OS. Peça, óleo e terceiro são linhas da OS, cobertas por `editar`. |
| `manutencao.almoxarifado` | Almoxarifado de peças | ver, criar, editar, excluir | entrada de peça e cadastro da peça no depósito |
| `manutencao.medicoes` | Horímetro e km | ver, criar, editar | tela do celular com fila offline |
| `manutencao.tipos-oleo` | Tipos de óleo | ver, criar, editar, excluir | |
| `cadastros.localidades` | Localidades | ver, criar, editar, excluir | |

O que **não** vira recurso, porque o ERP já resolve:

- Lixeira de frete e de combustível: vai para `administracao.lixeira`, que é universal. `fn_recurso_do_cadastro` ganha um branch por tabela nova, para a restauração exigir a permissão do recurso de origem.
- Auditoria: `audit_log` + `administracao.auditoria`.
- Exportar para Excel: segue o padrão do ERP (listagem gerencial exporta com `ver`).
- Etiquetas QR e status do equipamento: `cadastros.equipamentos/editar`.

### 4.2 De-para das chaves do Gestão Obras

A tabela completa (250 chaves → recurso/ação) vai ser gerada na Fase 1, em `supabase/provas/de_para_permissoes_gestao_obras.sql`, e revisada pelo Tiago **antes** de ser aplicada. Exemplos da regra:

| Chave no Gestão Obras | ERP |
|---|---|
| `ver_frete`, `aba_frete_fretes` | `frete.fretes/ver` |
| `criar_frete` / `editar_frete` / `excluir_frete` | `frete.fretes/criar` / `editar` / `excluir` |
| `ajustar_saldo_transportadora` | `frete.ajustes/criar` |
| `aprovar_lancamento_manual` | `frete.ajustes/aprovar` e `desaprovar` |
| `criar_saida_combustivel`, `saida_combustivel_mobile`, `criar_abastecimento_carreta` | `combustivel.saidas/criar` |
| `esvaziar_tanque` | `combustivel.esvaziamentos/criar` |
| `corrigir_anomalias_combustivel` | `combustivel.anomalias/editar` |
| `criar_os`, `abrir_os_mobile` | `manutencao.servicos/criar` |
| `adicionar_peca_os`, `adicionar_oleo_os`, `adicionar_terceiro_os`, `editar_diagnostico_os` | `manutencao.servicos/editar` |
| `lancar_medicao_mobile` | `manutencao.medicoes/criar` |
| `restaurar_lixeira_frete` | `administracao.lixeira/editar` (a lixeira confere o recurso de origem) |

### 4.3 Quem recebe o acesso

`usuario_permissoes` é **por usuário**. Recurso novo nasce sem ninguém, e a aba some até para o Tiago. `aplicar_perfil` **substitui** a matriz inteira. Então:

1. **Admin:** a migration de cada fase insere os recursos da fase no perfil Admin **e** nos 4 usuários Admin ativos (Tiago, Emanuel, James, Lorenzo), no padrão de `20260827180200_permissao_cadastros_cartoes.sql`.
2. **Os outros usuários:** a matriz de cada um sai do de-para aplicado às chaves que ele tem hoje no Gestão Obras. **Só adiciona linhas**: não usa `aplicar_perfil` em ninguém que já tem Compras, Financeiro ou RH, senão ele perde o que tem.
3. **Usuários que não existem no ERP:** Yara Nylla (Operador), Racenilton (Gerente) e Bruno Souza (Apontador). Recebem convite antes da virada. Os outros casam por email/nome: Tiago, Emanuel, James, Brenda, Andreia, Marvim/Marvin (a mesma pessoa, decisão h).
4. **Perfis-modelo novos**, só para quem entrar depois: "Frete", "Combustível" e "Manutenção". O perfil "Apontador", que já existe com 3 permissões e 0 usuários, passa a ter `combustivel.saidas/ver+criar` e `manutencao.medicoes/ver+criar`, que é exatamente o que a descrição dele promete.

### 4.4 O que prova que a permissão está certa (definição de pronto)

- `recursos.test.ts` atualizado: módulos novos em `MODULOS`, ordem do submenu, e todo recurso tem `ver`.
- Prova SQL por fase, com `set local role authenticated`, igual às de `supabase/provas/`: um usuário sem o recurso não lê e não grava. **Duas linhas de controle obrigatórias:** (a) quem tem só `combustivel.saidas/criar` grava um abastecimento e **não** consegue gravar entrada; (b) quem tem só `frete.ajustes/criar` cria o ajuste e o saldo **não muda** até alguém com `aprovar` aprovar.
- Aba some do menu sem `ver`; botão some sem a ação.

---

## 5. Modelo de dados no ERP (regras que valem para toda tabela nova)

- `uuid` como id. O id antigo (texto, ex. `mrcbbnhonvook`) fica numa tabela de de-para no schema `legado` (sem grant para `authenticated`), que serve para migrar, reconciliar e depois ser apagada.
- RLS + grants explícitos + trigger de `audit_log` + soft delete pela lixeira, como manda o CLAUDE.md.
- **Datas:** `fretes.data` e `pedidos_material.data` hoje são `text`. Viram `date`. As colunas `timestamp without time zone` do combustível (`data_hora`, `data`) são interpretadas como horário de America/Rio_Branco e gravadas como `timestamptz`. Uma conversão errada aqui empurra abastecimento de fim de noite para o dia seguinte e muda o FIFO.
- **Casas decimais** (decisão 5): nestes módulos, VALOR e TAXA são `numeric(14,4)` e `numeric(_,4)`. Litros, preço por litro, taxa por litro, t·km, preço unitário, `valor_total` de frete, abastecimento, pagamento de frete, movimento da conta corrente e custo de OS guardam 4 casas, exatamente como a origem, e a migração copia **sem arredondar**. A exibição em R$ mostra 2 casas (`MoneyText`), e o detalhe mostra as 4. A constante nova vai para `src/lib/casas-decimais.ts` com nome próprio (por exemplo `CASAS_VALOR_OPERACIONAL = 4`), para ninguém usar por engano no Financeiro, que continua com 2.
- **Numeração:** OS no formato `OS-AAAA-NNNN` pela `documento_sequencias`. O número antigo fica gravado em `numero_legado`.
- **Centro de custo:** o abastecimento de equipamento próprio aponta para a etapa do equipamento na raiz de manutenção. `alocacoes` (hoje jsonb, em 2.909 saídas) vira tabela filha `abastecimento_alocacoes` (centro de custo, litros, percentual), que é como o ERP modela rateio. As alocações nas obras 009 e 010 da origem apontam, as duas, para o centro de custo raiz da obra "009 - Lote 09 & 10" (decisão 4). A etapa de serviço da origem (53 usadas) **não vira centro de custo**: o nome dela fica gravado em `etapa_legado` na alocação, só como histórico, sem aparecer no rateio do Financeiro.

Tabelas novas por módulo (nomes no padrão do ERP):

- **Frete:** `fretes`, `frete_pagamentos`, `transportadora_movimentos`, `pedidos_material` + `pedido_material_itens` (hoje `itens` é jsonb), `frete_painel_config`, `frete_anomalias_conferidas`.
- **Combustível:** `tanques`, `combustivel_entradas`, `combustivel_saidas`, `abastecimento_alocacoes`, `combustivel_transferencias`, `combustivel_esvaziamentos`, `combustivel_camadas` (substitui `consumos_lote`, no desenho PEPS da Fase 4), `combustivel_sem_suprimento`, `combustivel_anomalias_conferidas`.
- **Manutenção:** `ordens_servico`, `os_pecas`, `os_oleos`, `os_terceiros`, `tipos_oleo`, `almoxarifado_depositos`, `almoxarifado_entradas`, `almoxarifado_saldos`, `equipamento_medicoes`, `equipamento_status_historico`, `equipamento_especificacoes`.

A conta corrente fica numa tabela só (`transportadora_movimentos`), que o frete, o pagamento, o ajuste e o abastecimento de carreta alimentam por função. **Ninguém grava nela direto da tela.** Tipos que existem hoje: `credito_frete`, `credito_abastecimento_transterra`, `debito_abastecimento_transterra`, `debito_abastecimento_emt`, `debito_pagamento_frete`, `ajuste_manual_credito`, `ajuste_manual_debito`. `abatido_em_pagamento_id` **não migra**: o mecanismo nunca foi usado (anotado no vault em 08/07/2026).

---

## 6. De-para dos cadastros (a parte que mais pode dar errado)

| Cadastro | Situação medida | Como resolver |
|---|---|---|
| Fornecedores | 51 usados nos 3 módulos. 36 casam 1 para 1 pelo nome normalizado. Os outros 15 existem no ERP com outro nome (conferido em 22/09, tabela 6.1). Só a **EMT TRANSPORTES não existe** e é criada. | Aplicar a tabela 6.1. As flags de transportadora e dona de tanque e a taxa por litro vão para o fornecedor do ERP. |
| Equipamentos | Origem 109, ERP 107 depois de 22/09. | **Feito**, seção 6.2 e `equipamentos-de-para.csv`. |
| Obras | Origem 7: Empresa EMT, Empresa AMZ, 003, 007, 009 (Lote 09), 010 (Lote 10), 012. | 009 e 010 da origem → a obra única "009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10" (decisão 4). 003, 007 e 012 casam pelo número. Empresa EMT → Escritório Central, Empresa AMZ → Amazônia Agroindústria (decisão b). |
| Etapas | 53 etapas da origem aparecem nos abastecimentos. No ERP, a obra 009 não tem etapa. | Não viram centro de custo. O nome fica em `etapa_legado` (seção 5). |
| Insumos combustível | 4 na origem | Diesel S10 → `10093`, Diesel S500 → `10259`, Gasolina → `184`. **Arla** (decisão 6): aceita o insumo galão `1335M186` (fator 20) ou um insumo Arla em litro, que é criado se não existir. `combustivel_entradas` guarda o insumo, a quantidade na unidade dele e `litros` já convertido, e o tanque só enxerga `litros`. A saída de Arla é sempre em litro. Conferido em 22/09: são os mesmos códigos das OCs do Compras (S10 em 11 itens, S500 em 5, Arla galão em 6, Gasolina em 1). |
| Peças | 249 na origem, 221 usadas em OS. O ERP tem 991 insumos de peça (categoria Equipamentos). | **Decisão d:** casar com os insumos do ERP, pelo nome, com revisão do Tiago. Só o que não tiver par é criado. Estoque mínimo, máximo e compatibilidade com equipamento vão para `almoxarifado_*`, não para `insumos`. |
| Usuários | 9 na origem, 8 no ERP | Seção 4.3 |

### 6.2 Equipamentos (FEITO em 22/09/2026)

Os 42 que faltavam foram criados no ERP. Agora são 107 equipamentos, e os 109 da origem têm par. O de-para completo está em `scripts/migracao-gestao-obras/equipamentos-de-para.csv`.

- **EMT (7), na raiz "Manutenção/Documentação de Equipamentos"**, com a etapa criada pelo gatilho: MT-01 e MT-02 (Bros 160), CT-001 Caminhão Plataforma SQR6E16, Rolo Dynapac CA 25, Trator John Deere, Trator Walmet e **Outros**.
- **Colorado (31, com a Recicladora P-003), com a etapa na obra "002 - Equipamentos Colorado 2026".** Os códigos COL-* da origem foram mantidos. Os que não tinham código ficaram sem código, com o nome da origem.
- **Alugados de terceiros (4), sem etapa (sem centro de custo):** Caminhão de Apoio Jorgean, Caçamba JXS6G76, Caçamba NAA-4511 e Hilux Renan BDX3D28. O diesel e o serviço desses equipamentos são alocados na obra onde eles trabalharam (a alocação que já vem da origem), nunca no equipamento.
- **Fusões:** "Equipamento Desconhecido" vira **Outros** (os dois apontam para o mesmo equipamento no ERP). As duas fichas da Caçamba NAA-4511 viram uma.
- **O que ainda falta (Fase 1):** a coluna `propriedade` não existe no ERP. Hoje, um equipamento da Colorado cadastrado pela tela cai na manutenção da EMT, e é preciso mover a etapa à mão. A Fase 1 cria a coluna `propriedade` (`propria`, `colorado`, `alugada`), marca os 31 da Colorado e os 4 alugados, e muda `fn_equipamento_cria_etapa_manutencao`: o próprio ganha etapa na raiz de manutenção, o da Colorado ganha etapa na obra 002, e o alugado não ganha etapa. Mudar a propriedade de um equipamento que já tem lançamento no centro de custo é bloqueado.

### 6.1 Fornecedores com nome diferente (achados no ERP em 22/09/2026)

| Gestão Obras | ERP | Confiança |
|---|---|---|
| Andrade Transporte | ANDRADE JUNIOR SERVIÇOS DE TRANSPORTES LTDA (11.024.598/0001-75) | alta. Existe também "ANDRADE CONSTRUÇÕES TERRAPLANAGEM", que **não** é a transportadora |
| LMC Transportadora | LMC CAMELI & CIA LTDA (06.987.041/0001-08) | alta |
| Transportadora Soares | SOARES TRANSPORTE LTDA (54.023.474/0001-88) | alta |
| ETAM Construtora | CONSTRUTORA ETAM LTDA (22.768.840/0001-31) | alta |
| Areacre e Areacre - Josias (**dois na origem**) | JOSIAS O DA SILVA LTDA, fantasia Areacre (19.892.960/0001-31) | alta. Os dois da origem viram um fornecedor só no ERP. A conta corrente é somada, e a conferência 9.1 é feita pela soma dos dois. |
| Posto Progresso | AUTO POSTO PROGRESSO EIRELI | alta |
| Britam | BRITAS DA AMAZONIA MINERACAO E COMERCIO LTDA (14.666.956/0001-31) | alta |
| Vale do Abunã | PEDREIRA VALE DO ABUNA (04.087.224/0001-33) | alta |
| Formate | PEDREIRA E EXTRACAO FORTALEZA, fantasia FORMATE (05.660.758/0001-70) | alta |
| Argamassa AS/ Grafifort | Argamassa AS - Graf Fort (17.871.571/0002-85) | certa, mesmo CNPJ |
| RECOL VEÍCULOS JURUÁ | Recol Veículos Juruá LTDA (20.316.039/0001-20) | alta |
| TRATOR PRIME | TRACTOR PRIME (54.691.419/0001-66) | alta |
| CASA DAS MÁQUINAS | Casa da máquina | média, sem CNPJ nos dois lados |
| JOHN DEERE | JD COMERCIO E IMPORTACAO LTDA (05.705.694/0001-86)? | **baixa, Tiago confirma** |
| EMT TRANSPORTES | não existe | **criar**, com `eh_transportadora = true` |

---

## 7. Fases

Regra do CLAUDE.md: nunca duas fases abertas ao mesmo tempo. Cada fase tem PR, preview na Vercel, prova SQL e validação do Tiago.

**Fase 0. Arrumar a origem antes de copiar** (no Gestão Obras, sem tocar no ERP)
- Fechar o descompasso entre banco e migrations do combustível (`calcular_combustivel_tanque_na_data` rodando diferente do arquivo).
- Resolver os 12 testes vermelhos de `fifoCombustivel.test.ts`, ou declarar que o FIFO do ERP vai ser reescrito e que esses testes viram a especificação.
- Decidir a pendência do S10 de 01/05 a 20/05 no tanque Meloza Colorado.
- Listar as tabelas `*_backup_*` e deixar fora da migração.

**Fase 1. Cadastros compartilhados** (ERP)
- Colunas novas em `fornecedores` e `equipamentos`, `equipamento_especificacoes`, `cadastros.localidades`.
- De-para de fornecedores, equipamentos, obras/etapas, insumos e usuários aprovado pelo Tiago e aplicado.
- Criar o fornecedor EMT TRANSPORTES. Aplicar a tabela 6.1 (John Deere só depois da confirmação).
- Constante `CASAS_VALOR_OPERACIONAL = 4` em `src/lib/casas-decimais.ts`, exceção escrita na regra 3 do CLAUDE.md e em `docs/decisoes.md`.
- Insumo Arla em litro, se não existir, e o fator 20 do galão `1335M186`.
- Convites para Yara, Racenilton e Bruno.
- Nenhuma tela de módulo novo ainda. Esta fase já melhora o ERP sozinha.

**Fase 2. Manutenção (piloto)**
- Recursos `manutencao.*`, tabelas, RLS, auditoria, soma de custo da OS, baixa de peça e de óleo no almoxarifado com checagem de saldo, status do equipamento acompanhando a OS.
- Celular: `/m` com QR do equipamento, abrir OS e lançar horímetro, **com fila offline** (a origem já tem, em `src/lib/offlineQueue.ts`). O ERP não tem service worker hoje. Entra aqui.
- Migração dos dados da manutenção e virada **só da manutenção**. Ela não depende de frete nem de combustível. Por isso é o piloto: valida o método com o menor risco de caixa.

**Fase 3. Combustível** e **Fase 4. Frete**: construídas em sequência, **viradas no mesmo dia.**
- Não dá para virar uma sem a outra: o abastecimento de carreta gera débito na conta corrente da transportadora, e a conta corrente é do Frete. Se virar só o combustível, o débito nasce num banco e o saldo é lido no outro.
- Combustível: tanques, entradas, abastecimentos (tela e celular), transferências, esvaziamentos, PEPS por camada com trava e recálculo, anomalias, sem suprimento.
- Frete: fretes, pedidos de material (saldo na pedreira pelo preço do pedido mais recente, regra de 08/06), conta corrente, pagamentos, ajustes com aprovação, painel com os cards configuráveis, anomalias.

**Fase 5. Desligamento**
- Os três módulos no Gestão Obras ficam **só leitura** por um ciclo de fechamento (RLS sem insert/update/delete), como referência.
- Depois as rotas saem do menu do Gestão Obras. Os dados antigos ficam no banco de origem, sem apagar.

---

## 8. Migração dos dados

- Script idempotente por módulo, em `scripts/migracao-gestao-obras/`, que lê a origem com a chave de serviço **fora do app** e grava no ERP pelo MCP ou pelo SQL, nunca pelo client.
- Preserva `created_at` e o autor (mapeado para `usuarios.id`; quem não existir vira o usuário "Migração").
- A ordem respeita as FKs: cadastros → tanques e depósitos → entradas → saídas → camadas → movimentos → pagamentos.
- **Anexos** (`foto_urls` e `arquivo_urls` em fretes, pagamentos, entradas, saídas, OS e documentos): copiar do storage de origem para o bucket `anexos` do ERP **e criar a linha em `public.arquivos` e em `anexo_vinculos` no mesmo passo.** O cron `/api/faxina-arquivos` apaga, em 24h, todo objeto do bucket sem linha em `arquivos`. Um anexo copiado sem a linha some no dia seguinte, sem aviso.
- Os gatilhos de conta corrente e de FIFO ficam **desligados durante a carga**. Os movimentos e as camadas são copiados como estão, e depois o recálculo roda uma vez e é conferido contra a origem. Com os gatilhos ligados, cada saída importada recalcularia o tanque inteiro (em maio eram 727 saídas só no Meloza Colorado) e geraria movimento em dobro.

---

## 9. Conferências da virada (linhas de controle)

A virada só acontece se todas baterem. O script imprime a origem e o destino lado a lado.

1. **Saldo de cada transportadora**, calculado pela mesma função que o app antigo usa na tela de conta corrente (não por uma soma nova), **igual na quarta casa**. Não há arredondamento, então não há diferença para explicar. Areacre é conferida pela soma dos dois fornecedores de origem.
2. **Nível (litros) e valor em estoque de cada tanque**, e o preço PEPS da última saída de cada tanque.
3. Quantidade de registros por tabela, sem contar os excluídos.
4. Soma de `valor_total` de fretes, de saídas de combustível e de pagamentos de frete, por mês.
5. OS: quantidade por status e `custo_total` somado. Em 22/09 eram 164 concluídas, 3 canceladas e R$ 299.367,27 no total.
6. Saldo de cada peça em cada almoxarifado.
7. Quantidade de anexos na origem igual à de linhas em `arquivos` com vínculo no destino.
8. **Linha de controle negativa:** um frete lançado no ERP depois da virada gera exatamente um crédito na conta corrente e **zero linhas em `lancamentos`**.

---

## 10. Virada

- **Data:** logo depois de fechar o frete do mês e pagar as transportadoras, para a conta corrente migrar com o menor saldo em aberto possível.
- **Congelamento:** o Gestão Obras fica só leitura nesses três módulos durante a carga (algumas horas, de preferência num fim de semana). Rodar os dois sistemas gravando ao mesmo tempo obrigaria a digitar tudo duas vezes no campo e criaria divergência. O paralelo é só de leitura (Fase 5).
- **Comunicação:** no dia anterior, a equipe recebe o link novo e o login. Os dois QR funcionam (decisão i): o adesivo antigo redireciona para o ERP e o novo aponta direto.

---

## 11. Decisões

Resolvidas em 22/09/2026: **a, b, c, d, e, f, g, h, i**, fornecedores (decisão 7) e Arla (decisão 6). Pendente: só a confirmação do fornecedor John Deere na tabela 6.1.

a. ~~Lote 09 e Lote 10~~ **Resolvida:** uma obra só, sem etapa por lote.
b. **Resolvida:** "Empresa EMT" → Escritório Central; "Empresa AMZ" → Amazônia Agroindústria.
c. **Resolvida e executada em 22/09:** 42 equipamentos criados. 7 da EMT na manutenção, 31 da Colorado na obra 002 e 4 alugados sem etapa. Desconhecido virou Outros.
d. **Resolvida:** as peças casam com o cadastro de insumos do ERP. Só é criada a que não tiver par, depois de revisão.
e. ~~Centavos~~ **Resolvida:** até 4 casas nos módulos novos, sem ajuste de migração.
f. **Resolvida, por enquanto:** o pagamento de frete é registrado no Frete e lançado à mão no Financeiro. Vínculo entre os dois fica para depois.
g. **Resolvida:** pedidos da pedreira ficam no Frete, sem ligação com a OC.
h. **Resolvida:** Marvim e Marvin são a mesma pessoa. Ele mantém Compras no ERP e ganha as permissões de campo que tem hoje no Gestão Obras.
i. **Resolvida:** os dois QR funcionam. O adesivo antigo (`emtconstrutora.com/m/eq/<id antigo>`) continua funcionando: o Gestão Obras redireciona para a tela do equipamento no ERP pelo `equipamentos-de-para.csv`. O Tiago vai colar QR novo do ERP em todas as máquinas, e o redirecionamento fica ligado até o último adesivo antigo sair. Na Fase 2 entra também a impressão das etiquetas novas no ERP (`cadastros.equipamentos/editar`).

---

## 12. Onde isto vai ser registrado

A cada fase: `docs/decisoes.md` (o que foi decidido e por quê), `supabase/provas/` (a prova de RLS e a de conferência) e o status em `personal-os/vault/projects/erp-emt/status.md`.

---

## 13. Correções depois da aprovação (Fases 0 e 1, 22/09/2026)

O texto acima fica como foi aprovado. O que o levantamento mostrou diferente está aqui, com o
registro completo em `docs/decisoes.md`.

- **7, Fase 0:** os 12 testes vermelhos de `fifoCombustivel.test.ts` já estavam verdes desde 09/07
  (commit `afb245d` do Gestão Obras). Os 16 testes viram a especificação do PEPS.
- **2 e 7, Fase 0:** o descompasso do combustível era de 31 funções e 11 triggers, não de uma. A
  cópia exata do banco vivo está em `Gestao_Obras/supabase/migrations/20260922110000_sync_combustivel_banco_vivo.sql`,
  e é dela que a Fase 3 porta as regras.
- **Nova pendência antes da Fase 3:** o FIFO autoritativo da origem (`private.recompute_fifo_tanque`)
  não desconta transferência de saída nem esvaziamento; os 16 testes descontam. Só o Meloza EMT
  muda (78 saídas, +R$ 440,69). E o recarimbo das 2 saídas S10 do Meloza Colorado não se sustenta
  com o gatilho de validação atual. As duas são decisão do Tiago.
- **3 e 6.2:** `propriedade` é `propria`, `colorado`, `alugada` (a seção 3 dizia `consorcio`).
- **4.2:** `aprovar_lancamento_manual` é do Apontamento RH, não de `frete.ajustes`.
- **4.1:** a lixeira do ERP NÃO confere o recurso de origem hoje; precisa ser construído antes de
  alguém que não é Admin receber `administracao.lixeira`.
- **6:** são 56 fornecedores usados (não 51); 3 pedem decisão do Tiago antes da carga.
- **9.5:** a contagem de OS é sem as excluídas (164 concluídas + 3 canceladas; há 5 concluídas
  excluídas, custo zero).
