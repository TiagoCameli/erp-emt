"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, LoaderCircle } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarData } from "@/lib/formatadores";
import { definirVencimentoDaFolha } from "@/modules/rh/folha/actions";
import type { StatusFolha } from "@/modules/rh/_shared/formato";

export interface VencimentoFolhaProps {
  folhaId: string;
  status: StatusFolha;
  /** Data escolhida (yyyy-MM-dd), ou null quando ninguém escolheu ainda. */
  dataVencimento: string | null;
  /** Permissão de editar a folha (rh.folha:editar). */
  podeEditar: boolean;
}

/**
 * A data de vencimento da folha: o dia em que os lançamentos de salário vencem
 * e ficam programados para pagamento.
 *
 * Editável SÓ em rascunho, como o Tiago pediu. Depois de enviada, a folha está
 * na mão de quem aprova, e mudar a data por baixo trocaria o que a pessoa
 * autorizou sem ela ver — quem precisar corrigir usa "Voltar para rascunho". A
 * mesma trava está na `fn_definir_vencimento_folha`, então esconder o campo aqui
 * é conveniência, não a garantia.
 *
 * Aparece nos DOIS casos, editável ou não: a data é o que vai para o Financeiro,
 * e quem abre uma folha esperando aprovação precisa ver para quando ela está
 * programada antes de aprovar.
 */
export function VencimentoFolha({
  folhaId,
  status,
  dataVencimento,
  podeEditar,
}: VencimentoFolhaProps) {
  const router = useRouter();
  const [valor, setValor] = React.useState(dataVencimento ?? "");
  const [salvando, setSalvando] = React.useState(false);

  // Depois do `router.refresh()` o servidor manda a data nova por prop, e o
  // campo tem de segui-la. Sem isto, salvar e o servidor devolver outra coisa
  // (a folha regerada, outra aba aberta) deixaria a tela mostrando o que foi
  // digitado em vez do que está gravado.
  //
  // Ajuste DURANTE o render, e não num efeito: é o padrão que o React
  // recomenda para estado derivado de prop, e o efeito renderizaria uma vez com
  // o valor velho antes de corrigir — piscada visível num campo de data.
  const [propAnterior, setPropAnterior] = React.useState(dataVencimento);
  if (propAnterior !== dataVencimento) {
    setPropAnterior(dataVencimento);
    setValor(dataVencimento ?? "");
  }

  const editavel = status === "rascunho" && podeEditar;
  const mudou = valor !== (dataVencimento ?? "");

  async function aoSalvar() {
    setSalvando(true);
    const resultado = await definirVencimentoDaFolha({ folhaId, data: valor });
    setSalvando(false);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(
      valor === ""
        ? "Data de vencimento limpa. Vale o dia dos Parâmetros da folha"
        : `Vencimento da folha em ${formatarData(valor)}`,
    );
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card px-4 py-3">
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="folha-vencimento"
          className="text-legenda text-muted-foreground"
        >
          <CalendarDays className="size-3.5" aria-hidden />
          Vencimento dos lançamentos
        </Label>
        {editavel ? (
          <Input
            id="folha-vencimento"
            type="date"
            className="w-[10rem] tabular-nums"
            value={valor}
            onChange={(evento) => setValor(evento.target.value)}
            disabled={salvando}
          />
        ) : (
          <p
            id="folha-vencimento"
            className="text-detalhe font-medium tabular-nums text-foreground"
          >
            {dataVencimento ? formatarData(dataVencimento) : "Não definida"}
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
          ? "É a data que vai para os lançamentos de salário na aprovação."
          : "Sem data aqui, vale o dia de pagamento dos Parâmetros da folha."}
        {editavel ? null : " A data só muda com a folha em rascunho."}
      </p>
    </div>
  );
}
