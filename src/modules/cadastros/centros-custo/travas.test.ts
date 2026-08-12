import { describe, expect, it } from "vitest";

import {
  nomeVemDeOutroCadastro,
  ondeRenomear,
} from "@/modules/cadastros/centros-custo/travas";

const raizDeObra = { obra_id: "obra-1", equipamento_id: null };
const etapaEquipamento = { obra_id: null, equipamento_id: "equip-1" };
const sistemaOuManual = { obra_id: null, equipamento_id: null };

describe("nomeVemDeOutroCadastro", () => {
  it("raiz de obra espelha o nome da obra", () => {
    expect(nomeVemDeOutroCadastro(raizDeObra)).toBe(true);
  });

  it("etapa de equipamento espelha o nome do equipamento", () => {
    expect(nomeVemDeOutroCadastro(etapaEquipamento)).toBe(true);
  });

  it("centro de sistema tem nome próprio e pode ser renomeado", () => {
    // É o caso do Escritório Central e do Manutenção de equipamentos: antes
    // ficavam travados junto com os espelhos, e era isso que impedia renomear.
    expect(nomeVemDeOutroCadastro(sistemaOuManual)).toBe(false);
  });

  it("etapa e item criados à mão têm nome próprio", () => {
    expect(nomeVemDeOutroCadastro(sistemaOuManual)).toBe(false);
  });
});

describe("ondeRenomear", () => {
  it("manda para Obras quando o nome espelha a obra", () => {
    expect(ondeRenomear(raizDeObra)).toContain("Obras");
  });

  it("manda para Equipamentos quando o nome espelha o equipamento", () => {
    expect(ondeRenomear(etapaEquipamento)).toContain("Equipamentos");
  });

  it("não tem para onde mandar quando o nome é do próprio nó", () => {
    expect(ondeRenomear(sistemaOuManual)).toBeNull();
  });

  it("obra tem precedência quando, por defeito de dado, os dois estão preenchidos", () => {
    expect(ondeRenomear({ obra_id: "o", equipamento_id: "e" })).toContain("obra");
  });
});
