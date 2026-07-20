# Reforma do ERP-EMT: enxugar para Compras, Financeiro e RH

- Data: 2026-07-20
- Autor: Tiago (dono) + Léo
- Status: aprovado no brainstorming, aguardando revisão do spec

## 1. Contexto e objetivo

O ERP-EMT foi construído em 8 fases com 9 módulos (Cadastros, Compras, Financeiro,
Estoque, Manutenção, Medição, RH, Gestão, Administração). A empresa vai operar só com
três frentes de negócio: **Compras, Financeiro e RH**. O resto sai. Ao mesmo tempo, o
fluxo de compra e pagamento é remodelado com portões de aprovação/autorização e um
modelo de atribuição de custo mais simples (obra / empresa / equipamento, sem árvore).

Os dados transacionais carregados em 27/06 (OCs, lançamentos, medições) são de teste e
serão zerados. Os cadastros (fornecedores, insumos, obras, equipamentos, contas
bancárias, clientes, colaboradores) são reais e ficam.

Objetivo: entregar um app menor, com o ciclo compra → lançamento → agendamento →
autorização → pagamento correto, custo sempre atrelado a obra/empresa/equipamento, e
anexo de arquivo em OC, lançamento e pagamento.

## 2. Escopo

### Fica (menu de negócio)
- **Compras:** Cotações + Ordens de compra.
- **Financeiro:** todas as abas de hoje (Lançamentos, Aprovação de pagamentos,
  Pagamentos, Contas a receber, Contas bancárias, Conciliação OFX, Categorias,
  Relatórios) com as mudanças da seção 5.
- **RH:** todas as abas de hoje, com a mudança do rateio da folha (seção 6).

### Fica (suporte)
- **Cadastros:** Obras, Fornecedores, Insumos, Equipamentos, Clientes, Unidades,
  Categorias, Colaboradores.
- **Administração:** Usuários e permissões, Perfis, Auditoria, Lixeira, Configurações.

### Sai por completo (app + banco)
- Módulos: **Estoque, Manutenção, Medição, Gestão**.
- Add-on: **Orçamentos/EAP**.
- Abas de Cadastros: **Depósitos e tanques** (era do Estoque), **Centros de custo**
  (o editor de árvore; a tabela `centros_custo` continua como encanamento, ver 4).
- Abas de Compras: **Pedidos, Recebimentos, Painel de compras**.

## 3. Decisões travadas (brainstorming)

1. App reduzido a Compras (Cotações + OC), Financeiro e RH; Cadastros e Administração de
   suporte.
2. Estoque, Manutenção, Medição, Gestão e Orçamentos removidos do app e do banco.
3. OC continua item a item ligada ao insumo. Sem estoque, sem recebimento.
4. Aprovar OC não gera mais lançamento automático. OC aprovada exibe botão **Gerar
   lançamento**; o lançamento nasce preenchido da OC e o operador escolhe a forma de
   pagamento.
5. Centro de custo deixa de ser árvore. Vira um **destino de custo** de 3 tipos: Obra
   (escolhe qual), Empresa (escritório central), Manutenção de equipamento (escolhe o
   equipamento). Implementação por **reaproveitamento do encanamento** (abordagem A).
6. Rateio continua existindo: um lançamento pode ser dividido entre destinos diferentes
   (ex: 60% obra A, 40% obra B). Sem os níveis Etapa/Item.
7. Formas de pagamento: dinheiro, cartão, PIX, transferência, boleto, cheque. A forma é
   definida **na criação do lançamento**.
8. Autorização de pagamento: **dinheiro e cartão pagam direto** (sem fila). **PIX,
   transferência, boleto e cheque** entram na fila de autorização e só pagam depois de
   autorizado por quem tem permissão.
9. Contas a receber vira lançamento a receber avulso: NF emitida pela empresa atrelada a
   uma obra, ou recebimento avulso. Sai a origem "fatura de medição".
