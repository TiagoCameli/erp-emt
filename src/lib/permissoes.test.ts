import { describe, expect, it, vi } from "vitest";

// permissoes.ts importa "server-only" e o client server do Supabase.
// Aqui testamos só a camada pura (temPermissao), então neutralizamos
// os imports de servidor e o cache() do React.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original, cache: <T>(fn: T): T => fn };
});

import { modulosVisiveis, rotaInicial, temPermissao } from "@/lib/permissoes";
import type { PermissaoUsuario, UsuarioLogado } from "@/lib/permissoes";

function criarUsuario(permissoes: PermissaoUsuario[] = []): UsuarioLogado {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    nome: "Usuário de teste",
    email: "teste@emtconstrutora.com",
    ativo: true,
    perfilId: null,
    permissoes,
  };
}

describe("temPermissao", () => {
  it("retorna false para usuário null", () => {
    expect(temPermissao(null, "administracao.usuarios", "ver")).toBe(false);
  });

  it("retorna false quando o usuário não tem nenhuma permissão", () => {
    const usuario = criarUsuario([]);
    expect(temPermissao(usuario, "administracao.usuarios", "ver")).toBe(false);
  });

  it("retorna false com o recurso certo mas a ação errada", () => {
    const usuario = criarUsuario([
      { recurso: "administracao.usuarios", acao: "ver" },
    ]);
    expect(temPermissao(usuario, "administracao.usuarios", "editar")).toBe(
      false,
    );
  });

  it("retorna false com a ação certa mas o recurso errado", () => {
    const usuario = criarUsuario([
      { recurso: "administracao.perfis", acao: "ver" },
    ]);
    expect(temPermissao(usuario, "administracao.usuarios", "ver")).toBe(false);
  });

  it("retorna true com o par exato recurso + ação", () => {
    const usuario = criarUsuario([
      { recurso: "administracao.usuarios", acao: "ver" },
    ]);
    expect(temPermissao(usuario, "administracao.usuarios", "ver")).toBe(true);
  });

  it("encontra o par exato no meio de várias permissões", () => {
    const usuario = criarUsuario([
      { recurso: "administracao.perfis", acao: "ver" },
      { recurso: "administracao.usuarios", acao: "criar" },
      { recurso: "administracao.lixeira", acao: "editar" },
    ]);
    expect(temPermissao(usuario, "administracao.usuarios", "criar")).toBe(
      true,
    );
    expect(temPermissao(usuario, "administracao.lixeira", "ver")).toBe(false);
  });
});

describe("modulosVisiveis", () => {
  it("usuário null não vê nenhum módulo", () => {
    expect(modulosVisiveis(null)).toHaveLength(0);
  });

  it("retorna os módulos na ordem de MODULOS (Gestão antes de Compras)", () => {
    const usuario = criarUsuario([
      { recurso: "compras.ordens", acao: "ver" },
      { recurso: "gestao.painel", acao: "ver" },
    ]);
    expect(modulosVisiveis(usuario).map((m) => m.id)).toEqual([
      "gestao",
      "compras",
    ]);
  });
});

describe("rotaInicial", () => {
  it("sem nenhuma permissão retorna null", () => {
    expect(rotaInicial(criarUsuario([]))).toBeNull();
  });

  it("perfil de Compras cai em /compras", () => {
    const usuario = criarUsuario([{ recurso: "compras.ordens", acao: "ver" }]);
    expect(rotaInicial(usuario)).toBe("/compras");
  });

  it("perfil de Financeiro cai em /financeiro", () => {
    const usuario = criarUsuario([
      { recurso: "financeiro.lancamentos", acao: "ver" },
    ]);
    expect(rotaInicial(usuario)).toBe("/financeiro");
  });

  it("perfil de RH cai em /rh", () => {
    const usuario = criarUsuario([{ recurso: "rh.folha", acao: "ver" }]);
    expect(rotaInicial(usuario)).toBe("/rh");
  });

  it("quem vê Gestão cai em /gestao, mesmo vendo outros módulos", () => {
    const usuario = criarUsuario([
      { recurso: "gestao.painel", acao: "ver" },
      { recurso: "compras.ordens", acao: "ver" },
      { recurso: "financeiro.lancamentos", acao: "ver" },
    ]);
    expect(rotaInicial(usuario)).toBe("/gestao");
  });

  it("ação diferente de ver não conta como módulo visível", () => {
    const usuario = criarUsuario([{ recurso: "compras.ordens", acao: "criar" }]);
    expect(rotaInicial(usuario)).toBeNull();
  });
});
