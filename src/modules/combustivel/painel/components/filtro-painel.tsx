"use client";

import { BarraFiltrosConfiguravel, FiltroPeriodo, FiltroSelect, useFiltrosUrl } from "@/components/canonicos";
import { MODOS, ROTULO_MODO, type Modo } from "@/modules/combustivel/anomalias/base";

const OPCOES_MODO = MODOS.map((modo) => ({ valor: modo, rotulo: ROTULO_MODO[modo] }));

export interface FiltroPainelProps {
  /** Período (yyyy-MM-dd) já com o padrão aplicado pela página. */
  de: string;
  ate: string;
  /** O período veio da URL (e não do padrão)? Só então há o que limpar. */
  periodoEscolhido: boolean;
  modo: Modo;
}

/**
 * O recorte da Visão Geral da origem, na URL: o modo (ModeSwitch: equipamentos próprios
 * ou carretas) e o período (padrão: últimos 30 dias).
 */
export function FiltroPainel({ de, ate, periodoEscolhido, modo }: FiltroPainelProps) {
  const { setMuitos } = useFiltrosUrl();
  return (
    <BarraFiltrosConfiguravel
      idTabela="combustivel.painel.filtros"
      onLimparFiltros={() => setMuitos({ de: null, ate: null, modo: null })}
      filtros={[
        {
          id: "modo",
          rotulo: "Consumidor",
          fixo: true,
          temValor: modo !== "proprios",
          onLimpar: () => setMuitos({ modo: null }),
          elemento: (
            <FiltroSelect
              valor={modo}
              obrigatorio
              onValorChange={(valor) => setMuitos({ modo: valor === "proprios" || valor === "" ? null : valor })}
              opcoes={OPCOES_MODO}
            />
          ),
        },
        {
          id: "periodo",
          rotulo: "Período",
          fixo: true,
          temValor: periodoEscolhido,
          onLimpar: () => setMuitos({ de: null, ate: null }),
          elemento: (
            <FiltroPeriodo
              de={de}
              ate={ate}
              rotulo="Data da saída"
              onPeriodoChange={(novoDe, novoAte) =>
                setMuitos({ de: novoDe === "" ? null : novoDe, ate: novoAte === "" ? null : novoAte })
              }
            />
          ),
        },
      ]}
    />
  );
}
