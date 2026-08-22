import { describe, expect, it } from "vitest";

import { lerLancamentosEmPaginas } from "@/modules/financeiro/lancamentos/leitura-completa";
import type { LancamentoLista } from "@/modules/financeiro/lancamentos/queries";

/** Linha mínima: só o id importa aqui, que é a chave da deduplicação. */
const base: LancamentoLista = {
  id: "id-0",
  numero: "LAN-2026-0001",
  numeroDocumento: null,
  anexos: 0,
  tipo: "a_pagar",
  origem: "manual",
  descricao: "Linha de teste",
  categoriaNome: null,
  centroCustoRotulo: "BR-364 Lote 9",
  fornecedorNome: null,
  valor: 100,
  dataVencimento: "2026-08-10",
  status: "a_pagar",
  qtdParcelas: 1,
  dataCompra: "2026-08-01",
  mesCompetencia: "2026-08-01",
  criadoEm: "2026-08-01T12:00:00.000Z",
  revisao: "sem-conta",
  valorRecorte: null,
  valorPago: 0,
  valorAberto: 100,
  valorVencido: 0,
  descontoObtido: 0,
};

/**
 * "Tudo que está filtrado" depende inteiro daqui, e o jeito de falhar é
 * silencioso: a planilha sai com 1.000 das 8.000 linhas (ou o cartão soma um
 * sexto do dinheiro), o arquivo abre normalmente e o total fecha com ele mesmo.
 * Por isso os casos cobrem página curta, total redondo, linha repetida e leitura
 * que não fechou o total.
 */
describe("lerLancamentosEmPaginas", () => {
  /** Lançamentos falsos com ids sequenciais. */
  function lote(de: number, quantos: number): LancamentoLista[] {
    return Array.from({ length: quantos }, (_, i) => ({
      ...base,
      id: `id-${de + i}`,
    }));
  }

  /** Leitor de páginas em cima de uma lista, como o banco faria. */
  function leitorDe(itens: LancamentoLista[], total = itens.length) {
    const chamadas: Array<{ pagina: number; tamanho: number }> = [];
    const ler = async (pagina: number, tamanho: number) => {
      chamadas.push({ pagina, tamanho });
      return {
        itens: itens.slice(pagina * tamanho, pagina * tamanho + tamanho),
        total,
      };
    };
    return { ler, chamadas };
  }

  it("junta todas as páginas até fechar o total", async () => {
    const { ler, chamadas } = leitorDe(lote(1, 2500));
    const leitura = await lerLancamentosEmPaginas(ler, 25_000, 1000);

    expect(leitura.total).toBe(2500);
    expect(leitura.itens).toHaveLength(2500);
    // Três requisições: 1000 + 1000 + 500 (a última vem curta e encerra).
    expect(chamadas.map((c) => c.pagina)).toEqual([0, 1, 2]);
    // Ordem preservada: a planilha sai na ordem da listagem.
    expect(leitura.itens[0].id).toBe("id-1");
    expect(leitura.itens[2499].id).toBe("id-2500");
  });

  it("para no total redondo sem pedir uma página vazia à toa", async () => {
    const { ler, chamadas } = leitorDe(lote(1, 2000));
    const leitura = await lerLancamentosEmPaginas(ler, 25_000, 1000);

    expect(leitura.itens).toHaveLength(2000);
    expect(chamadas).toHaveLength(2);
  });

  it("cabe numa página só", async () => {
    const { ler, chamadas } = leitorDe(lote(1, 25));
    const leitura = await lerLancamentosEmPaginas(ler, 25_000, 1000);

    expect(leitura.itens).toHaveLength(25);
    expect(chamadas).toHaveLength(1);
  });

  it("filtro vazio devolve total zero sem inventar linha", async () => {
    const { ler } = leitorDe([]);
    const leitura = await lerLancamentosEmPaginas(ler, 25_000, 1000);

    expect(leitura.total).toBe(0);
    expect(leitura.itens).toEqual([]);
  });

  it("acima do teto para na primeira página, sem varrer o banco", async () => {
    // 30.000 linhas com teto de 25.000: quem chamou precisa do número real para
    // dizer quanto tem, e não faz sentido ler 30 páginas para depois recusar.
    const { ler, chamadas } = leitorDe(lote(1, 1000), 30_000);
    const leitura = await lerLancamentosEmPaginas(ler, 25_000, 1000);

    expect(leitura.total).toBe(30_000);
    expect(leitura.itens).toEqual([]);
    expect(chamadas).toHaveLength(1);
  });

  it("linha repetida entre páginas entra uma vez só", async () => {
    // O que acontece de verdade quando alguém cria um lançamento no meio da
    // leitura: o novo entra na frente e empurra uma linha para a página seguinte.
    // Sem dedup, o mesmo lançamento seria somado duas vezes no total.
    const ler = async (pagina: number) => ({
      itens: pagina === 0 ? lote(1, 2) : lote(2, 2),
      total: 3,
    });
    const leitura = await lerLancamentosEmPaginas(ler, 25_000, 2);

    expect(leitura.itens.map((i) => i.id)).toEqual(["id-1", "id-2", "id-3"]);
  });

  it("leitura que não fecha o total volta menor, para quem chamou recusar", async () => {
    // Banco diz 5.000, a lista só entrega 1.500: o sintoma de resposta cortada.
    // A função NÃO finge que acabou; devolve itens < total e quem chamou barra.
    const { ler } = leitorDe(lote(1, 1500), 5000);
    const leitura = await lerLancamentosEmPaginas(ler, 25_000, 1000);

    expect(leitura.total).toBe(5000);
    expect(leitura.itens.length).toBeLessThan(leitura.total);
  });

  it("o número de páginas é limitado, mesmo com leitor que nunca acaba", async () => {
    // Leitor patológico: total dentro do teto, página sempre cheia, mas sempre as
    // MESMAS linhas. A deduplicação impede a contagem de subir, então a saída por
    // "fechou o total" nunca acontece e o que segura o laço é o limite de páginas
    // (teto / tamanho da página). Sem ele, isto marteleria o banco para sempre.
    let chamadas = 0;
    const ler = async () => {
      chamadas += 1;
      return { itens: lote(1, 1000), total: 4000 };
    };
    const leitura = await lerLancamentosEmPaginas(ler, 4000, 1000);

    expect(chamadas).toBe(4);
    // E devolve menos que o total, então quem chamou recusa em vez de entregar
    // 1.000 de 4.000 lançamentos.
    expect(leitura.itens).toHaveLength(1000);
    expect(leitura.total).toBe(4000);
  });
});
