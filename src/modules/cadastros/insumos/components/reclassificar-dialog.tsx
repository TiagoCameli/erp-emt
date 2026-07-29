"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { Combobox } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { GrupoOpcao } from "@/modules/cadastros/categorias/queries";
import type { CategoriaOpcao } from "@/modules/cadastros/insumos/queries";

export interface ReclassificarDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Quantos insumos estão selecionados. */
  quantidade: number;
  categorias: CategoriaOpcao[];
  grupos: GrupoOpcao[];
  onConfirmar: (categoriaId: string) => Promise<void>;
}

/**
 * Reclassificação em lote: escolhe grupo e depois a subcategoria, na mesma
 * cascata do formulário do insumo, e aplica em todos os selecionados.
 *
 * É a ferramenta que faz a fila de "A classificar" andar: selecionar 50 linhas
 * e mandar de uma vez, em lugar de abrir 50 drawers.
 */
export function ReclassificarDialog({
  aberto,
  onAbertoChange,
  quantidade,
  categorias,
  grupos,
  onConfirmar,
}: ReclassificarDialogProps) {
  const [grupoId, setGrupoId] = React.useState(() => grupos[0]?.id ?? "");
  const [categoriaId, setCategoriaId] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  // Reabrir começa limpo, sem carregar a escolha da vez anterior.
  const [abertoAnterior, setAbertoAnterior] = React.useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) {
      setGrupoId(grupos[0]?.id ?? "");
      setCategoriaId("");
    }
  }

  const doGrupo = categorias.filter((c) => c.grupoId === grupoId);

  async function confirmar() {
    setSalvando(true);
    await onConfirmar(categoriaId);
    setSalvando(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar categoria</DialogTitle>
          <DialogDescription>
            {quantidade === 1
              ? "1 insumo vai para a subcategoria escolhida."
              : `${quantidade} insumos vão para a subcategoria escolhida.`}{" "}
            Isso muda em qual grupo o custo deles aparece nos relatórios.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reclassificar-grupo">Grupo</Label>
            <Combobox
              valor={grupoId}
              onValorChange={(valor) => {
                setGrupoId(valor);
                setCategoriaId("");
              }}
              opcoes={grupos.map((grupo) => ({
                valor: grupo.id,
                rotulo: grupo.nome,
              }))}
              placeholder="Selecione o grupo"
              disabled={salvando}
              className="w-full"
              id="reclassificar-grupo"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="reclassificar-categoria">Subcategoria</Label>
            <Combobox
              valor={categoriaId}
              onValorChange={setCategoriaId}
              opcoes={doGrupo.map((categoria) => ({
                valor: categoria.id,
                rotulo: categoria.nome,
              }))}
              placeholder="Selecione a subcategoria"
              disabled={salvando || doGrupo.length === 0}
              className="w-full"
              id="reclassificar-categoria"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void confirmar()}
            disabled={salvando || categoriaId === ""}
          >
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Aplicando...
              </>
            ) : (
              "Alterar categoria"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
