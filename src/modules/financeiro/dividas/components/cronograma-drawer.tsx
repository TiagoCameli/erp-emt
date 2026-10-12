"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { CampoFormulario, FormDrawer } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CronogramaEditor,
  lerLinhas,
  type LinhaEditavel,
  type LinhaLida,
} from "@/modules/financeiro/dividas/components/cronograma-editor";

export interface CronogramaDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  titulo: string;
  descricao: string;
  colunas: [string, string, string];
  alvo: { rotulo: string; valor: number };
  /** As linhas que abrem no editor (o cronograma atual, para ajustar). */
  linhasIniciais: LinhaEditavel[];
  /** Já existe cronograma: trocar pede o motivo (o banco cobra o mesmo). */
  exigeMotivo: boolean;
  /** Devolve false quando a action recusou (o toast já avisou): o drawer fica aberto. */
  onSalvar: (linhas: LinhaLida[], motivo: string) => Promise<boolean>;
}

/**
 * O cronograma digitado (o do banco, no contrato; o da administradora, na
 * cota), num drawer: abre com o atual para ajustar, ou vazio para colar.
 */
export function CronogramaDrawer({
  aberto,
  onAbertoChange,
  titulo,
  descricao,
  colunas,
  alvo,
  linhasIniciais,
  exigeMotivo,
  onSalvar,
}: CronogramaDrawerProps) {
  const [linhas, setLinhas] = React.useState<LinhaEditavel[]>(linhasIniciais);
  const [motivo, setMotivo] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [mexeu, setMexeu] = React.useState(false);

  // Reabrir volta ao cronograma atual: estado anterior no render, não efeito.
  const [abertoAntes, setAbertoAntes] = React.useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setLinhas(linhasIniciais);
      setMotivo("");
      setMexeu(false);
    }
  }

  async function salvar() {
    const lidas = lerLinhas(linhas);
    if (lidas.length === 0) {
      toast.error("Informe as parcelas do cronograma");
      return;
    }
    if (exigeMotivo && motivo.trim() === "") {
      toast.error("Informe o motivo para trocar o cronograma");
      return;
    }
    setSalvando(true);
    try {
      const ok = await onSalvar(lidas, motivo.trim());
      if (ok) onAbertoChange(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={titulo}
      descricao={descricao}
      larguraClassName="sm:max-w-3xl"
      temAlteracoesNaoSalvas={mexeu && !salvando}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={salvar} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar cronograma"
            )}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <CronogramaEditor
          colunas={colunas}
          linhas={linhas}
          onLinhasChange={(l) => {
            setLinhas(l);
            setMexeu(true);
          }}
          alvo={alvo}
          disabled={salvando}
        />
        {exigeMotivo ? (
          <CampoFormulario
            id="cronograma-motivo"
            rotulo="Motivo da troca"
            obrigatorio
            ajuda="Fica no histórico do contrato, junto da versão anterior."
          >
            <Textarea
              id="cronograma-motivo"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={salvando}
            />
          </CampoFormulario>
        ) : null}
      </div>
    </FormDrawer>
  );
}
