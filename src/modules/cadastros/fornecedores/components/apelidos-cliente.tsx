"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Landmark, LoaderCircle, Plus, Trash2 } from "lucide-react";

import {
  CampoFormulario,
  CelulaVazia,
  Combobox,
  ConfirmDialog,
  DataTable,
  EmptyState,
  StatusBadge,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatarDataHora } from "@/lib/formatadores";
import { usePaginacaoCliente } from "@/modules/_shared/filtros-cliente";
import {
  adicionarApelido,
  removerApelido,
} from "@/modules/cadastros/fornecedores/apelidos-actions";
import type { ApelidoBancario } from "@/modules/cadastros/fornecedores/apelidos";

export interface ApelidosClienteProps {
  apelidos: ApelidoBancario[];
  fornecedores: { id: string; nome: string }[];
  podeEditar: boolean;
}

/**
 * Apelidos bancários (Bloco I da conciliação): o nome que o banco escreve no
 * histórico para cada fornecedor. A conciliação aprende sozinha quando alguém
 * confirma um casamento com selo "Confira"; aqui dá para conferir, cadastrar
 * à mão e remover.
 */
export function ApelidosCliente({ apelidos, fornecedores, podeEditar }: ApelidosClienteProps) {
  const router = useRouter();
  const { paginacao, setPaginacao } = usePaginacaoCliente();
  const [adicionando, setAdicionando] = React.useState(false);
  const [fornecedorId, setFornecedorId] = React.useState("");
  const [apelido, setApelido] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [removerAlvo, setRemoverAlvo] = React.useState<ApelidoBancario | null>(null);

  async function salvar() {
    setEnviando(true);
    const resposta = await adicionarApelido({ fornecedorId, apelido });
    setEnviando(false);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    toast.success("Apelido cadastrado");
    setAdicionando(false);
    setFornecedorId("");
    setApelido("");
    router.refresh();
  }

  async function remover() {
    if (!removerAlvo) return false;
    const resposta = await removerApelido(removerAlvo.id);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return false;
    }
    toast.success("Apelido removido");
    setRemoverAlvo(null);
    router.refresh();
  }

  const colunas = React.useMemo<ColumnDef<ApelidoBancario, unknown>[]>(
    () => [
      {
        accessorKey: "apelido",
        header: "Nome no banco",
        size: 260,
        meta: { celular: "titulo" },
        cell: ({ row }) => <span className="font-mono text-legenda">{row.original.apelido}</span>,
      },
      { accessorKey: "favorecido", header: "Fornecedor", size: 260 },
      {
        id: "origem",
        header: "Origem",
        size: 140,
        meta: { naoTruncar: true },
        cell: ({ row }) =>
          row.original.origem === "manual" ? (
            <StatusBadge status="executado" rotulo="Manual" />
          ) : (
            <StatusBadge status="aprovado" rotulo="Conciliação" />
          ),
      },
      {
        accessorKey: "vezesUsado",
        header: "Usado",
        size: 90,
        meta: { alinharDireita: true },
        cell: ({ row }) => <span className="tabular-nums">{row.original.vezesUsado}</span>,
      },
      {
        id: "ultimo",
        header: "Último uso",
        size: 150,
        cell: ({ row }) =>
          row.original.ultimoUso ? (
            <span className="tabular-nums">{formatarDataHora(row.original.ultimoUso)}</span>
          ) : (
            <CelulaVazia />
          ),
      },
      {
        id: "acoes",
        header: "",
        size: 100,
        meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
        cell: ({ row }) =>
          podeEditar ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setRemoverAlvo(row.original)}
              title="Remover"
            >
              <Trash2 />
              <span className="max-md:sr-only">Remover</span>
            </Button>
          ) : null,
      },
    ],
    [podeEditar],
  );

  return (
    <div className="flex flex-col gap-4">
      {podeEditar ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setAdicionando(true)}>
            <Plus />
            Novo apelido
          </Button>
        </div>
      ) : null}

      <DataTable
        idTabela="cadastros.fornecedores.apelidos"
        columns={colunas}
        data={apelidos}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
        emptyState={
          <EmptyState
            icone={Landmark}
            titulo="Nenhum apelido bancário ainda"
            descricao="A conciliação aprende quando alguém confirma um casamento com selo Confira."
            className="border-none bg-transparent"
          />
        }
      />

      <Dialog open={adicionando} onOpenChange={(aberto) => !enviando && setAdicionando(aberto)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo apelido bancário</DialogTitle>
            <DialogDescription>
              O nome que o banco escreve no histórico, como &quot;FORTBRAS AUTOPECAS S A&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <CampoFormulario id="apelido-fornecedor" rotulo="Fornecedor" obrigatorio>
              <Combobox
                id="apelido-fornecedor"
                valor={fornecedorId}
                onValorChange={setFornecedorId}
                opcoes={fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome }))}
                placeholder="Escolha o fornecedor"
                disabled={enviando}
              />
            </CampoFormulario>
            <CampoFormulario
              id="apelido-texto"
              rotulo="Nome no banco"
              obrigatorio
              ajuda="Sem acento e sem pontuação, em maiúsculas: o app ajusta ao salvar"
            >
              <Input
                id="apelido-texto"
                value={apelido}
                maxLength={200}
                onChange={(e) => setApelido(e.target.value)}
                disabled={enviando}
              />
            </CampoFormulario>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAdicionando(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void salvar()}
              disabled={enviando || !fornecedorId || apelido.trim().length < 3}
            >
              {enviando ? <LoaderCircle className="animate-spin" /> : <Plus />}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        aberto={removerAlvo !== null}
        onAbertoChange={(aberto) => !aberto && setRemoverAlvo(null)}
        titulo="Remover apelido"
        descricao={
          removerAlvo
            ? `${removerAlvo.apelido} deixa de ser reconhecido como ${removerAlvo.favorecido}: a conciliação volta a pedir conferência.`
            : ""
        }
        textoConfirmar="Remover"
        variante="destrutivo"
        onConfirmar={remover}
      />
    </div>
  );
}
