import { absoluto, lerDecimal, paraTexto, subtrair, arredondar } from "@/modules/medicao/_shared/decimal";
import { decimalPtBr, numeroExibicao } from "@/modules/medicao/planilha/formato";

import type { AlertaLinha } from "./tipos";

export const ROTULO_TIPO_ALERTA: Record<string, string> = {
  acumulado_acima_previsto: "Acumulado acima do previsto",
  prazo_perto_do_fim: "Prazo perto do fim",
  valor_perto_do_previsto: "Valor perto do previsto",
  valor_contrato_diferente: "Valor do contrato diferente da planilha",
};

export const ROTULO_GRAVIDADE: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

/** Ordem de exibição: a mais grave primeiro. */
export const ORDEM_GRAVIDADE: Record<string, number> = { alta: 0, media: 1, baixa: 2 };

/** yyyy-mm-dd vira dd/mm/aaaa, sem passar por Date (sem deslocamento de fuso). */
export function dataPtBr(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Dinheiro de texto do banco: R$ 1.234,56, 2 casas, sem Number. */
export function dinheiroTexto(texto: string | null): string {
  if (texto === null || texto === "") return "";
  try {
    return `R$ ${decimalPtBr(paraTextoDuasCasas(texto))}`;
  } catch {
    return texto;
  }
}

function paraTextoDuasCasas(texto: string): string {
  const d = arredondar(lerDecimal(texto), 2);
  const negativo = d.digitos < BigInt(0);
  const s = (negativo ? -d.digitos : d.digitos).toString().padStart(3, "0");
  return `${negativo ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
}

function comUnidade(numero: string | null, unidade: string | null): string {
  const n = numeroExibicao(numero);
  return unidade ? `${n} ${unidade}` : n;
}

function dias(n: number): string {
  return Math.abs(n) === 1 ? "1 dia" : `${Math.abs(n)} dias`;
}

/** A frase do alerta em pt-BR, montada só de `valor`, `referencia`, `data`, `unidade` e `com_motivo`. */
export function fraseAlerta(a: Pick<AlertaLinha, "tipo" | "itemCodigo" | "unidade" | "valor" | "referencia" | "data" | "comMotivo">): string {
  switch (a.tipo) {
    case "acumulado_acima_previsto": {
      const base = `${a.itemCodigo ?? "Item"} acumulado ${comUnidade(a.valor, a.unidade)}, acima do previsto de ${comUnidade(a.referencia, a.unidade)}`;
      return a.comMotivo
        ? `${base} (motivo informado, ainda precisa de aditivo)`
        : `${base} (sem motivo informado, precisa de aditivo)`;
    }
    case "prazo_perto_do_fim": {
      const restantes = Number.parseInt(a.valor ?? "", 10);
      const data = dataPtBr(a.data);
      if (Number.isNaN(restantes)) return `Prazo termina em ${data}`;
      if (restantes < 0) return `Prazo terminou em ${data}, há ${dias(restantes)}`;
      if (restantes === 0) return `Prazo termina hoje, em ${data}`;
      return `Prazo termina em ${data}, em ${dias(restantes)}`;
    }
    case "valor_perto_do_previsto":
      return `Executado ${decimalPtBr(a.valor)}% do previsto (limite ${numeroExibicao(a.referencia)}%)`;
    case "valor_contrato_diferente": {
      const base = `Valor do contrato ${dinheiroTexto(a.valor)} e planilha v0 ${dinheiroTexto(a.referencia)}`;
      if (a.valor === null || a.referencia === null) return base;
      try {
        const dif = paraTexto(absoluto(subtrair(lerDecimal(a.valor), lerDecimal(a.referencia))));
        return `${base}: diferença ${dinheiroTexto(dif)}`;
      } catch {
        return base;
      }
    }
    default:
      return "";
  }
}
