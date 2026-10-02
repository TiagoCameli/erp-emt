import { describe, expect, it } from "vitest";

import { eventoMedicaoParaTrilha, type EventoMedicao } from "./eventos";

const base: EventoMedicao = {
  id: "e1",
  evento: "abrir",
  deStatus: null,
  paraStatus: "aberta",
  motivo: null,
  criadoEm: "2026-10-01T10:00:00Z",
  usuarioNome: "Tiago",
};

describe("eventoMedicaoParaTrilha", () => {
  it("traduz cada evento do ciclo para título e destaque da trilha", () => {
    const casos: [string, string, string][] = [
      ["abrir", "Medição aberta", "criacao"],
      ["fechar", "Medição fechada para conferência", "edicao"],
      ["versao", "Planilha da medição trocada", "edicao"],
      ["reabrir", "Medição reaberta", "rejeicao"],
      ["enviar", "Revisão enviada ao contratante", "documento"],
      ["nova_revisao", "Nova revisão aberta", "rejeicao"],
      ["aprovar", "Medição aprovada", "aprovacao"],
      ["aprovar_revisao", "Revisão pós-aprovação aprovada", "aprovacao"],
      ["revisao_pos", "Revisão pós-aprovação aberta", "desaprovacao"],
      ["carga", "Medição trazida na carga inicial", "criacao"],
      ["reajuste", "Reajuste registrado", "documento"],
      ["reajuste_excluido", "Relatório de reajuste excluído", "rejeicao"],
    ];
    for (const [evento, titulo, tipo] of casos) {
      const e = eventoMedicaoParaTrilha({ ...base, evento });
      expect(e.titulo).toBe(titulo);
      expect(e.tipo).toBe(tipo);
    }
  });

  it("descrição junta o motivo e a mudança de status, com os rótulos pt-BR", () => {
    const e = eventoMedicaoParaTrilha({
      ...base,
      id: "e2",
      evento: "reabrir",
      deStatus: "em_conferencia",
      paraStatus: "aberta",
      motivo: "Faltou o lançamento do dia 12",
    });
    expect(e).toEqual({
      id: "e2",
      data: "2026-10-01T10:00:00Z",
      titulo: "Medição reaberta",
      descricao: "Faltou o lançamento do dia 12 · de Em conferência para Aberta",
      usuario: "Tiago",
      tipo: "rejeicao",
    });
  });

  it("sem mudança de status (revisão pós) mostra só o motivo; sem usuário fica sem rodapé de nome", () => {
    const e = eventoMedicaoParaTrilha({
      ...base,
      evento: "revisao_pos",
      deStatus: "aprovada",
      paraStatus: "aprovada",
      motivo: "REV02: DNIT pediu correção",
      usuarioNome: null,
    });
    expect(e.descricao).toBe("REV02: DNIT pediu correção");
    expect(e.usuario).toBeUndefined();
  });

  it("reajuste: a descrição é o texto gravado pelo banco, sem mudança de status", () => {
    const e = eventoMedicaoParaTrilha({
      ...base,
      evento: "reajuste",
      deStatus: "aprovada",
      paraStatus: "aprovada",
      motivo: "Relatório SIAC 2, índices definitivos: R$ -40.021,28",
    });
    expect(e.titulo).toBe("Reajuste registrado");
    expect(e.descricao).toBe("Relatório SIAC 2, índices definitivos: R$ -40.021,28");
  });

  it("evento desconhecido não quebra: título é o próprio código", () => {
    const e = eventoMedicaoParaTrilha({ ...base, evento: "algo_novo", paraStatus: null });
    expect(e.titulo).toBe("algo_novo");
    expect(e.tipo).toBe("outro");
  });
});
