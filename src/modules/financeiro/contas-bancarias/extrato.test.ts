import { describe, expect, it } from "vitest";

import {
  extratoFechaNoSaldo,
  montarExtrato,
  somarMovimentos,
  type MovimentoBruto,
} from "@/modules/financeiro/contas-bancarias/extrato";

/**
 * A entrada aqui é o que `fn_extrato_conta` devolve: UMA LINHA POR MOVIMENTO, já
 * na ordem cronológica e com `valor` sempre positivo (o sinal é `entrada`).
 *
 * O caso real que estes testes protegem é a BB 102.124-9: 5.939 movimentos
 * registrados, dos quais só 53 estão dentro do saldo atual, porque a conta tem
 * data de corte em 21/08/2026. O saldo dela fecha em R$ 37.393,55; somar os
 * 5.939 daria −R$ 386.238,63.
 */

/** Movimento com o mínimo preenchido, para o teste falar só do que importa. */
function mov(campos: Partial<MovimentoBruto>): MovimentoBruto {
  return {
    chave: "parcela:1",
    tipo: "parcela",
    lancamentoId: null,
    data: "2026-08-22",
    entrada: false,
    valor: 0,
    noSaldo: true,
    numero: null,
    numeroDocumento: null,
    descricao: null,
    categoriaNome: null,
    contraparte: null,
    parcela: null,
    ...campos,
  };
}

describe("saldo acumulado do extrato", () => {
  it("parte do saldo inicial e anda linha a linha", () => {
    const { movimentos, saldoFinal } = montarExtrato(1000, [
      mov({ chave: "a", entrada: true, valor: 500 }),
      mov({ chave: "b", entrada: false, valor: 200 }),
      mov({ chave: "c", entrada: false, valor: 300 }),
    ]);

    expect(movimentos.map((m) => m.saldoAcumulado)).toEqual([1500, 1300, 1000]);
    expect(saldoFinal).toBe(1000);
  });

  it("fecha no saldo da listagem no caso real da conta operacional", () => {
    // Entradas de R$ 627.000,00 e saídas de R$ 745.090,79 sobre um saldo de
    // abertura de R$ 155.484,34, que é o que a BB 102.124-9 tem em 26/08/2026.
    const { saldoFinal } = montarExtrato("155484.34", [
      mov({ chave: "a", entrada: true, valor: "627000.00" }),
      mov({ chave: "b", entrada: false, valor: "745090.79" }),
    ]);

    expect(saldoFinal).toBe(37393.55);
    expect(extratoFechaNoSaldo(saldoFinal, 37393.55)).toBe(true);
  });

  it("movimento anterior ao corte NÃO entra no acumulado e não tem saldo próprio", () => {
    // O dinheiro anterior ao corte já está dentro do saldo inicial. Somar de
    // novo contaria o mesmo pagamento duas vezes, e a linha antiga não tem
    // acumulado porque para ela o número não existe.
    const { movimentos, saldoFinal } = montarExtrato(1000, [
      mov({ chave: "antiga1", entrada: false, valor: 900, noSaldo: false }),
      mov({ chave: "antiga2", entrada: true, valor: 5000, noSaldo: false }),
      mov({ chave: "nova", entrada: false, valor: 100 }),
    ]);

    expect(movimentos.map((m) => m.saldoAcumulado)).toEqual([null, null, 900]);
    expect(saldoFinal).toBe(900);
  });

  it("conta sem nenhum movimento no saldo fecha no próprio saldo inicial", () => {
    // É a CAIXA ECONOMICA em 26/08/2026: 340 movimentos registrados, corte no
    // mesmo dia, zero linhas dentro do saldo.
    const { saldoFinal } = montarExtrato("4599100.34", [
      mov({ chave: "antiga", entrada: false, valor: "1000.00", noSaldo: false }),
    ]);

    expect(saldoFinal).toBe(4599100.34);
  });

  it("NUMERIC que chega como string vira o real certo", () => {
    // O tipo gerado promete number e nisso ele mente: o PostgREST devolve
    // NUMERIC como string em algumas rotas, e "8000.00" - 0 sem conversão vira
    // concatenação ou NaN sem erro nenhum no console.
    const { movimentos, saldoFinal } = montarExtrato("500000.00", [
      mov({ chave: "a", entrada: false, valor: "475400.00" }),
    ]);

    expect(movimentos[0]?.valor).toBe(475400);
    expect(movimentos[0]?.valorComSinal).toBe(-475400);
    expect(saldoFinal).toBe(24600);
  });

  it("saída fica negativa em valorComSinal e positiva em valor", () => {
    // A coluna ordena por `valorComSinal`: pelo absoluto, uma saída de R$ 100
    // mil ficaria colada numa entrada de R$ 100 mil como se fossem iguais.
    const { movimentos } = montarExtrato(0, [
      mov({ chave: "a", entrada: true, valor: 100 }),
      mov({ chave: "b", entrada: false, valor: 100 }),
    ]);

    expect(movimentos.map((m) => m.valor)).toEqual([100, 100]);
    expect(movimentos.map((m) => m.valorComSinal)).toEqual([100, -100]);
  });

  it("não acumula erro de ponto flutuante em muitas somas", () => {
    // 300 saídas de R$ 0,07 sobre R$ 100,00. Em float o resultado sai
    // 78.99999999999831 e a tela mostraria um centavo diferente da listagem de
    // contas, que soma em centavos.
    const linhas = Array.from({ length: 300 }, (_, i) =>
      mov({ chave: `c${i}`, entrada: false, valor: 0.07 }),
    );

    expect(montarExtrato(100, linhas).saldoFinal).toBe(79);
  });

  it("extrato vazio fecha no saldo inicial", () => {
    expect(montarExtrato("155484.34", []).saldoFinal).toBe(155484.34);
  });
});

