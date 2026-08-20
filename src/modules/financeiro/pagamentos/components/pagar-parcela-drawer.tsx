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
  LinhaCampos,
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

/** Um campo de dinheiro opcional do formulário, já interpretado. */
interface CampoDinheiro {
  /** O operador digitou algo? Vazio é zero, não erro: o campo é opcional. */
  informado: boolean;
  numero: number;
  /** Número de verdade e não negativo. O teto do desconto é conferido fora. */
  ok: boolean;
}

/**
 * Interpreta um campo de dinheiro opcional. Vazio vale zero: os três ajustes do
 * pagamento (desconto, juros, outras despesas) são opcionais, e exigir "0"
 * digitado em cada um deles para pagar um boleto na data seria trabalho por
 * nada.
 */
function campoDinheiro(texto: string): CampoDinheiro {
  const informado = texto.trim() !== "";
  const numero = informado ? paraNumero(texto) : 0;
  return {
    informado,
    numero,
    ok: Number.isFinite(numero) && numero >= 0,
  };
}

/** Mensagem de erro comum aos três campos de dinheiro, ou undefined. */
function erroDinheiro(campo: CampoDinheiro): string | undefined {
  if (!campo.informado || campo.ok) return undefined;
  return Number.isFinite(campo.numero)
    ? "O valor não pode ser negativo"
    : "Informe um número (ex: 24.600,00)";
}

