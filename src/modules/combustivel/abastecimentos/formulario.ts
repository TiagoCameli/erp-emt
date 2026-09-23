import { agoraDataHoraLocal, isoParaDataHoraLocal } from "@/modules/combustivel/_shared/rotulos";
import type { AbastecimentoCompleto } from "@/modules/combustivel/abastecimentos/queries";
import { TIPOS_MEDICAO, type SaidaFormInput } from "@/modules/combustivel/abastecimentos/schemas";
import { numeroParaCampo } from "@/modules/manutencao/servicos/numero";

/**
 * Valores iniciais do formulário de abastecimento. Módulo puro (a tela e o teste).
 */

export function valoresNovoAbastecimento(agora: Date = new Date()): SaidaFormInput {
  return {
    origem: "tanque",
    tipoConsumidor: "equipamento_proprio",
    tanqueId: "",
    equipamentoId: "",
    transportadoraId: "",
    placa: "",
    motorista: "",
    insumoId: "",
    litros: "",
    precoCombustivel: "",
    precoProprietario: "",
    taxaLitro: "",
    precoUnitario: "",
    pago: false,
    pagoEm: "",
    medicao: "",
    tipoMedicao: "",
    dataHora: agoraDataHoraLocal(agora),
    obraId: "",
    manterAlocacoes: false,
    observacoes: "",
    tanqueExterno: false,
  };
}

/** Tipo de medição do equipamento: só horímetro e km viram medição. */
export function tipoMedicaoDoControle(controlePor: string | null | undefined): string {
  return controlePor && (TIPOS_MEDICAO as readonly string[]).includes(controlePor) ? controlePor : "";
}

/**
 * O abastecimento salvo, de volta ao formulário. Com uma alocação só, ela vira a
 * obra do campo; com várias (migração), o formulário as mantém como estão.
 */
export function valoresDoAbastecimento(completo: AbastecimentoCompleto): SaidaFormInput {
  const s = completo.saida;
  const varias = completo.alocacoes.length > 1;
  const carreta = s.tipoConsumidor === "carreta_transportadora";
  const noTanque = s.origem === "tanque";
  return {
    origem: s.origem,
    tipoConsumidor: s.tipoConsumidor,
    tanqueId: s.tanqueId ?? "",
    equipamentoId: s.equipamentoId ?? "",
    transportadoraId: s.transportadoraId ?? "",
    placa: s.placa ?? "",
    motorista: s.motorista ?? "",
    insumoId: s.insumoId,
    litros: numeroParaCampo(s.litros),
    // Como a origem (defaultValues): o preço da carreta e a taxa voltam como salvos.
    precoCombustivel: carreta && noTanque ? numeroParaCampo(s.precoCombustivel) : "",
    precoProprietario: carreta && s.tanqueExterno ? numeroParaCampo(s.precoProprietario) : "",
    taxaLitro: carreta && s.taxaLitro > 0 ? numeroParaCampo(s.taxaLitro) : "",
    precoUnitario: noTanque ? "" : numeroParaCampo(s.precoUnitario),
    pago: s.pago,
    pagoEm: s.pagoEm ?? "",
    medicao: numeroParaCampo(s.medicao),
    tipoMedicao: s.tipoMedicao ?? tipoMedicaoDoControle(s.equipamentoControlePor),
    dataHora: isoParaDataHoraLocal(s.data),
    obraId: !varias && completo.alocacoes.length === 1 ? completo.alocacoes[0].centroCustoId : "",
    manterAlocacoes: varias,
    observacoes: s.observacoes ?? "",
    tanqueExterno: s.tanqueExterno,
  };
}

// ---------------------------------------------------------------------------
// Prévia de impacto financeiro da origem (previewImpacto)
// ---------------------------------------------------------------------------

export interface LinhaImpacto {
  sinal: "▲" | "▼";
  texto: string;
  cor: "verde" | "vermelho" | "cinza";
}

