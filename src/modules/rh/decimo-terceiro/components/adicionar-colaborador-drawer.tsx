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

  const vazio = colaboradores.length === 0;

  /**
   * Limpa a seleção ao FECHAR, não ao abrir.
   *
   * Zerar no abrir só dá para fazer dentro de um effect, e `setState` síncrono
   * em effect dispara renderização em cascata (a regra
   * `react-hooks/set-state-in-effect` recusa). Fechando, o estado já fica
   * limpo para a próxima abertura, e o caminho cobre Cancelar, Esc e clique
   * fora de uma vez.
   */
  function fechar() {
    setColaboradorId("");
    onAbertoChange(false);
  }

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
      fechar();
      onAdicionado();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={(proximo) => {
        if (proximo) onAbertoChange(true);
        else fechar();
      }}
      titulo="Acrescentar colaborador"
      descricao="Entra no lote com valor zerado, para você digitar. Só aparecem aqui os ativos que ainda não estão no lote."
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={fechar}
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
