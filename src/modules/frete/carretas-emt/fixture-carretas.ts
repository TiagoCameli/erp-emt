import type { DadosCarretas } from "./calculo";

/** Duas carretas, um contrato só de uma e outro das duas, placa errada e gasto na raiz. */
export const RAIZ = "raiz";
const A = { centroId: "cc-a", nome: "Caminhão Cavalo XF 530 FTT SQS7E01 - 02", placa: "SQS7E01" };
const B = { centroId: "cc-b", nome: "Caminhão Cavalo XF 530 FTT SQU9C94 - 03", placa: "SQU9C94" };

export function base(): DadosCarretas {
  return {
    raizId: RAIZ,
    carretas: [A, B],
    fretes: [
      { placa: "SQS7E01", mes: "2026-08", tipo: "material", viagens: 10, toneladas: 500, km: 4000, valor: 100000 },
      { placa: "SQS7E01", mes: "2026-09", tipo: "material", viagens: 5, toneladas: 250, km: 2000, valor: 50000.1 },
      { placa: "SQU9C94", mes: "2026-09", tipo: "transferencia", viagens: 4, toneladas: 120, km: 400, valor: 8000.2 },
      // Placa digitada errada: não é de nenhuma carreta, mas entra no total da frota.
      { placa: "SQS7E71", mes: "2026-09", tipo: "transferencia", viagens: 2, toneladas: 60, km: 200, valor: 3000 },
    ],
    gastos: [
      { centroId: "cc-a", mes: "2026-08", categoria: "Salário Mão de Obra", valor: 5000, pago: 5000 },
      { centroId: "cc-a", mes: "2026-09", categoria: "Manutenção de equipamentos", valor: 12000.3, pago: 0 },
      { centroId: "cc-b", mes: "2026-09", categoria: "IPVA", valor: 3000, pago: 3000 },
      { centroId: "cc-b", mes: "2026-09", categoria: "Aquisição de Equipamento", valor: 20000, pago: 20000 },
      { centroId: RAIZ, mes: "2026-09", categoria: "Outras despesas", valor: 1000, pago: 1000 },
      // Fora do período padrão do teste.
      { centroId: "cc-a", mes: "2026-07", categoria: "Combustível", valor: 999, pago: 999 },
    ],
    contratos: [
      { lancamentoId: "L1", centroId: "cc-a", numero: "LAN-1", credor: "DAF", contratado: 60000, parcelas: 6 },
      // Um contrato de duas carretas, meio a meio.
      { lancamentoId: "L2", centroId: "cc-a", numero: "LAN-2", credor: "PACCAR", contratado: 30000, parcelas: 3 },
      { lancamentoId: "L2", centroId: "cc-b", numero: "LAN-2", credor: "PACCAR", contratado: 30000, parcelas: 3 },
    ],
    parcelas: [
      { lancamentoId: "L1", centroId: "cc-a", mes: "2026-07", paga: true, quantidade: 1, valor: 10000 },
      { lancamentoId: "L1", centroId: "cc-a", mes: "2026-08", paga: true, quantidade: 1, valor: 10000 },
      { lancamentoId: "L1", centroId: "cc-a", mes: "2026-09", paga: false, quantidade: 1, valor: 10000 },
      { lancamentoId: "L1", centroId: "cc-a", mes: "2026-10", paga: false, quantidade: 3, valor: 30000 },
      { lancamentoId: "L2", centroId: "cc-a", mes: "2026-08", paga: false, quantidade: 1, valor: 10000 },
      { lancamentoId: "L2", centroId: "cc-b", mes: "2026-08", paga: false, quantidade: 1, valor: 10000 },
      { lancamentoId: "L2", centroId: "cc-a", mes: "2026-09", paga: true, quantidade: 1, valor: 10000 },
      { lancamentoId: "L2", centroId: "cc-b", mes: "2026-09", paga: true, quantidade: 1, valor: 10000 },
      { lancamentoId: "L2", centroId: "cc-a", mes: "2026-10", paga: false, quantidade: 1, valor: 10000 },
      { lancamentoId: "L2", centroId: "cc-b", mes: "2026-10", paga: false, quantidade: 1, valor: 10000 },
    ],
    diesel: [{ placa: "SQS7E01", mes: "2026-09", litros: 1000, valor: 6394.7 }],
  };
}
