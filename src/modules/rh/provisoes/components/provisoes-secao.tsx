"use client";

import * as React from "react";
import { Plus, TriangleAlert } from "lucide-react";

import { SecaoFormulario } from "@/components/canonicos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
      {/* A frase anterior dizia que a provisão "não gera conta a pagar,
          diferente dos encargos acima", e isso é falso para encargo SEM grupo
          de recolhimento, que também não gera lançamento nenhum. A distinção
          verdadeira é o grupo, e ela importa porque é justamente o encargo sem
          grupo que parece servir para 13º e férias (ver docs/decisoes.md,
          entrada de 14/08/2026, ponto 1). */}
      <p className="text-detalhe text-muted-foreground">
        Percentual do salário lançado como custo do mês na folha, sem gerar
        conta a pagar no Financeiro. Nos encargos acima, quem tem grupo de
        recolhimento vira guia e sai do caixa; encargo sem grupo entra no custo
        e também não gera lançamento nenhum.
      </p>

      <Alert>
        <TriangleAlert />
        <AlertTitle>Não cadastre 13º nem férias como encargo</AlertTitle>
        <AlertDescription>
          Com a provisão cadastrada aqui, o mesmo custo conta duas vezes na
          folha, e nenhuma conferência acusa: a diferença aparece só no custo da
          obra e no resultado do mês. Encargo é para o que a empresa recolhe
          sobre a folha do mês, como INSS patronal, FGTS e RAT/SAT.
        </AlertDescription>
      </Alert>

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
