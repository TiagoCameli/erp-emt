"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";

import { ConfirmDialog, semDerrubarSucesso } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { excluirFrete, restaurarFrete } from "@/modules/frete/fretes/actions";
import type { FreteLinha, OpcoesFrete } from "@/modules/frete/fretes/tipos";
import { FreteFormDrawer } from "./frete-form-drawer";

export interface FreteDetalheAcoesProps {
  frete: FreteLinha;
  opcoes: OpcoesFrete;
  podeEditar: boolean;
  podeExcluir: boolean;
  podeRestaurar: boolean;
}

/**
 * Ações do cabeçalho da página do frete (`/frete/fretes/[id]`): Editar e Excluir no vivo,
 * Restaurar no excluído (com editar a Lixeira e excluir na aba). Depois de excluir, a
 * página continua no frete, agora com o selo "Excluído" e o motivo.
 */
export function FreteDetalheAcoes({ frete, opcoes, podeEditar, podeExcluir, podeRestaurar }: FreteDetalheAcoesProps) {
  const router = useRouter();
  const [editando, setEditando] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState(false);
  const [restaurando, setRestaurando] = React.useState(false);
  const excluido = Boolean(frete.excluidoEm);

  async function aoExcluir(motivo?: string) {
    const resultado = await excluirFrete(frete.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Frete movido para a lixeira.");
    setExcluindo(false);
    semDerrubarSucesso("frete.fretes.excluir", () => router.refresh());
  }

  async function aoRestaurar() {
    const resultado = await restaurarFrete(frete.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Registro restaurado.");
    setRestaurando(false);
    semDerrubarSucesso("frete.fretes.restaurar", () => router.refresh());
  }

  if (excluido) {
    if (!podeRestaurar) return null;
    return (
      <>
        <Button type="button" size="sm" variant="outline" onClick={() => setRestaurando(true)}>
          <RotateCcw />
          Restaurar frete
        </Button>
        <ConfirmDialog
          aberto={restaurando}
          onAbertoChange={setRestaurando}
          titulo="Restaurar frete"
          descricao="Restaurar este registro pra fora da lixeira? O crédito na conta corrente da transportadora volta."
          textoConfirmar="Restaurar frete"
          onConfirmar={aoRestaurar}
        />
      </>
    );
  }

  return (
    <>
      {podeExcluir ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setExcluindo(true)}>
          <Trash2 />
          Excluir frete
        </Button>
      ) : null}
      {podeEditar ? (
        <Button type="button" size="sm" onClick={() => setEditando(true)}>
          <Pencil />
          Editar frete
        </Button>
      ) : null}
      {podeEditar ? (
        <FreteFormDrawer
          aberto={editando}
          onAbertoChange={(aberto) => {
            setEditando(aberto);
            if (!aberto) semDerrubarSucesso("frete.fretes.editar", () => router.refresh());
          }}
          frete={frete}
          opcoes={opcoes}
        />
      ) : null}
      <ConfirmDialog
        aberto={excluindo}
        onAbertoChange={setExcluindo}
        titulo="Excluir frete"
        descricao={`O frete ${frete.notaFiscal ? `NF ${frete.notaFiscal}` : "sem NF"} de ${frete.origemNome} para ${frete.destinoNome} vai para a lixeira, e o crédito dele sai da conta corrente de ${frete.transportadoraNome}. Dá para restaurar depois.`}
        textoConfirmar="Excluir frete"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoExcluir}
      />
    </>
  );
}
