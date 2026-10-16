import { formatarKm } from "@/modules/mapa/geo";
import { ROTULO_ESTADO } from "@/modules/mapa/tipos";

/**
 * Histórico do Mapa (/mapa/historico): a trilha de `mapa_movimentacoes` como a
 * `fn_mapa_historico` devolve, já com os nomes. Aqui só se decide como cada tipo vira texto
 * de "antes → depois".
 */

export interface MovimentacaoMapa {
  id: number;
  tipo: string;
  alvo: string;
  alvoId: string;
  alvoCodigo: string;
  alvoNome: string;
  dataEfetiva: string;
  criadoEm: string;
  usuarioNome: string;
  motivo: string;
  deObra: string | null;
  paraObra: string | null;
  deLugar: string | null;
  paraLugar: string | null;
  deKm: number | null;
  paraKm: number | null;
  deEstado: string | null;
  paraEstado: string | null;
  dePessoa: string | null;
  paraPessoa: string | null;
  deAcoplado: string | null;
  paraAcoplado: string | null;
  fornecedor: string | null;
  /** Desfeita pelo Histórico (a linha fica, riscada); null = vale. */
  desfeitaEm: string | null;
  desfeitaPorNome: string | null;
  desfeitaMotivo: string | null;
  /** A última que ainda vale da máquina, de um tipo que dá para desfazer (o banco decide). */
  podeDesfazer: boolean;
}

export const TIPOS_MOVIMENTACAO = [
  "transferencia",
  "posicao",
  "estado",
  "operador",
  "locacao",
  "acoplamento",
] as const;

export const ROTULO_TIPO_MOVIMENTACAO: Record<string, string> = {
  transferencia: "Transferência",
  posicao: "Posição",
  estado: "Estado",
  operador: "Operador",
  locacao: "Locação",
  acoplamento: "Acoplamento",
  frente: "Frente",
  equipe: "Equipe",
};

export function rotuloTipoMovimentacao(tipo: string): string {
  return ROTULO_TIPO_MOVIMENTACAO[tipo] ?? tipo;
}

function rotuloEstado(e: string | null): string | null {
  if (!e) return null;
  return ROTULO_ESTADO[e as keyof typeof ROTULO_ESTADO] ?? e;
}

/** "Pátio central" ou "Lote 09 · km 701,2"; null quando não há lugar nenhum. */
function lugar(nome: string | null, km: number | null): string | null {
  if (!nome) return km === null ? null : `km ${formatarKm(km)}`;
  return km === null ? nome : `${nome} · km ${formatarKm(km)}`;
}

function juntar(...partes: (string | null)[]): string {
  const ok = partes.filter((p): p is string => !!p);
  return ok.length ? ok.join(" · ") : "–";
}

export interface ResumoMovimentacao {
  de: string;
  para: string;
  /** A obra mudou (transferência entre obras), para destacar na tabela. */
  trocouObra: boolean;
}

/** O antes e o depois de uma linha da trilha, em texto, segundo o tipo dela. */
export function resumirMovimentacao(m: MovimentacaoMapa): ResumoMovimentacao {
  switch (m.tipo) {
    case "transferencia":
    case "posicao": {
      // Na posição (1ª entrada ou ajuste) a obra não muda: só o lugar.
      const comObra = m.tipo === "transferencia";
      const deObra = comObra ? (m.deObra ?? "Sem obra") : null;
      const paraObra = comObra ? (m.paraObra ?? "Sem obra") : null;
      return {
        de: juntar(
          deObra,
          lugar(m.deLugar, m.deKm),
          comObra ? rotuloEstado(m.deEstado) : null,
        ),
        para: juntar(
          paraObra,
          lugar(m.paraLugar, m.paraKm),
          comObra ? rotuloEstado(m.paraEstado) : null,
        ),
        trocouObra: comObra && m.deObra !== m.paraObra,
      };
    }
    case "estado":
      return {
        de: rotuloEstado(m.deEstado) ?? "–",
        para: rotuloEstado(m.paraEstado) ?? "–",
        trocouObra: false,
      };
    case "operador":
      return {
        de: m.dePessoa ?? "Sem operador",
        para: m.paraPessoa ?? "Sem operador",
        trocouObra: false,
      };
    case "acoplamento":
      return {
        de: m.deAcoplado ? `Acoplado em ${m.deAcoplado}` : "Solto",
        para: m.paraAcoplado ? `Acoplado em ${m.paraAcoplado}` : "Solto",
        trocouObra: false,
      };
    case "locacao":
      return {
        de: "–",
        para: m.fornecedor ? `Alugada de ${m.fornecedor}` : "Em locação",
        trocouObra: false,
      };
    default:
      return { de: "–", para: "–", trocouObra: false };
  }
}