describe("soma de entradas e saídas", () => {
  it("separa entrada de saída e devolve o líquido", () => {
    const soma = somarMovimentos([
      { entrada: true, valor: 627000 },
      { entrada: false, valor: 745090.79 },
    ]);

    expect(soma).toEqual({
      entradas: 627000,
      saidas: 745090.79,
      liquido: -118090.79,
    });
  });

  it("soma em centavos, sem sobra de ponto flutuante", () => {
    const soma = somarMovimentos([
      { entrada: true, valor: 0.1 },
      { entrada: true, valor: 0.2 },
    ]);

    expect(soma.entradas).toBe(0.3);
  });

  it("lista vazia soma zero", () => {
    expect(somarMovimentos([])).toEqual({
      entradas: 0,
      saidas: 0,
      liquido: 0,
    });
  });
});

describe("linha de controle: o extrato fecha no saldo da listagem", () => {
  it("aceita diferença de ponto flutuante abaixo do centavo", () => {
    // Os dois números vêm de funções diferentes do banco. Comparar float com
    // float acusaria 1e-10 de diferença e o alerta viraria ruído permanente.
    expect(extratoFechaNoSaldo(37393.55, 37393.550000000001)).toBe(true);
  });

  it("acusa divergência de um centavo", () => {
    // Um centavo aqui não é arredondamento: é regra de dinheiro diferente entre
    // fn_extrato_conta e fn_rel_posicao_bancaria, e é exatamente o que este
    // alerta existe para pegar.
    expect(extratoFechaNoSaldo(37393.55, 37393.56)).toBe(false);
  });

  it("acusa a divergência grande do caso que motivou o controle", () => {
    // −R$ 386.238,63 é onde a BB 102.124-9 fecharia se a data de corte deixasse
    // de ser aplicada num dos dois lados. Contra R$ 37.393,55 de saldo real.
    expect(extratoFechaNoSaldo(-386238.63, 37393.55)).toBe(false);
  });
});
