import type { OrigemSaida } from "@/modules/combustivel/_shared/rotulos";

/** Origem curta, como a coluna da lista da origem ("Dinheiro", não "Dinheiro (posto)"). */
export const ROTULO_ORIGEM_CURTO: Record<OrigemSaida, string> = {
  tanque: "Tanque",
  dinheiro: "Dinheiro",
  requisicao: "Requisição",
};
