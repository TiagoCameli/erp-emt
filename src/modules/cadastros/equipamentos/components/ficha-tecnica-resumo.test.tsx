import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { formatarQuantidade } from "@/lib/formatadores";
import {
  fichaDoRegistro,
  type FichaTecnica,
} from "@/modules/cadastros/equipamentos/ficha-tecnica";

import { FichaTecnicaResumo } from "./ficha-tecnica-resumo";

const VAZIA: FichaTecnica = fichaDoRegistro({
  equipamento_id: "11111111-2222-4333-8444-555555555555",
  capacidade_tanque_l: null,
  capacidade_oleo_motor_l: null,
  tipo_oleo_motor: null,
  capacidade_oleo_hidraulico_l: null,
  tipo_oleo_hidraulico: null,
  capacidade_oleo_transmissao_l: null,
  tipo_oleo_transmissao: null,
  capacidade_oleo_diferencial_l: null,
  capacidade_arrefecedor_l: null,
  pneu_medida: null,
  pneu_qtd: null,
  bateria_especificacao: null,
  bateria_qtd: null,
  filtros: null,
  consumo_esperado_l_h: null,
  consumo_esperado_km_l: null,
  garantia_fim_data: null,
  garantia_fim_medicao: null,
  observacoes_tecnicas: null,
});

describe("FichaTecnicaResumo", () => {
  afterEach(cleanup);

  it("ficha vazia mostra o aviso e nenhum grupo", () => {
    render(<FichaTecnicaResumo ficha={VAZIA} />);
    expect(screen.getByText("Ficha técnica não preenchida")).toBeInTheDocument();
    expect(screen.queryByText("Combustível e fluidos")).not.toBeInTheDocument();
  });

  it("mostra só os campos preenchidos, e só os grupos que têm algum", () => {
    render(
      <FichaTecnicaResumo
        controlePor="horimetro"
        ficha={{
          ...VAZIA,
          capacidadeTanqueL: 350.1234,
          capacidadeOleoMotorL: 15,
          tipoOleoMotor: "15W40",
          filtros: [{ tipo: "Ar", codigo: "AF-1" }],
          garantiaFimMedicao: 2000,
        }}
      />,
    );

    expect(screen.getByText("Tanque de combustível")).toBeInTheDocument();
    expect(screen.getByText(`${formatarQuantidade(350.1234)} L`)).toBeInTheDocument();
    expect(screen.getByText("15 L, 15W40")).toBeInTheDocument();
    expect(screen.getByText("Ar")).toBeInTheDocument();
    expect(screen.getByText("AF-1")).toBeInTheDocument();
    expect(screen.getByText(`${formatarQuantidade(2000)} h`)).toBeInTheDocument();

    // Linhas de controle: o que não foi preenchido não aparece.
    expect(screen.queryByText("Óleo hidráulico")).not.toBeInTheDocument();
    expect(screen.queryByText("Arrefecedor")).not.toBeInTheDocument();
    expect(screen.queryByText("Até a data")).not.toBeInTheDocument();
    expect(screen.queryByText("Pneus e bateria")).not.toBeInTheDocument();
    expect(screen.queryByText("Consumo esperado")).not.toBeInTheDocument();
    expect(screen.queryByText("Observações técnicas")).not.toBeInTheDocument();
    expect(screen.queryByText("Ficha técnica não preenchida")).not.toBeInTheDocument();
  });
});
