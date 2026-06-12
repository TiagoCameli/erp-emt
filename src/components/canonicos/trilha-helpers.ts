import type { Json } from "@/lib/database.types";

import type { EventoTrilha, TipoEventoTrilha } from "./trilha";

/** Linha do audit_log, com nome do usuário se a query fizer o join. */
export interface RegistroAuditLog {
  id: number | string;
  tabela: string;
  registro_id: string | null;
  acao: string;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  dados_antes: Json | null;
  dados_depois: Json | null;
  criado_em: string;
}

const CAMPOS_IGNORADOS = new Set(["updated_at", "created_at"]);
const LIMITE_CAMPOS = 5;

const MAPA_ACOES: Record<string, { tipo: TipoEventoTrilha; titulo: string }> =
  {
    INSERT: { tipo: "criacao", titulo: "Registro criado" },
    UPDATE: { tipo: "edicao", titulo: "Registro editado" },
    DELETE: { tipo: "exclusao", titulo: "Registro excluído" },
  };

type ObjetoJson = { [chave: string]: Json | undefined };

function ehObjetoJson(valor: Json | null): valor is ObjetoJson {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function formatarValor(valor: Json | undefined): string {
  if (valor === null || valor === undefined) return "vazio";
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

function descricaoDoDiff(
  dadosAntes: Json | null,
  dadosDepois: Json | null,
): string | undefined {
  if (!ehObjetoJson(dadosAntes) || !ehObjetoJson(dadosDepois)) {
    return undefined;
  }

  const chaves = new Set([
    ...Object.keys(dadosAntes),
    ...Object.keys(dadosDepois),
  ]);

  const alteracoes: string[] = [];
  for (const chave of chaves) {
    if (CAMPOS_IGNORADOS.has(chave)) continue;
    const antes = dadosAntes[chave];
    const depois = dadosDepois[chave];
    if (JSON.stringify(antes ?? null) === JSON.stringify(depois ?? null)) {
      continue;
    }
    alteracoes.push(`${chave}: ${formatarValor(antes)} → ${formatarValor(depois)}`);
  }

  if (alteracoes.length === 0) return undefined;

  const visiveis = alteracoes.slice(0, LIMITE_CAMPOS);
  const restantes = alteracoes.length - visiveis.length;
  const sufixo =
    restantes > 0
      ? `, e mais ${restantes} ${restantes === 1 ? "campo" : "campos"}`
      : "";

  return `${visiveis.join(", ")}${sufixo}`;
}

/** Converte linhas do audit_log em eventos prontos para o componente Trilha. */
export function eventosDoAuditLog(
  registros: RegistroAuditLog[],
): EventoTrilha[] {
  return registros.map((registro) => {
    const mapeado = MAPA_ACOES[registro.acao.toUpperCase()] ?? {
      tipo: "outro" as const,
      titulo: "Registro alterado",
    };

    return {
      id: String(registro.id),
      data: registro.criado_em,
      titulo: mapeado.titulo,
      descricao: descricaoDoDiff(registro.dados_antes, registro.dados_depois),
      usuario: registro.usuario_nome ?? undefined,
      tipo: mapeado.tipo,
    };
  });
}
