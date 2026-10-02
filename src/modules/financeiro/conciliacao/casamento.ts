/**
 * Motor de casamento da conciliação: decide qual movimento do extrato é qual
 * parcela ou transferência do app. Módulo puro (sem banco, sem React), testado
 * em `casamento.test.ts`.
 *
 * O que o extrato real do BB 102.124-9 de 09/2026 ensinou (508 movimentos):
 * - 415 casam por valor exato no MESMO dia. Valor e dia são o critério.
 * - 67 desses têm mais de uma parcela com o mesmo valor no mesmo dia (folha,
 *   diárias, PIX de valor redondo). Quem desempata é o nome do favorecido, que
 *   o banco escreve no histórico: "PIX - ENVIADO - 01/09 19:22 JOSE AUGUSTO DA
 *   SILVA PRA" (o nome vem cortado, então o último pedaço casa por prefixo).
 * - Dois boletos divergem em R$ 0,01 da parcela. Isso NUNCA casa sozinho: vira
 *   sugestão com a diferença à vista, e quem concilia decide ajustar.
 *
 * O automático só casa o que não muda nada na parcela (paga, nesta conta,
 * valor exato). Trocar conta, dar baixa em parcela aberta ou ajustar centavo
 * fica para a pessoa, pela sugestão.
 */

export type Sentido = "credito" | "debito";

/** Movimento do extrato ainda sem par. `valor` vem com sinal, como no OFX. */
export interface MovimentoCasavel {
  id: string;
  dataMovimento: string;
  valor: number;
  memo: string | null;
}

/** De onde vem o candidato: decide o que o casamento faz com ele. */
export type GrupoCandidato =
  /** Parcela paga nesta conta: só vincula. */
  | "paga_na_conta"
  /** Parcela paga em outra conta: muda a conta e vincula. */
  | "paga_outra_conta"
  /** Parcela ainda não paga: dá baixa na data do movimento e vincula. */
  | "aberta"
  /** Lado livre de uma transferência entre contas. */
  | "transferencia";

export interface CandidatoCasavel {
  especie: "parcela" | "transferencia";
  grupo: GrupoCandidato;
  id: string;
  /** Data de pagamento, vencimento (aberta) ou da transferência. */
  data: string;
  /** Valor em módulo, como o banco debitou/creditou (líquido da parcela). */
  valor: number;
  sentido: Sentido;
  /** Nomes que podem aparecer no histórico (fantasia, razão social, descrição). */
  nomes: (string | null)[];
}

export interface ParCasado {
  transacaoId: string;
  especie: "parcela" | "transferencia";
  alvoId: string;
  dias: number;
  nomeBate: boolean;
  /** Casou sem o nome confirmar e havia outro candidato possível: vale olhar. */
  confira: boolean;
}

export interface Sugestao<C extends CandidatoCasavel = CandidatoCasavel> {
  candidato: C;
  /** Valor do banco menos valor do app (positivo: banco saiu/entrou mais). */
  diferenca: number;
  dias: number;
  nomeBate: boolean;
}

/** Janela do automático: o banco às vezes compensa no dia útil seguinte. */
export const JANELA_AUTOMATICA_DIAS = 3;
/** Janela das sugestões manuais. */
export const JANELA_SUGESTAO_DIAS = 7;
/** Diferença máxima que aparece como sugestão de ajuste (centavos de boleto). */
export const TOLERANCIA_SUGESTAO = 1;

/**
 * Palavras que aparecem no histórico do banco ou em razão social e não
 * identificam ninguém. Sem tirá-las, "PAGAMENTO DE BOLETO - X LTDA" bateria com
 * qualquer outro boleto de qualquer LTDA.
 */
const PALAVRAS_VAZIAS = new Set([
  "PIX", "ENVIADO", "RECEBIDO", "PAGAMENTO", "PAGTO", "BOLETO", "TED", "DOC",
  "TRANSF", "TRANSFERENCIA", "ELETR", "DISPONIV", "ENVIADA", "RECEBIDA", "TARIFA",
  "LTDA", "EIRELI", "ME", "EPP", "SA", "S/A", "CIA", "COMERCIO", "SERVICOS",
  "DE", "DA", "DO", "DAS", "DOS", "E", "EM", "PARA", "COM", "REFERENTE", "REF",
  "AUTO", "ATEND", "VIA", "CONTA", "BB", "BANCO", "BRASIL",
]);

