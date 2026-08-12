# Excluir obras e centros de custo sem nada atrelado — Design

Data: 2026-08-10
Status: implementado e verificado no banco (10/08/2026); falta o clique na tela logada
Autor: Léo (com Tiago)

## Problema

Hoje obra e centro de custo só **desativam** (`ativo = false`). Não existe exclusão. O cadastro
acumula lixo de teste de importação sem forma de limpar: no banco vivo de 10/08/2026 são 16
obras e 18 centros de custo (16 raízes de obra + 2 de sistema), com **zero** etapas, itens,
lançamentos, itens de OC, folha, colaboradores, diárias e pontos. Ou seja, cadastro base
carregado e nada transacional em cima.

O pedido do Tiago: poder excluir obra e centro de custo **desde que nada esteja atrelado**.

## Por que isso ficou de fora da Fase 1

A migration `20260612210004_lixeira_cadastros_e_permissoes.sql` diz explicitamente, no
comentário do topo, que obras, equipamentos e centros de custo **não** entram na allowlist
`fn_recurso_do_cadastro` porque "tem triggers/auto-referencia e na Fase 1 sao apenas
DESATIVADOS". Isso não era preguiça, era um problema real:

**O trigger `trg_obra_cria_centro_custo` faz toda obra nascer com um centro de custo raiz.**

```sql
create trigger trg_obra_cria_centro_custo
  after insert on public.obras
  for each row execute function public.fn_obra_cria_centro_custo();
```

E `centros_custo.obra_id` tem FK para `obras(id)`. Consequência: ao pé da letra do pedido,
**nenhuma obra jamais estaria "sem nada atrelado"** — sempre tem o centro dela pendurado, e a
FK impede o delete. A exclusão genérica pela `fn_excluir_cadastro` falharia sempre, com um
23503 traduzido como "Este registro está em uso", que é uma mentira útil para o usuário.

## Mapa de dependências (banco vivo, 10/08/2026)

Todas as FKs são `NO ACTION`, nenhuma tem cascade.

Apontam para `centros_custo`:

| tabela | coluna |
|---|---|
| `centros_custo` | `pai_id` (auto-referência: filhos) |
| `colaboradores` | `centro_custo_id` |
| `folha_itens` | `centro_custo_id` |
| `lancamentos` | `centro_custo_id` |
| `lancamento_rateios` | `centro_custo_id` |
| `oc_itens` | `centro_custo_id` |

Apontam para `obras`:

| tabela | coluna |
|---|---|
| `centros_custo` | `obra_id` (o centro raiz criado pelo trigger) |
| `colaboradores` | `obra_id` |
| `rh_diarias` | `obra_id` |
| `rh_pontos` | `obra_id` |

Triggers relevantes: `obras` tem `trg_obra_cria_centro_custo` (AFTER INSERT). `centros_custo`
tem só auditoria, `updated_at` e `created_by` — nenhum trigger gerador.

## Decisões fechadas com o Tiago

1. **Obra e centro raiz morrem juntos, numa operação atômica.** É o simétrico do trigger:
   nasceram juntos. Excluir a obra apaga também o centro raiz dela. Só é permitido se o centro
   raiz não tiver filhos e se nada apontar nem para a obra nem para o centro.
2. **Centro de custo só exclui folha, de baixo para cima.** Um nó com filhos não é excluível.
   Para apagar uma etapa com 3 itens, apaga os 3 itens e depois a etapa. Mais cliques, mas
   nenhuma exclusão em massa acidental na espinha dorsal do sistema.
3. **A validação mora no banco**, não na Server Action, senão dá para furar chamando a RPC
   direto.
4. **Uma única entrada na lixeira para o par obra + centro raiz** (ver "Restauração").
5. `alternarAtivo` continua existindo. Excluir é adição, não substituição.

## Regras de exclusão

**Centro de custo é excluível quando todas forem verdade:**

- `sistema = false` (protege Escritório Central e Manutenção)
- `nivel > 1` — nível 1 nunca sai sozinho, porque é ou centro de sistema ou raiz de obra
- zero filhos (`centros_custo.pai_id`)
- zero referências em `colaboradores`, `folha_itens`, `lancamentos`, `lancamento_rateios`,
  `oc_itens`

**Obra é excluível quando todas forem verdade:**

- o centro raiz dela não tem filhos
- zero referências à obra em `colaboradores.obra_id`, `rh_diarias.obra_id`, `rh_pontos.obra_id`
- zero referências ao centro raiz dela nas 5 tabelas acima

Nos dois casos: exige motivo (regra de ouro 7) e a ação `excluir` no recurso
(`cadastros.obras` / `cadastros.centros-custo`). Ambas as permissões já existem para o perfil
Admin desde a migration 11; o Gestor só tem `ver`. Nenhuma migration de permissão é necessária.

## Design

