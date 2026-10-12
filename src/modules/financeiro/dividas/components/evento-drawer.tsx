"use client";

import * as React from "react";

import {
  CampoFormulario,
  Combobox,
  ConfirmDialog,
  FormDrawer,
  InputMoeda,
  LinhaCampos,
  MoneyText,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarData } from "@/lib/formatadores";
import { paraNumero } from "@/modules/compras/ordens/calculo";
import { registrarEvento } from "@/modules/financeiro/dividas/actions";
import { saldoNaData, somarCentavos } from "@/modules/financeiro/dividas/calculo";
import {
  CronogramaEditor,
  lerLinhas,
  type LinhaEditavel,
} from "@/modules/financeiro/dividas/components/cronograma-editor";
import type { LinhaCronograma } from "@/modules/financeiro/dividas/queries";
import { ROTULO_EVENTO, TIPOS_EVENTO } from "@/modules/financeiro/dividas/schemas";

type TipoEvento = (typeof TIPOS_EVENTO)[number];

const OPCOES = TIPOS_EVENTO.map((t) => ({ valor: t, rotulo: ROTULO_EVENTO[t] }));

const AJUDA_VALOR: Record<TipoEvento, string> = {
  amortizacao: "O que abateu do principal.",
  quitacao: "O que foi pago para quitar. O que passar do saldo entra como juros.",
  renegociacao: "O saldo novo de principal. Vazio: o saldo na data.",
};

function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Rio_Branco" }).format(new Date());
}

export interface EventoDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  contratoId: string;
  /** Price e SAC recalculam o resto da amortização sozinhos; do banco, digita-se. */
  sistema: string;
  valorLiberado: number;
  dataLiberacao: string;
  cronograma: LinhaCronograma[];
}

/**
 * Amortização antecipada, quitação ou renegociação. Todo evento grava uma
 * versão nova do cronograma: o que venceu até a data fica, entra a linha do
 * evento e, depois, o resto (recalculado em Price/SAC, ou digitado). Gravar
 * pede o motivo, que fica no histórico do contrato.
 */
