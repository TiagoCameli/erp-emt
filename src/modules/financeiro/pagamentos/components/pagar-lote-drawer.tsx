"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
  MoneyText,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO, formatarBRL, formatarData } from "@/lib/formatadores";
import { ROTULO_BANCO, type BancoConta } from "@/modules/financeiro/_shared/formato";
import { pagarParcela } from "@/modules/financeiro/pagamentos/actions";
import { foraDaJanela } from "@/modules/financeiro/pagamentos/janela";
import type {
  ContaBancariaOpcao,
  ParcelaAprovada,
} from "@/modules/financeiro/pagamentos/queries";

/**
 * Rótulo da conta no seletor: nome, banco e o saldo que ela tem hoje.
 *
 * Sem permissão de ver o saldo, o rótulo fica só com nome e banco. É por aqui
 * que o saldo vazaria com mais facilidade: ele está DENTRO do texto da opção, e
 * `formatarBRL(null)` devolve "R$ 0,00" — a conta apareceria como se estivesse
 * zerada, o que é pior que não mostrar nada.
 */
function rotuloConta(conta: ContaBancariaOpcao): string {
  const banco = ROTULO_BANCO[conta.banco as BancoConta] ?? conta.banco;
  if (conta.saldoAtual === null) return `${conta.nome} - ${banco}`;
  return `${conta.nome} - ${banco} (${formatarBRL(conta.saldoAtual)})`;
}

export interface PagarLoteDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Parcelas marcadas na tabela. Só as aprovadas chegam aqui. */
  parcelas: ParcelaAprovada[];
  contas: ContaBancariaOpcao[];
  /** Chamado ao fim, com quantas foram pagas de fato. */
  onPago?: (pagas: number) => void;
}

/** Uma parcela que o banco recusou, com o motivo que ele deu. */
interface Falha {
  titulo: string;
  motivo: string;
}

/**
 * Pagamento em LOTE: uma conta e uma data para todas as parcelas marcadas.
 *
 * Desconto, juros e outras despesas ficam de fora de propósito: são acerto de
 * uma parcela específica, e aplicar um número igual em vinte parcelas é o tipo
 * de coisa que ninguém consegue conferir depois. Quem precisa de qualquer um
 * dos três paga aquela parcela sozinha, pelo drawer individual.
 *
 * ## Por que o laço é aqui e não numa action de lote
 *
 * Cada parcela vira UMA chamada de `pagarParcela`, em sequência. Três razões:
 *
 * - O banco confere o SALDO da conta a cada pagamento. Em paralelo, duas
 *   chamadas leem o mesmo saldo e as duas passam — a conta fecha negativa.
 * - Uma action que pagasse as vinte de uma vez levaria vinte idas ao banco
 *   dentro de uma function só, com teto de tempo de execução; falhar no meio
 *   deixaria metade pago e nenhuma resposta.
 * - Falha de uma não pode derrubar as outras. Aqui cada recusa vira uma linha
 *   no relatório final, com a mensagem que o banco deu.
 */
