/**
 * A navegação do Combustível como a da origem (v2/CombustivelTabsNav): uma barra de abas
 * agrupada em Operacional e Analítico, com Relatórios e Lixeira à parte. No ERP cada aba é
 * uma rota; o recorte (modo, período e os filtros globais) viaja na URL de uma aba para a
 * outra, como o estado da barra de filtros da origem, que era um só para a tela inteira.
 */

import type { RecursoId } from "@/config/recursos";

export interface AbaCombustivel {
  rota: string;
  rotulo: string;
  /** Recurso cuja permissão `ver` mostra a aba. */
  recurso: RecursoId;
}

export interface GrupoAbas {
  /** Rótulo pequeno acima do grupo ("Operacional", "Analítico"); `null` = sem rótulo. */
  rotulo: string | null;
  abas: AbaCombustivel[];
}

export const ROTA_COMBUSTIVEL = "/combustivel";

export const GRUPOS_ABAS: readonly GrupoAbas[] = [
  { rotulo: null, abas: [{ rota: ROTA_COMBUSTIVEL, rotulo: "Visão Geral", recurso: "combustivel.painel" }] },
  {
    rotulo: "Operacional",
    abas: [
      { rota: "/combustivel/abastecimentos", rotulo: "Saídas", recurso: "combustivel.saidas" },
      { rota: "/combustivel/entradas", rotulo: "Entradas", recurso: "combustivel.entradas" },
      { rota: "/combustivel/transferencias", rotulo: "Transferências", recurso: "combustivel.transferencias" },
      { rota: "/combustivel/tanques", rotulo: "Tanques", recurso: "combustivel.tanques" },
    ],
  },
  {
    rotulo: "Analítico",
    abas: [
      { rota: "/combustivel/equipamentos", rotulo: "Equipamentos", recurso: "combustivel.painel" },
      { rota: "/combustivel/obras", rotulo: "Obras", recurso: "combustivel.painel" },
      { rota: "/combustivel/fornecedores", rotulo: "Fornecedores", recurso: "combustivel.painel" },
      { rota: "/combustivel/anomalias", rotulo: "Anomalias", recurso: "combustivel.anomalias" },
    ],
  },
  { rotulo: null, abas: [{ rota: "/combustivel/relatorios", rotulo: "Relatórios", recurso: "combustivel.relatorios" }] },
  { rotulo: null, abas: [{ rota: "/combustivel/lixeira", rotulo: "Lixeira", recurso: "combustivel.saidas" }] },
];

/**
 * As chaves da URL que formam o recorte global (a barra de filtros da origem). Só elas
 * atravessam de uma aba para outra: filtro próprio de uma lista (busca, página, coluna)
 * não faz sentido na aba vizinha.
 */
export const CHAVES_RECORTE = [
  "modo",
  "de",
  "ate",
  "obra",
  "equipamento",
  "tanque",
  "combustivel",
  "fornecedor",
  "operador",
  "transportadora",
  "placa",
] as const;

/** A aba ativa: a de rota mais longa que é prefixo do caminho (o detalhe acende a lista). */
export function abaAtiva(caminho: string, rotas: readonly string[]): string | null {
  let melhor: string | null = null;
  for (const rota of rotas) {
    const casa = rota === ROTA_COMBUSTIVEL ? caminho === rota : caminho === rota || caminho.startsWith(`${rota}/`);
    if (casa && (melhor === null || rota.length > melhor.length)) melhor = rota;
  }
  return melhor;
}

/** O link da aba levando o recorte atual (e nada além dele). */
export function hrefComRecorte(rota: string, atual: URLSearchParams): string {
  const params = new URLSearchParams();
  for (const chave of CHAVES_RECORTE) {
    for (const valor of atual.getAll(chave)) params.append(chave, valor);
  }
  const query = params.toString();
  return query ? `${rota}?${query}` : rota;
}

/**
 * Os botões "+ Nova Entrada/Saída/Transferência" do topo da origem abriam o formulário
 * por cima de qualquer aba. Aqui levam à lista com `?novo=1`, e a lista abre o drawer.
 */
export const PARAM_NOVO = "novo";

export function hrefNovo(rota: string, atual: URLSearchParams): string {
  const base = hrefComRecorte(rota, atual);
  return `${base}${base.includes("?") ? "&" : "?"}${PARAM_NOVO}=1`;
}
