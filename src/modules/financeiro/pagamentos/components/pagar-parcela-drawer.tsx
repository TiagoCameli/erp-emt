"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Anexos } from "@/components/canonicos/anexos";
import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputMoeda,
  MoneyText,
  SecaoFormulario,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { dataHojeISO, formatarData } from "@/lib/formatadores";
import { paraNumero } from "@/modules/financeiro/lancamentos/schemas";
import {
  ROTULO_BANCO,
  type BancoConta,
} from "@/modules/financeiro/_shared/formato";
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
  /** Anexos já vinculados a esta parcela (comprovante e o que veio da cadeia). */
  anexos?: AnexoDoDocumento[];
  /** Libera anexar o comprovante. */
  podeAnexar?: boolean;
}

/** Rótulo da conta no select: nome + banco. */
function rotuloConta(conta: ContaBancariaOpcao): string {
  const banco = ROTULO_BANCO[conta.banco as BancoConta] ?? conta.banco;
  return `${conta.nome} - ${banco}`;
}

/**
 * Drawer de registro de pagamento de uma parcela aprovada: escolhe a conta
 * bancária e a data (default hoje em Rio Branco) e confirma. Aceita o anexo do
 * comprovante antes de confirmar: o vínculo é feito na própria parcela, que é o
 * que o sistema chama de pagamento.

 * Ao pagar, fn_pagar_parcela propaga os anexos do lançamento para cá, então o
 * pagamento termina com o comprovante e a papelada da cadeia.
 *
 * Desconto é opcional e sai do que a conta bancária paga, sem mexer no valor
 * devido da parcela. O rodapé mostra o líquido ANTES de confirmar, porque é ele
 * que vai bater com o extrato do banco.
 */
export function PagarParcelaDrawer({
  aberto,
  onAbertoChange,
  parcela,
  contas,
  anexos = [],
  podeAnexar = false,
  onPago,
}: PagarParcelaDrawerProps) {
  const [contaId, setContaId] = React.useState("");
  const [dataPagamento, setDataPagamento] = React.useState(dataHojeISO());
  const [desconto, setDesconto] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  // Ao abrir o drawer, zera a conta e o desconto e volta a data para hoje.
  // Ajuste de estado durante o render (padrão React) na transição de fechado
  // para aberto, sem efeito: o reset acontece antes da pintura, sem render em
  // cascata. Zerar o desconto aqui é obrigatório: desconto de um pagamento
  // vazando para o próximo tiraria dinheiro que ninguém abateu.
  const [estavaAberto, setEstavaAberto] = React.useState(aberto);
  if (aberto && !estavaAberto) {
    setEstavaAberto(true);
    setContaId("");
    setDataPagamento(dataHojeISO());
    setDesconto("");
  } else if (!aberto && estavaAberto) {
    setEstavaAberto(false);
  }

  // Campo vazio é desconto zero, não erro: ele é opcional.
  const descontoInformado = desconto.trim() !== "";
  const descontoNumero = descontoInformado ? paraNumero(desconto) : 0;
  const descontoValido =
    Number.isFinite(descontoNumero) &&
    descontoNumero >= 0 &&
    (parcela === null || descontoNumero <= parcela.valor);
  const liquido =
    parcela && descontoValido ? parcela.valor - descontoNumero : null;

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!parcela || salvando) return;

    if (contaId === "") {
      toast.error("Selecione a conta bancária do pagamento");
      return;
    }

    if (descontoInformado && !Number.isFinite(descontoNumero)) {
      toast.error("Informe o desconto como número (ex: 24.600,00)");
      return;
    }
    if (descontoNumero < 0) {
      toast.error("O desconto não pode ser negativo");
      return;
    }
    if (descontoNumero > parcela.valor) {
      toast.error("O desconto não pode ser maior que o valor da parcela");
      return;
    }

    setSalvando(true);
    const resultado = await pagarParcela(
      parcela.id,
      contaId,
      dataPagamento,
      descontoNumero,
    );
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
          {/* O que o operador precisa ver antes de confirmar: sem desconto, o
              valor; com desconto, a conta feita, porque é o líquido que vai
              sair da conta e bater com o extrato do banco. */}
          <div className="text-detalhe text-muted-foreground">
            {descontoNumero > 0 && liquido !== null ? (
              <>
                Valor{" "}
                <MoneyText valor={parcela?.valor ?? null} className="inline" />{" "}
                menos desconto{" "}
                <MoneyText valor={descontoNumero} className="inline" /> ={" "}
                <span className="font-semibold text-foreground">
                  <MoneyText valor={liquido} className="inline" />
                </span>
              </>
            ) : (
              <>
                Valor{" "}
                <span className="font-semibold text-foreground">
                  <MoneyText valor={parcela?.valor ?? null} className="inline" />
                </span>
              </>
            )}
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
            <Button
              type="submit"
              form={ID_FORM}
              disabled={salvando || !parcela || !descontoValido}
            >
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
              <span className="text-right font-medium">
                {parcela.descricao}
              </span>
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
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Data autorizada</span>
              <span className="font-medium tabular-nums">
                {parcela.dataProgramada
                  ? formatarData(parcela.dataProgramada)
                  : "-"}
              </span>
            </div>
          </div>
        ) : null}

        {parcela ? (
          <SecaoFormulario titulo="Comprovante e anexos">
            <Anexos
              entidade="pagamento"
              entidadeId={parcela.id}
              anexos={anexos}
              podeEditar={podeAnexar}
            />
          </SecaoFormulario>
        ) : null}

        <CampoFormulario
          id="pagamento-conta"
          rotulo="Conta bancária"
          obrigatorio
        >
          <Combobox
            valor={contaId}
            onValorChange={setContaId}
            opcoes={contas.map((conta) => ({
              valor: conta.id,
              rotulo: rotuloConta(conta),
            }))}
            placeholder="Selecione a conta"
            disabled={salvando}
            id="pagamento-conta"
            className="w-full"
          />
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

        <CampoFormulario
          id="pagamento-desconto"
          rotulo="Desconto"
          largura="medio"
          ajuda="Abatimento concedido pelo credor neste pagamento. Deixe vazio se não houve. Não altera o valor devido da parcela."
          erro={
            descontoInformado && !descontoValido
              ? !Number.isFinite(descontoNumero)
                ? "Informe um número (ex: 24.600,00)"
                : descontoNumero < 0
                  ? "O desconto não pode ser negativo"
                  : "O desconto não pode ser maior que o valor da parcela"
              : undefined
          }
        >
          <InputMoeda
            id="pagamento-desconto"
            valor={desconto}
            onValorChange={setDesconto}
            disabled={salvando}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
