"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";

import { CelulaArvore, ConfirmDialog, DataTable, EmptyState, SecaoDetalhe } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { excluirLocal } from "@/modules/execucao/obras/actions";
import { LocalDrawer } from "@/modules/execucao/obras/components/local-drawer";
import type { Local } from "@/modules/execucao/obras/queries";
import { ROTULO_LADO, ROTULO_TIPO_LOCAL, type Lado, type TipoObra } from "@/modules/execucao/_shared/rotulos";

interface NoLocal extends Local {
  filhos: NoLocal[];
}

/** Monta a árvore de `paiId`. Local cujo pai não está na lista vira raiz. */
export function arvoreDeLocais(locais: Local[]): NoLocal[] {
  const nos = new Map<string, NoLocal>(locais.map((l) => [l.id, { ...l, filhos: [] }]));
  const raizes: NoLocal[] = [];
  for (const no of nos.values()) {
    const pai = no.paiId ? nos.get(no.paiId) : undefined;
    (pai ? pai.filhos : raizes).push(no);
  }
  return raizes;
}

export interface LocaisTabelaProps {
  obraId: string;
  tipoObra: TipoObra;
  locais: Local[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

export function LocaisTabela({ obraId, tipoObra, locais, podeCriar, podeEditar, podeExcluir }: LocaisTabelaProps) {
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<Local | null>(null);
  const [excluindo, setExcluindo] = React.useState<Local | null>(null);
  const rodovia = tipoObra === "rodovia";
  const raizes = React.useMemo(() => arvoreDeLocais(locais), [locais]);

  const colunas = React.useMemo<ColumnDef<NoLocal, unknown>[]>(() => {
    const base: ColumnDef<NoLocal, unknown>[] = [
      {
        id: "codigo",
        header: "Código",
        size: 200,
        cell: ({ row }) => (
          <CelulaArvore linha={row}>
            <span className="font-mono">{row.original.codigo}</span>
          </CelulaArvore>
        ),
      },
      { accessorKey: "nome", header: "Nome", size: 240 },
      { id: "tipo", header: "Tipo", size: 130, cell: ({ row }) => ROTULO_TIPO_LOCAL[row.original.tipo] ?? row.original.tipo },
    ];
    if (!rodovia) return base;
    return [
      ...base,
      {
        id: "km",
        header: "Km",
        size: 150,
        meta: { atomico: true },
        cell: ({ row }) =>
          row.original.kmInicial === null ? "" : `${row.original.kmInicial.replace(".", ",")} a ${(row.original.kmFinal ?? "").replace(".", ",")}`,
      },
      { id: "lado", header: "Lado", size: 130, cell: ({ row }) => (row.original.lado ? (ROTULO_LADO[row.original.lado as Lado] ?? row.original.lado) : "") },
      { id: "faixa", header: "Faixa", size: 100, cell: ({ row }) => row.original.faixa ?? "" },
    ];
  }, [rodovia]);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  async function confirmarExclusao(motivo?: string) {
    if (!excluindo) return false;
    const r = await excluirLocal(excluindo.id, motivo ?? "");
    if ("erro" in r) {
      toast.error(r.erro);
      return false;
    }
    toast.success("Local excluído");
    setExcluindo(null);
    semDerrubarSucesso("execucao.obras.excluirLocal.refresh", () => router.refresh());
  }

  const temMenu = podeEditar || podeExcluir;

  return (
    <SecaoDetalhe
      titulo="Locais"
      acao={
        podeCriar ? (
          <Button type="button" size="sm" variant="outline" onClick={abrirNovo}>
            <Plus />
            Novo local
          </Button>
        ) : undefined
      }
    >
      <DataTable<NoLocal>
        columns={colunas}
        data={raizes}
        subLinhas={(l) => l.filhos}
        idDaLinha={(l) => l.id}
        searchKey="nome"
        searchPlaceholder="Buscar local"
        acoesLinha={
          temMenu
            ? (l) => (
                <>
                  {podeEditar ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        setEmEdicao(l);
                        setDrawerAberto(true);
                      }}
                    >
                      <Pencil />
                      Editar
                    </DropdownMenuItem>
                  ) : null}
                  {podeExcluir ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(l)}>
                      <Trash2 />
                      Excluir
                    </DropdownMenuItem>
                  ) : null}
                </>
              )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={MapPin}
            titulo="Nenhum local cadastrado"
            descricao="Cadastre blocos, pavimentos ou trechos para vincular às atividades"
            className="border-none bg-transparent"
          />
        }
      />
      <LocalDrawer
        aberto={drawerAberto}
        onAbertoChange={setDrawerAberto}
        obraId={obraId}
        tipoObra={tipoObra}
        locais={locais}
        local={emEdicao}
        onSalvo={() => semDerrubarSucesso("execucao.obras.local.refresh", () => router.refresh())}
      />
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(a) => {
          if (!a) setExcluindo(null);
        }}
        titulo="Excluir local"
        descricao={excluindo ? `${excluindo.codigo} - ${excluindo.nome} sai da lista de locais.` : ""}
        textoConfirmar="Excluir"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={confirmarExclusao}
      />
    </SecaoDetalhe>
  );
}