/**
 * Drawer de registro de pagamento de uma parcela aprovada: escolhe a conta
 * bancária e a data (default hoje em Rio Branco) e confirma. Aceita o anexo do
 * comprovante antes de confirmar: o vínculo é feito na própria parcela, que é o
 * que o sistema chama de pagamento.

 * Ao pagar, fn_pagar_parcela propaga os anexos do lançamento para cá, então o
 * pagamento termina com o comprovante e a papelada da cadeia.
 *
 * ## Os três ajustes do ato de pagar
 *
 * Desconto ABATE, juros e multa SOMAM, outras despesas (tarifa, cartório,
 * protesto) SOMAM. Nenhum dos três mexe no valor devido da parcela: eles
 * compõem o líquido, que é o que sai da conta bancária.
 *
 * Só o desconto tem teto de valor da parcela, e não é simetria esquecida:
 * abater mais do que se deve é dinheiro que ninguém deve, enquanto uma parcela
 * de R$ 100 protestada pode custar mais em multa e custas do que ela mesma.
 *
 * O rodapé mostra a composição inteira ANTES de confirmar, porque é o líquido
 * que vai bater com o extrato do banco — e três números somados de cabeça é
 * exatamente onde o operador descobre a diferença só na conciliação.
 *
 * Data diferente da autorizada não é impedimento: é exceção auditada. O campo
 * de motivo aparece só nesse caso, é obrigatório nele, e o que for escrito vira
 * evento na trilha da parcela. Quem paga na data autorizada não vê campo nenhum
 * a mais.
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
  const [juros, setJuros] = React.useState("");
  const [outrasDespesas, setOutrasDespesas] = React.useState("");
  // Motivo começa vazio (não há de onde herdar) e zera ao abrir, pelo mesmo
  // argumento do desconto: motivo de um pagamento vazando para o próximo
  // justificaria uma exceção que ninguém escreveu.
  const [motivo, setMotivo] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  // Ao abrir o drawer, a conta começa na que a parcela já tem, os três ajustes
  // zeram e a data volta para hoje. Ajuste de estado durante o render (padrão
  // React) na transição de fechado para aberto, sem efeito: o reset acontece
  // antes da pintura, sem render em cascata.
  //
  // A conta vem da parcela porque ela já foi escolhida no lançamento ou na
  // aprovação (fn_aprovar_parcela recebe a conta, fn_definir_conta_lancamento
  // grava nas parcelas não pagas): pedir de novo era descartar o que o sistema
  // já sabia. Parcela sem conta (o caso da aba Programados, e o motivo de o
  // campo ser opcional no contrato) continua vazia pedindo escolha.
  //
  // Zerar DESCONTO, JUROS e OUTRAS DESPESAS aqui continua obrigatório, por outro
  // motivo: ajuste de um pagamento vazando para o próximo tira (ou acrescenta)
  // dinheiro que ninguém acertou.
  const [estavaAberto, setEstavaAberto] = React.useState(aberto);
  if (aberto && !estavaAberto) {
    setEstavaAberto(true);
    setContaId(parcela?.contaBancariaId ?? "");
    setDataPagamento(dataHojeISO());
    setDesconto("");
    setJuros("");
    setOutrasDespesas("");
    setMotivo("");
  } else if (!aberto && estavaAberto) {
    setEstavaAberto(false);
  }

  const campoDesconto = campoDinheiro(desconto);
  const campoJuros = campoDinheiro(juros);
  const campoDespesas = campoDinheiro(outrasDespesas);

  // O desconto é o único com teto: ele abate a dívida. Juros e despesa somam, e
  // passar do valor da parcela é caso real (protesto de boleto pequeno).
  const descontoAcimaDoValor =
    parcela !== null && campoDesconto.numero > parcela.valor;
  const descontoValido = campoDesconto.ok && !descontoAcimaDoValor;
  const ajustesValidos = descontoValido && campoJuros.ok && campoDespesas.ok;

  const liquido =
    parcela && ajustesValidos
      ? parcela.valor -
        campoDesconto.numero +
        campoJuros.numero +
        campoDespesas.numero
      : null;
  const temAjuste =
    campoDesconto.numero > 0 ||
    campoJuros.numero > 0 ||
    campoDespesas.numero > 0;

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

    // Um toast por campo, com o nome dele: "informe um número" sozinho manda o
    // operador procurar em qual dos três está o problema.
    const numericos: [string, CampoDinheiro][] = [
      ["o desconto", campoDesconto],
      ["os juros e multa", campoJuros],
      ["as outras despesas", campoDespesas],
    ];
    for (const [nome, campo] of numericos) {
      if (campo.informado && !Number.isFinite(campo.numero)) {
        toast.error(`Informe ${nome} como número (ex: 24.600,00)`);
        return;
      }
      if (campo.numero < 0) {
        toast.error(
          `${nome[0].toUpperCase()}${nome.slice(1)} não pode ser negativo`,
        );
        return;
      }
    }
    if (descontoAcimaDoValor) {
      toast.error("O desconto não pode ser maior que o valor da parcela");
      return;
    }

    if (!motivoOk) {
      toast.error("Informe o motivo do pagamento fora da data autorizada");
      return;
    }

    setSalvando(true);
    const resultado = await pagarParcela(parcela.id, contaId, dataPagamento, {
      desconto: campoDesconto.numero,
      juros: campoJuros.numero,
      outrasDespesas: campoDespesas.numero,
      motivo: foraDaData ? motivo.trim() : undefined,
    });
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
          {/* O que o operador precisa ver antes de confirmar: sem ajuste, o
              valor; com qualquer um dos três, a conta feita por extenso, porque
              é o líquido que vai sair da conta e bater com o extrato do banco. */}
          <div className="text-detalhe text-muted-foreground">
            {temAjuste && liquido !== null ? (
              <>
                Valor{" "}
                <MoneyText valor={parcela?.valor ?? null} className="inline" />
                {campoDesconto.numero > 0 ? (
                  <>
                    {" "}
                    menos desconto{" "}
                    <MoneyText
                      valor={campoDesconto.numero}
                      className="inline"
                    />
                  </>
                ) : null}
                {campoJuros.numero > 0 ? (
                  <>
                    {" "}
                    mais juros{" "}
                    <MoneyText valor={campoJuros.numero} className="inline" />
                  </>
                ) : null}
                {campoDespesas.numero > 0 ? (
                  <>
                    {" "}
                    mais despesas{" "}
                    <MoneyText valor={campoDespesas.numero} className="inline" />
                  </>
                ) : null}{" "}
                ={" "}
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
              disabled={salvando || !parcela || !ajustesValidos || !motivoOk}
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

        {/* Os três lado a lado, e não empilhados: eles são UMA conta só, a do
            líquido do rodapé. Separados por três linhas de formulário, o
            operador preenche o primeiro e não vê que os outros dois existem. */}
        <LinhaCampos colunas={3}>
          <CampoFormulario
            id="pagamento-desconto"
            rotulo="Desconto"
            ajuda="Abatimento concedido pelo credor neste pagamento. Deixe vazio se não houve. Não altera o valor devido da parcela."
            erro={
              descontoAcimaDoValor
                ? "O desconto não pode ser maior que o valor da parcela"
                : erroDinheiro(campoDesconto)
            }
          >
            <InputMoeda
              id="pagamento-desconto"
              valor={desconto}
              onValorChange={setDesconto}
              disabled={salvando}
            />
          </CampoFormulario>

          <CampoFormulario
            id="pagamento-juros"
            rotulo="Juros e multa"
            ajuda="Juros e multa pagos pelo atraso. Somam no que sai da conta e não alteram o valor devido da parcela."
            erro={erroDinheiro(campoJuros)}
          >
            <InputMoeda
              id="pagamento-juros"
              valor={juros}
              onValorChange={setJuros}
              disabled={salvando}
            />
          </CampoFormulario>

          <CampoFormulario
            id="pagamento-outras-despesas"
            rotulo="Outras despesas"
            ajuda="Despesa cobrada junto que não é juros nem multa: tarifa bancária, cartório, protesto. Soma no que sai da conta."
            erro={erroDinheiro(campoDespesas)}
          >
            <InputMoeda
              id="pagamento-outras-despesas"
              valor={outrasDespesas}
              onValorChange={setOutrasDespesas}
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

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
