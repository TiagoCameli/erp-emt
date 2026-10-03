"use client";

import type { FiltroDaBarra } from "@/components/canonicos";
import { Checkbox } from "@/components/ui/checkbox";
import {
  escritaIncluirInvestimento,
  PARAM_INCLUIR_INVESTIMENTO,
} from "@/modules/financeiro/relatorios/filtro-investimento";

/**
 * Caixa de marcar com rótulo, no tamanho da barra de filtros.
 *
 * Saiu de dentro da barra do Custo por centro quando o "Incluir investimentos"
 * passou a valer em quatro telas: quatro cópias da mesma caixa divergiriam no
 * primeiro ajuste de altura feito numa só.
 */
export function FiltroMarcar({
  id,
  rotulo,
  marcado,
  onMarcarChange,
  desabilitado,
  motivo,
}: {
  id: string;
  rotulo: string;
  marcado: boolean;
  onMarcarChange: (marcado: boolean) => void;
  desabilitado?: boolean;
  /** Por que está desabilitado, no title. Some quando habilitado. */
  motivo?: string;
}) {
  return (
    <label
      htmlFor={id}
      title={desabilitado ? motivo : undefined}
      className={
        "flex h-8 items-center gap-1.5 text-detalhe " +
        (desabilitado ? "text-muted-foreground/60" : "text-muted-foreground")
      }
    >
      <Checkbox
        id={id}
        checked={marcado}
        disabled={desabilitado}
        onCheckedChange={(estado) => onMarcarChange(estado === true)}
      />
      {rotulo}
    </label>
  );
}

/**
 * O "Incluir investimentos" das telas de custo, como item da barra.
 *
 * Fixo na barra, e não escondido no menu "Filtros": é a escolha que muda o
 * significado do número (com ou sem máquina e terreno comprados), e quem abre a
 * tela precisa ver que ela existe e em que posição está.
 */
export function filtroIncluirInvestimento({
  marcado,
  setMuitos,
}: {
  marcado: boolean;
  setMuitos: (mudancas: Record<string, string | null>) => void;
}): FiltroDaBarra {
  return {
    id: PARAM_INCLUIR_INVESTIMENTO,
    rotulo: "Investimentos",
    fixo: true,
    temValor: marcado,
    onLimpar: () => setMuitos(escritaIncluirInvestimento(false)),
    elemento: (
      <FiltroMarcar
        id="filtro-incluir-investimento"
        rotulo="Incluir investimentos"
        marcado={marcado}
        onMarcarChange={(novo) => setMuitos(escritaIncluirInvestimento(novo))}
      />
    ),
  };
}
