import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { BarraFiltrosConfiguravel } from "@/components/canonicos/filter-bar";
import {
  escreverPreferenciasTabela,
  lerPreferenciasTabela,
  preferenciasVazias,
  VERSAO_PREFERENCIAS,
} from "@/components/canonicos/preferencias-tabela";
import {
  buscarPreferenciaTabela,
  limparPreferenciaTabela,
  salvarPreferenciaTabela,
} from "@/modules/_shared/preferencias-tabela/actions";

/**
 * O que está salvo para o usuário nesta rodada. Fica num objeto porque a fábrica
 * do vi.mock sobe para o topo do arquivo e não pode fechar sobre um `let` normal.
 */
const preferencia = vi.hoisted(() => ({ salva: null as string | null }));

/**
 * Portas dos dois lados da fila de gravação, para o teste segurar o save no ar e
 * ver se o delete espera por ele. `null` = a ação resolve na hora.
 */
const portas = vi.hoisted(() => ({
  salvar: null as null | (() => void),
  limpar: null as null | (() => void),
}));

// A barra busca e grava a preferência por Server Action, e Server Action usa
// cookies(), que não existe fora de uma requisição.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => preferencia.salva),
  salvarPreferenciaTabela: vi.fn(
    () =>
      new Promise<void>((resolve) => {
        if (portas.salvar === null) resolve();
        else portas.salvar = resolve;
      }),
  ),
  limparPreferenciaTabela: vi.fn(
    () =>
      new Promise<void>((resolve) => {
        if (portas.limpar === null) resolve();
        else portas.limpar = resolve;
      }),
  ),
}));

const ID = "cadastros.categorias.filtros";
const IDS_FILTROS = ["busca", "status", "grupo"];

beforeEach(() => {
  preferencia.salva = null;
  portas.salvar = null;
  portas.limpar = null;
  vi.mocked(buscarPreferenciaTabela).mockClear();
  vi.mocked(salvarPreferenciaTabela).mockClear();
  vi.mocked(limparPreferenciaTabela).mockClear();
});

afterEach(() => {
  cleanup();
});

interface Opcoes {
  /** O filtro "status" tem valor escolhido agora? */
  statusComValor?: boolean;
  onLimparStatus?: () => void;
}

/**
 * Uma barra com os três casos que existem nas telas de Cadastros: um filtro fixo
 * (a busca), um que nasce visível e um que nasce escondido.
 */
function montar({ statusComValor = false, onLimparStatus }: Opcoes = {}) {
  return render(
    <BarraFiltrosConfiguravel
      idTabela={ID}
      filtros={[
        {
          id: "busca",
          rotulo: "Busca",
          fixo: true,
          elemento: <input aria-label="Busca" />,
        },
        {
          id: "status",
          rotulo: "Status",
          temValor: statusComValor,
          onLimpar: onLimparStatus,
          elemento: <input aria-label="Status" />,
        },
        {
          id: "grupo",
          rotulo: "Grupo",
          ocultoPorPadrao: true,
          elemento: <input aria-label="Grupo" />,
        },
      ]}
    />,
  );
}

/** Liga ou desliga um filtro no menu "Filtros". O Radix abre no pointerdown. */
function alternarFiltro(rotulo: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name: /Filtros/ }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: rotulo }));
  // Menu aberto marca o resto da tela com aria-hidden, e aí getByRole não acha
  // mais o botão que o abriu.
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
}

/** A última preferência gravada, já interpretada pelo leitor do canônico. */
function ultimaSalva() {
  const chamadas = vi.mocked(salvarPreferenciaTabela).mock.calls;
  expect(chamadas.length).toBeGreaterThan(0);
  return lerPreferenciasTabela(chamadas[chamadas.length - 1][1], [], IDS_FILTROS);
}

