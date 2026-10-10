import { TIPOS_VINCULO, type TipoVinculo } from "@/modules/execucao/_shared/rotulos";

/**
 * Texto de predecessoras da grade: "1.2TI+2; 1.3II-1; #7". Código da linha, tipo (TI, II, TT, IT; sem tipo
 * é TI) e atraso em dias úteis. "#7" é a linha número 7 da grade. Só interpreta: quem valida ciclo e
 * existência é o banco (fn_ex_atividades_salvar_lote).
 */
export type Predecessora = { codigo: string; tipo: TipoVinculo; atraso: number };

// O código termina em dígito (1, 1.2, A1.3): assim "1.1XX" não vira código. Linha com código só de letras
// é referida pelo número da linha (#7).
const PADRAO = /^(#\d+|[A-Za-z0-9.]*?[0-9])\s*(TI|II|TT|IT)?\s*(?:([+-])\s*(\d+))?\s*(?:d|dias?)?$/i;

export function lerPredecessoras(
  texto: string,
  codigoDaLinha: (numero: number) => string | undefined,
): { ok: true; valor: Predecessora[] } | { ok: false; erro: string } {
  const pedacos = texto.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
  const valor: Predecessora[] = [];
  for (const pedaco of pedacos) {
    const m = PADRAO.exec(pedaco);
    if (!m) return { ok: false, erro: `Não entendi "${pedaco}". Use código, tipo (TI, II, TT, IT) e atraso: 1.2TI+2` };
    const [, ref, tipoTexto, sinal, numero] = m;
    let codigo = ref;
    if (ref.startsWith("#")) {
      const n = Number(ref.slice(1));
      const achado = codigoDaLinha(n);
      if (!achado) return { ok: false, erro: `Não existe a linha ${n}` };
      codigo = achado;
    }
    const tipo = (tipoTexto?.toUpperCase() ?? "TI") as TipoVinculo;
    if (!TIPOS_VINCULO.includes(tipo)) return { ok: false, erro: `Tipo de vínculo inválido em "${pedaco}"` };
    const atraso = numero ? Number(numero) * (sinal === "-" ? -1 : 1) : 0;
    if (valor.some((v) => v.codigo === codigo)) return { ok: false, erro: `A predecessora ${codigo} aparece duas vezes` };
    valor.push({ codigo, tipo, atraso });
  }
  return { ok: true, valor };
}

export function formatarPredecessoras(lista: readonly Predecessora[]): string {
  return lista
    .map(({ codigo, tipo, atraso }) => {
      if (tipo === "TI" && atraso === 0) return codigo;
      const lag = atraso === 0 ? "" : atraso > 0 ? `+${atraso}` : `${atraso}`;
      return `${codigo}${tipo}${lag}`;
    })
    .join("; ");
}
