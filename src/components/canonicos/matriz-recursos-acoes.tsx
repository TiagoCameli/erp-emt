"use client";

import { Fragment } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ACOES,
  MODULOS,
  recursosDoModulo,
  type Acao,
  type RecursoDef,
} from "@/config/recursos";

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
  /**
   * Marca ou desmarca UMA célula.
   *
   * O botão "Tudo" da linha chama isto uma vez por ação do recurso, no mesmo
   * evento. Por isso o consumidor é OBRIGADO a atualizar o estado pela forma
   * funcional (`setEstado((atual) => ...)`): quem fecha o valor antigo no
   * closure perde todas as chamadas menos a última e o botão marcaria uma ação
   * só. Há teste cobrindo a sequência de chamadas.
   */
  onAlternar: (recurso: string, acao: Acao, marcada: boolean) => void;
  desabilitada?: boolean;
  /** Altura máxima com scroll interno (drawers). */
  alturaMaximaClassName?: string;
}

/** Ações do recurso que estão marcadas hoje. */
function acoesMarcadas(
  recurso: RecursoDef,
  selecionadas: Set<string>,
): readonly Acao[] {
  return recurso.acoes.filter((acao) =>
    selecionadas.has(chavePermissao(recurso.id, acao)),
  );
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
  /**
   * Marca ou limpa a linha inteira, e SÓ as ações que o recurso tem.
   *
   * Ação que não existe no catálogo não pode entrar na seleção: o servidor a
   * descartaria de qualquer jeito (`salvarMatrizUsuario` filtra por
   * `recurso.acoes`), mas a tela ficaria mentindo que a permissão está lá até
   * alguém recarregar.
   */
  function alternarLinha(recurso: RecursoDef, marcar: boolean): void {
    for (const acao of recurso.acoes) {
      const jaMarcada = selecionadas.has(chavePermissao(recurso.id, acao));
      if (jaMarcada !== marcar) onAlternar(recurso.id, acao, marcar);
    }
  }

  return (
    <div
      className={`overflow-auto rounded-md border border-border ${alturaMaximaClassName}`}
    >
      <table className="w-full border-collapse text-detalhe">
        <thead className="sticky top-0 z-10 bg-surface">
          {/* O nome do recurso vai à ESQUERDA, diferente do resto das tabelas do
              app. Aqui a coluna absorve a sobra de largura da tela cheia, e são
              mais de cinquenta linhas: centralizado, cada nome começa num ponto
              diferente e não existe borda para o olho descer. As ações seguem
              centralizadas, cada uma sob o seu cabeçalho. */}
          <tr>
            <th className="w-full px-3 py-2 text-left font-medium text-muted-foreground">
              Recurso
            </th>
            <th className="px-2 py-2 text-center font-medium text-muted-foreground">
              Todas
            </th>
            {ACOES.map((acao) => (
              <th
                key={acao}
                className="px-2 py-2 text-center font-medium whitespace-nowrap text-muted-foreground"
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
                  colSpan={ACOES.length + 2}
                  className="px-3 py-1.5 text-left text-legenda font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {modulo.nome}
                </td>
              </tr>
              {recursosDoModulo(modulo.id).map((recurso) => {
                const marcadas = acoesMarcadas(recurso, selecionadas);
                const todasMarcadas = marcadas.length === recurso.acoes.length;
                return (
                  <tr key={recurso.id} className="border-t border-border">
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {recurso.nome}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {/* Largura fixa para o rótulo trocar sem a coluna pular, e
                          o rótulo diz o que o clique FAZ, não o estado atual. */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="w-16 text-muted-foreground hover:text-foreground"
                        disabled={desabilitada}
                        onClick={() => alternarLinha(recurso, !todasMarcadas)}
                        aria-label={
                          todasMarcadas
                            ? `Desmarcar todas as ações de ${recurso.nome}`
                            : `Marcar todas as ações de ${recurso.nome}`
                        }
                      >
                        {todasMarcadas ? "Limpar" : "Tudo"}
                      </Button>
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
                            // Mesmo travessão da CelulaVazia, mas sem o
                            // aria-label dela: aqui o vazio não é "não
                            // informado", é "essa ação não existe nesse
                            // recurso", e são dezenas de células por tela.
                            <span
                              className="text-muted-foreground/40"
                              aria-hidden="true"
                            >
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
