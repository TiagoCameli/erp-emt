import { describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";
import {
  diferencaParaFechar,
  diffDoRateio,
  motivoParaNaoSalvar,
  somarRateios,
  type RateioForm,
} from "./rateio-editavel";

/** Atalho para montar uma linha do formulário sem repetir o objeto inteiro. */
function linha(centroCustoId: string, valor: string): RateioForm {
  return { centroCustoId, valor };
}

const CAVALO_03 = "11111111-1111-4111-8111-111111111111";
const CAVALO_04 = "22222222-2222-4222-8222-222222222222";
const CAVALO_05 = "33333333-3333-4333-8333-333333333333";

describe("somarRateios", () => {
  it("soma em centavos, sem acumular resto binário", () => {
    // 0,1 + 0,2 em float dá 0.30000000000000004. Em centavos dá 0,30.
    const soma = somarRateios([linha(CAVALO_03, "0,10"), linha(CAVALO_04, "0,20")]);
    expect(soma).toBe(0.3);
  });

  it("soma o rateio real do lançamento do seguro sem perder centavo", () => {
    // Os quatro caminhões do LAN do seguro: três de 32.454,08 e um de 32.454,10.
    const soma = somarRateios([
      linha(CAVALO_03, "32454,08"),
      linha(CAVALO_04, "32454,08"),
      linha(CAVALO_05, "32454,10"),
      linha("44444444-4444-4444-8444-444444444444", "32454,08"),
    ]);
    expect(soma).toBe(129816.34);
  });

  it("conta linha em branco como zero em vez de virar NaN", () => {
    expect(somarRateios([linha(CAVALO_03, ""), linha(CAVALO_04, "10,00")])).toBe(10);
  });
});

describe("diferencaParaFechar", () => {
  it("é zero quando o rateio fecha com o valor do lançamento", () => {
    expect(
      diferencaParaFechar([linha(CAVALO_03, "60,00"), linha(CAVALO_04, "40,00")], 100),
    ).toBe(0);
  });

  it("é positiva quando falta dinheiro para distribuir", () => {
    expect(diferencaParaFechar([linha(CAVALO_03, "60,00")], 100)).toBe(40);
  });

  it("é negativa quando o rateio passou do valor", () => {
    expect(diferencaParaFechar([linha(CAVALO_03, "160,00")], 100)).toBe(-60);
  });
});

describe("motivoParaNaoSalvar", () => {
  /** O caso feliz: dois centros, soma fechando, motivo escrito. */
  const linhasBoas = [linha(CAVALO_03, "60,00"), linha(CAVALO_04, "40,00")];

  it("deixa salvar quando fecha e tem motivo", () => {
    expect(
      motivoParaNaoSalvar({
        linhas: linhasBoas,
        valorDoLancamento: 100,
        justificativa: "Seguro rateado por carreta, conforme apólice",
      }),
    ).toBeNull();
  });

  it("exige ao menos uma linha", () => {
    expect(
      motivoParaNaoSalvar({
        linhas: [],
        valorDoLancamento: 100,
        justificativa: "qualquer",
      }),
    ).toBe("Informe ao menos um centro de custo.");
  });

  it("exige o centro escolhido em toda linha", () => {
    expect(
      motivoParaNaoSalvar({
        linhas: [linha(CAVALO_03, "60,00"), linha("", "40,00")],
        valorDoLancamento: 100,
        justificativa: "qualquer",
      }),
    ).toBe("Escolha o centro de custo de todas as linhas.");
  });

  it("recusa valor zerado ou negativo", () => {
    expect(
      motivoParaNaoSalvar({
        linhas: [linha(CAVALO_03, "100,00"), linha(CAVALO_04, "0,00")],
        valorDoLancamento: 100,
        justificativa: "qualquer",
      }),
    ).toBe("Toda linha do rateio precisa de um valor maior que zero.");
  });

  it("recusa o mesmo centro em duas linhas", () => {
    // Duas linhas do mesmo centro somam certo e passariam pela trigger do banco,
    // mas viram duas verdades sobre a mesma obra em todo relatório por centro.
    expect(
      motivoParaNaoSalvar({
        linhas: [linha(CAVALO_03, "60,00"), linha(CAVALO_03, "40,00")],
        valorDoLancamento: 100,
        justificativa: "qualquer",
      }),
    ).toBe(
      "O mesmo centro de custo aparece em duas linhas: some os valores numa linha só.",
    );
  });

  it("recusa soma diferente do valor do lançamento, dizendo quanto falta", () => {
    const motivo = motivoParaNaoSalvar({
      linhas: [linha(CAVALO_03, "60,00")],
      valorDoLancamento: 100,
      justificativa: "qualquer",
    });
    // Asserido pelo formatador: o BRL do Intl usa espaço não separável depois do
    // "R$", que um literal digitado à mão não tem.
    expect(motivo).toBe(
      `A soma do rateio (${formatarBRL(60)}) precisa fechar com o valor do lançamento (${formatarBRL(100)}). Faltam ${formatarBRL(40)}.`,
    );
  });

  it("diz que sobrou quando o rateio passou do valor", () => {
    const motivo = motivoParaNaoSalvar({
      linhas: [linha(CAVALO_03, "160,00")],
      valorDoLancamento: 100,
      justificativa: "qualquer",
    });
    expect(motivo).toBe(
      `A soma do rateio (${formatarBRL(160)}) precisa fechar com o valor do lançamento (${formatarBRL(100)}). Sobram ${formatarBRL(60)}.`,
    );
  });

  it("cobra o motivo por último, depois dos erros de dado", () => {
    // Sem justificativa E com soma errada: o que aparece é a soma, porque é o que
    // a pessoa precisa consertar primeiro. Pedir a explicação antes esconderia o
    // erro de dinheiro atrás de uma exigência de texto.
    const motivo = motivoParaNaoSalvar({
      linhas: [linha(CAVALO_03, "60,00")],
      valorDoLancamento: 100,
      justificativa: "",
    });
    expect(motivo).toContain("precisa fechar com o valor do lançamento");
  });

  it("cobra o motivo quando o resto está certo", () => {
    expect(
      motivoParaNaoSalvar({
        linhas: linhasBoas,
        valorDoLancamento: 100,
        justificativa: "   ",
      }),
    ).toBe("Explique por que o rateio está mudando.");
  });
});

describe("diffDoRateio", () => {
  it("separa quem entrou, quem saiu e quem mudou de valor", () => {
    const resultado = diffDoRateio(
      [
        { centroCustoId: CAVALO_03, valor: 60 },
        { centroCustoId: CAVALO_04, valor: 40 },
      ],
      [
        { centroCustoId: CAVALO_03, valor: 70 },
        { centroCustoId: CAVALO_05, valor: 30 },
      ],
    );

    expect(resultado.mudaram).toEqual([
      { centroCustoId: CAVALO_03, valorDe: 60, valorPara: 70 },
    ]);
    expect(resultado.sairam).toEqual([{ centroCustoId: CAVALO_04, valor: 40 }]);
    expect(resultado.entraram).toEqual([{ centroCustoId: CAVALO_05, valor: 30 }]);
  });

  it("não acusa mudança quando nada mudou", () => {
    const igual = [{ centroCustoId: CAVALO_03, valor: 100 }];
    const resultado = diffDoRateio(igual, igual);
    expect(resultado.mudaram).toEqual([]);
    expect(resultado.entraram).toEqual([]);
    expect(resultado.sairam).toEqual([]);
    expect(resultado.mudou).toBe(false);
  });

  it("acusa mudança de um centavo", () => {
    // Um centavo movido de uma obra para outra é reclassificação de custo, e a
    // trilha precisa registrar. Comparar em float diria que 32454.08 e 32454.09
    // são "praticamente iguais"; em centavos são dois números diferentes.
    const resultado = diffDoRateio(
      [{ centroCustoId: CAVALO_03, valor: 32454.08 }],
      [{ centroCustoId: CAVALO_03, valor: 32454.09 }],
    );
    expect(resultado.mudou).toBe(true);
    expect(resultado.mudaram).toEqual([
      { centroCustoId: CAVALO_03, valorDe: 32454.08, valorPara: 32454.09 },
    ]);
  });
});
