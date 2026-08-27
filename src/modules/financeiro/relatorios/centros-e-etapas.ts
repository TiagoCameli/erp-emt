import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";

/**
 * A escolha de centro de custo nos relatórios, em DOIS campos: a raiz num, a
 * etapa no outro.
 *
 * ## Por que dois campos, e não uma lista só
 *
 * Um campo só foi o que existiu entre 27/08/2026 de manhã e a tarde do mesmo dia,
 * e o Tiago pegou na primeira olhada: das 76 opções, 61 eram etapas da MESMA raiz
 * ("Manutenção/Documentação de Equipamentos"), e o rótulo carregava o nome do pai
 * para desempatar. Num seletor de 13rem, isso desenha sessenta e uma linhas
 * idênticas — "Manutenção/Docume…" — e o nome que distingue uma da outra fica
 * depois do corte. A lista tinha a informação certa e mostrava a errada.
 *
 * Com dois campos, a lista de cima volta a ter 15 linhas legíveis (uma por raiz) e
 * o nome do equipamento vira o começo da linha do segundo campo, onde há espaço
 * para ele. É a mesma escada que o formulário de rateio já usa desde sempre (ver
 * `_shared/centro-custo/queries.ts`): centro e depois etapa.
 *
 * ## O segundo campo só existe quando há o que escolher
 *
 * Ele aparece quando alguma raiz escolhida TEM etapa, e some quando não tem. Hoje
 * só duas raízes têm filhos (Manutenção, com 61, e Empréstimos, com 6 — e essa
 * saiu dos relatórios operacionais em 27/08/2026), então um campo fixo ficaria
 * vazio e inerte na esmagadora maioria das aberturas da tela.
 *
 * ## Etapa escolhida SUBSTITUI a raiz na consulta
 *
 * `centrosEfetivos` é a tradução da tela para o banco, e a regra é: quem escolheu
 * etapa está pedindo aquele recorte, não o centro inteiro mais ele. Escolher
 * "Manutenção" e dentro dela dois equipamentos manda os dois equipamentos, e não
 * a raiz — que traria as outras 59 máquinas junto e faria o número contradizer o
 * filtro que a pessoa acabou de montar.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** Uma opção pronta para o `FiltroSelectMulti`. */
export interface OpcaoDeFiltro {
  valor: string;
  rotulo: string;
}

/** Nome de exibição do centro: com o código na frente quando ele existe. */
function rotuloDoCentro(centro: CentroCustoOpcao): string {
  return centro.codigo ? `${centro.codigo} · ${centro.nome}` : centro.nome;
}

/** Só as raízes, na ordem em que o cadastro veio. */
export function raizesDoCadastro(
  centros: readonly CentroCustoOpcao[],
): CentroCustoOpcao[] {
  return centros.filter((centro) => centro.paiId === null);
}

/** As opções do primeiro campo: uma linha por raiz. */
export function opcoesDeRaiz(
  centros: readonly CentroCustoOpcao[],
): OpcaoDeFiltro[] {
  return raizesDoCadastro(centros).map((centro) => ({
    valor: centro.id,
    rotulo: rotuloDoCentro(centro),
  }));
}

/** As etapas das raízes escolhidas, na ordem do cadastro. */
export function etapasDasRaizes(
  centros: readonly CentroCustoOpcao[],
  raizesEscolhidas: readonly string[],
): CentroCustoOpcao[] {
  if (raizesEscolhidas.length === 0) return [];
  const escolhidas = new Set(raizesEscolhidas);
  return centros.filter(
    (centro) => centro.paiId !== null && escolhidas.has(centro.paiId),
  );
}

/**
 * As opções do segundo campo.
 *
 * O nome do pai entra no rótulo SÓ quando duas raízes com etapa estão escolhidas
 * ao mesmo tempo. Com uma raiz só — que é o caso de toda abertura normal da tela —
 * o prefixo seria a mesma palavra repetida em todas as linhas, que é exatamente o
 * defeito que este campo veio consertar.
 */