10. Lançamentos avulsos (a pagar ou a receber) são permitidos sem OC, mas exigem destino
    (obra/empresa/equipamento).
11. Anexo de qualquer tipo de arquivo em OC, lançamento e pagamento.
12. Folha do RH: custo rateado **automático** proporcional aos apontamentos do mês.
    Fallback: funcionário sem apontamento no mês cai na Empresa.
13. Dados: zera transacional, mantém cadastros.
14. Autorizar pagamento reaproveita a permissão existente
    `financeiro.aprovacao-pagamentos`. Aprovar OC reaproveita `compras.ordens` ação
    `aprovar`.

## 4. Modelo de destino de custo (abordagem A)

Hoje a tabela `centros_custo` é uma árvore. Já existem os nós certos por gatilho: toda
obra cria um centro de custo raiz, o Escritório Central é um centro, e todo equipamento
cria um nó sob o centro Manutenção. A reforma **mantém `centros_custo` e as FKs
existentes** (`lancamento_rateios.centro_custo_id`, `oc_itens.centro_custo_id`, folha) e
muda só a camada de cima:

- **Seletor de destino** com 3 tipos. O usuário escolhe Obra (dropdown de obras),
  Empresa, ou Equipamento (dropdown de equipamentos). O sistema resolve internamente o
  `centro_custo_id` correspondente (raiz da obra / centro Escritório Central / nó do
  equipamento sob Manutenção).
- Some o editor de árvore (aba Centros de custo) e a criação de nós Etapa/Item.
- `oc_itens.deposito_id` é removido (era do estoque).
- Um helper único (`lib` ou módulo compartilhado) faz o mapeamento destino ↔
  `centro_custo_id` nos dois sentidos, para o formulário e para a exibição.

Vantagem: RH, rateio e relatórios que já leem `centro_custo_id` continuam funcionando
sem reescrita.

## 5. Fluxos

### 5.1 Compras
- **Cotações:** sem mudança de comportamento; perde só o vínculo com Pedidos (removido).
- **OC:** fornecedor, data, itens (insumo, quantidade, preço, destino de custo por
  item), observações, anexos. Status: rascunho → pendente_aprovação →
  aprovado/rejeitado, e cancelado. Some `recebido_parcial`/`recebido` (não há mais
  recebimento).
- **Aprovar** (permissão `compras.ordens.aprovar`): muda status para aprovado e **não
  gera lançamento**. A RPC atual que gera lançamento previsto é removida/alterada.
- **Gerar lançamento:** botão visível na OC aprovada para quem tem
  `financeiro.lancamentos.criar`. Abre o formulário do lançamento a pagar já preenchido
  (fornecedor, valor total dos itens, rateio de destino somado por item). O operador
  define a **forma de pagamento** e as parcelas, e confirma. Um lançamento por OC.
  Bloqueia gerar um segundo lançamento para a mesma OC.

### 5.2 Financeiro: lançamento
- Campos: tipo (a_pagar / a_receber), fornecedor (a_pagar) ou cliente (a_receber),
  descrição, valor, competência, **forma de pagamento**, **parcelas** (número +
  vencimento, o vencimento é o agendamento), **rateios** (destino + valor, soma = valor),
  categoria financeira, anexos.
- Origem a_pagar: da OC (botão) ou avulso.
- Origem a_receber: NF emitida atrelada a uma obra, ou recebimento avulso (aba Contas a
  receber). Remove a coluna/relação de origem "fatura".
- Forma de pagamento nova coluna em `lancamentos`. Determina se as parcelas precisam de
  autorização.
- Forma de pagamento e a regra de autorização valem só para **a_pagar**. O **a_receber**
  controla recebimento (baixa da parcela recebida) e não passa por fila de autorização.

### 5.3 Financeiro: agendamento, autorização e pagamento
- As parcelas do lançamento são o agendamento (cada uma com vencimento).
- **Dinheiro e cartão:** a parcela pode ser paga direto por quem tem
  `financeiro.pagamentos.criar`, sem passar pela fila.
