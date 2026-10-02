/**
 * Rotas do Painel do Frete: o mesmo mapa e tabela das Carretas EMT, com os fretes de TODAS as
 * transportadoras.
 *
 * Os fretes chegam um a um (já recortados pelos filtros do painel) e viram o formato agrupado que
 * `montarRotas` das carretas lê: um frete é uma viagem, o km lançado é o mínimo e o máximo dele,
 * e o tempo é a diferença em dias entre a saída e a chegada (só quem tem chegada).
 */

import type { FreteMes, Localidade, TracadoRota } from "@/modules/frete/carretas-emt/calculo";
import { montarRotas, type LinhaRota } from "@/modules/frete/carretas-emt/rotas";
import type { FretePainel } from "@/modules/frete/painel/calculo";

const DIA_MS = 86_400_000;

function diasEntre(saida: string, chegada: string): number | null {
  const a = Date.parse(`${saida.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${chegada.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / DIA_MS);
}

/**
 * `de` e `ate` são os do filtro do painel (yyyy-MM-dd, vazio = sem limite): dão os meses das
 * barrinhas de cada rota. Sem eles, do primeiro ao último mês com frete.
 */
export function rotasDoPainel(
  fretes: readonly FretePainel[],
  mapa: { localidades: Localidade[]; tracados: TracadoRota[] },
  de = "",
  ate = "",
): LinhaRota[] {
  const linhas: FreteMes[] = [];
  for (const f of fretes) {
    if (!f.data || !f.origemId || !f.destinoId) continue;
    const dias = f.dataChegada ? diasEntre(f.data, f.dataChegada) : null;
    linhas.push({
      placa: "",
      mes: f.data.slice(0, 7),
      tipo: f.tipo,
      viagens: 1,
      toneladas: f.peso || 0,
      km: f.km || 0,
      kmMin: f.km || 0,
      kmMax: f.km || 0,
      valor: f.valorTotal || 0,
      origemId: f.origemId,
      destinoId: f.destinoId,
      comChegada: dias === null ? 0 : 1,
      dias: dias ?? 0,
      diasMax: dias,
    });
  }
  if (linhas.length === 0) return [];
  const mesesComFrete = linhas.map((l) => l.mes).sort();
  return montarRotas(
    {
      raizId: "",
      carretas: [],
      fretes: linhas,
      gastos: [],
      contratos: [],
      parcelas: [],
      diesel: [],
      localidades: mapa.localidades,
      tracados: mapa.tracados,
      alertas: [],
    },
    {
      de: de.slice(0, 7) || mesesComFrete[0]!,
      ate: ate.slice(0, 7) || mesesComFrete.at(-1)!,
      placa: "",
    },
  );
}