export function PagarLoteDrawer({
  aberto,
  onAbertoChange,
  parcelas,
  contas,
  onPago,
}: PagarLoteDrawerProps) {
  // Inicial pelas parcelas, e não vazio, para o caso de o drawer ser montado já
  // aberto: o reset abaixo só dispara na TRANSIÇÃO de fechado para aberto, e
  // sozinho ele deixaria a conta (e com ela o saldo na tela) em branco nessa
  // montagem. Mesmo cuidado do drawer de pagamento individual.
  const [contaId, setContaId] = React.useState(() =>
    contaUnicaDasParcelas(parcelas),
  );
  const [dataPagamento, setDataPagamento] = React.useState(dataHojeISO());
  const [motivo, setMotivo] = React.useState("");
  const [pagando, setPagando] = React.useState(false);
  const [progresso, setProgresso] = React.useState({ feitos: 0, total: 0 });
  const [falhas, setFalhas] = React.useState<Falha[]>([]);

  // Ao abrir, tudo volta ao início. Motivo e conta vazando de um lote para o
  // seguinte justificariam uma exceção que ninguém escreveu e pagariam da conta
  // errada.
  const [estavaAberto, setEstavaAberto] = React.useState(aberto);
  if (aberto && !estavaAberto) {
    setEstavaAberto(true);
    setContaId(contaUnicaDasParcelas(parcelas));
    setDataPagamento(dataHojeISO());
    setMotivo("");
    setFalhas([]);
    setProgresso({ feitos: 0, total: 0 });
  } else if (!aberto && estavaAberto) {
    setEstavaAberto(false);
  }

  const total = parcelas.reduce((soma, parcela) => soma + parcela.valor, 0);
  const conta = contas.find((opcao) => opcao.id === contaId) ?? null;
  // Null aqui é "não dá para projetar": ou não escolheu conta, ou não pode ver o
  // saldo dela. Nos dois casos a tela não avisa nada antes — quem recusa segue
  // sendo o guard de `fn_pagar_parcela`, com mensagem que não conta o valor.
  const saldoDepois =
    conta && conta.saldoAtual !== null ? conta.saldoAtual - total : null;
  const saldoNaoCobre = saldoDepois !== null && saldoDepois < 0;

  // Quais parcelas seriam pagas fora da data autorizada. É a MESMA regra do
  // banco (`foraDaJanela`), para o campo de motivo aparecer exatamente quando o
  // banco vai exigir — e não uma aproximação que deixa o erro para o final.
  const foraDaData = parcelas.filter((parcela) =>
    foraDaJanela(dataPagamento, parcela.dataProgramada),
  );
  const precisaMotivo = foraDaData.length > 0;
  const motivoFaltando = precisaMotivo && motivo.trim() === "";

  const podeConfirmar =
    !pagando && parcelas.length > 0 && contaId !== "" && !motivoFaltando;

  async function confirmar() {
    if (!podeConfirmar) return;

    setPagando(true);
    setFalhas([]);
    setProgresso({ feitos: 0, total: parcelas.length });

    const recusadas: Falha[] = [];
    let pagas = 0;

    for (const [indice, parcela] of parcelas.entries()) {
      const titulo = `${parcela.lancamentoNumero ?? "Parcela"} ${parcela.numeroParcela}`;
      try {
        const resultado = await pagarParcela(parcela.id, contaId, dataPagamento, {
          motivo: motivo.trim() === "" ? undefined : motivo.trim(),
        });
        if ("erro" in resultado) recusadas.push({ titulo, motivo: resultado.erro });
        else pagas += 1;
      } catch {
        recusadas.push({
          titulo,
          motivo: "A chamada falhou no caminho. Tente esta de novo",
        });
      }
      setProgresso({ feitos: indice + 1, total: parcelas.length });
    }

    setPagando(false);
    setFalhas(recusadas);

    if (pagas > 0) {
      toast.success(
        pagas === 1 ? "1 parcela paga" : `${pagas} parcelas pagas`,
      );
      onPago?.(pagas);
    }
    // Só fecha quando saiu tudo. Havendo recusa, o painel fica aberto com a
    // lista do que não passou: fechar levaria embora a única explicação.
    if (recusadas.length === 0) onAbertoChange(false);
    else if (pagas === 0) toast.error("Nenhuma parcela foi paga");
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={pagando ? () => {} : onAbertoChange}
      titulo={
        parcelas.length === 1
          ? "Pagar 1 parcela"
          : `Pagar ${parcelas.length} parcelas`
      }
      descricao="Uma conta e uma data para todas. Desconto, juros e despesas só no pagamento individual."
      rodape={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-detalhe text-muted-foreground">
            {pagando
              ? `Pagando ${progresso.feitos} de ${progresso.total}...`
              : `Total: ${formatarBRL(total)}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pagando}
              onClick={() => onAbertoChange(false)}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={!podeConfirmar} onClick={confirmar}>
              {pagando
                ? "Pagando..."
                : parcelas.length === 1
                  ? "Pagar parcela"
                  : `Pagar ${parcelas.length} parcelas`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <LinhaCampos>
          <CampoFormulario rotulo="Conta bancária" obrigatorio id="conta-lote">
            <Combobox
              id="conta-lote"
              valor={contaId}
              onValorChange={setContaId}
              opcoes={contas.map((opcao) => ({
                valor: opcao.id,
                rotulo: rotuloConta(opcao),
              }))}
              placeholder="Escolha a conta"
              disabled={pagando}
            />
          </CampoFormulario>
          <CampoFormulario
            rotulo="Data do pagamento"
            obrigatorio
            id="data-lote"
          >
            <Input
              id="data-lote"
              type="date"
              value={dataPagamento}
              max={dataHojeISO()}
              disabled={pagando}
              onChange={(evento) => setDataPagamento(evento.target.value)}
            />
          </CampoFormulario>
        </LinhaCampos>

        <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-surface p-3 sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-legenda text-muted-foreground">
              Total selecionado
            </span>
            <MoneyText valor={total} className="font-medium" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-legenda text-muted-foreground">
              Saldo da conta
            </span>
            {conta && conta.saldoAtual !== null ? (
              <MoneyText valor={conta.saldoAtual} />
            ) : (
              <span className="text-detalhe text-muted-foreground">
                {conta ? "Sem permissão" : "Escolha a conta"}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-legenda text-muted-foreground">
              Saldo depois
            </span>
            {saldoDepois === null ? (
              <span className="text-detalhe text-muted-foreground">-</span>
            ) : (
              <MoneyText
                valor={saldoDepois}
                className={saldoNaoCobre ? "text-status-rejeitado" : undefined}
              />
            )}
          </div>
        </div>

        {saldoNaoCobre ? (
          <Aviso
            titulo="O saldo desta conta não cobre o lote"
            texto={`O banco recusa pagamento sem saldo, então a partir de certo ponto as parcelas vão sendo negadas uma a uma. Pague um lote menor ou escolha outra conta: faltam ${formatarBRL(Math.abs(saldoDepois))}.`}
          />
        ) : null}

        {precisaMotivo ? (
          <div className="flex flex-col gap-2">
            <Aviso
              titulo={
                foraDaData.length === 1
                  ? "1 parcela está fora da data autorizada"
                  : `${foraDaData.length} parcelas estão fora da data autorizada`
              }
              texto="Pagar fora da data autorizada é permitido, mas fica registrado na trilha com o motivo. O mesmo motivo vale para todas as parcelas deste lote."
            />
            <CampoFormulario rotulo="Motivo" obrigatorio id="motivo-lote">
              <Textarea
                id="motivo-lote"
                value={motivo}
                maxLength={500}
                disabled={pagando}
                placeholder="Por que o pagamento saiu em outra data"
                onChange={(evento) => setMotivo(evento.target.value)}
              />
            </CampoFormulario>
            <ul className="flex flex-col gap-1">
              {foraDaData.slice(0, 5).map((parcela) => (
                <li
                  key={parcela.id}
                  className="text-legenda text-muted-foreground"
                >
                  {parcela.lancamentoNumero ?? "Parcela"}{" "}
                  {parcela.numeroParcela} — autorizada para{" "}
                  {formatarData(parcela.dataProgramada)}
                </li>
              ))}
              {foraDaData.length > 5 ? (
                <li className="text-legenda text-muted-foreground">
                  e mais {foraDaData.length - 5}
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {falhas.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-md border border-status-rejeitado/30 bg-status-rejeitado/5 p-3">
            <p className="text-detalhe font-medium">
              {falhas.length === 1
                ? "1 parcela não foi paga"
                : `${falhas.length} parcelas não foram pagas`}
            </p>
            <ul className="flex flex-col gap-1">
              {falhas.map((falha) => (
                <li key={falha.titulo} className="text-legenda">
                  <span className="font-medium">{falha.titulo}:</span>{" "}
                  {falha.motivo}
                </li>
              ))}
            </ul>
            <p className="text-legenda text-muted-foreground">
              As demais já foram pagas. Corrija o que apontou acima e tente
              estas de novo.
            </p>
          </div>
        ) : null}

        <ul className="flex flex-col gap-1.5">
          {parcelas.map((parcela) => (
            <li
              key={parcela.id}
              className="flex items-center justify-between gap-3 border-b border-border pb-1.5 text-detalhe last:border-none"
            >
              <span className="min-w-0 flex-1 truncate">
                {parcela.lancamentoNumero ?? "-"} · parcela{" "}
                {parcela.numeroParcela} · {parcela.fornecedorNome}
              </span>
              <span className="shrink-0 text-legenda text-muted-foreground">
                vence {formatarData(parcela.dataVencimento)}
              </span>
              <MoneyText valor={parcela.valor} />
            </li>
          ))}
        </ul>
      </div>
    </FormDrawer>
  );
}

/**
 * Conta a usar como sugestão inicial: a que TODAS as parcelas já têm.
 *
 * A conta costuma vir escolhida do lançamento ou da aprovação. Quando as
 * marcadas discordam, o campo abre vazio de propósito: escolher a de uma delas
 * pagaria as outras da conta errada sem ninguém notar.
 */
function contaUnicaDasParcelas(parcelas: ParcelaAprovada[]): string {
  const contas = new Set(
    parcelas.map((parcela) => parcela.contaBancariaId ?? ""),
  );
  if (contas.size !== 1) return "";
  const unica = [...contas][0];
  return unica ?? "";
}

/** Aviso de atenção, no mesmo desenho do detalhe do lançamento. */
function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-status-pendente/30 bg-status-pendente/5 px-3 py-3">
      <TriangleAlert
        className="mt-0.5 size-4 shrink-0 text-status-pendente"
        aria-hidden="true"
      />
      <div>
        <p className="text-detalhe font-medium">{titulo}</p>
        <p className="text-legenda text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}
