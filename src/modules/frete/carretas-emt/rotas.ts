/**
 * Produção por rota das carretas (origem -> destino), para o mapa e a tabela no fim da aba.
 *
 * Mesmo recorte do resto da aba: período (mês do frete), carreta (placa) e tipo de transporte.
 * Os números vêm dos fretes já agrupados pela RPC (mês x placa x tipo x origem x destino).
 *
 * Km: o lançado no frete (média, mínimo e máximo) e o da estrada (traçado do OSRM). Tempo: o
 * frete guarda só a DATA de saída e de chegada, então o tempo médio é em DIAS, só dos fretes com
 * chegada lançada.
 *
 * Os ALERTAS vêm frete a frete do banco (R1 km longe da estrada, R2 viagem longa demais), já sem
 * os conferidos, e aqui só se agrupam por rota e regra: cada grupo leva aos fretes dele na aba
 * Fretes e pode ser marcado como conferido de uma vez.
 */

import type { AlertaFrete, DadosCarretas, FiltroCarretas, Localidade, TracadoRota } from "./calculo";

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
  /** Fretes sem data de chegada (ficam fora do tempo médio). */
  semChegada: number;
  /** Há alerta não conferido nesta rota (no recorte de período, carreta e tipo). */
  temAlerta: boolean;
}

export interface AlertaRota {
  chave: string;
  rotaChave: string;
  regra: AlertaFrete["regra"];
  origemNome: string;
  destinoNome: string;
  freteIds: string[];
  mensagem: string;
}

/** A chave da rota, também usada na URL (?rota=): os ids das duas localidades. */
export function chaveDaRota(origemId: string, destinoId: string): string {
  return `${origemId}_${destinoId}`;
}

/** Onde o alerta leva: a aba Fretes só com os fretes dele. */
export function linkDosFretes(freteIds: readonly string[]): string {
  return `/frete/fretes?fretes=${freteIds.map(encodeURIComponent).join(",")}`;
}

function diaBR(dia: string): string {
  const [a, m, d] = dia.split("-");
  return a && m && d ? `${d}/${m}/${a}` : dia;
}

function noRecorte(filtro: FiltroCarretas, a: { mes: string; tipo: string; placa: string; origemId: string; destinoId: string }) {
  const placa = filtro.placa ? somenteLetrasNumeros(filtro.placa) : "";
  if (a.mes < filtro.de || a.mes > filtro.ate) return false;
  if (filtro.tipo && a.tipo !== filtro.tipo) return false;
  if (placa && a.placa !== placa) return false;
  if (filtro.rota && chaveDaRota(a.origemId, a.destinoId) !== filtro.rota) return false;
  return true;
}

/** Os alertas do recorte, um por rota e regra, na ordem das rotas mais produtivas primeiro. */
export function montarAlertas(dados: DadosCarretas, filtro: FiltroCarretas): AlertaRota[] {
  const local = new Map(dados.localidades.map((l) => [l.id, l.nome]));
  const grupos = new Map<string, AlertaFrete[]>();
  for (const a of dados.alertas) {
    if (!a.freteId || !noRecorte(filtro, a)) continue;
    const chave = `${chaveDaRota(a.origemId, a.destinoId)}|${a.regra}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }
  return [...grupos.entries()]
    .map(([chave, lista]) => {
      const a = lista[0]!;
      const n = lista.length;
      const fretes = n === 1 ? "1 frete" : `${n} fretes`;
      const datas = [...new Set(lista.map((x) => diaBR(x.data)))].join(", ");
      let mensagem: string;
      if (a.regra === "R1") {
        const kms = [...new Set(lista.map((x) => numeroBR(x.km)))].join(", ");
        mensagem = `${fretes} com km lançado longe da estrada (${kms} km; a estrada tem ${numeroBR(a.kmMapa ?? 0)} km), em ${datas}`;
      } else {
        const dias = [...new Set(lista.map((x) => x.dias ?? 0))].join(", ");
        mensagem = `${fretes} com viagem longa demais (${dias} dias da saída à chegada; o normal da rota é ${numeroBR(a.mediana ?? 0, 1)} dias), em ${datas}`;
      }
      return {
        chave,
        rotaChave: chaveDaRota(a.origemId, a.destinoId),
        regra: a.regra,
        origemNome: local.get(a.origemId) ?? "Local sem cadastro",
        destinoNome: local.get(a.destinoId) ?? "Local sem cadastro",
        freteIds: lista.map((x) => x.freteId),
        mensagem,
      };
    })
    .sort((x, y) => x.chave.localeCompare(y.chave));
}

const somenteLetrasNumeros = (placa: string) => placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

function numeroBR(valor: number, casas = 0): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function montarRotas(dados: DadosCarretas, filtro: FiltroCarretas): LinhaRota[] {
  const placa = filtro.placa ? somenteLetrasNumeros(filtro.placa) : "";
  const placas = new Set(dados.carretas.map((k) => k.placa));
  const local = new Map(dados.localidades.map((l) => [l.id, l]));
  const tracado = new Map<string, TracadoRota>(dados.tracados.map((t) => [chaveDaRota(t.origemId, t.destinoId), t]));
  const comAlerta = new Set(montarAlertas(dados, { ...filtro, rota: "" }).map((a) => a.rotaChave));

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
    const chave = chaveDaRota(f.origemId, f.destinoId);
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
        semChegada: a.viagens - a.comChegada,
        temAlerta: comAlerta.has(chave),
      };
    })
    .sort((x, y) => y.producao - x.producao);
}
