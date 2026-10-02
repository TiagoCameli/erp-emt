import { paraNumeroDoBanco } from "@/modules/manutencao/servicos/formato";
import type { DadosCarretas } from "@/modules/frete/carretas-emt/calculo";

type Linha = Record<string, unknown>;

function lista(valor: unknown): Linha[] {
  return Array.isArray(valor) ? valor.filter((v): v is Linha => typeof v === "object" && v !== null) : [];
}

const texto = (v: unknown) => (typeof v === "string" ? v : "");
const numero = (v: unknown) => paraNumeroDoBanco(typeof v === "number" || typeof v === "string" ? v : null);

function coordenada(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** O traçado da rota: [[lat, lng], ...]. Ponto malformado sai, em vez de derrubar o mapa. */
function pontos(v: unknown): [number, number][] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((p) =>
    Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))
      ? [[Number(p[0]), Number(p[1])] as [number, number]]
      : [],
  );
}

/**
 * Localidades (com coordenada) e traçados das rotas, das linhas do banco: o Painel do Frete lê as
 * duas tabelas direto, sem a RPC das carretas.
 */
export function paraMapaDeRotas(localidades: unknown, tracados: unknown): Pick<DadosCarretas, "localidades" | "tracados"> {
  return {
    localidades: lista(localidades).map((l) => ({
      id: texto(l.id),
      nome: texto(l.nome),
      latitude: coordenada(l.latitude),
      longitude: coordenada(l.longitude),
    })),
    tracados: lista(tracados).map((t) => ({
      origemId: texto(t.origem_localidade_id ?? t.origem_id),
      destinoId: texto(t.destino_localidade_id ?? t.destino_id),
      kmMapa: numero(t.km_mapa),
      horasMapa: t.horas_mapa === null || t.horas_mapa === undefined ? null : numero(t.horas_mapa),
      pontos: pontos(t.tracado),
    })),
  };
}

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
      origemId: texto(f.origem_id),
      destinoId: texto(f.destino_id),
      kmMin: numero(f.km_min),
      kmMax: numero(f.km_max),
      comChegada: numero(f.com_chegada),
      dias: numero(f.dias),
      diasMax: f.dias_max === null || f.dias_max === undefined ? null : numero(f.dias_max),
    })),
    localidades: lista(b.localidades).map((l) => ({
      id: texto(l.id),
      nome: texto(l.nome),
      latitude: coordenada(l.latitude),
      longitude: coordenada(l.longitude),
    })),
    alertas: lista(b.alertas).flatMap((a) => {
      const regra = texto(a.regra);
      if (regra !== "R1" && regra !== "R2") return [];
      return [
        {
          regra,
          freteId: texto(a.frete_id),
          data: texto(a.data),
          mes: texto(a.mes),
          tipo: texto(a.tipo),
          placa: texto(a.placa),
          origemId: texto(a.origem_id),
          destinoId: texto(a.destino_id),
          km: numero(a.km),
          kmMapa: coordenada(a.km_mapa),
          dias: coordenada(a.dias),
          mediana: coordenada(a.mediana),
        },
      ];
    }),
    tracados: lista(b.rotas).map((t) => ({
      origemId: texto(t.origem_id),
      destinoId: texto(t.destino_id),
      kmMapa: numero(t.km_mapa),
      horasMapa: t.horas_mapa === null || t.horas_mapa === undefined ? null : numero(t.horas_mapa),
      pontos: pontos(t.tracado),
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
