"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Lock, RotateCcw, Send, SlidersHorizontal, Undo2 } from "lucide-react";

import { ConfirmDialog } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { rotuloRevisao } from "@/modules/medicao/_shared/rotulos";
import type { PassoCiclo } from "@/modules/medicao/medicoes/ciclo";
import {
  enviarMedicao,
  fecharMedicao,
  novaRevisao,
  reabrirMedicao,
  revisarAprovada,
  type ResultadoCiclo,
} from "@/modules/medicao/medicoes/ciclo-actions";
import { AjusteDrawer } from "@/modules/medicao/medicoes/components/ajuste-drawer";
import type { ServicoAjuste } from "@/modules/medicao/medicoes/tipos";

/** O banco exige motivo com 3 letras ou mais (reabrir, nova revisão, revisar aprovada). */
const MIN_MOTIVO = 3;

type PassoComDialogo = Exclude<PassoCiclo, "ajuste" | "aprovar">;

interface ConfigDialogo {
  botao: string;
  icone: React.ComponentType;
  titulo: string;
  descricao: string;
  confirmar: string;
  exigeMotivo: boolean;
  sucesso: string;
  executar: (motivo: string) => Promise<ResultadoCiclo>;
}

export interface AcoesCicloProps {
  medicaoId: string;
  numero: number;
  /** Passos liberados, calculados no servidor (`passosDaMedicao`) pelo status e pelas permissões. */
  passos: PassoCiclo[];
  /** Número da revisão corrente (em aberto ou enviada); nulo quando não há. */
  revisaoNumero: number | null;
  /** Serviços da versão da medição, para o drawer de ajuste. */
  servicos: ServicoAjuste[];
  /**
   * Botão de aprovar (Task 4: tela de aprovação por item). Só aparece quando o passo "aprovar" está
   * liberado E a tela passou o botão; sem ele, o passo fica sem botão aqui.
   */
  botaoAprovar?: React.ReactNode;
}

/**
 * Botões do ciclo da medição no cabeçalho do detalhe. Fechar e Enviar passam pela confirmação
 * canônica; Reabrir, Nova revisão e Revisar aprovada pedem motivo no mesmo diálogo. O botão de
 * confirmar fica desabilitado enquanto o pedido está no ar (o `ConfirmDialog` segura o segundo
 * clique) e, se mesmo assim chegarem dois, a RPC trava a medição e recusa o segundo pelo status.
 */