function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * As linhas do "Impacto financeiro" da tela da origem. Carreta em tanque de dono externo:
 * crédito do dono (litros × (preço do dono + taxa)), débito da transportadora (o valor) e a
 * margem da EMT quando passa de meio centavo. Carreta em tanque da EMT: débito e estoque.
 * Equipamento próprio no tanque da EMT: só o estoque. Nada quando litros ou valor são zero.
 */
export function linhasImpacto(p: {
  carreta: boolean;
  noTanque: boolean;
  tanque: { nome: string; externo: boolean; donoNome: string | null } | null;
  transportadoraNome: string | null;
  litros: number;
  valorTotal: number;
  precoProprietario: number;
  taxa: number;
}): LinhaImpacto[] {
  if (p.litros <= 0 || p.valorTotal <= 0) return [];
  const litrosTexto = p.litros.toLocaleString("pt-BR");
  const linhas: LinhaImpacto[] = [];
  if (p.carreta) {
    if (!p.transportadoraNome || !p.tanque) return [];
    if (p.tanque.externo) {
      const credito = p.litros * (p.precoProprietario + p.taxa);
      const margem = p.valorTotal - credito;
      linhas.push({ sinal: "▲", texto: `Crédito ${p.tanque.donoNome ?? "?"}: ${brl(credito)}`, cor: "verde" });
      linhas.push({ sinal: "▼", texto: `Débito ${p.transportadoraNome}: ${brl(p.valorTotal)}`, cor: "vermelho" });
      if (Math.abs(margem) > 0.005) {
        linhas.push({
          sinal: margem > 0 ? "▲" : "▼",
          texto: `Margem EMT (combustível): ${brl(margem)}`,
          cor: margem > 0 ? "verde" : "vermelho",
        });
      }
    } else {
      linhas.push({ sinal: "▼", texto: `Débito ${p.transportadoraNome}: ${brl(p.valorTotal)}`, cor: "vermelho" });
      linhas.push({ sinal: "▼", texto: `Estoque tanque ${p.tanque.nome}: −${litrosTexto} L`, cor: "cinza" });
    }
  } else if (p.noTanque && p.tanque && !p.tanque.externo) {
    linhas.push({ sinal: "▼", texto: `Estoque tanque ${p.tanque.nome}: −${litrosTexto} L`, cor: "cinza" });
  }
  return linhas;
}

/** Diesel S10 pelo nome, como a origem acha o combustível padrão do tanque externo. */
export function acharDieselS10<T extends { id: string; nome: string }>(insumos: readonly T[]): T | null {
  return insumos.find((c) => c.nome.trim().toLowerCase() === "diesel s10") ?? null;
}

/**
 * Tipo de combustível do tanque escolhido, como a origem: externo = Diesel S10 (editável);
 * da EMT = o da entrada viva mais nova do tanque; sem entrada, "".
 */
export function tipoCombustivelDoTanque(p: {
  noTanque: boolean;
  tanque: { id: string; ehExterno: boolean } | null;
  dieselS10Id: string | null;
  combustivelPorTanque: Readonly<Record<string, string>>;
}): string {
  if (!p.noTanque || !p.tanque) return "";
  if (p.tanque.ehExterno) return p.dieselS10Id ?? "";
  return p.combustivelPorTanque[p.tanque.id] ?? "";
}

/**
 * Taxa que a origem preenche quando a transportadora muda (só na saída nova): o
 * `taxa_litro_padrao` da TRANSPORTADORA. Null: não mexe no campo (a origem só grava
 * quando a transportadora tem o número, zero inclusive).
 */
export function taxaPadraoDaTransportadora(
  transportadoras: readonly { id: string; taxaLitroPadrao: number | null }[],
  transportadoraId: string,
): number | null {
  const t = transportadoras.find((x) => x.id === transportadoraId);
  return t && t.taxaLitroPadrao !== null ? t.taxaLitroPadrao : null;
}
