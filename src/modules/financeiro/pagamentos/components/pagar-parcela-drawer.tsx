"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

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
import { Textarea } from "@/components/ui/textarea";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { dataHojeISO, formatarData } from "@/lib/formatadores";
import { paraNumero } from "@/modules/financeiro/lancamentos/schemas";
import {
  ROTULO_BANCO,
  type BancoConta,
} from "@/modules/financeiro/_shared/formato";
import { pagarParcela } from "@/modules/financeiro/pagamentos/actions";
import {
  foraDaJanela,
  textoDaDiferenca,
} from "@/modules/financeiro/pagamentos/janela";
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
 *
 * Data diferente da autorizada não é mais impedimento: é exceção auditada. O
 * campo de motivo aparece só nesse caso, é obrigatório nele, e o que for
 * escrito vira evento na trilha da parcela. Quem paga na data autorizada não vê
 * campo nenhum a mais.
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
  // Inicial pela parcela, e não vazio, para o caso de o drawer ser montado já
  // aberto: o reset abaixo só dispara na TRANSIÇÃO de fechado para aberto, então
  // sozinho ele deixaria a conta vazia nessa montagem.
  const [contaId, setContaId] = React.useState(parcela?.contaBancariaId ?? "");
  const [dataPagamento, setDataPagamento] = React.useState(dataHojeISO());
  const [desconto, setDesconto] = React.useState("");
  // Motivo começa vazio (não há de onde herdar) e zera ao abrir, pelo mesmo
  // argumento do desconto: motivo de um pagamento vazando para o próximo
  // justificaria uma exceção que ninguém escreveu.
  const [motivo, setMotivo] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  // Ao abrir o drawer, a conta começa na que a parcela já tem, o desconto zera e
  // a data volta para hoje. Ajuste de estado durante o render (padrão React) na
  // transição de fechado para aberto, sem efeito: o reset acontece antes da
  // pintura, sem render em cascata.
  //
  // A conta vem da parcela porque ela já foi escolhida no lançamento ou na
  // aprovação (fn_aprovar_parcela recebe a conta, fn_definir_conta_lancamento
  // grava nas parcelas não pagas): pedir de novo era descartar o que o sistema
  // já sabia. Parcela sem conta (o caso da aba Programados, e o motivo de o
  // campo ser opcional no contrato) continua vazia pedindo escolha.
  //
  // Zerar o DESCONTO aqui continua obrigatório, por outro motivo: desconto de um
  // pagamento vazando para o próximo tiraria dinheiro que ninguém abateu.
  const [estavaAberto, setEstavaAberto] = React.useState(aberto);
  if (aberto && !estavaAberto) {
    setEstavaAberto(true);
    setContaId(parcela?.contaBancariaId ?? "");
    setDataPagamento(dataHojeISO());
    setDesconto("");
    setMotivo("");
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

  // Fora da data autorizada o motivo é obrigatório, e o rótulo diz de quanto é
  // a diferença: "adiantado em 1 dia" é a informação que faz o operador escrever
  // uma justificativa de verdade em vez de um "ok".
  const dataAutorizada = parcela?.dataProgramada ?? null;
  const foraDaData = foraDaJanela(dataPagamento, dataAutorizada);
  const diferenca =
    foraDaData && dataAutorizada
      ? textoDaDiferenca(dataPagamento, dataAutorizada)
      : "";
  const motivoOk = !foraDaData || motivo.trim() !== "";

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

    if (!motivoOk) {
      toast.error("Informe o motivo do pagamento fora da data autorizada");
      return;
    }

    setSalvando(true);
    const resultado = await pagarParcela(
      parcela.id,
      contaId,
      dataPagamento,
      descontoNumero,
      foraDaData ? motivo.trim() : undefined,
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
              disabled={salvando || !parcela || !descontoValido || !motivoOk}
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

        {foraDaData ? (
          <CampoFormulario
            id="pagamento-motivo"
            rotulo={`Motivo do pagamento ${diferenca}`}
            obrigatorio
            ajuda="A data autorizada é a que foi aprovada. Pagar em outra data é permitido, e fica registrado na trilha da parcela com esta justificativa."
          >
            <Textarea
              id="pagamento-motivo"
              rows={2}
              maxLength={500}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Ex.: fornecedor deu desconto para antecipar"
              disabled={salvando}
            />
          </CampoFormulario>
        ) : null}
      </form>
    </FormDrawer>
  );
}
