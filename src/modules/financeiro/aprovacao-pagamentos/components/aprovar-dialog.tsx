"use client";

import * as React from "react";
import { CalendarClock, LoaderCircle, TriangleAlert } from "lucide-react";

import { Combobox } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataHojeISO, formatarBRL, formatarData } from "@/lib/formatadores";
import { avisoFimDeSemana } from "@/modules/financeiro/_shared/janela-pagamento";
import {
  ROTULO_BANCO,
  type BancoConta,
} from "@/modules/financeiro/_shared/formato";
import type { ContaBancariaOpcao } from "@/modules/financeiro/pagamentos/queries";

export interface AprovarDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Quantas parcelas vão ser aprovadas (1 na linha, N no lote). */
  quantidade: number;
  /** Valor somado do que está sendo aprovado. */
  valorTotal: number;
  /**
   * Vencimento da parcela quando é uma só. No lote fica null, porque cada
   * parcela tem o seu e o default é justamente respeitar o de cada uma.
   */
  vencimento?: string | null;
  /** Contas bancárias ativas, para trocar a conta na hora de aprovar. */
  contas: ContaBancariaOpcao[];
  /**
   * Conta que veio do lançamento, quando é uma parcela só. No lote fica null:
   * cada selecionada tem a sua, e o default é manter.
   */
  contaAtualId?: string | null;
  /** Nome da conta atual, para ela aparecer no campo mesmo se estiver inativa. */
  contaAtualNome?: string | null;
  /**
   * `dataProgramada` null significa "usa o vencimento de cada parcela" e
   * `contaId` null significa "mantém a conta do lançamento": os dois fallbacks
   * do banco.
   */
  onConfirmar: (
    dataProgramada: string | null,
    contaId: string | null,
  ) => Promise<void>;
}

/** Rótulo da conta no campo: nome + banco, igual ao drawer de pagamento. */
function rotuloConta(conta: ContaBancariaOpcao): string {
  const banco = ROTULO_BANCO[conta.banco as BancoConta] ?? conta.banco;
  return `${conta.nome} - ${banco}`;
}

/**
 * Modal de aprovação: aprovar é autorizar o pagamento de uma conta para uma data.
 *
 * O default da data é o vencimento (da parcela, ou de cada uma no lote), que é o
 * mesmo fallback que o banco aplica quando nenhuma data é enviada. Quem aprova só
 * digita data quando quer outra, e aí o sistema registra que a data foi escolhida
 * na aprovação, não herdada do vencimento.
 *
 * A conta vem escolhida do lançamento, que é o portão da aprovação: parcela sem
 * conta não chega aqui. Trocar a conta no modal é exceção, vale só para o que está
 * sendo aprovado, e sem mexer no campo nada muda.
 *
 * Fim de semana gera aviso, nunca bloqueio: pode existir motivo para programar
 * num sábado, e a decisão é de quem aprova. Feriado não é avisado porque o
 * sistema não tem cadastro de feriado, e chutar calendário seria pior.
 */
export function AprovarDialog({
  aberto,
  onAbertoChange,
  quantidade,
  valorTotal,
  vencimento,
  contas,
  contaAtualId,
  contaAtualNome,
  onConfirmar,
}: AprovarDialogProps) {
  const [outraData, setOutraData] = React.useState(false);
  const [data, setData] = React.useState("");
  const [conta, setConta] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  // Reabrir começa limpo, no default, sem carregar a escolha da vez anterior.
  const [abertoAnterior, setAbertoAnterior] = React.useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) {
      setOutraData(false);
      setData(vencimento ?? dataHojeISO());
      setConta(contaAtualId ?? "");
    }
  }

  const aviso = outraData && data ? avisoFimDeSemana(data) : null;
  const lote = quantidade > 1;

  // A conta atual entra na lista mesmo se não estiver entre as ativas: conta
  // desativada depois do lançamento apareceria como um id cru no campo.
  const opcoesConta = React.useMemo(() => {
    const base = contas.map((c) => ({ valor: c.id, rotulo: rotuloConta(c) }));
    if (contaAtualId && !base.some((opcao) => opcao.valor === contaAtualId)) {
      return [
        { valor: contaAtualId, rotulo: contaAtualNome ?? "Conta do lançamento" },
        ...base,
      ];
    }
    return base;
  }, [contas, contaAtualId, contaAtualNome]);

  const trocouConta = conta !== "" && conta !== (contaAtualId ?? "");

  async function confirmar() {
    setSalvando(true);
    try {
      // Só manda a conta quando é troca de verdade: mandar a mesma de volta
      // faria o banco revalidar uma conta que pode ter sido desativada depois.
      await onConfirmar(outraData ? data : null, trocouConta ? conta : null);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {lote ? `Aprovar ${quantidade} pagamentos` : "Aprovar pagamento"}
          </DialogTitle>
          <DialogDescription>
            {formatarBRL(valorTotal)}
            {lote ? ` em ${quantidade} parcelas` : ""}. Aprovar autoriza o
            pagamento para uma data: antes dela, o pagamento fica bloqueado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface px-3 py-2.5">
            <CalendarClock
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <p className="text-detalhe text-muted-foreground">
              {outraData ? (
                <>
                  Data escolhida agora, registrada como definida na aprovação.
                </>
              ) : lote ? (
                <>
                  Cada parcela fica autorizada para o{" "}
                  <span className="font-medium text-foreground">
                    próprio vencimento
                  </span>
                  .
                </>
              ) : vencimento ? (
                <>
                  Autorizado para o vencimento:{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatarData(vencimento)}
                  </span>
                  .
                </>
              ) : (
                <>
                  Esta parcela não tem vencimento, então a autorização cai em
                  hoje.
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="aprovar-outra-data"
              checked={outraData}
              onCheckedChange={(marcado) => setOutraData(marcado === true)}
              disabled={salvando}
            />
            <Label htmlFor="aprovar-outra-data" className="font-normal">
              {lote
                ? "Usar uma única data para todas"
                : "Autorizar para outra data"}
            </Label>
          </div>

          {outraData ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="aprovar-data">Data programada de pagamento</Label>
              <Input
                id="aprovar-data"
                type="date"
                value={data}
                onChange={(evento) => setData(evento.target.value)}
                disabled={salvando}
                className="tabular-nums"
              />
              {aviso ? (
                <p className="flex items-start gap-1.5 text-legenda text-status-pendente">
                  <TriangleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  {aviso}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="aprovar-conta">Conta bancária</Label>
            <Combobox
              id="aprovar-conta"
              valor={conta}
              onValorChange={setConta}
              opcoes={opcoesConta}
              placeholder={
                lote
                  ? "Manter a conta de cada pagamento"
                  : "Selecione a conta bancária"
              }
              buscaPlaceholder="Buscar conta"
              vazioTexto="Nenhuma conta bancária ativa"
              limpavel={lote}
              disabled={salvando}
              className="w-full"
            />
            <p className="text-legenda text-muted-foreground">
              {lote
                ? conta === ""
                  ? `Sem escolher, cada um dos ${quantidade} pagamentos sai da conta do próprio lançamento.`
                  : `A conta escolhida vale para os ${quantidade} pagamentos selecionados, só nesta aprovação.`
                : trocouConta
                  ? "Trocar a conta aqui vale só para esta parcela: as outras do lançamento continuam na conta original."
                  : "Conta que veio do lançamento. Trocar aqui vale só para esta parcela."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void confirmar()}
            disabled={salvando || (outraData && data === "")}
          >
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Aprovando...
              </>
            ) : lote ? (
              `Aprovar ${quantidade} pagamentos`
            ) : (
              "Aprovar pagamento"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
