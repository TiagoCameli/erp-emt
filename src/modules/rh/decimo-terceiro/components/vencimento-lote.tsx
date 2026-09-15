"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, LoaderCircle } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarData } from "@/lib/formatadores";
import { definirVencimento } from "@/modules/rh/decimo-terceiro/actions";
import type { StatusLote } from "@/modules/rh/decimo-terceiro/schemas";

export interface VencimentoLoteProps {
  loteId: string;
  /** O ano do 13º, usado só no texto do padrão. */
  ano: number;
  status: StatusLote;
  /** Data escolhida (yyyy-MM-dd), ou null quando vale o padrão. */
  dataVencimento: string | null;
  podeEditar: boolean;
}

/**
 * A data de vencimento do lote: o dia em que as contas a pagar do 13º vencem.
 *
 * Editável SÓ em rascunho. Depois de enviado, o lote está na mão de quem
 * aprova, e mudar a data por baixo trocaria o que a pessoa autorizou sem ela
 * ver — quem precisar corrigir usa "Voltar para rascunho". A mesma trava está
 * na `fn_definir_vencimento_decimo_terceiro`, então esconder o campo aqui é
 * conveniência, não a garantia.
 *
 * Aparece nos DOIS casos, editável ou não, e ANTES da barra de aprovação: quem
 * vai aprovar precisa ver para quando o dinheiro está programado antes de bater
 * o martelo, não depois de rolar a página.
 */
export function VencimentoLote({
  loteId,
  ano,
  status,
  dataVencimento,
  podeEditar,
}: VencimentoLoteProps) {
  const router = useRouter();
  const [valor, setValor] = React.useState(dataVencimento ?? "");
  const [salvando, setSalvando] = React.useState(false);

  // Ajuste DURANTE o render, e não num efeito: é o padrão do React para estado
  // derivado de prop. Num efeito, o campo renderizaria uma vez com o valor
  // velho antes de corrigir (piscada visível), e `setState` síncrono em efeito
  // ainda por cima é recusado pelo lint de hooks.
  const [propAnterior, setPropAnterior] = React.useState(dataVencimento);
  if (propAnterior !== dataVencimento) {
    setPropAnterior(dataVencimento);
    setValor(dataVencimento ?? "");
  }

  const editavel = status === "rascunho" && podeEditar;
  const mudou = valor !== (dataVencimento ?? "");

  async function aoSalvar() {
    setSalvando(true);
    const resultado = await definirVencimento({
      loteId,
      dataVencimento: valor,
    });
    setSalvando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(
      valor === ""
        ? `Data limpa. Vale 20/12/${ano}`
        : `13º vence em ${formatarData(valor)}`,
    );
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card px-4 py-3">
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="lote-13o-vencimento"
          className="text-legenda text-muted-foreground"
        >
          <CalendarDays className="size-3.5" aria-hidden />
          Vencimento das contas a pagar
        </Label>
        {editavel ? (
          <Input
            id="lote-13o-vencimento"
            type="date"
            className="w-[10rem] tabular-nums"
            value={valor}
            onChange={(evento) => setValor(evento.target.value)}
            disabled={salvando}
          />
        ) : (
          <p
            id="lote-13o-vencimento"
            className="text-detalhe font-medium tabular-nums text-foreground"
          >
            {dataVencimento ? formatarData(dataVencimento) : `20/12/${ano}`}
          </p>
        )}
      </div>

      {editavel ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          // Só habilita quando o valor na tela difere do gravado: botão que
          // grava o que já está gravado gera um toast de sucesso sobre nada.
          disabled={!mudou || salvando}
          onClick={aoSalvar}
        >
          {salvando ? <LoaderCircle className="animate-spin" /> : null}
          Salvar data
        </Button>
      ) : null}

      <p className="text-legenda text-muted-foreground">
        {dataVencimento
          ? "É a data que vai para as contas a pagar na aprovação."
          : `Sem data escolhida, o 13º vence em 20/12/${ano}.`}
        {editavel ? null : " A data só muda com o lote em rascunho."}
      </p>
    </div>
  );
}
