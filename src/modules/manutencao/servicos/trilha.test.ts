import { describe, expect, it } from "vitest";

import { eventosDaTrilhaOs } from "@/modules/manutencao/servicos/trilha";

const base = { usuarioNome: "Tiago", criadoEm: "2026-09-23T14:00:00Z" };

describe("eventosDaTrilhaOs", () => {
  it("abertura, início, conclusão, reabertura e cancelamento com título e tipo próprios", () => {
    const eventos = eventosDaTrilhaOs([
      { id: "1", statusDe: null, statusPara: "aberta", motivo: null, ...base },
      { id: "2", statusDe: "aberta", statusPara: "em_execucao", motivo: null, ...base },
      { id: "3", statusDe: "em_execucao", statusPara: "concluida", motivo: null, ...base },
      { id: "4", statusDe: "concluida", statusPara: "aberta", motivo: "Faltou a peça", ...base },
      { id: "5", statusDe: "aberta", statusPara: "cancelada", motivo: "Aberta em duplicidade", ...base },
    ]);
    expect(eventos.map((evento) => [evento.titulo, evento.tipo])).toEqual([
      ["OS aberta", "criacao"],
      ["Execução iniciada", "edicao"],
      ["OS concluída", "aprovacao"],
      ["OS reaberta", "desaprovacao"],
      ["OS cancelada", "rejeicao"],
    ]);
  });

  it("descrição diz de para e o motivo; usuário vem junto", () => {
    const [evento] = eventosDaTrilhaOs([
      { id: "4", statusDe: "concluida", statusPara: "aberta", motivo: "Faltou a peça", ...base },
    ]);
    expect(evento.descricao).toBe("Concluída para Aberta. Motivo: Faltou a peça");
    expect(evento.usuario).toBe("Tiago");
  });

  it("sem nome do usuário, o evento sai sem autor em vez de mostrar id", () => {
    const [evento] = eventosDaTrilhaOs([
      { id: "1", statusDe: null, statusPara: "aberta", motivo: null, usuarioNome: null, criadoEm: base.criadoEm },
    ]);
    expect(evento.usuario).toBeUndefined();
    expect(evento.descricao).toBe("Status: Aberta");
  });
});
