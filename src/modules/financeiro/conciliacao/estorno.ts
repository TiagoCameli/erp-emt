/**
 * Estorno na conciliação (Tiago, 05/10/2026): PIX rejeitado, TED devolvida e
 * boleto devolvido não são lançamento. O banco tirou e devolveu; o envio casa
 * com a devolução no próprio extrato e nada vai para o financeiro.
 *
 * Módulo puro, testado em `estorno.test.ts`. Regras:
 * - devolução é o movimento cujo histórico diz REJEITADO, DEVOLVIDO(A),
 *   ESTORNO ou RECUSADO;
 * - o envio tem o sentido oposto, o mesmo valor, a mesma espécie (TED com
 *   TED, PIX com PIX, boleto com boleto) e sai até 10 dias antes (ou no
 *   mesmo dia);
 * - quando o histórico traz a hora ("PIX - REJEITADO - 07/02 12:58"), o envio
 *   é o último até ela (no mesmo minuto vale), no máximo 30 minutos antes. Caso real: rejeição
 *   às 12:58 e envios de R$ 360,00 às 12:55, 12:57 e 16:27; o das 16:27 é
 *   outro pagamento, o rejeitado é o das 12:57;
 * - quando o histórico traz o nome (PIX-ENVIO DEVOLVIDO - JEFERSON), só vale
 *   envio com o nome;
 * - sem hora, casa sozinho com UM envio possível, ou com envios
 *   indistinguíveis (mesmo histórico): aí qualquer escolha dá o mesmo
 *   resultado;
 * - o resto fica como sugestão para quem concilia.
 */

import {
  casarAutomaticamente,
  diasEntre,
  nomeConfere,
  palavrasDoNome,
  type CandidatoCasavel,
  type MovimentoCasavel,
  type ParCasado,
} from "@/modules/financeiro/conciliacao/casamento";

/** Distância máxima, em dias, entre o envio e a devolução. */
export const JANELA_ESTORNO_DIAS = 10;

/** Com hora no histórico: o envio sai no máximo isso antes da rejeição. */
export const JANELA_ESTORNO_MINUTOS = 30;

export interface ParEstorno {
  /** A devolução. */
  transacaoId: string;
  /** O envio que voltou. */
  parId: string;
}

