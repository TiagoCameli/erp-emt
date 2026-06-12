import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StatusBadge } from "@/components/canonicos/status-badge";
import type { StatusPadrao } from "@/components/canonicos/status-badge";

// Sem globals: true no vitest.config, o cleanup automático da RTL não roda.
afterEach(cleanup);

const ROTULOS_ESPERADOS: Record<StatusPadrao, string> = {
  rascunho: "Rascunho",
  pendente_aprovacao: "Pendente de aprovação",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
  recebido: "Recebido",
  pago: "Pago",
  faturado: "Faturado",
  executado: "Executado",
};

describe("StatusBadge", () => {
  it.each(Object.entries(ROTULOS_ESPERADOS))(
    "renderiza o rótulo pt-BR de %s",
    (status, rotuloEsperado) => {
      render(<StatusBadge status={status} />);
      expect(screen.getByText(rotuloEsperado)).toBeInTheDocument();
    },
  );

  it("rótulo custom prevalece sobre o rótulo do mapa", () => {
    const { getByText, queryByText } = render(
      <StatusBadge status="aprovado" rotulo="Liberado" />,
    );
    expect(getByText("Liberado")).toBeInTheDocument();
    expect(queryByText("Aprovado")).not.toBeInTheDocument();
  });

  it("status fora do padrão exibe a própria string como rótulo", () => {
    render(<StatusBadge status="em_transito" />);
    expect(screen.getByText("em_transito")).toBeInTheDocument();
  });

  it.each(Object.keys(ROTULOS_ESPERADOS))(
    "sempre tem texto visível para %s, nunca só cor",
    (status) => {
      const { container } = render(<StatusBadge status={status} />);
      expect(container.textContent?.trim()).not.toBe("");
    },
  );
});
