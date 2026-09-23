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
    equipamentoTemEtapa: true,
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
export function valoresDoAbastecimento(
  completo: AbastecimentoCompleto,
  equipamentoTemEtapa: boolean,
): SaidaFormInput {
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
    // Carreta em tanque da EMT sem preço digitado ganha o preço do PEPS na RPC; na
    // edição ele volta como digitado, e é o mesmo número.
    precoCombustivel: carreta && noTanque ? numeroParaCampo(s.precoCombustivel) : "",
    precoProprietario: carreta && s.tanqueExterno ? numeroParaCampo(s.precoProprietario) : "",
    taxaLitro: carreta && noTanque && s.taxaLitro > 0 ? numeroParaCampo(s.taxaLitro) : "",
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
    equipamentoTemEtapa,
  };
}
