import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { instalarLayoutDeLista } from "@/components/canonicos/combobox-jsdom-teste";
import {
  BlocoAlocacaoMaquina,
  BlocoAlocacaoPessoa,
} from "@/modules/mapa/components/bloco-alocacao";
import type { EquipamentoMapa, PessoaMapa } from "@/modules/mapa/tipos";

/**
 * Bloco "Alocação" das fichas (v1.30): grava na hora, sem diálogo; a sugestão de um clique só
 * aparece depois de gravar; a máquina tem "Limpar operador".
 */

beforeAll(instalarLayoutDeLista);
afterEach(cleanup);

const SILO = "local-silo";
const maquina = (extra: Partial<EquipamentoMapa> = {}) =>
  ({
    id: "m1",
    codigo: "CB-001",
    descricao: "Escavadeira",
    placa: "",
    obraId: "obra1",
    obraNome: "BR-364",
    localidadeId: SILO,
    localidadeNome: "Silo",
    areaNome: "",
    operadorId: null,
    operadorNome: "",
    fontePosicao: "manual",
    ...extra,
  }) as unknown as EquipamentoMapa;
const pessoa = (extra: Partial<PessoaMapa> = {}) =>
  ({
    id: "p1",
    nome: "Jacson",
    funcao: "Operador",
    obraId: "obra1",
    obraMapaId: null,
    localidadeId: null,
    equipamentoId: null,
    areaId: null,
    centroCustoId: null,
    centroCustoNome: "",
    ...extra,
  }) as unknown as PessoaMapa;

function escolher(rotuloCampo: string, textoOpcao: string) {
  fireEvent.click(screen.getByRole("combobox", { name: rotuloCampo }));
  fireEvent.click(screen.getByText(textoOpcao));
}

describe("BlocoAlocacaoPessoa", () => {
  it("escolher a máquina grava na hora e depois sugere o local da máquina", async () => {
    const onAlocar = vi.fn(async () => true);
    render(
      <BlocoAlocacaoPessoa
        pessoa={pessoa()}
        maquinas={[maquina()]}
        localidades={[]}
        obras={[]}
        centrosCusto={[]}
        podeEditar
        salvando={false}
        onAlocar={onAlocar}
        onTrocarObra={vi.fn()}
      />,
    );
    escolher("Máquina que opera", "CB-001 · Escavadeira");
    expect(onAlocar).toHaveBeenCalledWith({
      colaboradorId: "p1",
      equipamentoId: "m1",
    });
    const chip = await screen.findByText("Usar também o local da máquina");
    fireEvent.click(chip);
    await waitFor(() =>
      expect(onAlocar).toHaveBeenLastCalledWith({
        colaboradorId: "p1",
        localidadeId: SILO,
      }),
    );
  });

  it("gravação recusada não oferece sugestão", async () => {
    const onAlocar = vi.fn(async () => false);
    render(
      <BlocoAlocacaoPessoa
        pessoa={pessoa()}
        maquinas={[maquina()]}
        localidades={[]}
        obras={[]}
        centrosCusto={[]}
        podeEditar
        salvando={false}
        onAlocar={onAlocar}
        onTrocarObra={vi.fn()}
      />,
    );
    escolher("Máquina que opera", "CB-001 · Escavadeira");
    await waitFor(() => expect(onAlocar).toHaveBeenCalled());
    expect(screen.queryByText(/Usar também/)).toBeNull();
  });

  it("máquina ocupada diz com quem está", () => {
    render(
      <BlocoAlocacaoPessoa
        pessoa={pessoa()}
        maquinas={[maquina({ operadorId: "p2", operadorNome: "Ana" })]}
        localidades={[]}
        obras={[]}
        centrosCusto={[]}
        podeEditar
        salvando={false}
        onAlocar={vi.fn(async () => true)}
        onTrocarObra={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Máquina que opera" }));
    expect(screen.getByText("CB-001 · Escavadeira · com Ana")).toBeTruthy();
  });
});

describe("BlocoAlocacaoMaquina", () => {
  it("Limpar operador tira quem opera, numa ação só", () => {
    const onAlocar = vi.fn(async () => true);
    render(
      <BlocoAlocacaoMaquina
        maquina={maquina({ operadorId: "p2", operadorNome: "Ana" })}
        pessoas={[]}
        codigoDe={new Map()}
        podeEditar
        salvando={false}
        onAlocar={onAlocar}
        onTransferir={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpar operador" }));
    expect(onAlocar).toHaveBeenCalledWith({
      colaboradorId: "p2",
      equipamentoId: null,
    });
    expect(screen.getByText("Transferir a máquina leva o operador junto.")).toBeTruthy();
  });

  it("escolher a pessoa assinala na máquina", () => {
    const onAlocar = vi.fn(async () => true);
    render(
      <BlocoAlocacaoMaquina
        maquina={maquina()}
        pessoas={[pessoa()]}
        codigoDe={new Map()}
        podeEditar
        salvando={false}
        onAlocar={onAlocar}
        onTransferir={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Limpar operador" })).toBeNull();
    escolher("Operador", "Jacson · Operador");
    expect(onAlocar).toHaveBeenCalledWith({
      colaboradorId: "p1",
      equipamentoId: "m1",
    });
  });
});
