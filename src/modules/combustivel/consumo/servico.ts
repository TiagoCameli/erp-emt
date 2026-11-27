import "server-only";

import { aplicarFiltroGlobal, type FiltroGlobal } from "@/modules/combustivel/_shared/filtro-global";
import { ROTULO_CLASSE_CONSUMO } from "@/modules/combustivel/_shared/leituras";
import { carregarBaseCombustivel } from "@/modules/combustivel/anomalias/queries";
import {
  destaques,
  mediasPorGrupo,
  resumirPorVeiculo,
  type ConfigConsumo,
  type Destaque,
  type MediaGrupo,
  type ResumoVeiculo,
  type TrechoLinha,
} from "@/modules/combustivel/consumo/calculo";
import { carregarConfigConsumo, carregarTrechos } from "@/modules/combustivel/consumo/queries";
import { fimExclusivoDoDia, inicioDoDia, type Periodo } from "@/modules/combustivel/relatorios/periodo";
import { rotuloEquipamento } from "@/modules/manutencao/servicos/formato";

/** Uma linha da tabela de Consumo: o resumo do veículo com nome, tipo, obra e destaque. */
export interface LinhaConsumo extends ResumoVeiculo {
  nome: string;
  tipo: string;
  obra: string | null;
  destaque: Destaque | null;
}

export interface RelatorioConsumo {
  linhas: LinhaConsumo[];
  medias: MediaGrupo[];
  config: ConfigConsumo;
  /** Abastecimentos do recorte sem nenhuma leitura (ficam fora do consumo). */
  semLeitura: number;
  abastecimentos: number;
}

function janelaDe(periodo: Periodo): { de: string | null; ate: string | null } {
  return {
    de: periodo.de <= "0001-01-01" ? null : inicioDoDia(periodo.de),
    ate: periodo.ate >= "9999-01-01" ? null : fimExclusivoDoDia(periodo.ate),
  };
}

/** "yyyy-MM-dd" menos N meses (dia de calendário, UTC puro). */
function menosMeses(dia: string, meses: number): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  const data = new Date(Date.UTC(ano!, mes! - 1 - meses, d!));
  return data.toISOString().slice(0, 10);
}

/**
 * O relatório de Consumo do recorte global (período, modo, obra, equipamento, tanque,
 * combustível, interno/externo...). O trecho entra quando o abastecimento que o FECHA passa
 * no filtro; o corte em trechos é do banco e não depende do filtro.
 */
export async function montarRelatorioConsumo(filtro: FiltroGlobal, periodo: Periodo): Promise<RelatorioConsumo> {
  const [base, config] = await Promise.all([carregarBaseCombustivel(), carregarConfigConsumo()]);
  const recorte = aplicarFiltroGlobal(base.saidas, filtro, periodo);
  const ids = new Set(recorte.map((s) => s.id));

  const historicoDe = menosMeses(periodo.ate >= "9999-01-01" ? new Date().toISOString().slice(0, 10) : periodo.ate, config.janelaMeses);
  const [trechos, trechosHistorico] = await Promise.all([
    carregarTrechos(janelaDe(periodo)),
    carregarTrechos(janelaDe({ de: historicoDe, ate: periodo.ate })),
  ]);
  const doRecorte = trechos.filter((t) => ids.has(t.saidaId));
  const resumos = resumirPorVeiculo(doRecorte);
  const chaves = new Set(resumos.map((r) => r.chave));
  const historico = resumirPorVeiculo(trechosHistorico.filter((t) => t.veiculoChave && chaves.has(t.veiculoChave)));
  const realces = destaques(resumos, historico, config);

  const equipamentoPorId = new Map(base.equipamentos.map((e) => [e.id, e]));
  const saidaPorId = new Map(recorte.map((s) => [s.id, s]));
  const obraPredominante = (chave: string): string | null => {
    const litrosPorObra = new Map<string, number>();
    for (const t of doRecorte) {
      if (t.veiculoChave !== chave) continue;
      const obraId = saidaPorId.get(t.saidaId)?.obraId;
      if (obraId) litrosPorObra.set(obraId, (litrosPorObra.get(obraId) ?? 0) + t.litros);
    }
    const [obraId] = [...litrosPorObra.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    return obraId ? (base.obraNome.get(obraId) ?? null) : null;
  };
  const tipoDe = (r: ResumoVeiculo): string => {
    if (r.classe !== "maquina") return ROTULO_CLASSE_CONSUMO[r.classe];
    const tipo = r.equipamentoId ? equipamentoPorId.get(r.equipamentoId)?.tipo?.trim() : null;
    return tipo || "Máquina sem tipo";
  };
  const nomeDe = (r: ResumoVeiculo): string => {
    const equipamento = r.equipamentoId ? equipamentoPorId.get(r.equipamentoId) : undefined;
    if (equipamento) return rotuloEquipamento(equipamento);
    const transportadora = r.transportadoraId ? base.transportadoraNome.get(r.transportadoraId) : null;
    return transportadora ? `${r.placa} · ${transportadora}` : r.placa;
  };

  const linhas: LinhaConsumo[] = resumos.map((r) => ({
    ...r,
    nome: nomeDe(r),
    tipo: tipoDe(r),
    obra: obraPredominante(r.chave),
    destaque: realces.get(r.chave) ?? null,
  }));
  const tipoPorChave = new Map(linhas.map((l) => [l.chave, l.tipo]));
  const trechoPorSaida = new Map(doRecorte.map((t) => [t.saidaId, t]));

  return {
    linhas,
    medias: mediasPorGrupo(resumos, (r) => tipoPorChave.get(r.chave) ?? "Máquina sem tipo"),
    config,
    semLeitura: recorte.filter((s) => {
      const t = trechoPorSaida.get(s.id);
      return !t || (t.odometroKm === null && t.horimetroH === null);
    }).length,
    abastecimentos: recorte.length,
  };
}

/** Histórico inteiro de um veículo (todos os abastecimentos, sem filtro de período). */
export async function historicoDoVeiculo(chave: string): Promise<TrechoLinha[]> {
  return carregarTrechos({ de: null, ate: null, veiculo: chave });
}
