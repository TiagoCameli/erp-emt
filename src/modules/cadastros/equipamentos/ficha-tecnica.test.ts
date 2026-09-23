import { describe, expect, it } from "vitest";

import {
  fichaDoRegistro,
  fichaParaFormulario,
  fichaTecnicaFormSchema,
  fichaTecnicaSchema,
  filtrosDoJson,
  numeroDaFicha,
  quantidadeDaFicha,
  registroDaFicha,
  type FichaTecnicaFormInput,
  type RegistroFichaTecnica,
} from "@/modules/cadastros/equipamentos/ficha-tecnica";

const EQUIPAMENTO = "11111111-2222-4333-8444-555555555555";

const FORM_EM_BRANCO = fichaParaFormulario(null);

function form(parcial: Partial<FichaTecnicaFormInput>): FichaTecnicaFormInput {
  return { ...FORM_EM_BRANCO, ...parcial };
}

const LINHA_VAZIA: RegistroFichaTecnica = {
  equipamento_id: EQUIPAMENTO,
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
};

describe("filtrosDoJson", () => {
  it("null, número, texto e booleano viram lista vazia", () => {
    for (const valor of [null, undefined, 42, "PSL-123", true]) {
      expect(filtrosDoJson(valor), String(valor)).toEqual([]);
    }
  });

  it("lê a forma que o módulo grava e descarta item sem nada", () => {
    expect(
      filtrosDoJson([
        { tipo: " Óleo do motor ", codigo: "PSL-123" },
        { tipo: "", codigo: "" },
        null,
        [1, 2],
      ]),
    ).toEqual([{ tipo: "Óleo do motor", codigo: "PSL-123" }]);
  });

  it("tolera apelidos, código numérico, lista de textos e objeto chave/valor", () => {
    expect(filtrosDoJson([{ nome: "Ar", referencia: 4455 }])).toEqual([
      { tipo: "Ar", codigo: "4455" },
    ]);
    expect(filtrosDoJson(["PSL-1", " ", 77])).toEqual([
      { tipo: "", codigo: "PSL-1" },
      { tipo: "", codigo: "77" },
    ]);
    expect(filtrosDoJson({ Combustível: "FF-5", Vazio: "" })).toEqual([
      { tipo: "Combustível", codigo: "FF-5" },
    ]);
  });
});

describe("números da ficha", () => {
  it("aceita 4 casas, com vírgula ou ponto decimal", () => {
    expect(numeroDaFicha("12,3456")).toBe(12.3456);
    expect(numeroDaFicha("6.3947")).toBe(6.3947);
    expect(numeroDaFicha("1.234,5")).toBe(1234.5);
  });

  it("vazio é null; 5 casas, texto e acima do NUMERIC(14,4) são recusados", () => {
    expect(numeroDaFicha("")).toBeNull();
    expect(numeroDaFicha("   ")).toBeNull();
    expect(numeroDaFicha("1,23456")).toBeUndefined();
    expect(numeroDaFicha("doze")).toBeUndefined();
    expect(numeroDaFicha("-3")).toBeUndefined();
    expect(numeroDaFicha("99999999999")).toBeUndefined();
  });

  it("quantidade é inteira e não negativa", () => {
    expect(quantidadeDaFicha("6")).toBe(6);
    expect(quantidadeDaFicha(" 0 ")).toBe(0);
    expect(quantidadeDaFicha("")).toBeNull();
    for (const texto of ["1,5", "-1", "seis", "1000"]) {
      expect(quantidadeDaFicha(texto), texto).toBeUndefined();
    }
  });
});

