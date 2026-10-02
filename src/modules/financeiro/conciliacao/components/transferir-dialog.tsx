"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, LoaderCircle } from "lucide-react";

import { CampoFormulario, Combobox, MoneyText } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { transferirMovimentos } from "@/modules/financeiro/conciliacao/actions";
import { pareceAplicacaoAutomatica } from "@/modules/financeiro/conciliacao/casamento";
import { somar, type TransacaoPainel } from "@/modules/financeiro/conciliacao/painel";
import type { ContaBancariaOpcao } from "@/modules/financeiro/conciliacao/queries";

export interface TransferirDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  transacoes: TransacaoPainel[];
  conta: ContaBancariaOpcao;
  contas: ContaBancariaOpcao[];
  centros: CentroCustoOpcao[];
}

/**
 * Lança o movimento como transferência entre contas da EMT. O caso que mais
 * aparece é o BB Rende Fácil: o banco aplica a sobra e resgata o que falta
 * todo dia, e isso é dinheiro indo e voltando da subconta de investimentos,
 * não despesa nem receita. Por isso a subconta já vem escolhida quando o
 * histórico é de aplicação.
 *
 * Com a subconta de investimentos o banco pede a aplicação (CDB, fundo): é o
 * centro de nível 2 sob Investimentos.
 */
export function TransferirDialog({
  aberto,
  onAbertoChange,
  transacoes,
  conta,
  contas,
  centros,
}: TransferirDialogProps) {
  const router = useRouter();
  const subconta = contas.find(
    (c) => c.tipo === "investimento" && c.contaPaiId === conta.id,
  );
  // O pai remonta o diálogo a cada abertura (key), então o estado inicial já
  // sai do movimento: aplicação automática vem com a subconta escolhida.
  const aplicacao =
    transacoes.length > 0 && transacoes.every((t) => pareceAplicacaoAutomatica(t.memo));
  const [contraparteId, setContraparteId] = React.useState(
    aplicacao && subconta ? subconta.id : "",
  );
  const [aplicacaoId, setAplicacaoId] = React.useState("");
  const [descricao, setDescricao] = React.useState(aplicacao ? "BB Rende Fácil" : "");
  const [enviando, setEnviando] = React.useState(false);

  const contraparte = contas.find((c) => c.id === contraparteId);
  const envolveInvestimento =
    contraparte?.tipo === "investimento" || conta.tipo === "investimento";

  const aplicacoes = React.useMemo(() => {
    const raizes = new Set(
      centros.filter((c) => c.tipo === "investimento" && !c.paiId).map((c) => c.id),
    );
    return centros
      .filter((c) => c.paiId && raizes.has(c.paiId))
      .map((c) => ({ valor: c.id, rotulo: c.nome }));
  }, [centros]);

  const credito = (transacoes[0]?.valor ?? 0) >= 0;
  const total = Math.abs(somar(transacoes.map((t) => t.valor)));

  async function confirmar() {
    if (!contraparteId) return;
    setEnviando(true);
    const resposta = await transferirMovimentos({
      transacaoIds: transacoes.map((t) => t.id),
      contaContraparteId: contraparteId,
      centroCustoId: envolveInvestimento && aplicacaoId ? aplicacaoId : undefined,
      descricao: descricao || undefined,
    });
    setEnviando(false);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    if (resposta.falhas.length > 0) {
      toast.error(
        `${resposta.feitos} lançada(s), ${resposta.falhas.length} com erro: ${resposta.falhas[0]?.erro}`,
      );
    } else {
      toast.success(
        resposta.feitos === 1
          ? "Transferência lançada e conciliada"
          : `${resposta.feitos} transferências lançadas e conciliadas`,
      );
    }
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={(novo) => !enviando && onAbertoChange(novo)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lançar como transferência</DialogTitle>
          <DialogDescription>
            {transacoes.length === 1 ? "1 movimento" : `${transacoes.length} movimentos`},{" "}
            <MoneyText valor={total} />.{" "}
            {credito ? "O dinheiro entra nesta conta vindo de:" : "O dinheiro sai desta conta para:"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <CampoFormulario id="trf-contraparte" rotulo={credito ? "Conta de origem" : "Conta de destino"} obrigatorio>
            <Combobox
              id="trf-contraparte"
              valor={contraparteId}
              onValorChange={setContraparteId}
              opcoes={contas
                .filter((c) => c.id !== conta.id)
                .map((c) => ({ valor: c.id, rotulo: c.nome }))}
              placeholder="Escolha a conta"
              disabled={enviando}
            />
          </CampoFormulario>

          {envolveInvestimento ? (
            <CampoFormulario
              id="trf-aplicacao"
              rotulo="Aplicação"
              obrigatorio
              ajuda={
                aplicacoes.length === 0
                  ? "Nenhuma aplicação cadastrada em Investimentos. Cadastre em Centros de custo."
                  : "CDB, fundo ou Rende Fácil, cadastrados em Investimentos"
              }
            >
              <Combobox
                id="trf-aplicacao"
                valor={aplicacaoId}
                onValorChange={setAplicacaoId}
                opcoes={aplicacoes}
                placeholder="Escolha a aplicação"
                disabled={enviando}
              />
            </CampoFormulario>
          ) : null}

          <CampoFormulario id="trf-descricao" rotulo="Descrição">
            <Input
              id="trf-descricao"
              value={descricao}
              maxLength={500}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Se ficar vazio, grava o histórico do banco"
              disabled={enviando}
            />
          </CampoFormulario>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void confirmar()}
            disabled={enviando || !contraparteId || (envolveInvestimento && !aplicacaoId)}
          >
            {enviando ? <LoaderCircle className="animate-spin" /> : <ArrowLeftRight />}
            Lançar transferência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
