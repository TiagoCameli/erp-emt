import { paraNumeroDoBanco } from "@/modules/manutencao/servicos/formato";
import type { DadosCarretas } from "@/modules/frete/carretas-emt/calculo";

type Linha = Record<string, unknown>;

function lista(valor: unknown): Linha[] {
  return Array.isArray(valor) ? valor.filter((v): v is Linha => typeof v === "object" && v !== null) : [];
}

const texto = (v: unknown) => (typeof v === "string" ? v : "");
const numero = (v: unknown) => paraNumeroDoBanco(typeof v === "number" || typeof v === "string" ? v : null);

/** Converte o JSON da RPC (números em texto) no formato do cálculo. */
export function paraDadosCarretas(bruto: unknown): DadosCarretas | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const b = bruto as Linha;
  if (!Array.isArray(b.carretas) || !Array.isArray(b.fretes) || !Array.isArray(b.gastos)) return null;
  return {
    raizId: texto(b.raiz_id),
    carretas: lista(b.carretas).map((k) => ({ centroId: texto(k.centro_id), nome: texto(k.nome), placa: texto(k.placa) })),
    fretes: lista(b.fretes).map((f) => ({
      placa: texto(f.placa),
      mes: texto(f.mes),
      tipo: texto(f.tipo),
      viagens: numero(f.viagens),
      toneladas: numero(f.toneladas),
      km: numero(f.km),
      valor: numero(f.valor),
    })),
    gastos: lista(b.gastos).map((g) => ({
      centroId: texto(g.centro_id),
      mes: texto(g.mes),
      categoria: texto(g.categoria) || "Sem categoria",
      valor: numero(g.valor),
      pago: numero(g.pago),
    })),
    contratos: lista(b.contratos).map((k) => ({
      lancamentoId: texto(k.lancamento_id),
      centroId: texto(k.centro_id),
      numero: texto(k.numero),
      credor: texto(k.credor),
      contratado: numero(k.contratado),
      parcelas: numero(k.parcelas),
    })),
    parcelas: lista(b.parcelas).map((p) => ({
      lancamentoId: texto(p.lancamento_id),
      centroId: texto(p.centro_id),
      mes: texto(p.mes),
      paga: p.paga === true,
      quantidade: numero(p.quantidade),
      valor: numero(p.valor),
    })),
    diesel: lista(b.diesel).map((d) => ({
      placa: texto(d.placa),
      mes: texto(d.mes),
      litros: numero(d.litros),
      valor: numero(d.valor),
    })),
  };
}