### Banco (uma migration)

A regra fica numa função só, que devolve **NULL quando libera ou um código** quando barra —
não a frase pronta. Motivo: as mensagens em SQL neste repo seguem pt-BR sem acento (885
`raise exception` assim), e a UI precisa de texto acentuado. Com código, a regra vive num lugar
(banco) e o texto noutro (TS), sem duplicar nem estropiar acento.

- `fn_obra_bloqueio(p_id uuid) returns text` e `fn_centro_custo_bloqueio(p_id uuid) returns
  text` — fonte única da regra. Códigos: `nao_encontrado`, `sistema`, `raiz_de_obra`,
  `nivel_1`, `tem_filhos`, `em_uso`, `centro_em_uso`, `centros_duplicados`.

Funções de leitura, para a UI saber **por que** está bloqueado:

- `fn_obra_dependencias(p_id uuid) returns jsonb` — contagens de filhos do centro raiz,
  colaboradores, diárias, pontos, lançamentos, rateios, itens de OC, folha, mais o código de
  bloqueio.
- `fn_centro_custo_dependencias(p_id uuid) returns jsonb` — idem para o nó, mais `sistema` e
  `nivel`.
- `fn_obras_bloqueios(p_ids uuid[] default null)` e
  `fn_centros_custo_bloqueios(p_ids uuid[] default null)` — mapa id → código, em lote, para a
  listagem. Existem porque as queries do app usam o client do Supabase (PostgREST) e não SQL
  cru, então não dá `LEFT JOIN LATERAL`; e chamar a função de dependências por linha seria N+1.
  `p_ids` nulo devolve tudo.

As funções de leitura são `security definer` de propósito: sob RLS o usuário pode não ver
`folha_itens` ou `lancamentos`, a contagem sairia zerada e habilitaria um botão que vai falhar.
Todas exigem a ação `ver` no recurso antes de contar.

Funções de escrita, `security definer`, `set search_path = ''`:

- `fn_excluir_centro_custo(p_id uuid, p_motivo text)`
- `fn_excluir_obra(p_id uuid, p_motivo text)`

Ambas: checam permissão, exigem motivo não vazio, validam as regras e **estouram erro
específico** ("Esta etapa tem 3 itens abaixo dela", "Esta obra tem 2 colaboradores vinculados"),
nunca deixam o 23503 genérico vazar. Gravam snapshot na `lixeira` e deletam. A
`fn_excluir_obra` apaga o centro raiz e depois a obra na mesma transação.

Guarda na porta genérica:

- `fn_excluir_cadastro` passa a **rejeitar** `obras` e `centros_custo` com mensagem apontando
  para as funções específicas. Sem isso, alguém chamaria a RPC genérica e furaria as validações.
- `fn_recurso_do_cadastro` passa a mapear `obras` → `cadastros.obras` e `centros_custo` →
  `cadastros.centros-custo`, porque a restauração usa essa allowlist.

### Restauração (o ponto chato)

Restaurar uma obra reinsere a linha em `obras`, o trigger dispara de novo e **cria um segundo
centro raiz**. Se o centro antigo também fosse reinserido, a obra ficaria com dois.

Solução: **uma única entrada na lixeira**, da tabela `obras`, cujo `dados` é
`to_jsonb(obra) || jsonb_build_object('centro_custo_raiz', to_jsonb(centro))`. O
`jsonb_populate_record` ignora chaves que não são coluna, então o insert da obra continua
funcionando sem tratamento especial.

`fn_restaurar_cadastro` ganha um ramo para `obras`:

1. insere a obra a partir do snapshot (o trigger recria o centro raiz, com `nome` da obra)
2. aplica `codigo`, `orcamento` e `ativo` do snapshot embutido sobre esse centro recém-criado

Sem trigger desabilitado, sem duplicata, e o par volta sempre junto. Custo: o `id` do centro
raiz muda ao restaurar. Isso é inofensivo, porque a exclusão só é permitida quando **nada**
referenciava aquele id.

Centro de custo nível 2/3 restaura pelo caminho genérico, porque `centros_custo` não tem
trigger gerador. Se o pai já tiver sido apagado, a FK barra e vira mensagem amigável.

Consequência de UX aceita pelo Tiago: o diálogo de confirmação lista os dois registros que
serão apagados, mas a lixeira mostra **um item só** ("Obra X, com o centro de custo raiz").

### Aplicação

- `src/modules/cadastros/obras/actions.ts`: `excluirObra(id, motivo)`.
- `src/modules/cadastros/centros-custo/actions.ts`: `excluirNo(id, motivo)`.
  Ambas no formato dos outros cadastros: `exigirPermissao` → RPC → `traduzErroExclusao` →
  `revalidatePath`, retornando `{ ok: true } | { erro: string }`.