/** Tira acento, caixa e pontuação, e quebra em palavras que identificam. */
export function palavrasDoNome(texto: string | null | undefined): string[] {
  if (!texto) return [];
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(
      (palavra) =>
        palavra.length >= 3 && !/^\d+$/.test(palavra) && !PALAVRAS_VAZIAS.has(palavra),
    );
}

/**
 * Quantas palavras do histórico aparecem num dos nomes do candidato. A palavra
 * do histórico casa se for igual ou se for PREFIXO de uma palavra do nome (o
 * banco corta o nome: "SILVA PRA" de "SILVA PRADO").
 */
export function palavrasEmComum(
  memo: string | null,
  nomes: readonly (string | null)[],
): number {
  const doMemo = palavrasDoNome(memo);
  if (doMemo.length === 0) return 0;
  const doNome = new Set(nomes.flatMap((nome) => palavrasDoNome(nome)));
  if (doNome.size === 0) return 0;
  let comum = 0;
  for (const palavra of doMemo) {
    if (doNome.has(palavra)) {
      comum += 1;
      continue;
    }
    for (const candidata of doNome) {
      if (candidata.startsWith(palavra) || palavra.startsWith(candidata)) {
        comum += 1;
        break;
      }
    }
  }
  return comum;
}

/** Diferença em dias entre duas datas yyyy-MM-dd, em módulo. */
export function diasEntre(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ms)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round(ms / 86_400_000));
}

function centavos(valor: number): number {
  return Math.round(Math.abs(valor) * 100);
}

function sentidoDo(movimento: MovimentoCasavel): Sentido {
  return movimento.valor >= 0 ? "credito" : "debito";
}

/**
 * Casamento automático: só valor EXATO, mesmo sentido, dentro da janela, e só
 * com parcela paga nesta conta ou transferência (os grupos que não mudam nada
 * no app). Cada candidato casa com um movimento só.
 *
 * Ordem de preferência entre os pares possíveis: o nome que bate pesa mais que
 * a data (dois PIX de R$ 1.499,43 no mesmo dia só se separam pelo nome), e
 * entre iguais vale a data mais próxima. Atribuição gulosa pelos melhores
 * pares primeiro, que para este tamanho (centenas) é exata o bastante e
 * previsível para quem confere.
 */
