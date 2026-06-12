"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MatrizRecursosAcoes,
  chavePermissao,
  permissaoDaChave,
} from "@/components/canonicos/matriz-recursos-acoes";
import type { Acao } from "@/config/recursos";
import { createClient } from "@/lib/supabase/client";
import { salvarMatrizUsuario } from "@/modules/administracao/usuarios/actions";
import type { MatrizInput } from "@/modules/administracao/usuarios/schemas";

export interface MatrizPermissoesProps {
  usuarioId: string;
  podeEditar: boolean;
  /** Incremente para forçar recarga (ex: depois de aplicar um perfil). */
  recarregar?: number;
}

/**
 * Editor da matriz individual do usuário sobre a matriz canônica
 * de recursos x ações. Salvar substitui a matriz inteira numa
 * transação só (RPC salvar_matriz_usuario).
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
              (data ?? []).map((par) =>
                chavePermissao(par.recurso, par.acao as Acao),
              ),
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
      const chave = chavePermissao(recursoId, acao);
      if (marcado) nova.add(chave);
      else nova.delete(chave);
      return { chave: atual.chave, selecao: nova };
    });
  }

  async function salvar() {
    setSalvando(true);
    const permissoes: MatrizInput = [...selecao].map((chave) =>
      permissaoDaChave(chave),
    );

    const resultado = await salvarMatrizUsuario(usuarioId, permissoes);
    setSalvando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
    } else {
      toast.success("Matriz de permissões salva");
    }
  }

  if (carregando) {
    // Espelha o tamanho da matriz real: o drawer não pula quando carrega.
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-64 w-full rounded-md" />
        {podeEditar ? (
          <div className="flex justify-end">
            <Skeleton className="h-8 w-28" />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <MatrizRecursosAcoes
        selecionadas={selecao}
        onAlternar={alternar}
        desabilitada={!podeEditar || salvando}
      />

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