- **PIX, transferência, boleto, cheque:** a parcela entra na fila de **Aprovação de
  pagamentos**. Só depois de autorizada (`financeiro.aprovacao-pagamentos.aprovar`) pode
  ser paga.
- **Pagar** (drawer atual, estendido): conta bancária + data + **anexo de comprovante**
  (todos os tipos). Registra o pagamento na parcela.
- A regra de "precisa de autorização" é derivada da forma de pagamento do lançamento,
  gravada na parcela no momento da geração para a fila ler sem recalcular.

### 5.4 Contas a receber
- Vira criação de lançamento a_receber avulso: cliente, NF/descrição, valor, obra
  (destino), parcelas de recebimento. Some qualquer geração automática a partir de
  fatura de medição.

## 6. RH: rateio da folha

- Ao gerar/fechar a folha de uma competência, o custo de cada colaborador é **rateado
  automaticamente** entre os destinos apontados no mês, proporcional aos dias/horas de
  apontamento (`rh_apontamentos` / `rh_pontos`).
- Exemplo: 12 dias na obra A e 8 na obra B → rateio 60% / 40%.
- Fallback: colaborador sem apontamento no mês → 100% Empresa (escritório central).
- O lançamento a pagar gerado pela folha usa o mesmo modelo de `lancamento_rateios` com
  os destinos resolvidos. Substitui o comportamento atual de "centro de custo da obra
  mais apontada".
- Diárias: cada diária já tem o apontamento do dia, então rateia para a obra daquele dia.
- Adiantamentos: destino Empresa por padrão (é adiantamento ao colaborador, não custo de
  obra), ajustável no acerto.

## 7. Permissões (`config/recursos.ts`)

- Remover os recursos de: estoque.*, manutencao.*, medicao.*, gestao.*,
  cadastros.orcamentos, cadastros.depositos, cadastros.centros-custo, compras.pedidos,
  compras.recebimentos, compras.painel.
- Remover os módulos Estoque, Manutenção, Medição, Gestão de `MODULOS`.
- Manter: compras.cotacoes, compras.ordens; todo o financeiro.*; todo o rh.*;
  cadastros.obras/fornecedores/insumos/equipamentos/clientes/unidades/categorias/
  colaboradores; todo administracao.*.
- Autorizar pagamento = `financeiro.aprovacao-pagamentos` (existente). Aprovar OC =
  `compras.ordens.aprovar` (existente). Sem recurso novo.
- Os perfis semeados que referenciam recursos removidos precisam de limpeza para não
  apontar para recurso inexistente.

## 8. Anexos

- Reaproveitar a tabela `anexos` e o bucket de Storage já usados por Compras (registro
  por `tabela` + `registro_id`, permissão pelo recurso dono).
- Estender o mapa de tabela → recurso (hoje em `compras/_shared/anexos-recurso.ts`) para
  incluir os alvos do financeiro: `lancamentos` (recurso `financeiro.lancamentos`) e a
  parcela paga em `lancamento_parcelas` (recurso `financeiro.pagamentos`) para o
  comprovante. Manter `ordens_compra` (recurso `compras.ordens`).
- Liberar **todos os tipos de arquivo** (revisar e remover qualquer whitelist de MIME no
  componente/validação de anexo).
- O componente de anexos vira compartilhado (sai de dentro de Compras para um lugar
  neutro), já que Financeiro e Compras passam a usá-lo.

## 9. Migração e dados

Migração versionada em `supabase/migrations/`, em ordem segura de FK. Passos:

1. **Desamarrar Medição do Financeiro:** remover a relação/coluna de origem "fatura" em
   `lancamentos` (e qualquer FK para `faturas`).