- Queries de listagem passam a trazer `podeExcluir` e `motivoBloqueio` por linha, via
  `LEFT JOIN LATERAL` com as contagens. São 16 obras e 18 centros: custo irrelevante.
- UI usa o `ConfirmDialog` canônico, que já tem `variante="destrutivo"` e `exigeMotivo`. O botão
  só aparece com a permissão `excluir` e fica **desabilitado com o motivo no tooltip** quando
  bloqueado. Nível 1 não mostra botão: raiz de obra orienta "exclua pela obra", centro de
  sistema não mostra nada.
- `src/modules/administracao/lixeira/restauravel.ts` passa a incluir `obras` e `centros_custo`.

### Onde a lógica pura fica testável

`src/modules/cadastros/_shared/dependencias.ts`, módulo puro (sem React, sem banco):

- `motivoBloqueioObra(codigo)` e `motivoBloqueioCentroCusto(codigo)` — código → frase pt-BR, ou
  null quando libera. Código desconhecido cai numa frase genérica em vez de quebrar, para o app
  sobreviver a um código novo no banco.
- `codigoBloqueio(mensagem)` — extrai o código da mensagem de erro do Postgres
  (`"... nao pode ser excluida (tem_filhos)"`), para a Server Action traduzir quando a corrida
  perde. Devolve null quando o erro veio de outra causa, e aí a action cai no
  `traduzErroExclusao` de sempre.

Assim a frase existe num lugar só e é reusada pelo item desabilitado do menu, pelo diálogo e
pelo erro da action.

**Onde o motivo aparece na UI:** dentro do próprio menu de ações, como um rótulo abaixo do item
"Excluir" desabilitado — não como `title`/tooltip, que em item de dropdown não é alcançável por
teclado.

## Verificação (executada em 10/08/2026)

O projeto testa regra pura com Vitest (jsdom) e **não tem harness de teste de banco**. Então:

1. **Vitest** em `dependencias.test.ts`, 15 testes: todo código traduz, código desconhecido cai
   no genérico, e `codigoBloqueio` extrai da mensagem do Postgres sem confundir parêntese no
   meio da frase. Suíte cheia: 76 arquivos, 965 testes, tudo passando.
2. **Bateria SQL** no projeto vivo, num bloco que estoura no fim para dar rollback. 12 checagens,
   todas verdes: obra nasce com 1 centro raiz; obra limpa libera; motivo vazio barra; centro raiz
   devolve `raiz_de_obra`; centro de sistema devolve `sistema`; com etapa filha a obra barra;
   etapa folha exclui; a obra depois exclui e leva o centro raiz; a lixeira ganha **uma** entrada
   de `obras` com `centro_custo_raiz` embutido e **nenhuma** separada do centro; restaurar
   devolve a obra com **um** centro raiz, não dois; a porta genérica `fn_excluir_cadastro` barra
   as duas tabelas; usuário sem permissão é barrado pela função. Depois confirmado que o rollback
   não deixou resíduo (16 obras, 18 centros, lixeira 0).
3. **Funções de lote**: 16 e 18 linhas, filtro por `p_ids` funcionando, e os nomes de coluna
   (`obra_id`/`bloqueio`, `centro_custo_id`/`bloqueio`) casando com o que o TS consome.
4. `tsc --noEmit`, `eslint` (zero aviso novo), `vitest`, `next build` passando.
5. **Advisors** comparados antes/depois por `cache_key`: 12 entradas novas, 8 minhas e 4 do
   trabalho de adiantamentos que entrou na `main` no meio. As 8 são todas do mesmo tipo já
   estabelecido no projeto (`authenticated_security_definer_function_executable`), e as 8 checam
   `tem_permissao` na primeira linha. Nenhum tipo novo, nada desapareceu. Performance: só INFO
   pré-existente.

**O que não foi verificado:** o clique na tela logada. As rotas ficam atrás do login e eu não
tenho credencial, então a UI foi validada por compilação (`next build`) e pelos tipos, não por
uso real. Isso o Tiago precisa fazer: abrir /cadastros/obras, conferir que o item "Excluir obra"
aparece habilitado, excluir uma obra de teste, e conferir a lixeira e a restauração.

## Fora de escopo

- **Equipamentos**, que estão no mesmo comentário da migration 11 e têm o mesmo problema de
  trigger (equipamento cria etapa no centro Manutenção). Mesma solução se aplica, mas é outro
  bloco.
- Exclusão de subárvore de centro de custo de uma vez. O Tiago escolheu folha por folha.
- Exclusão em lote de obras.
- Mexer em `ativo`/desativação, que continua como está.

## Risco conhecido

Depois desta entrega, as 16 obras do banco ficam todas excluíveis, porque nenhuma tem custo
atrelado. É exatamente o caso de uso pedido (limpar lixo de importação), mas vale o registro:
o botão vai aparecer habilitado em toda a lista.
