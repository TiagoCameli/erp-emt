"use client";

import { BarraFiltrosConfiguravel, FiltroMes, useFiltrosUrl } from "@/components/canonicos";

export interface FiltroMesPainelProps {
  /** Mês mostrado (yyyy-MM), já com o padrão aplicado pela página. */
  mes: string;
  /** O mês veio da URL (e não do padrão)? Só então há o que limpar. */
  escolhido: boolean;
}

/** Mês da visão geral, na URL. Vazio volta ao mês corrente. */
export function FiltroMesPainel({ mes, escolhido }: FiltroMesPainelProps) {
  const { setMuitos } = useFiltrosUrl();
  return (
    <BarraFiltrosConfiguravel
      idTabela="combustivel.painel.filtros"
      onLimparFiltros={() => setMuitos({ mes: null })}
      filtros={[
        {
          id: "mes",
          rotulo: "Mês",
          fixo: true,
          temValor: escolhido,
          onLimpar: () => setMuitos({ mes: null }),
          elemento: <FiltroMes valor={mes} rotulo="Mês" onValorChange={(valor) => setMuitos({ mes: valor || null })} />,
        },
      ]}
    />
  );
}
