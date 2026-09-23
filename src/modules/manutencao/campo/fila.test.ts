import { afterEach, describe, expect, it, vi } from "vitest";

import type { EnvioCampo, RespostaEnvioCampo } from "@/modules/manutencao/campo/envio";
import {
  armazemEmMemoria,
  enviarPelaRede,
  enviarPendentes,
  itensDoUsuario,
  novoItem,
  type ItemFila,
} from "@/modules/manutencao/campo/fila";

const EQUIP = "11111111-1111-4111-8111-111111111111";
const EU = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTRO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function envio(n: number): EnvioCampo {
  return {
    tipo: "medicao",
    idCliente: `0000000${n}-0000-4000-8000-000000000000`,
    dados: { equipamentoId: EQUIP, data: "2026-09-23", valor: 100 + n, observacoes: "" },
  };
}

function item(n: number, usuarioId = EU, minuto = n): ItemFila {
  return novoItem(
    { usuarioId, equipamentoId: EQUIP, resumo: `Leitura ${n}`, envio: envio(n) },
    new Date(Date.UTC(2026, 8, 23, 12, minuto)),
  );
}

const OK = (id: string): RespostaEnvioCampo => ({ ok: true, id });

describe("enviarPendentes", () => {
  it("manda na ordem em que foi lançado e tira da fila o que foi", async () => {
    const armazem = armazemEmMemoria([item(2), item(1)]);
    const ordem: string[] = [];
    const resultado = await enviarPendentes(
      armazem,
      async (e) => {
        ordem.push(e.idCliente);
        return OK("x");
      },
      EU,
    );
    expect(ordem).toEqual([envio(1).idCliente, envio(2).idCliente]);
    expect(resultado).toEqual({ enviados: 2, recusados: 0, pendentes: 0, semSessao: false });
    expect(await armazem.listar()).toEqual([]);
  });

  it("sem rede o item FICA, conta a tentativa e o laço para", async () => {
    const armazem = armazemEmMemoria([item(1), item(2)]);
    const enviar = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const resultado = await enviarPendentes(armazem, enviar, EU);

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(resultado.pendentes).toBe(2);
    const [primeiro] = itensDoUsuario(await armazem.listar(), EU);
    expect(primeiro).toMatchObject({ tentativas: 1, recusado: false });
    expect(primeiro!.ultimoErro).toMatch(/Sem sinal/);
    expect(await armazem.listar()).toHaveLength(2);
  });

  it("recusa definitiva marca o item e segue para o próximo", async () => {
    const armazem = armazemEmMemoria([item(1), item(2)]);
    const resultado = await enviarPendentes(
      armazem,
      async (e) =>
        e.idCliente === envio(1).idCliente
          ? { ok: false, erro: "Equipamento inativo", definitivo: true }
          : OK("y"),
      EU,
    );
    expect(resultado).toEqual({ enviados: 1, recusados: 1, pendentes: 0, semSessao: false });
    const restantes = await armazem.listar();
    expect(restantes).toHaveLength(1);
    expect(restantes[0]).toMatchObject({ recusado: true, ultimoErro: "Equipamento inativo" });
  });

  it("item recusado não é reenviado na próxima rodada", async () => {
    const armazem = armazemEmMemoria([{ ...item(1), recusado: true }]);
    const enviar = vi.fn(async () => OK("z"));
    await enviarPendentes(armazem, enviar, EU);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("sessão vencida para o laço e avisa", async () => {
    const armazem = armazemEmMemoria([item(1), item(2)]);
    const enviar = vi.fn(
      async (): Promise<RespostaEnvioCampo> => ({ ok: false, erro: "Sessão encerrada", definitivo: false, semSessao: true }),
    );
    const resultado = await enviarPendentes(armazem, enviar, EU);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(resultado).toMatchObject({ semSessao: true, pendentes: 2 });
  });

  it("não manda a fila de outro usuário do mesmo celular", async () => {
    const armazem = armazemEmMemoria([item(1, OUTRO), item(2)]);
    const enviados: string[] = [];
    await enviarPendentes(
      armazem,
      async (e) => {
        enviados.push(e.idCliente);
        return OK("w");
      },
      EU,
    );
    // Linha de controle: o meu foi, o do outro ficou intacto.
    expect(enviados).toEqual([envio(2).idCliente]);
    expect((await armazem.listar()).map((i) => i.usuarioId)).toEqual([OUTRO]);
  });
});

describe("enviarPelaRede", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resposta que não é o JSON da rota vira falha passageira, e o item não some", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>login</html>", { status: 200, headers: { "Content-Type": "text/html" } })),
    );
    const resposta = await enviarPelaRede(envio(1));
    expect(resposta).toMatchObject({ ok: false, definitivo: false });
  });

  it("devolve o JSON da rota como veio", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, id: "abc" })));
    expect(await enviarPelaRede(envio(1))).toEqual({ ok: true, id: "abc" });
  });
});