export function casarAutomaticamente(
  movimentos: readonly MovimentoCasavel[],
  candidatos: readonly CandidatoCasavel[],
  janelaDias: number = JANELA_AUTOMATICA_DIAS,
): ParCasado[] {
  const elegiveis = candidatos.filter(
    (c) => c.grupo === "paga_na_conta" || c.grupo === "transferencia",
  );

  const porValor = new Map<string, CandidatoCasavel[]>();
  for (const candidato of elegiveis) {
    const chave = `${candidato.sentido}:${centavos(candidato.valor)}`;
    const lista = porValor.get(chave);
    if (lista) lista.push(candidato);
    else porValor.set(chave, [candidato]);
  }

  interface Possivel {
    movimento: MovimentoCasavel;
    candidato: CandidatoCasavel;
    dias: number;
    nome: number;
    ordem: number;
  }
  const possiveis: Possivel[] = [];
  const opcoesPorMovimento = new Map<string, number>();
  movimentos.forEach((movimento, ordem) => {
    const chave = `${sentidoDo(movimento)}:${centavos(movimento.valor)}`;
    const lista = porValor.get(chave) ?? [];
    let opcoes = 0;
    for (const candidato of lista) {
      const dias = diasEntre(candidato.data, movimento.dataMovimento);
      if (dias > janelaDias) continue;
      opcoes += 1;
      possiveis.push({
        movimento,
        candidato,
        dias,
        nome: palavrasEmComum(movimento.memo, candidato.nomes),
        ordem,
      });
    }
    opcoesPorMovimento.set(movimento.id, opcoes);
  });

  possiveis.sort(
    (a, b) =>
      Number(b.nome > 0) - Number(a.nome > 0) ||
      a.dias - b.dias ||
      b.nome - a.nome ||
      a.ordem - b.ordem ||
      a.candidato.data.localeCompare(b.candidato.data),
  );

  const movimentoUsado = new Set<string>();
  const candidatoUsado = new Set<string>();
  const pares: ParCasado[] = [];
  for (const possivel of possiveis) {
    if (movimentoUsado.has(possivel.movimento.id)) continue;
    const chaveCandidato = `${possivel.candidato.especie}:${possivel.candidato.id}`;
    if (candidatoUsado.has(chaveCandidato)) continue;
    movimentoUsado.add(possivel.movimento.id);
    candidatoUsado.add(chaveCandidato);
    const nomeBate = possivel.nome > 0;
    pares.push({
      transacaoId: possivel.movimento.id,
      especie: possivel.candidato.especie,
      alvoId: possivel.candidato.id,
      dias: possivel.dias,
      nomeBate,
      confira:
        !nomeBate &&
        ((opcoesPorMovimento.get(possivel.movimento.id) ?? 0) > 1 ||
          possivel.dias > 0),
    });
  }
  return pares;
}

/**
 * Sugestões para o casamento manual de UM movimento, de todos os grupos, em
 * ordem de quem concilia escolheria: valor exato antes de valor com diferença,
 * nome que bate, data mais próxima, e entre iguais o que muda menos no app
 * (paga na conta, transferência, outra conta, aberta).
 */
export function sugerirParaMovimento<C extends CandidatoCasavel>(
  movimento: MovimentoCasavel,
  candidatos: readonly C[],
  {
    janelaDias = JANELA_SUGESTAO_DIAS,
    janelaAbertaDias = 45,
    tolerancia = TOLERANCIA_SUGESTAO,
  }: { janelaDias?: number; janelaAbertaDias?: number; tolerancia?: number } = {},
): Sugestao<C>[] {
  const sentido = sentidoDo(movimento);
  const banco = centavos(movimento.valor);
  const peso: Record<GrupoCandidato, number> = {
    paga_na_conta: 0,
    transferencia: 1,
    paga_outra_conta: 2,
    aberta: 3,
  };

  return candidatos
    .filter((candidato) => candidato.sentido === sentido)
    .map((candidato) => ({
      candidato,
      diferenca: (banco - centavos(candidato.valor)) / 100,
      dias: diasEntre(candidato.data, movimento.dataMovimento),
      nomeBate: palavrasEmComum(movimento.memo, candidato.nomes) > 0,
    }))
    .filter((sugestao) => {
      const janela =
        sugestao.candidato.grupo === "aberta" ? janelaAbertaDias : janelaDias;
      if (sugestao.dias > janela) return false;
      // Diferença só se oferece para parcela: transferência casa no valor exato.
      const limite = sugestao.candidato.especie === "transferencia" ? 0 : tolerancia;
      return Math.abs(sugestao.diferenca) <= limite + 1e-9;
    })
    .sort(
      (a, b) =>
        Number(a.diferenca !== 0) - Number(b.diferenca !== 0) ||
        Number(b.nomeBate) - Number(a.nomeBate) ||
        a.dias - b.dias ||
        peso[a.candidato.grupo] - peso[b.candidato.grupo],
    );
}

/**
 * Histórico que o banco usa para a aplicação/resgate automático. Movimento
 * assim não é despesa nem receita: é transferência para a subconta de
 * investimentos, e a tela oferece esse caminho primeiro.
 */
export function pareceAplicacaoAutomatica(memo: string | null): boolean {
  if (!memo) return false;
  const texto = memo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  return (
    texto.includes("RENDE FACIL") ||
    texto.includes("APLICACAO") ||
    texto.includes("RESGATE")
  );
}
