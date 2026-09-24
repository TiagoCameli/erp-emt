import "server-only";

import { dataHojeISO } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { carregarBaseFrete } from "@/modules/frete/_shared/pedreira-dados";
import {
  detectAnomaliasFrete,
  FRETE_DETECTOR_LABEL,
  type AnomaliaFrete,
  type FreteDeteccao,
} from "@/modules/frete/anomalias/detect";

export interface Conferencia {
  motivo: string | null;
  conferidoEm: string;
}

/** Um frete afetado, como a FretesAfetadosList da origem. */
export interface FreteDaAnomalia {
  id: string;
  data: string;
  origem: string;
  destino: string;
  material: string;
  peso: number;
  placa: string | null;
  notaFiscal: string | null;
  valorMaterial: number;
}

export interface AnomaliaFreteLista extends AnomaliaFrete {
  rotuloDetector: string;
  conferencia: Conferencia | null;
  fretes: FreteDaAnomalia[];
}

export interface ResultadoAnomaliasFrete {
  anomalias: AnomaliaFreteLista[];
  hoje: string;
}

async function lerConferidas(): Promise<Map<string, Conferencia>> {
  const supabase = await createClient();
  const conferidas = await todasAsLinhas((de, ate) =>
    supabase.from("frete_anomalias_conferidas").select("chave, motivo, conferido_em").order("chave").range(de, ate),
  );
  if (conferidas.erro) throw new Error("Não foi possível ler as anomalias conferidas");
  return new Map(conferidas.linhas.map((c) => [c.chave, { motivo: c.motivo, conferidoEm: c.conferido_em }]));
}

/**
 * A aba Anomalias da origem: a detecção roda sobre TODOS os fretes ativos (a origem
 * passava `fretesNoPeriodo = fretesTodos`) e todos os pedidos. O período da tela recorta
 * a lista pela data da anomalia, sem mexer na detecção (senão o F4 mudaria de grupo).
 */
export async function carregarAnomaliasFrete(): Promise<ResultadoAnomaliasFrete> {
  const [base, porChave] = await Promise.all([carregarBaseFrete(), lerConferidas()]);
  const hoje = dataHojeISO();

  const fretes: FreteDeteccao[] = base.fretes.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    data: f.data,
    dataChegada: f.dataChegada,
    pedreiraId: f.pedreiraId,
    origemNome: base.localidadeNome.get(f.origemId) ?? "",
    destinoNome: base.localidadeNome.get(f.destinoId) ?? "",
    insumoId: f.insumoId,
    peso: f.peso,
    valorMaterial: f.valorMaterial,
    notaFiscal: f.notaFiscal,
    placaCarreta: f.placaCarreta,
  }));
  const fornecedorNome = new Map([...base.fornecedores.values()].map((f) => [f.id, f.nome]));

  const anomalias = detectAnomaliasFrete({
    fretesNoPeriodo: fretes,
    fretesTodos: fretes,
    pedidos: base.pedidos,
    insumoNome: base.insumoNome,
    fornecedorNome,
    hoje,
  });

  const fretePorId = new Map(base.fretes.map((f) => [f.id, f]));
  return {
    hoje,
    anomalias: anomalias.map((a) => ({
      ...a,
      rotuloDetector: FRETE_DETECTOR_LABEL[a.detector],
      conferencia: porChave.get(a.id) ?? null,
      fretes: a.affectedFreteIds.flatMap((id) => {
        const f = fretePorId.get(id);
        if (!f) return [];
        return [
          {
            id: f.id,
            data: f.data,
            origem: base.localidadeNome.get(f.origemId) ?? "",
            destino: base.localidadeNome.get(f.destinoId) ?? "",
            material: base.insumoNome.get(f.insumoId) ?? f.insumoId,
            peso: f.peso,
            placa: f.placaCarreta,
            notaFiscal: f.notaFiscal,
            valorMaterial: f.valorMaterial,
          },
        ];
      }),
    })),
  };
}