2. **Zerar transacional:** truncar (respeitando FK) OCs e itens, cotações e itens,
   pedidos e itens, recebimentos e itens, lançamentos + parcelas + rateios, pagamentos,
   extratos/transações OFX, medições/itens/anexos, planilhas contratuais/itens, faturas,
   estoque (movimentos/camadas/saldos/mínimos/abastecimentos), OS
   (peças/mão de obra/terceiros/transições), checklists e execuções, planos preventivos e
   atividades, leituras de equipamento, orçamentos e itens. Auditoria e sequências de
   documento zeradas/reiniciadas conforme fizer sentido.
3. **Dropar tabelas** dos módulos mortos: estoque (abastecimentos, estoque_camadas,
   estoque_minimos, estoque_movimentos, estoque_saldos, depositos, leituras_equipamento),
   manutenção (checklists, checklist_perguntas, checklist_respostas, checklist_execucoes,
   planos_preventivos, plano_atividades, equipamento_planos, ordens_servico, os_pecas,
   os_mao_obra, os_terceiros, os_transicoes), medição (planilhas_contratuais,
   planilha_itens, medicoes, medicao_itens, medicao_anexos, faturas), orçamentos
   (orcamentos, orcamento_itens), compras (pedidos, pedido_itens, recebimentos,
   recebimento_itens).
4. **Alterar tabelas que ficam:** `lancamentos` ganha `forma_pagamento`;
   `lancamento_parcelas` ganha marcador de "exige autorização" (derivado da forma);
   `oc_itens` perde `deposito_id`; ajustar o check de status da OC (remover
   recebido_parcial/recebido).
5. **Trocar/remover a RPC** de aprovação de OC (não gerar lançamento) e criar a
   função/action de "gerar lançamento a partir da OC".
6. **Ajustar a geração da folha** para produzir rateio por apontamento.
7. Rodar advisors do Supabase (security + performance) e corrigir o que aparecer.
8. RLS, grants explícitos e auditoria mantidos em tudo que fica; nada de tabela sem
   política.

Cuidado: `centros_custo` **não** é dropada nem zerada (é encanamento). Confirmar que os
nós de obra/empresa/equipamento existentes continuam válidos após a limpeza.

## 10. Fora de escopo

- Nenhuma tela nova de negócio além das mudanças acima.
- Sem mexer em Conciliação OFX, Relatórios, Categorias e Contas bancárias além do que a
  remoção de módulos e o novo destino de custo exigirem.
- Sem multiempresa, sem PDF novo, sem export novo.

## 11. Riscos e pontos de atenção

- **FK de Medição → Financeiro:** dropar `faturas`/`medicoes` sem desamarrar o
  `lancamentos` antes quebra a migração. Passo 1 resolve.
- **Perfis apontando para recurso removido:** limpar `perfil_permissoes` /
  `usuario_permissoes` das linhas de recursos que somem, senão a matriz de permissões
  mostra lixo.
- **Rotas órfãs:** garantir que as rotas dos módulos removidos não fiquem acessíveis por
  URL (remover as pastas de `app/(app)/...`).
- **Folha rateada:** apontamento incompleto joga custo pra Empresa; validar com dado real
  antes de confiar no número.
- **Ordem do drop:** montar a migração respeitando dependências (itens antes dos pais,
  desamarrar FKs antes de dropar).

## 12. Definição de pronto

- `tsc --noEmit`, lint e build passando. Sem `any` novo, sem `console.log`.
- Menu mostra só Compras, Financeiro, RH, Cadastros e Administração. Módulos removidos
  fora do menu e sem rota acessível.
- OC aprovada mostra Gerar lançamento; lançamento nasce da OC com a forma escolhida.
- Dinheiro/cartão pagam sem passar pela fila; PIX/transferência/boleto/cheque só pagam
  depois de autorizados.
- Destino de custo de 3 tipos com rateio funcionando em OC, lançamento e folha.
- Anexo de qualquer tipo em OC, lançamento e comprovante de pagamento.
- Folha rateia pelos apontamentos; fallback Empresa testado.
- RLS testada (usuário sem permissão não vê e não muta). Auditoria gravando.
- Advisors do Supabase sem achado novo relevante.
- Funciona no preview da Vercel antes de pedir validação do Tiago.