function normalizar(memo: string | null): string {
  return (memo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

export type EspecieMovimento = "pix" | "ted" | "boleto" | "outro";

/**
 * A espécie do movimento pelo histórico (Bloco L): devolução só casa com
 * envio da mesma espécie. Caso real: TED de R$ 2.000,00 devolvida em
 * 29/08/2025 disputando com dois PIX do mesmo valor.
 */
export function especieDoMovimento(memo: string | null): EspecieMovimento {
  const texto = normalizar(memo).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (/\bBOLETO\b/.test(texto)) return "boleto";
  if (/^TED\b/.test(texto) || /\bTED DEVOLVIDA\b/.test(texto)) return "ted";
  if (/\bPIX\b/.test(texto)) return "pix";
  return "outro";
}

/** O histórico diz que o banco devolveu um movimento anterior. */
export function pareceEstorno(memo: string | null): boolean {
  return /\b(REJEITAD|DEVOLVID|ESTORN|RECUSAD|DEVOLUCAO)/.test(normalizar(memo));
}

/** "dd/mm hh:mm" do histórico do BB, em minutos, com o dia como chave. */
function horaDoHistorico(memo: string | null): { dia: string; minutos: number } | null {
  const m = /(\d{2})\/(\d{2}) (\d{2}):(\d{2})/.exec(memo ?? "");
  if (!m) return null;
  return { dia: `${m[2]}-${m[1]}`, minutos: Number(m[3]) * 60 + Number(m[4]) };
}

/** Palavras que dizem o motivo da devolução, não quem recebeu. */
const PALAVRAS_DO_MOTIVO = new Set([
  "REJEITADO", "DEVOLVIDO", "DEVOLVIDA", "ESTORNO", "RECUSADO",
  "RECUSADA", "DEVOLUCAO", "ERRO", "TEMPO", "EXCEDIDO", "ORDEM", "PSP",
  "EFETUADO", "NAO", "ENVIO", "PELO", "REJEITADA", "AUSENC", "DIVGNC", "IDENTF", "CPF", "CNPJ",
  "CNT", "DEST", "CRED", "INVAL", "DEBITO", "CREDITO",
]);

function nomeDaDevolucao(memo: string | null): string[] {
  return palavrasDoNome(memo).filter((p) => !PALAVRAS_DO_MOTIVO.has(p));
}

function centavos(valor: number): number {
  return Math.round(Math.abs(valor) * 100);
}

/** O histórico sem hora, número e pontuação. */
function chaveDoHistorico(memo: string | null): string {
  return palavrasDoNome(memo).join(" ");
}

/**
 * Envios que podem ter voltado nesta devolução: sentido oposto, mesmo valor,
 * até 10 dias antes. Os mais perto primeiro.
 */
export function enviosPossiveis<M extends MovimentoCasavel>(
  devolucao: MovimentoCasavel,
  movimentos: readonly M[],
): M[] {
  const especie = especieDoMovimento(devolucao.memo);
  return movimentos
    .filter(
      (m) =>
        m.id !== devolucao.id &&
        (especie === "outro" || especieDoMovimento(m.memo) === especie) &&
        Math.sign(m.valor) === -Math.sign(devolucao.valor) &&
        centavos(m.valor) === centavos(devolucao.valor) &&
        !pareceEstorno(m.memo) &&
        m.dataMovimento <= devolucao.dataMovimento &&
        diasEntre(m.dataMovimento, devolucao.dataMovimento) <= JANELA_ESTORNO_DIAS,
    )
    .sort(
      (a, b) =>
        b.dataMovimento.localeCompare(a.dataMovimento) ||
        (b.memo ?? "").localeCompare(a.memo ?? "") ||
        a.id.localeCompare(b.id),
    );
}

function distanciaDeHora(a: MovimentoCasavel, b: MovimentoCasavel): number {
  const ha = horaDoHistorico(a.memo);
  const hb = horaDoHistorico(b.memo);
  if (!ha || !hb || ha.dia !== hb.dia) return Number.MAX_SAFE_INTEGER;
  return Math.abs(ha.minutos - hb.minutos);
}

/**
 * Para o diálogo: qualquer movimento de sentido oposto e mesmo valor a até
 * 10 dias, antes ou depois (o usuário pode começar pelo envio).
 */
export function paresPossiveis<M extends MovimentoCasavel>(
  movimento: MovimentoCasavel,
  movimentos: readonly M[],
): M[] {
  return movimentos
    .filter(
      (m) =>
        m.id !== movimento.id &&
        Math.sign(m.valor) === -Math.sign(movimento.valor) &&
        centavos(m.valor) === centavos(movimento.valor) &&
        diasEntre(m.dataMovimento, movimento.dataMovimento) <= JANELA_ESTORNO_DIAS,
    )
    .sort(
      (a, b) =>
        Number(pareceEstorno(b.memo) !== pareceEstorno(movimento.memo)) -
          Number(pareceEstorno(a.memo) !== pareceEstorno(movimento.memo)) ||
        diasEntre(a.dataMovimento, movimento.dataMovimento) -
          diasEntre(b.dataMovimento, movimento.dataMovimento) ||
        distanciaDeHora(a, movimento) - distanciaDeHora(b, movimento) ||
        a.id.localeCompare(b.id),
    );
}

/**
 * O envio que esta devolução desfez, quando dá para ter certeza. Null deixa
 * para quem concilia.
 */
function envioDaDevolucao(
  devolucao: MovimentoCasavel,
  movimentos: readonly MovimentoCasavel[],
): MovimentoCasavel | null {
  let envios = enviosPossiveis(devolucao, movimentos);
  if (envios.length === 0) return null;

  const nome = nomeDaDevolucao(devolucao.memo);
  if (nome.length > 0) {
    envios = envios.filter((e) => nomeConfere(nome.join(" "), [e.memo]));
    if (envios.length === 0) return null;
  }

  const hora = horaDoHistorico(devolucao.memo);
  if (hora) {
    const antes = envios
      .map((e) => ({ e, h: horaDoHistorico(e.memo) }))
      .filter(
        ({ h }) =>
          h !== null &&
          h.dia === hora.dia &&
          h.minutos <= hora.minutos &&
          hora.minutos - h.minutos <= JANELA_ESTORNO_MINUTOS,
      );
    if (antes.length === 0) return null;
    const ultimo = Math.max(...antes.map(({ h }) => h!.minutos));
    const empatados = antes.filter(({ h }) => h!.minutos === ultimo).map(({ e }) => e);
    const chave = chaveDoHistorico(empatados[0].memo);
    if (!empatados.every((e) => chaveDoHistorico(e.memo) === chave)) return null;
    return empatados[0];
  }

  const chave = chaveDoHistorico(envios[0].memo);
  if (envios.length > 1 && !envios.every((e) => chaveDoHistorico(e.memo) === chave)) return null;
  return envios[0];
}

/**
 * Casamento automático dos estornos. `vizinhos` são movimentos sem par fora
 * do período (o envio de uma devolução do dia 2 pode ser do mês anterior):
 * entram só como envio.
 */
export function casarEstornos(
  movimentos: readonly MovimentoCasavel[],
  vizinhos: readonly MovimentoCasavel[] = [],
): ParEstorno[] {
  const usados = new Set<string>();
  const todos = [...movimentos, ...vizinhos];
  // Na ordem do dia e da hora: duas rejeições seguidas pegam os envios na
  // mesma ordem (11:18 com o das 11:18, 11:21 com o das 11:20).
  const devolucoes = movimentos
    .filter((m) => pareceEstorno(m.memo))
    .sort(
      (a, b) =>
        a.dataMovimento.localeCompare(b.dataMovimento) ||
        (horaDoHistorico(a.memo)?.minutos ?? 0) - (horaDoHistorico(b.memo)?.minutos ?? 0) ||
        a.id.localeCompare(b.id),
    );

  const pares: ParEstorno[] = [];
  for (const devolucao of devolucoes) {
    const envio = envioDaDevolucao(
      devolucao,
      todos.filter((m) => !usados.has(m.id)),
    );
    if (!envio) continue;
    usados.add(envio.id);
    usados.add(devolucao.id);
    pares.push({ transacaoId: devolucao.id, parId: envio.id });
  }
  return pares;
}

/**
 * O automático inteiro: estornos primeiro, depois as regras de parcela e
 * transferência no que sobrou. Devolução que não achou o envio fica fora das
 * regras: um PIX rejeitado nunca é recebimento de cliente.
 */
export function casarTudo(
  movimentos: readonly MovimentoCasavel[],
  vizinhos: readonly MovimentoCasavel[],
  candidatos: readonly CandidatoCasavel[],
): { estornos: ParEstorno[]; pares: ParCasado[] } {
  const estornos = casarEstornos(movimentos, vizinhos);
  const usados = new Set(estornos.flatMap((p) => [p.transacaoId, p.parId]));
  const pares = casarAutomaticamente(
    movimentos.filter((m) => !usados.has(m.id) && !pareceEstorno(m.memo)),
    candidatos,
  );
  return { estornos, pares };
}