export function EventoDrawer({
  aberto,
  onAbertoChange,
  contratoId,
  sistema,
  valorLiberado,
  dataLiberacao,
  cronograma,
}: EventoDrawerProps) {
  const [tipo, setTipo] = React.useState<TipoEvento>("amortizacao");
  const [data, setData] = React.useState(hojeISO());
  const [valor, setValor] = React.useState("");
  const [linhas, setLinhas] = React.useState<LinhaEditavel[]>([]);
  const [confirmando, setConfirmando] = React.useState(false);

  const [abertoAntes, setAbertoAntes] = React.useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setTipo("amortizacao");
      setData(hojeISO());
      setValor("");
      setLinhas([]);
    }
  }

  const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(data);
  const saldo = dataValida ? saldoNaData(cronograma, data, valorLiberado) : null;
  const valorNumero = valor.trim() === "" ? null : paraNumero(valor);
  const calcula = sistema === "price" || sistema === "sac";
  const pedeLinhas = tipo === "renegociacao" || (tipo === "amortizacao" && !calcula);
  const aceitaLinhas = tipo !== "quitacao";

  // O que o principal das parcelas novas precisa somar.
  const saldoNovo =
    saldo === null
      ? null
      : tipo === "amortizacao"
        ? somarCentavos([saldo, -(valorNumero ?? 0)])
        : tipo === "renegociacao"
          ? (valorNumero ?? saldo)
          : 0;

  function validar(): string | null {
    if (!dataValida) return "Informe a data do evento";
    if (data < dataLiberacao) return "Evento antes da liberação do contrato";
    if (tipo !== "renegociacao" && (valorNumero === null || valorNumero <= 0)) return "Informe o valor do evento";
    if (tipo === "amortizacao" && saldo !== null && valorNumero !== null && valorNumero > saldo) {
      return "A amortização passa do saldo devedor";
    }
    if (pedeLinhas && lerLinhas(linhas).length === 0) return "Informe as parcelas que ficam depois do evento";
    return null;
  }

  function aoContinuar() {
    const erro = validar();
    if (erro) {
      toast.error(erro);
      return;
    }
    setConfirmando(true);
  }

  async function gravar(motivo?: string): Promise<boolean> {
    const lidas = aceitaLinhas ? lerLinhas(linhas) : [];
    const r = await registrarEvento({
      contratoId,
      tipo,
      data,
      valor: valorNumero ?? undefined,
      motivo: motivo ?? "",
      linhas:
        lidas.length > 0
          ? lidas.map((l) => ({
              vencimento: l.vencimento,
              principal: l.valores[0],
              juros: l.valores[1],
              encargos: l.valores[2],
            }))
          : undefined,
    });
    if ("erro" in r) {
      toast.error(r.erro);
      return false;
    }
    toast.success(`${ROTULO_EVENTO[tipo]} registrada. O cronograma ganhou uma versão nova`);
    setConfirmando(false);
    onAbertoChange(false);
    return true;
  }

  return (
    <>
      <FormDrawer
        aberto={aberto}
        onAbertoChange={onAbertoChange}
        titulo="Registrar evento"
        descricao="A versão atual do cronograma fica no histórico. O que já venceu até a data do evento continua igual."
        larguraClassName="sm:max-w-3xl"
        rodape={
          <>
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={aoContinuar}>
              Registrar {ROTULO_EVENTO[tipo].toLowerCase()}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <LinhaCampos colunas={3}>
            <CampoFormulario id="evento-tipo" rotulo="Evento" obrigatorio>
              <Combobox
                id="evento-tipo"
                valor={tipo}
                onValorChange={(v) => v && setTipo(v as TipoEvento)}
                opcoes={OPCOES}
                className="w-full"
              />
            </CampoFormulario>
            <CampoFormulario id="evento-data" rotulo="Data" obrigatorio>
              <Input id="evento-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </CampoFormulario>
            <CampoFormulario
              id="evento-valor"
              rotulo={tipo === "renegociacao" ? "Saldo novo" : "Valor"}
              obrigatorio={tipo !== "renegociacao"}
              ajuda={AJUDA_VALOR[tipo]}
            >
              <InputMoeda id="evento-valor" valor={valor} onValorChange={setValor} />
            </CampoFormulario>
          </LinhaCampos>

          {saldo !== null ? (
            <p className="text-detalhe text-muted-foreground">
              Saldo devedor de principal em {formatarData(data)}: <MoneyText valor={saldo} />
              {tipo === "quitacao" && valorNumero !== null && valorNumero > saldo ? (
                <>
                  {" "}
                  · juros da quitação: <MoneyText valor={somarCentavos([valorNumero, -saldo])} />
                </>
              ) : null}
            </p>
          ) : null}

          {aceitaLinhas ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-corpo font-medium text-foreground">Parcelas depois do evento</h3>
              <p className="text-legenda text-muted-foreground">
                {pedeLinhas
                  ? "Obrigatório: digite ou cole o cronograma novo do banco. Vencimentos depois da data do evento."
                  : "Opcional. Vazio, o ERP recalcula as parcelas que faltavam no mesmo número, pela taxa do contrato."}
              </p>
              <CronogramaEditor
                colunas={["Principal", "Juros", "Encargos"]}
                linhas={linhas}
                onLinhasChange={setLinhas}
                alvo={
                  saldoNovo !== null && (pedeLinhas || linhas.length > 0)
                    ? { rotulo: "O saldo depois do evento", valor: saldoNovo }
                    : undefined
                }
              />
            </div>
          ) : null}
        </div>
      </FormDrawer>

      <ConfirmDialog
        aberto={confirmando}
        onAbertoChange={setConfirmando}
        titulo={`Registrar ${ROTULO_EVENTO[tipo].toLowerCase()}?`}
        descricao={
          tipo === "quitacao"
            ? "O cronograma ganha uma versão nova, zerada depois da data, e o contrato fica quitado. Diga o motivo: ele fica no histórico."
            : "O cronograma ganha uma versão nova a partir da data do evento; a atual fica no histórico. Diga o motivo."
        }
        textoConfirmar={`Registrar ${ROTULO_EVENTO[tipo].toLowerCase()}`}
        exigeMotivo
        onConfirmar={gravar}
      />
    </>
  );
}