export function opcoesDeEtapa(
  centros: readonly CentroCustoOpcao[],
  raizesEscolhidas: readonly string[],
): OpcaoDeFiltro[] {
  const etapas = etapasDasRaizes(centros, raizesEscolhidas);
  const paisComEtapa = new Set(etapas.map((etapa) => etapa.paiId));
  const nomePorId = new Map(centros.map((centro) => [centro.id, centro.nome]));

  return etapas.map((etapa) => ({
    valor: etapa.id,
    rotulo:
      paisComEtapa.size > 1
        ? `${nomePorId.get(etapa.paiId ?? "") ?? "?"} › ${rotuloDoCentro(etapa)}`
        : rotuloDoCentro(etapa),
  }));
}

/**
 * Como o segundo campo se chama, pelo tipo das raízes que têm etapa.
 *
 * Etapa de obra e equipamento de manutenção são a MESMA coisa no schema e coisas
 * diferentes na boca de quem preenche. O tipo mora na raiz (o CHECK do banco
 * exige nulo nos níveis de baixo), então é dela que o nome sai.
 */
export function rotuloDasEtapas(
  centros: readonly CentroCustoOpcao[],
  raizesEscolhidas: readonly string[],
): { rotulo: string; todos: string } {
  const etapas = etapasDasRaizes(centros, raizesEscolhidas);
  const tipoPorId = new Map(centros.map((centro) => [centro.id, centro.tipo]));
  const tipos = new Set(
    etapas.map((etapa) => tipoPorId.get(etapa.paiId ?? "") ?? null),
  );

  if (tipos.size === 1 && tipos.has("manutencao")) {
    return { rotulo: "Equipamentos", todos: "Todos os equipamentos" };
  }
  return { rotulo: "Etapas", todos: "Todas as etapas" };
}

/** Há segundo campo a mostrar? */
export function temEtapasParaEscolher(
  centros: readonly CentroCustoOpcao[],
  raizesEscolhidas: readonly string[],
): boolean {
  return etapasDasRaizes(centros, raizesEscolhidas).length > 0;
}

/**
 * As etapas que continuam de pé depois de mexer nas raízes.
 *
 * Desmarcar a raiz apaga as etapas dela na MESMA navegação. Sem isso, o
 * `etapa=<uuid>` ficaria pendurado na URL, invisível (o campo some junto com a
 * raiz) e vivo: bastaria remarcar a raiz meia hora depois para o relatório voltar
 * recortado por um equipamento que ninguém lembra de ter escolhido.
 */
export function etapasValidas(
  centros: readonly CentroCustoOpcao[],
  raizesEscolhidas: readonly string[],
  etapasEscolhidas: readonly string[],
): string[] {
  const oferecidas = new Set(
    etapasDasRaizes(centros, raizesEscolhidas).map((etapa) => etapa.id),
  );
  return etapasEscolhidas.filter((id) => oferecidas.has(id));
}

/**
 * O que vai ao banco: para cada raiz escolhida, ela mesma OU as etapas dela que
 * foram escolhidas.
 *
 * A raiz sai da lista quando alguma etapa dela entra. As duas RPCs que recebem
 * isto (`fn_rel_custo_receita` e `fn_rel_custo_centro_custo`) agrupam pelo centro
 * escolhido mais fundo, então mandar raiz e etapa juntas devolveria DUAS linhas —
 * o equipamento e um "Manutenção/Documentação de Equipamentos" com as outras 59
 * máquinas dentro. Quem escolheu a etapa não pediu as outras.
 *
 * Etapa órfã (a raiz saiu da escolha) é descartada aqui também, e não só na tela:
 * esta função é a última porta antes do banco, e um link colado à mão não passa
 * pela tela.
 */
export function centrosEfetivos(
  centros: readonly CentroCustoOpcao[],
  raizesEscolhidas: readonly string[],
  etapasEscolhidas: readonly string[],
): string[] {
  if (raizesEscolhidas.length === 0) return [];

  const paiPorEtapa = new Map(
    centros
      .filter((centro) => centro.paiId !== null)
      .map((centro) => [centro.id, centro.paiId as string]),
  );

  const etapasPorRaiz = new Map<string, string[]>();
  for (const etapa of etapasEscolhidas) {
    const pai = paiPorEtapa.get(etapa);
    if (pai === undefined || !raizesEscolhidas.includes(pai)) continue;
    const lista = etapasPorRaiz.get(pai);
    if (lista) lista.push(etapa);
    else etapasPorRaiz.set(pai, [etapa]);
  }

  return raizesEscolhidas.flatMap((raiz) => etapasPorRaiz.get(raiz) ?? [raiz]);
}
