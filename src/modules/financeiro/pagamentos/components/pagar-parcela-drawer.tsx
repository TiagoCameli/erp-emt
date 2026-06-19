"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { FormDrawer, MoneyText } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dataHojeISO, formatarData } from "@/lib/formatadores";
import { ROTULO_BANCO, type BancoConta } from "@/modules/financeiro/_shared/formato";
import {
  CampoFormulario,
  classesFormulario,
} from "@/modules/cadastros/_shared/campos";
import { pagarParcela } from "@/modules/financeiro/pagamentos/actions";
import type {
  ContaBancariaOpcao,
  ParcelaAprovada,
} from "@/modules/financeiro/pagamentos/queries";

const ID_FORM = "form-pagar-parcela";

export interface PagarParcelaDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Parcela em pagamento, ou null quando o drawer está fechado. */
  parcela: ParcelaAprovada | null;
  contas: ContaBancariaOpcao[];
  /** Chamado após o pagamento ser registrado com sucesso. */
  onPago?: () => void;
}

/** Rótulo da conta no select: nome + banco. */
function rotuloConta(conta: ContaBancariaOpcao): string {
  const banco = ROTULO_BANCO[conta.banco as BancoConta] ?? conta.banco;
  return `${conta.nome} - ${banco}`;
}

/**
 * Drawer de registro de pagamento de uma parcela aprovada: escolhe a conta
 * bancária e a data (default hoje em Rio Branco) e confirma. Sem anexo de
 * comprovante nesta fase.
 */
export function PagarParcelaDrawer({
  aberto,
  onAbertoChange,
  parcela,
  contas,
  onPago,
}: PagarParcelaDrawerProps) {
  const [contaId, setContaId] = React.useState("");
  const [dataPagamento, setDataPagamento] = React.useState(dataHojeISO());
  const [salvando, setSalvando] = React.useState(false);

  // Ao abrir o drawer, zera a conta e volta a data para hoje. Ajuste de estado
  // durante o render (padrão React) na transição de fechado para aberto, sem
  // efeito: o reset acontece antes da pintura, sem render em cascata.
  const [estavaAberto, setEstavaAberto] = React.useState(aberto);
  if (aberto && !estavaAberto) {
    setEstavaAberto(true);
    setContaId("");
    setDataPagamento(dataHojeISO());
  } else if (!aberto && estavaAberto) {
    setEstavaAberto(false);
  }

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!parcela || salvando) return;

    if (contaId === "") {
      toast.error("Selecione a conta bancária do pagamento");
      return;
    }

    setSalvando(true);
    const resultado = await pagarParcela(parcela.id, contaId, dataPagamento);
    setSalvando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success("Pagamento registrado");
    onAbertoChange(false);
    onPago?.();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Registrar pagamento"
      descricao="Informe a conta bancária e a data do pagamento desta parcela"
      rodape={
        <div className="flex w-full items-center justify-between gap-4">
          <div className="text-detalhe text-muted-foreground">
            Valor{" "}
            <span className="font-semibold text-foreground">
              <MoneyText valor={parcela?.valor ?? null} className="inline" />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onAbertoChange(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button type="submit" form={ID_FORM} disabled={salvando || !parcela}>
              {salvando ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Registrando...
                </>
              ) : (
                "Confirmar pagamento"
              )}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={aoEnviar}
        className={classesFormulario}
        noValidate
      >
        {parcela ? (
          <div className="grid gap-3 rounded-md border border-border bg-surface px-3 py-3 text-detalhe">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Lançamento</span>
              <span className="font-medium">
                {parcela.lancamentoNumero ? (
                  <span className="codigo-doc">{parcela.lancamentoNumero}</span>
                ) : (
                  "-"
                )}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">Descrição</span>
              <span className="text-right font-medium">{parcela.descricao}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Fornecedor</span>
              <span className="font-medium">{parcela.fornecedorNome}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Parcela</span>
              <span className="font-medium tabular-nums">
                {parcela.numeroParcela}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Vencimento</span>
              <span className="font-medium tabular-nums">
                {parcela.dataVencimento
                  ? formatarData(parcela.dataVencimento)
                  : "-"}
              </span>
            </div>
          </div>
        ) : null}

        <CampoFormulario id="pagamento-conta" rotulo="Conta bancária" obrigatorio>
          <Select
            value={contaId}
            onValueChange={setContaId}
            disabled={salvando}
          >
            <SelectTrigger id="pagamento-conta" className="w-full">
              <SelectValue placeholder="Selecione a conta" />
            </SelectTrigger>
            <SelectContent>
              {contas.map((conta) => (
                <SelectItem key={conta.id} value={conta.id}>
                  {rotuloConta(conta)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CampoFormulario>

        <CampoFormulario
          id="pagamento-data"
          rotulo="Data do pagamento"
          obrigatorio
        >
          <Input
            id="pagamento-data"
            type="date"
            value={dataPagamento}
            onChange={(evento) => setDataPagamento(evento.target.value)}
            disabled={salvando}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
