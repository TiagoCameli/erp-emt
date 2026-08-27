import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

import {
  chavePermissao,
  MatrizRecursosAcoes,
} from "@/components/canonicos/matriz-recursos-acoes";
import { RECURSOS, type Acao } from "@/config/recursos";

/**
 * Recurso com as SEIS ações e recurso com menos que isso, escolhidos do
 * catálogo real. O botão "Tudo" tem que enxergar `recurso.acoes`, não as seis
 * colunas da tabela: se marcasse as seis sempre, o servidor descartaria as
 * inválidas em silêncio (`salvarMatrizUsuario` filtra por `recurso.acoes`) e a
 * tela ficaria dizendo que a permissão existe até alguém recarregar.
 */
const COMPLETO = RECURSOS.find((recurso) => recurso.acoes.length === 6)!;
const PARCIAL = RECURSOS.reduce((menor, recurso) =>
  recurso.acoes.length < menor.acoes.length ? recurso : menor,
);

afterEach(cleanup);

/** A linha da tabela de um recurso, achada pelo nome dele. */
function linhaDo(nome: string): HTMLElement {
  return screen.getByRole("cell", { name: nome }).closest("tr")!;
}

function botaoDaLinha(nome: string, acao: "Marcar" | "Desmarcar"): HTMLElement {
  return within(linhaDo(nome)).getByRole("button", {
    name: `${acao} todas as ações de ${nome}`,
  });
}

/**
 * Envoltório CONTROLADO, com atualização funcional — o contrato que o
 * componente exige de quem o usa. Sem a forma funcional, as N chamadas de
 * `onAlternar` do mesmo clique se sobrescrevem e só a última sobrevive: o botão
 * marcaria uma ação em vez da linha inteira.
 */
function MatrizControlada({
  inicial = [],
  onAlternar,
}: {
  inicial?: string[];
  onAlternar?: (recurso: string, acao: Acao, marcada: boolean) => void;
}) {
  const [selecionadas, setSelecionadas] = React.useState(
    () => new Set(inicial),
  );
  return (
    <MatrizRecursosAcoes
      selecionadas={selecionadas}
      onAlternar={(recurso, acao, marcada) => {
        onAlternar?.(recurso, acao, marcada);
        setSelecionadas((atual) => {
          const proxima = new Set(atual);
          const chave = chavePermissao(recurso, acao);
          if (marcada) proxima.add(chave);
          else proxima.delete(chave);
          return proxima;
        });
      }}
    />
  );
}

describe("MatrizRecursosAcoes: botão de todas as ações do recurso", () => {
  it("marca de uma vez SÓ as ações que o recurso tem", () => {
    const onAlternar = vi.fn();
    render(<MatrizControlada onAlternar={onAlternar} />);

    expect(PARCIAL.acoes.length).toBeLessThan(6);
    fireEvent.click(botaoDaLinha(PARCIAL.nome, "Marcar"));

    // Uma chamada por ação EXISTENTE, nunca pelas seis colunas da tabela.
    expect(onAlternar.mock.calls).toEqual(
      PARCIAL.acoes.map((acao) => [PARCIAL.id, acao, true]),
    );
  });

  it("com o recurso completo, marca a linha inteira de um clique", () => {
    render(<MatrizControlada />);

    const antes = within(linhaDo(COMPLETO.nome)).getAllByRole("checkbox");
    expect(antes).toHaveLength(6);
    fireEvent.click(botaoDaLinha(COMPLETO.nome, "Marcar"));

    const linha = within(linhaDo(COMPLETO.nome));
    expect(linha.getAllByRole("checkbox", { checked: true })).toHaveLength(6);
    // O rótulo passa a oferecer o contrário, que é como se desfaz o clique.
    expect(botaoDaLinha(COMPLETO.nome, "Desmarcar")).toHaveTextContent(
      "Limpar",
    );
  });

  it("completa o que falta a partir de uma linha PELA METADE", () => {
    const onAlternar = vi.fn();
    const jaMarcada = COMPLETO.acoes[0]!;
    render(
      <MatrizControlada
        inicial={[chavePermissao(COMPLETO.id, jaMarcada)]}
        onAlternar={onAlternar}
      />,
    );

    // Pela metade o botão ainda oferece MARCAR: meia linha não é linha cheia.
    fireEvent.click(botaoDaLinha(COMPLETO.nome, "Marcar"));

    // A que já estava marcada não é tocada. Alternar cegamente faria o "marcar
    // tudo" DESMARCAR justamente a permissão que já existia.
    expect(onAlternar.mock.calls).toEqual(
      COMPLETO.acoes
        .filter((acao) => acao !== jaMarcada)
        .map((acao) => [COMPLETO.id, acao, true]),
    );
    expect(
      within(linhaDo(COMPLETO.nome)).getAllByRole("checkbox", {
        checked: true,
      }),
    ).toHaveLength(6);
  });

  it("com a linha cheia o botão vira Limpar e desmarca tudo", () => {
    const onAlternar = vi.fn();
    render(
      <MatrizControlada
        inicial={COMPLETO.acoes.map((acao) =>
          chavePermissao(COMPLETO.id, acao),
        )}
        onAlternar={onAlternar}
      />,
    );

    fireEvent.click(botaoDaLinha(COMPLETO.nome, "Desmarcar"));

    expect(onAlternar.mock.calls).toEqual(
      COMPLETO.acoes.map((acao) => [COMPLETO.id, acao, false]),
    );
    expect(
      within(linhaDo(COMPLETO.nome)).queryAllByRole("checkbox", {
        checked: true,
      }),
    ).toHaveLength(0);
  });

  it("mexe só na própria linha: o recurso vizinho não se move", () => {
    render(<MatrizControlada />);

    fireEvent.click(botaoDaLinha(COMPLETO.nome, "Marcar"));

    // Linha de controle: sem ela, um "marcar tudo" que ignorasse o recurso e
    // varresse a matriz inteira passaria em todos os testes acima — dando
    // permissão de sistema inteiro a quem clicasse numa linha só.
    expect(
      within(linhaDo(PARCIAL.nome)).queryAllByRole("checkbox", {
        checked: true,
      }),
    ).toHaveLength(0);
  });

  it("desabilitada, o botão não marca nada", () => {
    const onAlternar = vi.fn();
    render(
      <MatrizRecursosAcoes
        selecionadas={new Set()}
        onAlternar={onAlternar}
        desabilitada
      />,
    );

    const botao = botaoDaLinha(COMPLETO.nome, "Marcar");
    expect(botao).toBeDisabled();

    fireEvent.click(botao);
    expect(onAlternar).not.toHaveBeenCalled();
  });
});
