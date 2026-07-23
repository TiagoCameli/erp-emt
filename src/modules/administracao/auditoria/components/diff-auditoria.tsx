"use client";

import { formatarValorCampo, rotuloCampo } from "@/components/canonicos";
import type { Json } from "@/lib/database.types";
import { cn } from "@/lib/utils";

/** Campos de housekeeping que não interessam no diff. */
const CAMPOS_IGNORADOS = new Set(["updated_at"]);

type ObjetoJson = { [chave: string]: Json | undefined };

type EstadoCampo = "igual" | "alterado" | "adicionado" | "removido";

interface LinhaDiff {
  campo: string;
  antes: Json | undefined;
  depois: Json | undefined;
  estado: EstadoCampo;
}

function comoObjeto(valor: Json | null): ObjetoJson | null {
  if (valor !== null && typeof valor === "object" && !Array.isArray(valor)) {
    return valor;
  }
  return null;
}

function montarLinhas(
  dadosAntes: Json | null,
  dadosDepois: Json | null,
): LinhaDiff[] {
  const antes = comoObjeto(dadosAntes);
  const depois = comoObjeto(dadosDepois);

  const campos = [
    ...new Set([
      ...Object.keys(antes ?? {}),
      ...Object.keys(depois ?? {}),
    ]),
  ]
    .filter((campo) => !CAMPOS_IGNORADOS.has(campo))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  return campos.map((campo) => {
    const temAntes = antes !== null && campo in antes;
    const temDepois = depois !== null && campo in depois;
    const valorAntes = temAntes ? antes[campo] : undefined;
    const valorDepois = temDepois ? depois[campo] : undefined;

    let estado: EstadoCampo = "igual";
    if (temAntes && !temDepois) {
      estado = "removido";
    } else if (!temAntes && temDepois) {
      estado = "adicionado";
    } else if (
      JSON.stringify(valorAntes ?? null) !== JSON.stringify(valorDepois ?? null)
    ) {
      estado = "alterado";
    }

    return { campo, antes: valorAntes, depois: valorDepois, estado };
  });
}

interface ValorCelulaProps {
  campo: string;
  valor: Json | undefined;
  nomes: Record<string, string>;
}

/**
 * Valor formatado de uma célula do diff. Tenta primeiro o formato amigável
 * do mapa de campos (dinheiro, data, situação, FK por nome); campo fora do
 * mapa cai no fallback cru (booleano Sim/Não, objeto em JSON, texto puro).
 */
function ValorCelula({ campo, valor, nomes }: ValorCelulaProps) {
  if (valor === undefined || valor === null) {
    return <span className="text-muted-foreground italic">vazio</span>;
  }
  const formatado = formatarValorCampo(campo, valor, nomes);
  if (formatado !== undefined) {
    return <span className="break-all">{formatado}</span>;
  }
  if (typeof valor === "boolean") {
    return <span>{valor ? "Sim" : "Não"}</span>;
  }
  if (typeof valor === "object") {
    return (
      <span className="codigo-doc break-all">{JSON.stringify(valor)}</span>
    );
  }
  return <span className="break-all">{String(valor)}</span>;
}

const GRADE_COLUNAS = "grid grid-cols-[minmax(8rem,1fr)_2fr_2fr]";

export interface DiffAuditoriaProps {
  dadosAntes: Json | null;
  dadosDepois: Json | null;
  /** Nome resolvido (id -> nome) dos campos FK que aparecem nos dados. */
  nomes?: Record<string, string>;
}

/**
 * Diff legível de um registro do audit_log: compara dados_antes e
 * dados_depois campo a campo (ignora updated_at). Alterados em âmbar
 * claro, adicionados em verde claro, removidos em vermelho claro. Rótulo do
 * campo e valores usam o mesmo mapa amigável da trilha do detalhe (dinheiro,
 * data, situação, nome de FK); campo fora do mapa mantém o nome cru (com
 * espaço) e o valor sem formatação especial.
 * O JSON cru fica atrás de "Ver JSON completo".
 */
export function DiffAuditoria({
  dadosAntes,
  dadosDepois,
  nomes = {},
}: DiffAuditoriaProps) {
  const linhas = montarLinhas(dadosAntes, dadosDepois);

  return (
    <div className="flex flex-col gap-3">
      {linhas.length === 0 ? (
        <p className="text-detalhe text-muted-foreground">
          Sem campos para comparar neste registro.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <div
            className={cn(
              GRADE_COLUNAS,
              "bg-surface text-legenda font-medium text-muted-foreground",
            )}
          >
            <div className="px-3 py-2">Campo</div>
            <div className="px-3 py-2">Antes</div>
            <div className="px-3 py-2">Depois</div>
          </div>
          {linhas.map((linha) => (
            <div
              key={linha.campo}
              className={cn(GRADE_COLUNAS, "border-t border-border text-detalhe")}
            >
              <div
                className="px-3 py-1.5 text-muted-foreground"
                title={linha.campo}
              >
                {rotuloCampo(linha.campo)}
              </div>
              <div
                className={cn(
                  "px-3 py-1.5",
                  linha.estado === "alterado" && "bg-accent",
                  linha.estado === "removido" && "bg-status-rejeitado/10",
                )}
              >
                <ValorCelula campo={linha.campo} valor={linha.antes} nomes={nomes} />
              </div>
              <div
                className={cn(
                  "px-3 py-1.5",
                  linha.estado === "alterado" && "bg-accent",
                  linha.estado === "adicionado" && "bg-status-aprovado/10",
                )}
              >
                <ValorCelula campo={linha.campo} valor={linha.depois} nomes={nomes} />
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="text-detalhe">
        <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">
          Ver JSON completo
        </summary>
        <pre className="codigo-doc text-legenda mt-2 max-h-64 overflow-auto rounded-md border border-border bg-surface p-3">
          {JSON.stringify({ antes: dadosAntes, depois: dadosDepois }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
