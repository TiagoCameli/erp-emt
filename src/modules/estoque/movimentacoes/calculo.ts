import type { OrigemPosicao } from "@/modules/estoque/queries";

/** O pedaço do movimento que o saldo atual precisa (o tipo completo é server-only). */
export interface MovimentoParaSaldo {
  origem: OrigemPosicao;
  localTipo: "deposito" | "tanque" | "pilha";
  localId: string;
  localNome: string;
  insumoId: string | null;
  insumoNome: string | null;
  unidade: string | null;
  data: string;
  saldo: number;
}

export interface SaldoAtualLinha {
  chave: string;
  origem: OrigemPosicao;
  localTipo: MovimentoParaSaldo["localTipo"];
  localId: string;
  localNome: string;
  insumoNome: string;
  unidade: string | null;
  saldo: number;
  ultimoMovimento: string;
  movimentos: number;
}

/**
 * Chave do saldo: local e insumo; no tanque de combustível, só o tanque (o nível é um só,
 * qualquer que seja o combustível, igual à `fn_comb_estoque_na_data`).
 */
export function chaveDoSaldo(movimento: Pick<MovimentoParaSaldo, "origem" | "localId" | "insumoId">): string {
  const insumo = movimento.origem === "combustivel" ? "tanque" : (movimento.insumoId ?? "vazio");
  return `${movimento.origem}:${movimento.localId}:${insumo}`;
}

/**
 * Saldo atual de cada local a partir do extrato. Recebe os movimentos do mais novo para o mais
 * velho (a ordem da lista): o primeiro de cada chave carrega o saldo de agora.
 */
export function saldosAtuais(movimentos: readonly MovimentoParaSaldo[]): SaldoAtualLinha[] {
  const porChave = new Map<string, SaldoAtualLinha>();
  for (const movimento of movimentos) {
    const chave = chaveDoSaldo(movimento);
    const existente = porChave.get(chave);
    if (existente) {
      existente.movimentos += 1;
      // O tanque esvaziado tem o esvaziamento sem combustível: vale o último que tinha.
      if (existente.insumoNome === "" && movimento.insumoNome) existente.insumoNome = movimento.insumoNome;
      continue;
    }
    porChave.set(chave, {
      chave,
      origem: movimento.origem,
      localTipo: movimento.localTipo,
      localId: movimento.localId,
      localNome: movimento.localNome,
      insumoNome: movimento.insumoNome ?? "",
      unidade: movimento.unidade,
      saldo: movimento.saldo,
      ultimoMovimento: movimento.data,
      movimentos: 1,
    });
  }
  return [...porChave.values()]
    .map((linha) =>
      // Tanque de combustível zerado está vazio, não "com o último diesel".
      linha.origem === "combustivel" && linha.saldo === 0 ? { ...linha, insumoNome: "Vazio" } : linha,
    )
    .sort(
      (a, b) => a.localNome.localeCompare(b.localNome, "pt-BR") || a.insumoNome.localeCompare(b.insumoNome, "pt-BR"),
    );
}

export interface ResumoDoLocal {
  entrou: number;
  saiu: number;
  movimentos: number;
}

/** Quanto entrou e saiu nos movimentos dados. A saída volta positiva, para o card. */
export function resumoDoLocal(movimentos: readonly { quantidade: number }[]): ResumoDoLocal {
  let entrou = 0;
  let saiu = 0;
  for (const movimento of movimentos) {
    if (movimento.quantidade > 0) entrou += movimento.quantidade;
    else saiu -= movimento.quantidade;
  }
  return { entrou, saiu, movimentos: movimentos.length };
}
