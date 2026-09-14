"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { adicionarAoLote } from "@/modules/rh/decimo-terceiro/actions";
import { rotuloVinculo } from "@/modules/rh/decimo-terceiro/formato";
import type { ColaboradorParaAdicionar } from "@/modules/rh/decimo-terceiro/queries";

export interface AdicionarColaboradorDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  loteId: string;
  colaboradores: ColaboradorParaAdicionar[];
  onAdicionado: () => void;
}

/**
 * Acrescenta alguém ao lote, zerado.
 *
 * Existe porque não há "regerar": regerar apagaria tudo que já foi digitado.
 * Por aqui voltam quem foi tirado do lote e quem foi contratado depois de o
 * lote ter sido criado.
 */
export function AdicionarColaboradorDrawer({
  aberto,
  onAbertoChange,
  loteId,
  colaboradores,
  onAdicionado,
}: AdicionarColaboradorDrawerProps) {
  const [colaboradorId, setColaboradorId] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  React.useEffect(() => {
    if (aberto) setColaboradorId("");
  }, [aberto]);

  const vazio = colaboradores.length === 0;

  async function aoSalvar() {
    if (!colaboradorId) {
      toast.error("Selecione o colaborador");
      return;
    }

    setSalvando(true);
    try {
      const resultado = await adicionarAoLote({ loteId, colaboradorId });
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Colaborador acrescentado ao lote");
      onAbertoChange(false);
      onAdicionado();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Acrescentar colaborador"
      descricao="Entra no lote com valor zerado, para você digitar. Só aparecem aqui os ativos que ainda não estão no lote."
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => onAbertoChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={salvando || vazio || !colaboradorId}
            onClick={aoSalvar}
          >
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            Acrescentar
          </Button>
        </>
      }
    >
      <div className={classesFormulario}>
        <CampoFormulario
          id="adicionar-colaborador"
          rotulo="Colaborador"
          obrigatorio
          ajuda={
            vazio
              ? "Todos os colaboradores ativos já estão neste lote."
              : undefined
          }
        >
          <Combobox
            valor={colaboradorId}
            onValorChange={setColaboradorId}
            opcoes={colaboradores.map((c) => ({
              valor: c.id,
              rotulo: `${c.nome} · ${rotuloVinculo(c.vinculo)}`,
            }))}
            placeholder="Selecione o colaborador"
            disabled={salvando || vazio}
          />
        </CampoFormulario>
      </div>
    </FormDrawer>
  );
}
