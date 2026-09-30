"use client";

import { ConfirmDialog } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { formatarData } from "@/lib/formatadores";
import { excluirLancamento } from "@/modules/medicao/lancamentos/actions";
import type { LancamentoLista } from "@/modules/medicao/lancamentos/tipos";

export interface ExcluirLancamentoProps {
  /** null: diálogo fechado. */
  lancamento: LancamentoLista | null;
  onFechar: () => void;
  onExcluido: () => void;
}

/**
 * Excluir um lançamento, com motivo obrigatório (o banco confere o mínimo de 3 letras). Diálogo
 * canônico de confirmação (`ConfirmDialog`, `exigeMotivo`), mesmo padrão de exclusão do resto do
 * app (ver `aoConfirmarExclusao` em combustivel/abastecimentos-tabela.tsx).
 */
export function ExcluirLancamento({ lancamento, onFechar, onExcluido }: ExcluirLancamentoProps) {
  async function confirmar(motivo?: string) {
    if (!lancamento) return;
    const resultado = await excluirLancamento(lancamento.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Lançamento excluído");
    onExcluido();
  }

  return (
    <ConfirmDialog
      aberto={lancamento !== null}
      onAbertoChange={(aberto) => {
        if (!aberto) onFechar();
      }}
      titulo="Excluir lançamento"
      descricao={
        lancamento
          ? `O lançamento de ${lancamento.codigo ?? "item"} em ${formatarData(lancamento.data)} sai da ${lancamento.medicaoNumero}ª medição. Informe o motivo da exclusão.`
          : ""
      }
      textoConfirmar="Excluir lançamento"
      variante="destrutivo"
      exigeMotivo
      onConfirmar={confirmar}
    />
  );
}
