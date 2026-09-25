"use client";

import * as React from "react";
import { ArrowDownToLine, ArrowUpFromLine, FileSpreadsheet, LoaderCircle, RefreshCw } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { baixarBase64 } from "@/lib/download";
import { exportarAplicacoes } from "@/modules/financeiro/aplicacoes/actions";
import { PosicaoFormDrawer } from "@/modules/financeiro/aplicacoes/components/posicao-form-drawer";
import { TransferenciaFormDrawer } from "@/modules/financeiro/transferencias/components/transferencia-form-drawer";
import type {
  AplicacaoOpcao,
  ContaOpcao,
} from "@/modules/financeiro/transferencias/queries";

/** Uma aplicação com o par de contas que a movimenta. */
export interface AplicacaoParaAcao {
  id: string;
  /** A etapa do centro de investimento (o que a transferência leva). */
  etapaId: string;
  nome: string;
  subcontaId: string;
  contaPaiId: string | null;
}

export interface AplicacoesAcoesCabecalhoProps {
  aplicacoes: AplicacaoParaAcao[];
  contas: ContaOpcao[];
  etapas: AplicacaoOpcao[];
  podeTransferir: boolean;
  podeEditar: boolean;
}

type Aberto = null | "aplicar" | "resgatar" | "posicao";

/**
 * As ações da página, no cabeçalho.
 *
 * Aplicar e Resgatar NÃO são uma action nova: abrem a transferência de sempre
 * (`salvarTransferencia` e `fn_salvar_transferencia`) já com a conta, a
 * subconta e a aplicação escolhidas. Aplicação continua sendo transferência com
 * etapa, como o Tiago pediu, e quem barra é a mesma RPC. Aparecem só para quem
 * pode criar transferência.
 */
export function AplicacoesAcoesCabecalho({
  aplicacoes,
  contas,
  etapas,
  podeTransferir,
  podeEditar,
}: AplicacoesAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState<Aberto>(null);
  const [exportando, setExportando] = React.useState(false);

  // Com uma aplicação só (ou todas na mesma subconta) o pré-preenchimento é
  // completo; com várias, a conta vem escolhida e a aplicação fica para a pessoa.
  const primeira = aplicacoes[0];
  const umaSo = aplicacoes.length === 1;
  const inicialAplicar = primeira
    ? {
        contaOrigemId: primeira.contaPaiId ?? "",
        contaDestinoId: primeira.subcontaId,
        aplicacaoId: umaSo ? primeira.etapaId : "",
      }
    : undefined;
  const inicialResgatar = primeira
    ? {
        contaOrigemId: primeira.subcontaId,
        contaDestinoId: primeira.contaPaiId ?? "",
        aplicacaoId: umaSo ? primeira.etapaId : "",
      }
    : undefined;

  async function aoExportar() {
    if (exportando) return;
    setExportando(true);
    try {
      const r = await exportarAplicacoes();
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      baixarBase64(r.base64, r.nomeArquivo);
    } finally {
      setExportando(false);
    }
  }

  const fechar = (v: boolean) => {
    if (!v) setAberto(null);
  };

  return (
    <>
      {podeTransferir && primeira ? (
        <>
          <Button type="button" size="sm" onClick={() => setAberto("aplicar")}>
            <ArrowDownToLine />
            Aplicar
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAberto("resgatar")}>
            <ArrowUpFromLine />
            Resgatar
          </Button>
        </>
      ) : null}
      {podeEditar && primeira ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setAberto("posicao")}>
          <RefreshCw />
          Atualizar posição
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="outline" onClick={aoExportar} disabled={exportando}>
        {exportando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FileSpreadsheet />}
        Exportar Excel
      </Button>

      {podeTransferir ? (
        <>
          <TransferenciaFormDrawer
            key={aberto === "aplicar" ? "aplicar-aberto" : "aplicar"}
            aberto={aberto === "aplicar"}
            onAbertoChange={fechar}
            transferencia={null}
            contas={contas}
            aplicacoes={etapas}
            inicial={inicialAplicar}
            tituloNovo="Aplicar"
          />
          <TransferenciaFormDrawer
            key={aberto === "resgatar" ? "resgatar-aberto" : "resgatar"}
            aberto={aberto === "resgatar"}
            onAbertoChange={fechar}
            transferencia={null}
            contas={contas}
            aplicacoes={etapas}
            inicial={inicialResgatar}
            tituloNovo="Resgatar"
          />
        </>
      ) : null}
      {podeEditar ? (
        <PosicaoFormDrawer
          aberto={aberto === "posicao"}
          onAbertoChange={fechar}
          aplicacoes={aplicacoes.map((a) => ({ id: a.id, nome: a.nome }))}
          posicao={null}
          podeEditar
        />
      ) : null}
    </>
  );
}
