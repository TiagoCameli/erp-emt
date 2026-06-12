"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ACOES, MODULOS, recursosDoModulo, type Acao } from "@/config/recursos";
import { createClient } from "@/lib/supabase/client";
import { salvarMatrizUsuario } from "@/modules/administracao/usuarios/actions";
import type { MatrizInput } from "@/modules/administracao/usuarios/schemas";

const ROTULOS_ACOES: Record<Acao, string> = {
  ver: "Ver",
  criar: "Criar",
  editar: "Editar",
  excluir: "Excluir",
  aprovar: "Aprovar",
  desaprovar: "Desaprovar",
};

export interface MatrizPermissoesProps {
  usuarioId: string;
  podeEditar: boolean;
  /** Incremente para forçar recarga (ex: depois de aplicar um perfil). */
  recarregar?: number;
}

/**
 * Editor da matriz individual de permissões: linhas = recursos
 * agrupados por módulo, colunas = ações. Células fora do catálogo
 * ficam vazias. Salvar substitui a matriz inteira do usuário.
 */
export function MatrizPermissoes({
  usuarioId,
  podeEditar,
  recarregar = 0,
}: MatrizPermissoesProps) {
  // Estado carrega junto com a chave: carregando = chave desatualizada.
  const chaveCarga = `${usuarioId}|${recarregar}`;
  const [carga, setCarga] = React.useState<{
    chave: string;
    selecao: Set<string>;
  } | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  const carregando = carga?.chave !== chaveCarga;
  const selecao = carga?.selecao ?? new Set<string>();

  React.useEffect(() => {
    let ativo = true;

    const supabase = createClient();
    supabase
      .from("usuario_permissoes")
      .select("recurso, acao")
      .eq("usuario_id", usuarioId)
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) {
          toast.error("Não foi possível carregar as permissões do usuário");
          setCarga({ chave: chaveCarga, selecao: new Set() });
        } else {
          setCarga({
            chave: chaveCarga,
            selecao: new Set(
              (data ?? []).map((par) => `${par.recurso}|${par.acao}`),
            ),
          });
        }
      });

    return () => {
      ativo = false;
    };
  }, [usuarioId, chaveCarga]);

  function alternar(recursoId: string, acao: Acao, marcado: boolean) {
    setCarga((atual) => {
      if (!atual) return atual;
      const nova = new Set(atual.selecao);
      const chave = `${recursoId}|${acao}`;
      if (marcado) nova.add(chave);
      else nova.delete(chave);
      return { chave: atual.chave, selecao: nova };
    });
  }

  async function salvar() {
    setSalvando(true);
    const permissoes: MatrizInput = [];
    for (const chave of selecao) {
      const separador = chave.indexOf("|");
      permissoes.push({
        recurso: chave.slice(0, separador),
        acao: chave.slice(separador + 1) as Acao,
      });
    }

    const resultado = await salvarMatrizUsuario(usuarioId, permissoes);
    setSalvando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
    } else {
      toast.success("Matriz de permissões salva");
    }
  }

  if (carregando) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-96 overflow-auto rounded-md border border-border">
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
              <React.Fragment key={modulo.id}>
                <tr className="border-t border-border bg-surface/60">
                  <td
                    colSpan={ACOES.length + 1}
                    className="px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {modulo.nome}
                  </td>
                </tr>
                {recursosDoModulo(modulo.id).map((recurso) => (
                  <tr key={recurso.id} className="border-t border-border">
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {recurso.nome}
                    </td>
                    {ACOES.map((acao) => (
                      <td key={acao} className="px-2 py-1.5 text-center">
                        {recurso.acoes.includes(acao) ? (
                          <Checkbox
                            checked={selecao.has(`${recurso.id}|${acao}`)}
                            onCheckedChange={(marcado) =>
                              alternar(recurso.id, acao, marcado === true)
                            }
                            disabled={!podeEditar || salvando}
                            aria-label={`${recurso.nome}: ${ROTULOS_ACOES[acao]}`}
                          />
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {podeEditar ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar matriz"
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
