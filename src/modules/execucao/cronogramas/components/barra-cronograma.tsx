"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, Calculator, IndentDecrease, IndentIncrease, ListOrdered, LoaderCircle, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type AcaoBarra = "inserir" | "recuar" | "avancar" | "acima" | "abaixo" | "excluir" | "renumerar" | "recalcular";

interface Botao {
  acao: AcaoBarra;
  rotulo: string;
  icone: LucideIcon;
  dica: string;
}

const ESTRUTURA: Botao[] = [
  { acao: "inserir", rotulo: "Nova linha", icone: Plus, dica: "Abaixo da linha marcada (Ctrl+Enter na grade)" },
  { acao: "recuar", rotulo: "Recuar", icone: IndentIncrease, dica: "Para dentro da linha de cima (Alt+Shift+→)" },
  { acao: "avancar", rotulo: "Avançar", icone: IndentDecrease, dica: "Para fora do resumo (Alt+Shift+←)" },
  { acao: "acima", rotulo: "Subir", icone: ArrowUp, dica: "Troca com a linha de cima (Alt+Shift+↑)" },
  { acao: "abaixo", rotulo: "Descer", icone: ArrowDown, dica: "Troca com a linha de baixo (Alt+Shift+↓)" },
  { acao: "excluir", rotulo: "Excluir", icone: Trash2, dica: "Exclui as linhas marcadas, com motivo (Ctrl+Delete na grade)" },
];

const CRONOGRAMA: Botao[] = [
  { acao: "renumerar", rotulo: "Renumerar EAP", icone: ListOrdered, dica: "Refaz os códigos na ordem da árvore (1, 1.1, 1.2...)" },
  { acao: "recalcular", rotulo: "Recalcular datas", icone: Calculator, dica: "Refaz as datas e o caminho crítico pelo calendário" },
];

export interface BarraCronogramaProps {
  /** Ações que a pessoa pode usar agora (permissão e linha marcada). As outras ficam desabilitadas. */
  habilitadas: ReadonlySet<AcaoBarra>;
  /** Ações que a pessoa tem permissão de usar. As outras nem aparecem. */
  visiveis: ReadonlySet<AcaoBarra>;
  salvando: boolean;
  onAcao: (acao: AcaoBarra) => void;
}

/** Barra da grade: botões com ícone e rótulo, e a dica com o atalho do teclado. */
export function BarraCronograma({ habilitadas, visiveis, salvando, onAcao }: BarraCronogramaProps) {
  const botao = (b: Botao) =>
    visiveis.has(b.acao) ? (
      <Tooltip key={b.acao}>
        <TooltipTrigger asChild>
          <span tabIndex={habilitadas.has(b.acao) ? undefined : 0}>
            <Button type="button" size="sm" variant="outline" disabled={!habilitadas.has(b.acao)} onClick={() => onAcao(b.acao)}>
              <b.icone />
              {b.rotulo}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{b.dica}</TooltipContent>
      </Tooltip>
    ) : null;

  return (
    <TooltipProvider>
      <div role="toolbar" aria-label="Ações da grade" className="flex flex-wrap items-center gap-2">
        {ESTRUTURA.map(botao)}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {CRONOGRAMA.map(botao)}
        {salvando ? (
          <span role="status" className="ml-auto flex items-center gap-1 text-detalhe text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            Salvando...
          </span>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
