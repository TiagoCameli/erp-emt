"use client";

import * as React from "react";
import { Landmark, Upload } from "lucide-react";

import { EmptyState, GradeKpis, KPICard } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { resumoUltimosMeses } from "@/modules/financeiro/conciliacao/painel";
import type {
  ContaBancariaOpcao,
  ResumoConta,
} from "@/modules/financeiro/conciliacao/queries";
import { ImportarOfxDialog } from "./importar-ofx-dialog";

export interface EscolherContaProps {
  contas: ContaBancariaOpcao[];
  /** Todas as contas ativas, para o importador. */
  todasContas: ContaBancariaOpcao[];
  resumos: ResumoConta[];
  podeImportar: boolean;
}

/**
 * Primeiro passo da conciliação: qual conta. Uma conta por vez, porque é assim
 * que o extrato chega (um arquivo por conta) e é assim que se confere. Cada
 * cartão diz onde está o trabalho: movimentos pendentes e o último mês com
 * extrato.
 */
export function EscolherConta({ contas, todasContas, resumos, podeImportar }: EscolherContaProps) {
  const [importarAberto, setImportarAberto] = React.useState(false);
  const porConta = new Map(resumos.map((r) => [r.contaId, r]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Escolha a conta que vai conciliar.</p>
        {podeImportar ? (
          <Button type="button" size="sm" onClick={() => setImportarAberto(true)}>
            <Upload />
            Importar OFX
          </Button>
        ) : null}
      </div>

      {contas.length === 0 ? (
        <EmptyState
          icone={Landmark}
          titulo="Nenhuma conta com extrato"
          descricao="Importe o OFX do banco para começar a conciliar a conta."
        />
      ) : (
        <GradeKpis>
          {contas.map((conta) => {
            const resumo = porConta.get(conta.id);
            const pendentes = resumo?.qtdPendentes ?? 0;
            return (
              <KPICard
                key={conta.id}
                titulo={conta.nome}
                valor={pendentes > 0 ? `${pendentes} pendentes` : resumo?.qtdExtratos ? "Em dia" : "Sem extrato"}
                detalhe={
                  resumo && resumo.meses.length > 0
                    ? resumoUltimosMeses(resumo.meses)
                    : "Nenhum extrato importado"
                }
                href={`?${new URLSearchParams({ conta: conta.id }).toString()}`}
              />
            );
          })}
        </GradeKpis>
      )}

      <ImportarOfxDialog
        key={importarAberto ? "import-aberto" : "import-fechado"}
        aberto={importarAberto}
        onAbertoChange={setImportarAberto}
        contas={todasContas}
      />
    </div>
  );
}
