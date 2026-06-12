"use client";

import { Fragment } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { ACOES, MODULOS, recursosDoModulo, type Acao } from "@/config/recursos";

export const ROTULOS_ACOES: Record<Acao, string> = {
  ver: "Ver",
  criar: "Criar",
  editar: "Editar",
  excluir: "Excluir",
  aprovar: "Aprovar",
  desaprovar: "Desaprovar",
};

/** Chave estável de uma célula da matriz: "recurso:acao". */
export function chavePermissao(recurso: string, acao: Acao): string {
  return `${recurso}:${acao}`;
}

/** Converte a chave de volta para o par recurso + ação. */
export function permissaoDaChave(chave: string): {
  recurso: string;
  acao: Acao;
} {
  const separador = chave.lastIndexOf(":");
  return {
    recurso: chave.slice(0, separador),
    acao: chave.slice(separador + 1) as Acao,
  };
}

export interface MatrizRecursosAcoesProps {
  /** Chaves marcadas, no formato de chavePermissao(). */
  selecionadas: Set<string>;
  onAlternar: (recurso: string, acao: Acao, marcada: boolean) => void;
  desabilitada?: boolean;
  /** Altura máxima com scroll interno (drawers). */
  alturaMaximaClassName?: string;
}

/**
 * Matriz canônica recursos x ações, controlada. É a MESMA tabela na
 * matriz individual do usuário e no template do perfil: uma linha por
 * recurso agrupada por módulo, checkbox só nas ações que existem no
 * catálogo, header sticky.
 */
export function MatrizRecursosAcoes({
  selecionadas,
  onAlternar,
  desabilitada = false,
  alturaMaximaClassName = "max-h-96",
}: MatrizRecursosAcoesProps) {
  return (
    <div
      className={`overflow-auto rounded-md border border-border ${alturaMaximaClassName}`}
    >
      <table className="w-full border-collapse text-detalhe">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
              Recurso
            </th>
            {ACOES.map((acao) => (
              <th
                key={acao}
                className="px-2 py-2 text-center font-medium text-muted-foreground"
              >
                {ROTULOS_ACOES[acao]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULOS.map((modulo) => (
            <Fragment key={modulo.id}>
              <tr className="border-t border-border bg-surface/60">
                <td
                  colSpan={ACOES.length + 1}
                  className="px-3 py-1.5 text-legenda font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {modulo.nome}
                </td>
              </tr>
              {recursosDoModulo(modulo.id).map((recurso) => (
                <tr key={recurso.id} className="border-t border-border">
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {recurso.nome}
                  </td>
                  {ACOES.map((acao) => {
                    const valida = recurso.acoes.includes(acao);
                    return (
                      <td key={acao} className="px-2 py-1.5 text-center">
                        {valida ? (
                          <Checkbox
                            checked={selecionadas.has(
                              chavePermissao(recurso.id, acao),
                            )}
                            onCheckedChange={(marcada) =>
                              onAlternar(recurso.id, acao, marcada === true)
                            }
                            disabled={desabilitada}
                            aria-label={`${recurso.nome}: ${ROTULOS_ACOES[acao]}`}
                          />
                        ) : (
                          <span
                            className="text-muted-foreground/40"
                            aria-hidden="true"
                          >
                            -
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
