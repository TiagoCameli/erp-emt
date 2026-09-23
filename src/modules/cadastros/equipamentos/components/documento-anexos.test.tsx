import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";

vi.mock("@/modules/_shared/anexos/actions", () => ({
  anexosDoDocumento: vi.fn(async () => []),
  removerAnexo: vi.fn(async () => ({ ok: true })),
  urlDoAnexo: vi.fn(async () => ({ url: "https://exemplo/arquivo" })),
}));
vi.mock("@/modules/_shared/anexos/enviar-do-navegador", () => ({
  enviarAnexoDoNavegador: vi.fn(async () => ({ ok: true })),
}));

import {
  AnexosDocumentoEquipamento,
  BotaoAnexosDocumento,
  ENTIDADE_DOCUMENTO_EQUIPAMENTO,
  rotuloQuantidadeAnexos,
} from "./documento-anexos";

afterEach(cleanup);

function anexo(nome: string): AnexoDoDocumento {
  return {
    vinculoId: `v-${nome}`,
    arquivoId: `a-${nome}`,
    nome,
    tipoMime: "application/pdf",
    tamanhoBytes: 2048,
    criadoEm: "2026-09-20T12:00:00Z",
    criadoPorNome: null,
    propagado: false,
    origemNumero: null,
    origemRotulo: null,
  };
}

describe("rotuloQuantidadeAnexos", () => {
  it("singular, plural e zero", () => {
    expect(rotuloQuantidadeAnexos(0)).toBe("Sem anexo");
    expect(rotuloQuantidadeAnexos(1)).toBe("1 anexo");
    expect(rotuloQuantidadeAnexos(3)).toBe("3 anexos");
  });
});

describe("BotaoAnexosDocumento", () => {
  it("enquanto carrega fica desabilitado e não diz 'Sem anexo'", () => {
    render(
      <BotaoAnexosDocumento
        tipoDocumento="Licenciamento"
        anexos={null}
        aberto={false}
        onAlternar={() => {}}
      />,
    );
    const botao = screen.getByRole("button", {
      name: "Carregando anexos do documento Licenciamento",
    });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Sem anexo/)).toBeNull();
  });

  it("mostra a quantidade e alterna a seção", () => {
    const onAlternar = vi.fn();
    render(
      <BotaoAnexosDocumento
        tipoDocumento="Seguro"
        anexos={[anexo("apolice.pdf"), anexo("boleto.pdf")]}
        aberto={false}
        onAlternar={onAlternar}
      />,
    );
    const botao = screen.getByRole("button", {
      name: "2 anexos no documento Seguro",
    });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(botao.textContent).toContain("2");
    fireEvent.click(botao);
    expect(onAlternar).toHaveBeenCalledTimes(1);
  });

  it("documento sem vínculo diz 'Sem anexo'", () => {
    render(
      <BotaoAnexosDocumento
        tipoDocumento="Laudo"
        anexos={[]}
        aberto
        onAlternar={() => {}}
      />,
    );
    const botao = screen.getByRole("button", {
      name: "Sem anexo no documento Laudo",
    });
    expect(botao.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("AnexosDocumentoEquipamento", () => {
  it("usa a entidade do banco", () => {
    expect(ENTIDADE_DOCUMENTO_EQUIPAMENTO).toBe("equipamento_documento");
  });

  it("lista os anexos vindos do servidor pelo componente canônico", () => {
    render(
      <AnexosDocumentoEquipamento
        documentoId="d1"
        anexos={[anexo("crlv-2026.pdf")]}
        podeEditar={false}
        onMudou={() => {}}
      />,
    );
    expect(screen.getByText("crlv-2026.pdf")).toBeTruthy();
  });
});