export function AcoesCiclo({ medicaoId, numero, passos, revisaoNumero, servicos, botaoAprovar }: AcoesCicloProps) {
  const router = useRouter();
  const [dialogo, setDialogo] = React.useState<PassoComDialogo | null>(null);
  const [ajusteAberto, setAjusteAberto] = React.useState(false);

  const rev = revisaoNumero === null ? "" : rotuloRevisao(revisaoNumero);
  const proxima = revisaoNumero === null ? "" : rotuloRevisao(revisaoNumero + 1);
  const atualizar = () => semDerrubarSucesso("medicao.medicoes.ciclo", () => router.refresh());

  const configs: Record<PassoComDialogo, ConfigDialogo> = {
    fechar: {
      botao: "Fechar medição",
      icone: Lock,
      titulo: `Fechar a ${numero}ª medição`,
      descricao:
        "A medição sai de aberta para em conferência e passa a usar a planilha vigente no último dia do período. Lançamentos novos deixam de entrar nela.",
      confirmar: "Fechar para conferência",
      exigeMotivo: false,
      sucesso: `${numero}ª medição fechada para conferência`,
      executar: () => fecharMedicao(medicaoId),
    },
    reabrir: {
      botao: "Reabrir",
      icone: Undo2,
      titulo: `Reabrir a ${numero}ª medição`,
      descricao: "A medição volta para aberta e recebe lançamentos de novo. Informe o motivo.",
      confirmar: "Reabrir medição",
      exigeMotivo: true,
      sucesso: `${numero}ª medição reaberta`,
      executar: (motivo) => reabrirMedicao(medicaoId, motivo),
    },
    enviar: {
      botao: `Enviar ${rev}`,
      icone: Send,
      titulo: `Enviar a ${rev}`,
      descricao:
        "A quantidade medida de cada item fica congelada nesta revisão. Depois do envio, mudança só entra por nova revisão.",
      confirmar: `Enviar ${rev} ao contratante`,
      exigeMotivo: false,
      sucesso: `${rev} enviada ao contratante`,
      executar: () => enviarMedicao(medicaoId),
    },
    nova_revisao: {
      botao: "Nova revisão",
      icone: FilePlus2,
      titulo: `Abrir a ${proxima}`,
      descricao: `A ${rev} enviada vira substituída e nasce a ${proxima} em aberto, para receber ajustes. Informe o motivo (o que o contratante pediu).`,
      confirmar: `Abrir ${proxima}`,
      exigeMotivo: true,
      sucesso: `${proxima} aberta`,
      executar: (motivo) => novaRevisao(medicaoId, motivo),
    },
    revisar_aprovada: {
      botao: "Revisar aprovada",
      icone: RotateCcw,
      titulo: `Revisar a ${numero}ª medição aprovada`,
      descricao:
        "A medição continua aprovada. A revisão pós-aprovação recebe ajustes, é enviada e aprovada, e só então substitui a aprovada. Informe o motivo.",
      confirmar: "Abrir revisão pós-aprovação",
      exigeMotivo: true,
      sucesso: "Revisão pós-aprovação aberta",
      executar: (motivo) => revisarAprovada(medicaoId, motivo),
    },
  };

  const ordem: PassoComDialogo[] = ["fechar", "reabrir", "nova_revisao", "revisar_aprovada"];
  const comDialogo = ordem.filter((p) => passos.includes(p));
  const temAjuste = passos.includes("ajuste") && revisaoNumero !== null;
  const temEnviar = passos.includes("enviar") && revisaoNumero !== null;
  const temAprovar = passos.includes("aprovar") && botaoAprovar !== undefined;
  const ativo = dialogo ? configs[dialogo] : null;

  /** Recusa do banco: avisa e devolve `false`, e o diálogo fica aberto com o motivo digitado. */
  async function confirmar(motivo?: string): Promise<boolean> {
    if (!ativo) return true;
    const resultado = await ativo.executar(motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return false;
    }
    toast.success(ativo.sucesso);
    atualizar();
    return true;
  }

  function botao(passo: PassoComDialogo, variante: "default" | "outline") {
    const c = configs[passo];
    const Icone = c.icone;
    return (
      <Button key={passo} type="button" size="sm" variant={variante} onClick={() => setDialogo(passo)}>
        <Icone />
        {c.botao}
      </Button>
    );
  }

  if (comDialogo.length === 0 && !temAjuste && !temEnviar && !temAprovar) return null;

  return (
    <>
      {comDialogo.map((p) => botao(p, p === "fechar" ? "default" : "outline"))}
      {temAjuste ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setAjusteAberto(true)}>
          <SlidersHorizontal />
          Lançar ajuste
        </Button>
      ) : null}
      {temEnviar ? botao("enviar", "default") : null}
      {temAprovar ? botaoAprovar : null}

      <ConfirmDialog
        key={dialogo ?? "nenhum"}
        aberto={ativo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setDialogo(null);
        }}
        titulo={ativo?.titulo ?? ""}
        descricao={ativo?.descricao ?? ""}
        textoConfirmar={ativo?.confirmar ?? ""}
        exigeMotivo={ativo?.exigeMotivo ?? false}
        minMotivo={MIN_MOTIVO}
        onConfirmar={confirmar}
      />

      {temAjuste ? (
        <AjusteDrawer
          aberto={ajusteAberto}
          onAbertoChange={setAjusteAberto}
          medicaoId={medicaoId}
          revisaoRotulo={rev}
          servicos={servicos}
          onLancado={atualizar}
        />
      ) : null}
    </>
  );
}
