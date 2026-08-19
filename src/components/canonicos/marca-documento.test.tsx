import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LogoEmt } from "@/components/canonicos/logo-emt";
import {
  CabecalhoDocumento,
  EmissaoDocumento,
  PistaEmt,
  RodapeEmpresa,
} from "@/components/canonicos/marca-documento";
import { EMPRESA } from "@/config/marca";

// Sem globals: true no vitest.config, o cleanup automático da RTL não roda.
afterEach(cleanup);

describe("LogoEmt", () => {
  it("com título é imagem com nome acessível; sem título é decoração", () => {
    const { container: comTitulo } = render(
      <LogoEmt titulo="EMT Construtora" />,
    );
    expect(
      comTitulo.querySelector('svg[role="img"][aria-label="EMT Construtora"]'),
    ).not.toBeNull();

    cleanup();

    // Sem título o SVG some do leitor de tela de propósito: quando o nome da
    // empresa já está escrito em texto ao lado, anunciar a logo é repetição.
    const { container: sem } = render(<LogoEmt />);
    expect(sem.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(sem.querySelector('svg[role="img"]')).toBeNull();
  });

  it("a variante simbolo corta o wordmark e mantém as letras", () => {
    const { container: completa } = render(<LogoEmt variante="completa" />);
    const { container: simbolo } = render(<LogoEmt variante="simbolo" />);

    // O recorte é o viewBox, e é o que diferencia as variantes: a `simbolo`
    // começa em y=150, depois do "Construtora Ltda".
    expect(completa.querySelector("svg")?.getAttribute("viewBox")).toBe(
      "0 0 932 742",
    );
    expect(simbolo.querySelector("svg")?.getAttribute("viewBox")).toBe(
      "0 150 932 592",
    );
    // Um path a menos: o wordmark não é desenhado na variante compacta, e não
    // apenas escondido por recorte (path fora do viewBox ainda pesa e ainda sai
    // no PDF de quem imprime).
    expect(completa.querySelectorAll("path")).toHaveLength(3);
    expect(simbolo.querySelectorAll("path")).toHaveLength(2);
  });

  it("mono pinta a marca inteira com currentColor, sem hex fixo", () => {
    const { container } = render(<LogoEmt mono />);
    const svg = container.querySelector("svg");
    if (!svg) throw new Error("svg não renderizou");

    // O uso de `mono` é sobre fundo colorido (a barra verde de um cabeçalho).
    // Qualquer hex sobrando aqui vira uma mancha da cor errada em cima do
    // fundo — por isso a checagem é no HTML todo, não path por path.
    expect(svg.outerHTML).not.toMatch(/#[0-9A-Fa-f]{6}/);
    expect(svg.outerHTML).toContain("currentColor");
  });
});

describe("RodapeEmpresa", () => {
  it("identifica a empresa com razão social, CNPJ, endereço e contato", () => {
    render(<RodapeEmpresa />);

    // Vem do config, não escrito no teste: é o config que os documentos leem, e
    // um teste com o CNPJ digitado à mão passaria mesmo depois de alguém trocar
    // o valor real por um errado.
    expect(screen.getByText(EMPRESA.razaoSocial)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(EMPRESA.cnpj.replace(/[./]/g, "\\$&"))),
    ).toBeInTheDocument();
    expect(screen.getByText(EMPRESA.endereco)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(EMPRESA.email.replace(/[.@]/g, "\\$&"))),
    ).toBeInTheDocument();
  });
});

describe("CabecalhoDocumento", () => {
  it("põe o título como o h1 do documento, com a logo do lado", () => {
    const { container } = render(
      <CabecalhoDocumento titulo="Pagamento" subtitulo="LAN-2026-0015" />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Pagamento" }),
    ).toBeInTheDocument();
    expect(screen.getByText("LAN-2026-0015")).toBeInTheDocument();
    expect(
      container.querySelector(`svg[aria-label="${EMPRESA.nome}"]`),
    ).not.toBeNull();
  });

  it("sem subtítulo não deixa linha vazia no lugar", () => {
    const { container } = render(<CabecalhoDocumento titulo="Holerite" />);
    // Holerite não tem número de documento. Renderizar um span vazio abriria um
    // vão no cabeçalho que parece dado faltando.
    expect(container.querySelectorAll("span")).toHaveLength(0);
  });
});

describe("EmissaoDocumento", () => {
  it("diz quando o papel foi gerado e por quem", () => {
    render(
      <EmissaoDocumento
        emitidoPor="Tiago Cameli"
        emitidoEm="2026-08-19T14:00:00Z"
      />,
    );
    // 14:00Z em America/Rio_Branco (UTC-5) é 09:00 do mesmo dia.
    expect(screen.getByText(/19\/08\/2026 09:00/)).toBeInTheDocument();
    expect(screen.getByText(/Tiago Cameli/)).toBeInTheDocument();
  });
});

describe("PistaEmt", () => {
  it("é asfalto com o eixo amarelo, e não um gradiente", () => {
    const { container } = render(<PistaEmt />);
    const asfalto = container.firstElementChild;

    // Dois elementos com cor de fundo: gradiente é a primeira coisa que o
    // navegador descarta quando a impressão está sem gráficos de fundo, e a
    // divisória sumiria inteira em vez de sair só sem cor.
    expect(asfalto?.className).toContain("bg-[#45464B]");
    expect(asfalto?.firstElementChild?.className).toContain("bg-[#CF943A]");
  });
});
