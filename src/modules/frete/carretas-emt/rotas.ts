/**
 * Produção por rota das carretas (origem -> destino), para o mapa e a tabela no fim da aba.
 *
 * Mesmo recorte do resto da aba: período (mês do frete), carreta (placa) e tipo de transporte.
 * Os números vêm dos fretes já agrupados pela RPC (mês x placa x tipo x origem x destino).
 *
 * Km: o lançado no frete (média, mínimo e máximo) e o da estrada (traçado do OSRM). Tempo: o
 * frete guarda só a DATA de saída e de chegada, então o tempo médio é em DIAS, só dos fretes com
 * chegada lançada. Os alertas apontam o que parece digitação errada, sem esconder o número.
 */

import type { DadosCarretas, FiltroCarretas, Localidade, TracadoRota } from "./calculo";

export interface LinhaRota {
  chave: string;
  origem: Localidade;
  destino: Localidade;
  /** Tipos de transporte que aparecem na rota (material, transferencia). */
  tipos: string[];
  viagens: number;
  toneladas: number;
  producao: number;
  producaoPorViagem: number | null;
  producaoPorTonelada: number | null;
  /** Km médio lançado no frete. */
  kmMedio: number | null;
  kmMin: number | null;
  kmMax: number | null;
  /** Km pela estrada; null sem traçado cadastrado. */
  kmMapa: number | null;
  horasMapa: number | null;
  /** Média de dias entre saída e chegada (só dos fretes com chegada). */
  diasMedio: number | null;
  diasMax: number | null;
  comChegada: number;
  /** null: sem traçado, o mapa desenha reta tracejada entre os dois pontos (se tiverem coordenada). */
  tracado: [number, number][] | null;
  alertas: string[];
}

/** Km lançado que se afasta mais que isto do km da estrada vira alerta. */
export const TOLERANCIA_KM = 0.2;

const somenteLetrasNumeros = (placa: string) => placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

function numeroBR(valor: number, casas = 0): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function montarRotas(dados: DadosCarretas, filtro: FiltroCarretas): LinhaRota[] {
  const placa = filtro.placa ? somenteLetrasNumeros(filtro.placa) : "";
  const placas = new Set(dados.carretas.map((k) => k.placa));
  const local = new Map(dados.localidades.map((l) => [l.id, l]));
  const tracado = new Map<string, TracadoRota>(dados.tracados.map((t) => [`${t.origemId}>${t.destinoId}`, t]));

  type Acc = {
    origemId: string;
    destinoId: string;
    tipos: Set<string>;
    viagens: number;
    toneladas: number;
    centavos: number;
    km: number;
    kmMin: number;
    kmMax: number;
    comChegada: number;
    dias: number;
    diasMax: number | null;
  };
  const acc = new Map<string, Acc>();

  for (const f of dados.fretes) {
    if (!f.origemId || !f.destinoId) continue;
    if (f.mes < filtro.de || f.mes > filtro.ate) continue;
    if (filtro.tipo && f.tipo !== filtro.tipo) continue;
    // Com uma carreta escolhida, só a placa dela; sem filtro, todas (inclusive placa desconhecida,
    // para o total do mapa bater com o resto da aba).
    if (placa && (f.placa !== placa || !placas.has(placa))) continue;
    const chave = `${f.origemId}>${f.destinoId}`;
    const a = acc.get(chave) ?? {
      origemId: f.origemId,
      destinoId: f.destinoId,
      tipos: new Set<string>(),
      viagens: 0,
      toneladas: 0,
      centavos: 0,
      km: 0,
      kmMin: Number.POSITIVE_INFINITY,
      kmMax: 0,
      comChegada: 0,
      dias: 0,
      diasMax: null,
    };
    a.tipos.add(f.tipo);
    a.viagens += f.viagens;
    a.toneladas += f.toneladas;
    a.centavos += Math.round(f.valor * 100);
    a.km += f.km;
    a.kmMin = Math.min(a.kmMin, f.kmMin ?? f.km / Math.max(f.viagens, 1));
    a.kmMax = Math.max(a.kmMax, f.kmMax ?? f.km / Math.max(f.viagens, 1));
    a.comChegada += f.comChegada ?? 0;
    a.dias += f.dias ?? 0;
    if (f.diasMax !== null && f.diasMax !== undefined) a.diasMax = Math.max(a.diasMax ?? 0, f.diasMax);
    acc.set(chave, a);
  }

  const semLocal = (id: string): Localidade => ({ id, nome: "Local sem cadastro", latitude: null, longitude: null });

  return [...acc.entries()]
    .map(([chave, a]) => {
      const t = tracado.get(chave);
      const producao = a.centavos / 100;
      const kmMedio = a.viagens > 0 ? a.km / a.viagens : null;
      const diasMedio = a.comChegada > 0 ? a.dias / a.comChegada : null;
      const alertas: string[] = [];
      if (t && kmMedio !== null && t.kmMapa > 0 && Math.abs(kmMedio - t.kmMapa) / t.kmMapa > TOLERANCIA_KM) {
        alertas.push(
          `Km lançado (${numeroBR(kmMedio)}) bem diferente da estrada (${numeroBR(t.kmMapa)} km): confira a origem e o destino desses fretes`,
        );
      }
      if (a.viagens > 1 && a.kmMin > 0 && a.kmMax > a.kmMin * 1.15) {
        alertas.push(`Km lançado varia de ${numeroBR(a.kmMin)} a ${numeroBR(a.kmMax)} na mesma rota`);
      }
      if (a.diasMax !== null && diasMedio !== null && a.diasMax > Math.max(5, diasMedio * 2)) {
        alertas.push(`Uma viagem levou ${a.diasMax} dias da saída à chegada: confira a data de chegada`);
      }
      if (a.comChegada < a.viagens) {
        const faltam = a.viagens - a.comChegada;
        alertas.push(`${faltam} ${faltam === 1 ? "frete sem" : "fretes sem"} data de chegada (fora do tempo médio)`);
      }
      return {
        chave,
        origem: local.get(a.origemId) ?? semLocal(a.origemId),
        destino: local.get(a.destinoId) ?? semLocal(a.destinoId),
        tipos: [...a.tipos].sort(),
        viagens: a.viagens,
        toneladas: a.toneladas,
        producao,
        producaoPorViagem: a.viagens > 0 ? producao / a.viagens : null,
        producaoPorTonelada: a.toneladas > 0 ? producao / a.toneladas : null,
        kmMedio,
        kmMin: Number.isFinite(a.kmMin) ? a.kmMin : null,
        kmMax: a.viagens > 0 ? a.kmMax : null,
        kmMapa: t?.kmMapa ?? null,
        horasMapa: t?.horasMapa ?? null,
        diasMedio,
        diasMax: a.diasMax,
        comChegada: a.comChegada,
        tracado: t && t.pontos.length >= 2 ? t.pontos : null,
        alertas,
      };
    })
    .sort((x, y) => y.producao - x.producao);
}
