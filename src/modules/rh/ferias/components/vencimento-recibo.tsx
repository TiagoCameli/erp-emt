"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, LoaderCircle } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarData } from "@/lib/formatadores";
import { definirVencimentoRecibo } from "@/modules/rh/ferias/recibo-actions";
import type { StatusRecibo } from "@/modules/rh/ferias/recibo-schemas";

export interface VencimentoReciboProps {
  feriasId: string;
  statusRecibo: StatusRecibo;
  /** Início do gozo (yyyy-MM-dd), usado só no texto do padrão. */
  dataInicio: string | null;
  /** Data escolhida (yyyy-MM-dd), ou null quando vale o padrão. */
  dataVencimento: string | null;
  podeEditar: boolean;
}

/** Dois dias antes do início do gozo, que é o padrão do banco. */
function padraoDoVencimento(dataInicio: string | null): string | null {
  if (!dataInicio) return null;
  const [ano, mes, dia] = dataInicio.split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));
  base.setUTCDate(base.getUTCDate() - 2);
  return base.toISOString().slice(0, 10);
}

/**
 * A data de vencimento do recibo: o dia em que a conta a pagar das férias
 * vence.
 *
 * Editável SÓ em rascunho. Depois de enviado, o recibo está na mão de quem
 * aprova, e mudar a data por baixo trocaria o que a pessoa autorizou sem ela
 * ver — quem precisar corrigir usa "Voltar para rascunho". A mesma trava está
 * na `fn_definir_vencimento_ferias`, então esconder o campo aqui é
 * conveniência, não a garantia.
 *
 * Aparece nos DOIS casos, editável ou não, e ANTES da barra de aprovação: quem
 * vai aprovar precisa ver para quando o dinheiro está programado antes de bater
 * o martelo, não depois de rolar a página.
 */
export function VencimentoRecibo({
  feriasId,
  statusRecibo,
  dataInicio,
  dataVencimento,
  podeEditar,
}: VencimentoReciboProps) {
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

  const editavel = statusRecibo === "rascunho" && podeEditar;
  const mudou = valor !== (dataVencimento ?? "");
  const padrao = padraoDoVencimento(dataInicio);
  const textoPadrao = padrao ? formatarData(padrao) : "dois dias antes do gozo";

  async function aoSalvar() {
    setSalvando(true);
    const resultado = await definirVencimentoRecibo({
      feriasId,
      dataVencimento: valor,
    });
    setSalvando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(
      valor === ""
        ? `Data limpa. Vale ${textoPadrao}`
        : `Recibo vence em ${formatarData(valor)}`,
    );
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card px-4 py-3">
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="recibo-ferias-vencimento"
          className="text-legenda text-muted-foreground"
        >
          <CalendarDays className="size-3.5" aria-hidden />
          Vencimento da conta a pagar
        </Label>
        {editavel ? (
          <Input
            id="recibo-ferias-vencimento"
            type="date"
            className="w-[10rem] tabular-nums"
            value={valor}
            onChange={(evento) => setValor(evento.target.value)}
            disabled={salvando}
          />
        ) : (
          <p
            id="recibo-ferias-vencimento"
            className="text-detalhe font-medium tabular-nums text-foreground"
          >
            {dataVencimento ? formatarData(dataVencimento) : textoPadrao}
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
          ? "É a data que vai para a conta a pagar na aprovação."
          : `Sem data escolhida, o recibo vence em ${textoPadrao}, que é o prazo legal de pagamento das férias.`}
        {editavel ? null : " A data só muda com o recibo em rascunho."}
      </p>
    </div>
  );
}
