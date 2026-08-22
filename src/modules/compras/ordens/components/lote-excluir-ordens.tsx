"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { excluirOrdensCompraLote } from "@/modules/compras/ordens/actions";
import {
  separarParaExclusao,
  textoPuladas,
  textoResumoExclusao,
  type OrdemParaExcluir,
} from "@/modules/compras/ordens/exclusao-lote";

export interface LoteExcluirOrdensProps {
  /** As ordens MARCADAS e à vista, com o status de cada uma. */
  ordensSelecionadas: OrdemParaExcluir[];
  onLimparSelecao: () => void;
  onConcluido: () => void;
  /**
   * Avisa a barra quando o lote está em voo, para ela desabilitar "Limpar
   * seleção": limpar no meio da exclusão deixaria o lote sem as linhas que ele
   * está apagando.
   */
  onExcluindoChange?: (excluindo: boolean) => void;
}

/**
 * Excluir em lote as ordens marcadas que estão em rascunho, cancelada ou
 * rejeitada.
 *
 * O botão só existe quando há ao menos uma marcada nesses status, e ele diz
 * QUANTAS vai apagar — número que pode ser menor que o da barra, porque a barra
 * conta as marcadas e este conta as elegíveis. Dizer "Excluir" sem o número, com
 * seleção misturada, deixaria a pessoa achando que apaga tudo o que marcou.
 *
 * O diálogo é quem explica a diferença antes de confirmar (foi a escolha do dono:
 * ver antes, em vez de descobrir depois). E o resumo do fim diz o que foi feito E
 * o que não foi, porque numa ação definitiva o silêncio é o pior aviso.
 *
 * A separação aqui é só a PRÉVIA. Quem decide de verdade é a Server Action, que
 * relê o status no banco: a lista da tela pode estar velha, e status é justamente
 * o campo que outra pessoa muda enquanto esta seleção está na tela.
 */
export function LoteExcluirOrdens({
  ordensSelecionadas,
  onLimparSelecao,
  onConcluido,
  onExcluindoChange,
}: LoteExcluirOrdensProps) {
  const [aberto, setAberto] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState(false);

  const { elegiveis, puladas } = React.useMemo(
    () => separarParaExclusao(ordensSelecionadas),
    [ordensSelecionadas],
  );

  // Nada elegível, nada a oferecer: um botão que só sabe recusar é ruído.
  if (elegiveis.length === 0) return null;

  const quantidade = elegiveis.length;
  const titulo =
    quantidade === 1
      ? "Excluir 1 ordem de compra"
      : `Excluir ${quantidade} ordens de compra`;

  const aviso = textoPuladas(puladas);
  const descricao = [
    aviso,
    "Esta ação apaga a ordem de compra, os itens e o lançamento previsto. Não é possível desfazer.",
  ]
    .filter(Boolean)
    .join(" ");

  async function aoConfirmar() {
    setExcluindo(true);
    onExcluindoChange?.(true);
    try {
      const resultado = await excluirOrdensCompraLote(
        elegiveis.map((ordem) => ordem.id),
      );
      if ("erro" in resultado) {
        // A seleção FICA: quem tropeça corrige e tenta de novo sem remarcar 13
        // linhas na mão.
        toast.error(resultado.erro);
        return;
      }
      const texto = textoResumoExclusao(resultado.resumo);
      if (resultado.resumo.excluidas === 0) {
        // Zero apagadas não é sucesso, mesmo sem erro de sistema.
        toast.error(texto);
        return;
      }
      toast.success(texto);
      onLimparSelecao();
      onConcluido();
    } finally {
      setExcluindo(false);
      onExcluindoChange?.(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={excluindo}
        onClick={() => setAberto(true)}
      >
        <Trash2 />
        {quantidade === 1 ? "Excluir 1" : `Excluir ${quantidade}`}
      </Button>

      <ConfirmDialog
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo={titulo}
        descricao={descricao}
        textoConfirmar="Excluir"
        variante="destrutivo"
        onConfirmar={aoConfirmar}
      />
    </>
  );
}