describe("BarraFiltrosConfiguravel", () => {
  it("mostra o fixo e o visível por padrão, e esconde o ocultoPorPadrao", () => {
    montar();

    expect(screen.getByLabelText("Busca")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.queryByLabelText("Grupo")).toBeNull();
  });

  it("ligar um filtro escondido mostra o campo e grava só os filtros", () => {
    montar();

    alternarFiltro("Grupo");

    expect(screen.getByLabelText("Grupo")).toBeInTheDocument();
    const salva = ultimaSalva();
    expect(salva?.filtros).toEqual({ grupo: true });
    // A barra não tem coluna nem largura para guardar: gravar qualquer coisa
    // aqui apagaria a configuração de tabela de quem dividir a chave.
    expect(salva?.versao).toBe(VERSAO_PREFERENCIAS);
    expect(salva?.visiveis).toEqual({});
    expect(salva?.ordem).toEqual([]);
    expect(salva?.larguras).toEqual({});
    expect(salva?.alturaLinha).toBeNull();
  });

  it("esconder um filtro preenchido limpa o valor dele", () => {
    const onLimpar = vi.fn();
    montar({ statusComValor: true, onLimparStatus: onLimpar });

    alternarFiltro("Status");

    expect(onLimpar).toHaveBeenCalledTimes(1);
  });

  it("filtro preenchido continua na tela mesmo escondido na preferência", async () => {
    preferencia.salva = escreverPreferenciasTabela({
      ...preferenciasVazias(),
      filtros: { status: false },
    });
    montar({ statusComValor: true });
    await act(async () => undefined);

    expect(screen.getByLabelText("Status")).toBeInTheDocument();
  });

  it("hidrata do banco: filtro escondido por padrão nasce visível se estava salvo", async () => {
    preferencia.salva = escreverPreferenciasTabela({
      ...preferenciasVazias(),
      filtros: { grupo: true, status: false },
    });
    montar();
    await act(async () => undefined);

    expect(screen.getByLabelText("Grupo")).toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).toBeNull();
    expect(buscarPreferenciaTabela).toHaveBeenCalledWith(ID);
  });

  it("filtro fixo não pode ser escondido", () => {
    montar();
    fireEvent.pointerDown(screen.getByRole("button", { name: /Filtros/ }), {
      button: 0,
      ctrlKey: false,
    });

    expect(
      screen.getByRole("menuitemcheckbox", { name: "Busca" }),
    ).toHaveAttribute("data-disabled");
  });

  it("voltar ao padrão da tela apaga a preferência em vez de gravar lixo", async () => {
    montar();

    alternarFiltro("Grupo");
    expect(salvarPreferenciaTabela).toHaveBeenCalledTimes(1);

    alternarFiltro("Grupo");
    // O delete sai atrás do save na fila, então cai num microtask.
    await act(async () => undefined);
    expect(limparPreferenciaTabela).toHaveBeenCalledWith(ID);
    expect(salvarPreferenciaTabela).toHaveBeenCalledTimes(1);
  });

  it("o delete do voltar ao padrão espera o save anterior terminar", async () => {
    // Porta armada: o save fica no ar até o teste soltar.
    portas.salvar = () => undefined;
    montar();

    alternarFiltro("Grupo");
    const soltarSave = portas.salvar;
    expect(salvarPreferenciaTabela).toHaveBeenCalledTimes(1);

    alternarFiltro("Grupo");
    // Sem a fila o delete sairia agora, chegaria antes do save e a preferência
    // que a pessoa acabou de desfazer voltaria viva no próximo carregamento.
    expect(limparPreferenciaTabela).not.toHaveBeenCalled();

    await act(async () => {
      soltarSave?.();
    });
    expect(limparPreferenciaTabela).toHaveBeenCalledTimes(1);
  });

  it("falha de gravação não trava a fila nem quebra a tela", async () => {
    vi.mocked(salvarPreferenciaTabela).mockRejectedValueOnce(new Error("rede"));
    montar();

    alternarFiltro("Grupo");
    await act(async () => undefined);

    alternarFiltro("Grupo");
    await act(async () => undefined);
    expect(limparPreferenciaTabela).toHaveBeenCalledTimes(1);
  });
});
