"use client";

import { BlocoFiltros, FilterBar, FiltroSelectMulti, useFiltrosUrl, type CampoDaBarra } from "@/components/canonicos";
import { escreverListaNaUrl } from "@/modules/financeiro/_shared/listas-na-url";
import {
  ROTULO_STATUS_CONTRATO,
  ROTULO_TIPO_CONTRATANTE,
  STATUS_CONTRATO,
  TIPOS_CONTRATANTE,
} from "@/modules/medicao/_shared/rotulos";

const OPCOES_STATUS = STATUS_CONTRATO.map((s) => ({ valor: s, rotulo: ROTULO_STATUS_CONTRATO[s] }));
const OPCOES_TIPO = TIPOS_CONTRATANTE.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_CONTRATANTE[t] }));

export interface PainelFiltrosProps {
  /** Status escolhidos (`?status=`), na URL. Vazio = todos. */
  status: string[];
  /** Tipos de contratante escolhidos (`?tipo=`), na URL. Vazio = todos. */
  tipos: string[];
}

/**
 * Barra do painel: status do contrato e tipo de contratante, os dois de escolha múltipla e na
 * URL. Lista vazia é "todos" tanto aqui quanto na RPC (ver `queries.ts`), então o mesmo vazio que
 * a barra grava é o que a consulta manda.
 */
export function PainelFiltros({ status, tipos }: PainelFiltrosProps) {
  const { setMuitos } = useFiltrosUrl();

  const campos: CampoDaBarra[] = [
    {
      id: "status",
      rotulo: "Status",
      elemento: (
        <FiltroSelectMulti
          valores={status}
          onValoresChange={(novos) => setMuitos({ status: escreverListaNaUrl(novos) })}
          opcoes={OPCOES_STATUS}
          todosRotulo="Todos os status"
        />
      ),
    },
    {
      id: "tipo",
      rotulo: "Tipo de contratante",
      elemento: (
        <FiltroSelectMulti
          valores={tipos}
          onValoresChange={(novos) => setMuitos({ tipo: escreverListaNaUrl(novos) })}
          opcoes={OPCOES_TIPO}
          todosRotulo="Todos os tipos"
        />
      ),
    },
  ];

  return (
    <FilterBar>
      <BlocoFiltros campos={campos} />
    </FilterBar>
  );
}
