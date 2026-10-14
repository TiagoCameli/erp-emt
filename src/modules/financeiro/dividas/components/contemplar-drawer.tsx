"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { CampoFormulario, Combobox, FormDrawer, InputMoeda, LinhaCampos } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { paraNumero } from "@/modules/compras/ordens/calculo";
import { contemplarCota } from "@/modules/financeiro/dividas/actions";
import type { EtapaOpcao } from "@/modules/financeiro/dividas/calculo";

const OPCOES_FORMA = [
  { valor: "sorteio", rotulo: "Sorteio" },
  { valor: "lance", rotulo: "Lance" },
];

function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Rio_Branco" }).format(new Date());
}

export interface ContemplarDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  cotaId: string;
  valorCredito: number;
  /** Raízes e etapas de imobilizado (ver `centrosImobilizado`). */
  centrosBem: EtapaOpcao[];
}

/**
 * Contemplação da cota: data, sorteio ou lance, o valor da carta e, opcional,
 * onde o bem fica no imobilizado. Depois dela, o que falta pagar da cota
 * passa a ser dívida na aba Créditos.
 */
export function ContemplarDrawer({ aberto, onAbertoChange, cotaId, valorCredito, centrosBem }: ContemplarDrawerProps) {
  const [data, setData] = React.useState(hojeISO());
  const [forma, setForma] = React.useState("sorteio");
  const [carta, setCarta] = React.useState("");
  const [lance, setLance] = React.useState("");
  const [bem, setBem] = React.useState("");
  const [observacao, setObservacao] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  const [abertoAntes, setAbertoAntes] = React.useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setData(hojeISO());
      setForma("sorteio");
      setCarta(valorCredito.toFixed(2).replace(".", ","));
      setLance("");
      setBem("");
      setObservacao("");
    }
  }

  async function contemplar() {
    setSalvando(true);
    try {
      const r = await contemplarCota({
        cotaId,
        data,
        forma: forma as "sorteio" | "lance",
        valorCarta: paraNumero(carta),
        valorLance: forma === "lance" ? paraNumero(lance) : undefined,
        bemCentroId: bem,
        motivo: observacao.trim() || undefined,
      });
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      toast.success("Cota contemplada. O que falta pagar agora é dívida");
      onAbertoChange(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Contemplar cota"
      descricao="Depois de contemplada, o que falta pagar da cota é dívida (aparece no painel de Dívidas)."
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={contemplar} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : (
              "Contemplar"
            )}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <LinhaCampos>
          <CampoFormulario id="contemplar-data" rotulo="Data da contemplação" obrigatorio>
            <Input id="contemplar-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </CampoFormulario>
          <CampoFormulario id="contemplar-forma" rotulo="Forma" obrigatorio>
            <Combobox
              id="contemplar-forma"
              valor={forma}
              onValorChange={(v) => v && setForma(v)}
              opcoes={OPCOES_FORMA}
              className="w-full"
            />
          </CampoFormulario>
        </LinhaCampos>
        <LinhaCampos>
          <CampoFormulario id="contemplar-carta" rotulo="Valor da carta" obrigatorio>
            <InputMoeda id="contemplar-carta" valor={carta} onValorChange={setCarta} />
          </CampoFormulario>
          {forma === "lance" ? (
            <CampoFormulario id="contemplar-lance" rotulo="Valor do lance" obrigatorio>
              <InputMoeda id="contemplar-lance" valor={lance} onValorChange={setLance} />
            </CampoFormulario>
          ) : null}
        </LinhaCampos>
        <CampoFormulario
          id="contemplar-bem"
          rotulo="Onde o bem fica"
          ajuda="Opcional: o centro de imobilizado do bem comprado com a carta."
        >
          <Combobox
            id="contemplar-bem"
            valor={bem}
            onValorChange={setBem}
            opcoes={centrosBem.map((c) => ({ valor: c.id, rotulo: c.rotulo }))}
            placeholder="Selecione o centro"
            limpavel
            className="w-full"
          />
        </CampoFormulario>
        <CampoFormulario id="contemplar-observacao" rotulo="Observação">
          <Textarea id="contemplar-observacao" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </CampoFormulario>
      </div>
    </FormDrawer>
  );
}
