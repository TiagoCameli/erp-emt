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

import { temPermissao } from "@/lib/permissoes";
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
