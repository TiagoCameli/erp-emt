/**
 * Leituras do painel no abastecimento: odômetro (km) e horímetro (h). Módulo puro (tela,
 * celular, action e testes).
 *
 * Regra do Tiago (27/11/2026, spec vault: projects/erp-emt/spec-odometro-consumo):
 * - odômetro em todo abastecimento; obrigatório nos cavalos da EMT TRANSPORTES (classe
 *   carreta) e nos carros e motos (veículo leve); nas máquinas e nas carretas de terceiro
 *   o campo existe e não trava;
 * - horímetro opcional em todos;
 * - leitura menor que a anterior é recusada, salvo troca de painel ou virada com motivo.
 *
 * O banco (`fn_comb_trg_saida_leitura`) é quem trava de verdade; estas regras só avisam
 * antes de mandar, com a mesma mensagem.
 */

export const CLASSES_CONSUMO = ["carreta", "veiculo_leve", "maquina"] as const;
export type ClasseConsumo = (typeof CLASSES_CONSUMO)[number];

export const ROTULO_CLASSE_CONSUMO: Record<ClasseConsumo, string> = {
  carreta: "Carreta",
  veiculo_leve: "Veículo leve",
  maquina: "Máquina",
};

export function classeConsumoDe(valor: string | null | undefined): ClasseConsumo {
  return (CLASSES_CONSUMO as readonly string[]).includes(valor ?? "") ? (valor as ClasseConsumo) : "maquina";
}

/** Odômetro obrigatório: cavalo da EMT e veículo leve. */
export function odometroObrigatorio(classe: ClasseConsumo | null): boolean {
  return classe === "carreta" || classe === "veiculo_leve";
}

export interface LeituraConhecida {
  valor: number;
  /** ISO. */
  data: string;
  origem: string;
}

export interface UltimasLeituras {
  km: LeituraConhecida | null;
  h: LeituraConhecida | null;
}

export const SEM_LEITURAS: UltimasLeituras = { km: null, h: null };

/** Só letra e número, maiúscula: o mesmo `fn_comb_placa_norm` do banco. */
export function normalizarPlaca(placa: string | null | undefined): string {
  return (placa ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export interface ProblemaLeitura {
  campo: "odometroKm" | "horimetroH" | "motivoVirada";
  mensagem: string;
}

function dataCurta(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Rio_Branco" }).format(new Date(iso));
}

function numero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** As travas de leitura que a tela confere antes de mandar ao banco. */
export function problemasDeLeitura(entrada: {
  classe: ClasseConsumo | null;
  odometroKm: number | null;
  horimetroH: number | null;
  virada: boolean;
  motivoVirada: string | null;
  anteriores: UltimasLeituras;
}): ProblemaLeitura[] {
  const problemas: ProblemaLeitura[] = [];
  const { classe, odometroKm, horimetroH, virada, anteriores } = entrada;
  if (odometroObrigatorio(classe) && odometroKm === null) {
    problemas.push({
      campo: "odometroKm",
      mensagem: `Informe o odômetro: é obrigatório para ${classe === "carreta" ? "os cavalos da EMT TRANSPORTES" : "carros e motos"}`,
    });
  }
  if (virada) {
    if (odometroKm === null && horimetroH === null) {
      problemas.push({ campo: "odometroKm", mensagem: "Informe a leitura nova do painel" });
    }
    if ((entrada.motivoVirada ?? "").trim().length < 3) {
      problemas.push({ campo: "motivoVirada", mensagem: "Informe o motivo da troca de painel ou virada" });
    }
    return problemas;
  }
  if (odometroKm !== null && anteriores.km && odometroKm < anteriores.km.valor) {
    problemas.push({
      campo: "odometroKm",
      mensagem: `Menor que a anterior (${numero(anteriores.km.valor)} km em ${dataCurta(anteriores.km.data)}). Se trocou o painel ou virou o odômetro, marque a virada`,
    });
  }
  if (horimetroH !== null && anteriores.h && horimetroH < anteriores.h.valor) {
    problemas.push({
      campo: "horimetroH",
      mensagem: `Menor que a anterior (${numero(anteriores.h.valor)} h em ${dataCurta(anteriores.h.data)}). Se trocou o painel ou virou o horímetro, marque a virada`,
    });
  }
  return problemas;
}

/**
 * As leituras com que a trava compara: só as de abastecimento (o banco compara só com
 * abastecimento; a leitura avulsa da Manutenção aparece, mas não trava). Na edição, a leitura
 * que não mudou não é conferida de novo (o banco também pula).
 */
export function anterioresParaTrava(
  anteriores: UltimasLeituras,
  edicao: { odometroKm: number | null; horimetroH: number | null } | null,
  atual: { odometroKm: number | null; horimetroH: number | null },
): UltimasLeituras {
  const doAbastecimento = (l: LeituraConhecida | null) => (l && l.origem === "abastecimento" ? l : null);
  return {
    km: edicao && edicao.odometroKm === atual.odometroKm ? null : doAbastecimento(anteriores.km),
    h: edicao && edicao.horimetroH === atual.horimetroH ? null : doAbastecimento(anteriores.h),
  };
}

/** "Última: 12.345 km em 05/01/2025" para a ajuda do campo. */
export function textoUltimaLeitura(leitura: LeituraConhecida | null, unidade: "km" | "h"): string {
  return leitura ? `Última: ${numero(leitura.valor)} ${unidade} em ${dataCurta(leitura.data)}` : "Sem leitura anterior";
}