describe("fichaTecnicaSchema", () => {
  it("formulário em branco vira tudo null e filtros vazio", () => {
    const r = fichaTecnicaSchema.safeParse(FORM_EM_BRANCO);
    expect(r.success).toBe(true);
    if (!r.success) return;
    for (const [chave, valor] of Object.entries(r.data)) {
      if (chave === "filtros") expect(valor).toEqual([]);
      else expect(valor, chave).toBeNull();
    }
  });

  it("converte números com 4 casas, texto aparado e string vazia em null", () => {
    const r = fichaTecnicaSchema.safeParse(
      form({
        capacidadeTanqueL: "350,1234",
        capacidadeOleoMotorL: "15",
        tipoOleoMotor: "  15W40  ",
        tipoOleoHidraulico: "   ",
        pneuQtd: "6",
        consumoEsperadoLH: "12.5",
        garantiaFimData: "2027-03-31",
        garantiaFimMedicao: "2000",
        observacoesTecnicas: "",
      }),
    );
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.capacidadeTanqueL).toBe(350.1234);
    expect(r.data.capacidadeOleoMotorL).toBe(15);
    expect(r.data.tipoOleoMotor).toBe("15W40");
    expect(r.data.tipoOleoHidraulico).toBeNull();
    expect(r.data.pneuQtd).toBe(6);
    expect(r.data.consumoEsperadoLH).toBe(12.5);
    expect(r.data.garantiaFimData).toBe("2027-03-31");
    expect(r.data.garantiaFimMedicao).toBe(2000);
    expect(r.data.observacoesTecnicas).toBeNull();
  });

  it("recusa 5 casas, quantidade decimal e data fora do formato", () => {
    expect(fichaTecnicaFormSchema.safeParse(form({ capacidadeTanqueL: "1,23456" })).success).toBe(false);
    expect(fichaTecnicaFormSchema.safeParse(form({ bateriaQtd: "1,5" })).success).toBe(false);
    expect(fichaTecnicaFormSchema.safeParse(form({ garantiaFimData: "31/03/2027" })).success).toBe(false);
  });

  it("filtro: linha em branco some, tipo sem código é recusado, código sem tipo passa", () => {
    const r = fichaTecnicaSchema.safeParse(
      form({
        filtros: [
          { tipo: " Ar ", codigo: " AF-1 " },
          { tipo: "", codigo: "" },
          { tipo: "", codigo: "FF-2" },
        ],
      }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.filtros).toEqual([
        { tipo: "Ar", codigo: "AF-1" },
        { tipo: "", codigo: "FF-2" },
      ]);
    }

    const recusado = fichaTecnicaFormSchema.safeParse(
      form({ filtros: [{ tipo: "Óleo", codigo: "" }] }),
    );
    expect(recusado.success).toBe(false);
    if (!recusado.success) {
      expect(recusado.error.issues[0]?.path).toEqual(["filtros", 0, "codigo"]);
    }
  });
});

describe("mapeamento com o banco", () => {
  it("linha do banco vira ficha em camelCase, com filtros tolerados", () => {
    const ficha = fichaDoRegistro({
      ...LINHA_VAZIA,
      capacidade_tanque_l: 350.1234,
      tipo_oleo_motor: "15W40",
      pneu_qtd: 6,
      filtros: { Ar: "AF-1" },
      garantia_fim_data: "2027-03-31",
    });
    expect(ficha.equipamentoId).toBe(EQUIPAMENTO);
    expect(ficha.capacidadeTanqueL).toBe(350.1234);
    expect(ficha.tipoOleoMotor).toBe("15W40");
    expect(ficha.pneuQtd).toBe(6);
    expect(ficha.filtros).toEqual([{ tipo: "Ar", codigo: "AF-1" }]);
    expect(ficha.garantiaFimData).toBe("2027-03-31");
    expect(ficha.capacidadeOleoMotorL).toBeNull();
  });

  it("ida e volta: banco > formulário > schema > banco devolve a mesma linha", () => {
    const linha: RegistroFichaTecnica = {
      ...LINHA_VAZIA,
      capacidade_tanque_l: 350.1234,
      capacidade_oleo_motor_l: 15,
      tipo_oleo_motor: "15W40",
      pneu_medida: "295/80R22.5",
      pneu_qtd: 6,
      bateria_qtd: 2,
      filtros: [{ tipo: "Ar", codigo: "AF-1" }],
      consumo_esperado_km_l: 2.75,
      garantia_fim_medicao: 1999.5,
      observacoes_tecnicas: "Trocar a cada 250 h",
    };
    const valores = fichaParaFormulario(fichaDoRegistro(linha));
    expect(valores.capacidadeTanqueL).toBe("350,1234");
    expect(valores.pneuQtd).toBe("6");

    const r = fichaTecnicaSchema.safeParse(valores);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(registroDaFicha(EQUIPAMENTO, r.data)).toEqual(linha);
  });

  it("lista de filtros vazia grava null", () => {
    const r = fichaTecnicaSchema.safeParse(FORM_EM_BRANCO);
    if (!r.success) throw new Error("formulário em branco deveria passar");
    expect(registroDaFicha(EQUIPAMENTO, r.data).filtros).toBeNull();
  });
});
