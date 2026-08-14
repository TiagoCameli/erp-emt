"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { SecaoFormulario } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import type { ProvisaoLista } from "@/modules/rh/provisoes/queries";
import { ProvisaoFormDrawer } from "./provisao-form-drawer";
import { ProvisoesTabela } from "./provisoes-tabela";

export interface ProvisoesSecaoProps {
  provisoes: ProvisaoLista[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Seção "Provisões de 13º e férias", embutida na tela de encargos (mesma
 * alçada, rh.encargos): tabela + drawer de criação/edição compartilhado. Sem
 * cálculo aqui — só o cadastro do percentual que a folha vai usar (Task 2).
 */
export function ProvisoesSecao({
  provisoes,
  podeCriar,
  podeEditar,
  podeExcluir,
}: ProvisoesSecaoProps) {
  const [editando, setEditando] = React.useState<ProvisaoLista | null>(null);
  const [aberto, setAberto] = React.useState(false);

  function abrirCriacao() {
    setEditando(null);
    setAberto(true);
  }

  function abrirEdicao(provisao: ProvisaoLista) {
    setEditando(provisao);
    setAberto(true);
  }

  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) setEditando(null);
  }

  return (
    <SecaoFormulario
      titulo="Provisões de 13º e férias"
      acao={
        podeCriar ? (
          <Button type="button" size="sm" onClick={abrirCriacao}>
            <Plus />
            Nova provisão
          </Button>
        ) : null
      }
    >
      <p className="text-detalhe text-muted-foreground">
        Percentual do salário lançado como custo do mês na folha. Não gera
        conta a pagar no Financeiro — diferente dos encargos acima.
      </p>

      <ProvisoesTabela
        provisoes={provisoes}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onEditar={abrirEdicao}
      />

      <ProvisaoFormDrawer
        key={editando?.id ?? "nenhum"}
        aberto={aberto}
        onAbertoChange={aoMudarAberto}
        provisao={editando}
      />
    </SecaoFormulario>
  );
}
