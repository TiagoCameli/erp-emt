# Fase 4: Frete no ERP (desenho)

Plano mestre: `docs/PLANO-FRETE-COMBUSTIVEL-MANUTENCAO.md`, Fase 4. Levantamento da origem em
24/09/2026 (Gestão Obras, só leitura): banco vivo (gatilhos `fn_fretes_movimentos`,
`fn_pagamentos_frete_movimentos`, views `transportadora_saldos` e `transportadora_movimentos_detalhe`)
e telas (`pages/Frete.tsx` e `components/frete/*`). A virada é no mesmo dia da do Combustível: a
conta corrente é uma só.

## Regra geral: igual à origem

Mesmo critério que o Tiago deu para o Combustível ("exatamente igual, so mude o que for
necessario"). Os cálculos da origem:

- **Frete:** `valor_total = peso × km × R$/t·km`, exato (a origem não arredonda);
  `valor_material = peso × preço unitário do material`, zero na transferência.
- **Conta corrente:** o frete (material ou transferência) credita a transportadora pelo
  `valor_total`; o pagamento debita pelo valor; o abastecimento de carreta credita o dono do
  tanque externo e debita a transportadora (Fase 3). Saldo = créditos − débitos; positivo, a EMT
  deve à transportadora.
- **Saldo na pedreira:** Σ quantidade dos pedidos − Σ peso dos fretes de material daquela
  pedreira e daquele material. A transferência não conta.
- **Anomalias F1 a F6** da origem, sem ajuste.

## Decisões do Tiago (24/09)

1. **Ajuste de saldo com aprovação** (plano 4.1): nasce pendente e só entra no saldo aprovado.
   Rejeitar o pendente e desaprovar o aprovado pedem motivo. Editar só o pendente.
2. **Defeitos dos gatilhos da origem corrigidos:** o movimento é refeito inteiro a cada
   gravação. Frete criado sem valor e corrigido depois ganha o crédito; trocar a transportadora
   leva o crédito; a obra do movimento acompanha a do frete.
3. **Os 12 créditos "pagamento estendido em nome de Areacre"** (11 da ETAM, 1 da EMT TRANSPORTES)
   entram como ajustes aprovados soltos, sem ficar presos ao pagamento da Areacre.
4. A falha de segurança da origem (saldo e extrato abertos sem login) foi fechada lá, com
   autorização (Gestão Obras `556dfe9`).

## O que muda por necessidade

- Transportadora, origem e destino viram FK (a origem guarda o nome em texto e casa por
  trigger). A transportadora precisa estar marcada como transportadora ou dona de tanque no
  cadastro, senão o crédito não nasce (na origem nascia sem crédito, calado).
- A localidade ganha o fornecedor da pedreira (`localidades.fornecedor_id`): a origem casa
  "Pedreira Britam" com o fornecedor "Britam" por "contém", e no ERP o fornecedor tem a razão
  social.
- Obra vira centro de custo (raiz da obra), como no resto do ERP.
- Senha para editar e excluir vira permissão; excluir pede motivo e vai para a lixeira do
  módulo (restaurar com `administracao.lixeira/editar` + `excluir` do recurso).
- Anexos no `arquivos` + `anexo_vinculos` (entidades `frete`, `frete_chegada`,
  `frete_pagamento`, `pedido_material`).
- Data do movimento: meio-dia de Rio Branco (a origem usava meio-dia de São Paulo; o dia é o
  mesmo).
- Cadastros (localidade, fornecedor, material) só pelo Cadastros, sem o "+ Nova localidade"
  dentro do formulário.

## Entregas

1. **4a. Banco:** `20260925100000_fase4_frete_banco` + índices, prova
   `supabase/provas/fase4a_frete_banco.sql`.
2. **4b. Telas:** painel, fretes, pedidos de material, conta corrente, pagamentos, ajustes,
   anomalias.
3. **4c. Carga do Frete e do Combustível**, preparada e ensaiada no molde da 2d, com a
   conferência 9.1 (saldo de cada transportadora igual na quarta casa).
4. **Virada das duas no mesmo dia.**
