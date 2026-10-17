import { describe, expect, it } from "vitest";

import { agruparRelatorio } from "@/modules/mapa/centros";
import { agruparRelatorioPessoas } from "@/modules/mapa/centros-pessoa";
import {
  montarPlanilhaDiasCentro,
  montarPlanilhaDiasPessoa,
} from "@/modules/mapa/centros-planilha";

const RAIZ = "11111111-1111-4111-8111-111111111111";
const SEM = "22222222-2222-4222-8222-222222222222";

describe("montarPlanilhaDiasCentro", () => {
  const rel = agruparRelatorio([
    { equipamentoId: "b", codigo: "EH-002", descricao: "Escavadeira", propriedade: "propria", centroId: SEM, centroNome: "Equipamento Sem Alocação", dias: 10 },
    { equipamentoId: "b", codigo: "EH-002", descricao: "Escavadeira", propriedade: "propria", centroId: RAIZ, centroNome: "009 - BR-364", dias: 6 },
    { equipamentoId: "a", codigo: "CB-001", descricao: "Caçamba", propriedade: "alugada", centroId: RAIZ, centroNome: "009 - BR-364", dias: 16 },
    { equipamentoId: "c", codigo: "COL-MZ-01", descricao: "Meloza Colorado - 01", propriedade: "colorado", centroId: SEM, centroNome: "Equipamento Sem Alocação", dias: 1 },
  ]);

  it("uma linha por máquina, uma coluna por centro, total por linha e linha de totais", () => {
    const wb = montarPlanilhaDiasCentro(rel, "outubro de 2026");
    const ws = wb.worksheets[0]!;
    const valores = ws.getSheetValues() as unknown[][];
    const linhas = valores.filter(Boolean).map((l) => l.slice(1));
    const cabecalho = linhas.findIndex((l) => l[0] === "Código");
    expect(linhas[cabecalho]).toEqual([
      "Código",
      "Equipamento",
      "Propriedade",
      "009 - BR-364",
      "Equipamento Sem Alocação",
      "Total",
    ]);
    expect(linhas[cabecalho + 1]).toEqual(["CB-001", "Caçamba", "Alugada", 16, 0, 16]);
    expect(linhas[cabecalho + 2]).toEqual(["COL-MZ-01", "Meloza Colorado - 01", "Alugada · Colorado", 0, 1, 1]);
    expect(linhas[cabecalho + 3]).toEqual(["EH-002", "Escavadeira", "Própria", 6, 10, 16]);
    expect(linhas[cabecalho + 4]).toEqual(["Total", "", "", 22, 11, 33]);
    expect(linhas.length).toBe(cabecalho + 5);
  });
});

describe("montarPlanilhaDiasPessoa", () => {
  it("uma linha por pessoa, uma coluna por centro, trabalhados, parados e total", () => {
    const rel = agruparRelatorioPessoas([
      { colaboradorId: "p1", nome: "Ana", funcao: "Operadora", centroId: RAIZ, centroNome: "009 - BR-364", estado: "trabalhando", dias: 12 },
      { colaboradorId: "p1", nome: "Ana", funcao: "Operadora", centroId: SEM, centroNome: "Pessoal Sem Alocação", estado: "parado", dias: 4 },
      { colaboradorId: "p2", nome: "Bruno", funcao: "", centroId: SEM, centroNome: "Pessoal Sem Alocação", estado: "trabalhando", dias: 1 },
    ]);
    const wb = montarPlanilhaDiasPessoa(rel, "outubro de 2026");
    const valores = wb.worksheets[0]!.getSheetValues() as unknown[][];
    const linhas = valores.filter(Boolean).map((l) => l.slice(1));
    const cabecalho = linhas.findIndex((l) => l[0] === "Pessoa");
    expect(linhas[cabecalho]).toEqual([
      "Pessoa",
      "Função",
      "009 - BR-364",
      "Pessoal Sem Alocação",
      "Trabalhados",
      "Parados",
      "Total",
    ]);
    expect(linhas[cabecalho + 1]).toEqual(["Ana", "Operadora", 12, 4, 12, 4, 16]);
    expect(linhas[cabecalho + 2]).toEqual(["Bruno", "", 0, 1, 1, 0, 1]);
    expect(linhas[cabecalho + 3]).toEqual(["Total", "", 12, 5, 13, 4, 17]);
    expect(linhas.length).toBe(cabecalho + 4);
  });
});
