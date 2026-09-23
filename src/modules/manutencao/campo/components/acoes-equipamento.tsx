"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ClipboardPlus, Fuel, Gauge, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { Abastecer } from "@/modules/manutencao/campo/components/abastecer";
import { AbrirOs } from "@/modules/manutencao/campo/components/abrir-os";
import { LancarLeitura } from "@/modules/manutencao/campo/components/lancar-leitura";
import type { TanqueCampo } from "@/modules/manutencao/campo/queries";
import { ROTULO_TIPO_MEDICAO, type TipoMedicao } from "@/modules/manutencao/medicoes/schemas";

interface Props {
  equipamentoId: string;
  controlePor: TipoMedicao | null;
  ultimaLeitura: number | null;
  temEtapa: boolean;
  centros: CentroCustoOpcao[];
  tanques: TanqueCampo[];
  podeLancarLeitura: boolean;
  podeAbrirOs: boolean;
  podeAbastecer: boolean;
}

type Aberto = "leitura" | "os" | "abastecer" | null;

const TITULO: Record<Exclude<Aberto, null>, string> = {
  leitura: "",
  os: "Abrir OS",
  abastecer: "Abastecer",
};

/** Os botões grandes da tela do QR, e o formulário de quem foi tocado. */
export function AcoesEquipamento({
  equipamentoId,
  controlePor,
  ultimaLeitura,
  temEtapa,
  centros,
  tanques,
  podeLancarLeitura,
  podeAbrirOs,
  podeAbastecer,
}: Props) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState<Aberto>(null);

  const oferecerLeitura = podeLancarLeitura && controlePor !== null;
  if (!oferecerLeitura && !podeAbrirOs && !podeAbastecer) return null;

  function feito() {
    setAberto(null);
    // Com sinal, a tela relê a última leitura e as OS; sem sinal, o refresh falha calado e
    // a tela segue a do cache, com o chip da fila dizendo o que falta subir.
    if (navigator.onLine) router.refresh();
  }

  if (aberto) {
    return (
      <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-secao font-semibold">
            {aberto === "leitura" && controlePor ? `Lançar ${ROTULO_TIPO_MEDICAO[controlePor].toLowerCase()}` : TITULO[aberto]}
          </h2>
          <Button variant="ghost" size="icon" onClick={() => setAberto(null)} aria-label="Fechar">
            <X aria-hidden />
          </Button>
        </div>
        {aberto === "leitura" && controlePor ? (
          <LancarLeitura equipamentoId={equipamentoId} tipo={controlePor} ultima={ultimaLeitura} onFeito={feito} />
        ) : aberto === "abastecer" ? (
          <Abastecer equipamentoId={equipamentoId} temEtapa={temEtapa} tanques={tanques} centros={centros} onFeito={feito} />
        ) : (
          <AbrirOs equipamentoId={equipamentoId} temEtapa={temEtapa} centros={centros} onFeito={feito} />
        )}
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {oferecerLeitura && controlePor ? (
        <Button size="lg" className="h-14 justify-start text-base" onClick={() => setAberto("leitura")}>
          <Gauge aria-hidden />
          Lançar {ROTULO_TIPO_MEDICAO[controlePor].toLowerCase()}
        </Button>
      ) : null}
      {podeAbastecer ? (
        <Button size="lg" variant="outline" className="h-14 justify-start text-base" onClick={() => setAberto("abastecer")}>
          <Fuel aria-hidden />
          Abastecer
        </Button>
      ) : null}
      {podeAbrirOs ? (
        <Button size="lg" variant="outline" className="h-14 justify-start text-base" onClick={() => setAberto("os")}>
          <ClipboardPlus aria-hidden />
          Abrir OS
        </Button>
      ) : null}
    </div>
  );
}
