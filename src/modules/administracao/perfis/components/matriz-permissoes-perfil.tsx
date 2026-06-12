"use client";

import { Fragment } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { ACOES, MODULOS, recursosDoModulo, type Acao } from "@/config/recursos";

const ROTULOS_ACOES: Record<Acao, string> = {
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

export interface MatrizPermissoesPerfilProps {
  /** Chaves marcadas, no formato de chavePermissao(). */
  selecionadas: Set<string>;
  onAlternar: (recurso: string, acao: Acao, marcada: boolean) => void;
  desabilitada?: boolean;
}

/**
 * Matriz recursos x ações do perfil. Mesmo padrão visual da matriz de
 * permissões de usuários: uma linha por recurso, checkbox apenas nas
 * ações que existem naquele recurso.
 */
export function MatrizPermissoesPerfil({
  selecionadas,
  onAlternar,
  desabilitada = false,
}: MatrizPermissoesPerfilProps) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-detalhe">
        <thead>
          <tr className="border-b border-border bg-surface">
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
              <tr className="border-b border-border bg-surface/60">
                <td
                  colSpan={ACOES.length + 1}
                  className="px-3 py-1.5 font-medium text-foreground"
                >
                  {modulo.nome}
                </td>
              </tr>
              {recursosDoModulo(modulo.id).map((recurso) => (
                <tr
                  key={recurso.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-3 py-1.5">{recurso.nome}</td>
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
