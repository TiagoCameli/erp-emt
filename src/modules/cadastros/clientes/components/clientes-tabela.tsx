"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, MoreHorizontal } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { opcoesDistintas } from "@/modules/cadastros/_shared/opcoes-filtro";
import {
  alternarAtivo,
  excluir,
} from "@/modules/cadastros/clientes/actions";
import type { ClienteLista } from "@/modules/cadastros/clientes/queries";
import { ClientesFormDrawer } from "./clientes-form-drawer";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

type FiltroStatus = "ativos" | "inativos" | "todos";

/** Opções do filtro de status. "ativos" é o padrão (valor vazio do select). */
const OPCOES_STATUS = [
  { valor: "inativos", rotulo: "Inativos" },
  { valor: "todos", rotulo: "Todos" },
];

function rotuloTipo(tipo: string): string {
  return tipo === "pf" ? "Pessoa física" : "Pessoa jurídica";
}

/** Espelha o check de `clientes.tipo` no banco. */
const OPCOES_TIPO = [
  { valor: "pf", rotulo: rotuloTipo("pf") },
  { valor: "pj", rotulo: rotuloTipo("pj") },
];

export interface ClientesTabelaProps {
  clientes: ClienteLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Listagem de clientes: busca por nome, status, tipo de pessoa, UF e cidade,
 * com ações de linha (editar, ativar/desativar, excluir). A criação fica no
 * PageHeader.
 *
 * A página carrega o cadastro inteiro, então filtrar em memória está correto.
 */
export function ClientesTabela({
  clientes,
  podeEditar,
  podeExcluir,
}: ClientesTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "ativos", ["ativos", "inativos", "todos"]);
  const [tipo, setTipo] = useFiltroSessao("tipo", "");
  const [uf, setUf] = useFiltroSessao("uf", "");
  const [cidade, setCidade] = useFiltroSessao("cidade", "");

  const [edicaoCliente, setEdicaoCliente] = React.useState<ClienteLista | null>(
    null,
  );
  const [drawerAberto, setDrawerAberto] = React.useState(false);

  const [exclusaoCliente, setExclusaoCliente] =
    React.useState<ClienteLista | null>(null);
  const [exclusaoAberta, setExclusaoAberta] = React.useState(false);

  const opcoesUf = React.useMemo(
    () => opcoesDistintas(clientes.map((cliente) => cliente.uf)),
    [clientes],
  );

  // Cidades da UF escolhida: a lista de cidade acompanha a UF do filtro.
  const opcoesCidade = React.useMemo(
    () =>
      opcoesDistintas(
        clientes
          .filter((cliente) => uf === "" || cliente.uf === uf)
          .map((cliente) => cliente.cidade),
      ),
    [clientes, uf],
  );

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes.filter((cliente) => {
      if (status === "ativos" && !cliente.ativo) return false;
      if (status === "inativos" && cliente.ativo) return false;
      if (tipo !== "" && cliente.tipo !== tipo) return false;
      if (uf !== "" && cliente.uf !== uf) return false;
      if (cidade !== "" && cliente.cidade !== cidade) return false;
      if (termo.length > 0 && !cliente.nome.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [clientes, busca, status, tipo, uf, cidade]);

  function abrirEdicao(cliente: ClienteLista) {
    setEdicaoCliente(cliente);
    setDrawerAberto(true);
  }

  async function alternar(cliente: ClienteLista) {
    const resultado = await alternarAtivo(cliente.id, !cliente.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(cliente.ativo ? "Cliente desativado" : "Cliente reativado");
  }

  function abrirExclusao(cliente: ClienteLista) {
    setExclusaoCliente(cliente);
    setExclusaoAberta(true);
  }

  async function confirmarExclusao(motivo?: string) {
    if (!exclusaoCliente) return;
    const resultado = await excluir(exclusaoCliente.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Cliente excluído");
  }

  const colunas = React.useMemo<ColumnDef<ClienteLista, unknown>[]>(() => {
    const base: ColumnDef<ClienteLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        size: 340,
        // Célula de duas linhas: sem `naoTruncar` a DataTable embrulha as duas
        // num truncate de uma linha só, que corta no seco e esconde a fantasia
        // quando a altura da linha é fixa. O corte passa a ser linha a linha,
        // com o texto inteiro no tooltip, como na CelulaDescricaoCategoria.
        meta: { naoTruncar: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium" title={row.original.nome}>
              {row.original.nome}
            </div>
            {row.original.nomeFantasia ? (
              <div
                className="truncate text-legenda text-muted-foreground"
                title={row.original.nomeFantasia}
              >
                {row.original.nomeFantasia}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        size: 130,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {rotuloTipo(row.original.tipo)}
          </span>
        ),
      },
      {
        accessorKey: "cpfCnpj",
        header: "CPF/CNPJ",
        size: 170,
        cell: ({ row }) =>
          row.original.cpfCnpj ? (
            <span className="codigo-doc tabular-nums">
              {row.original.cpfCnpj}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "cidade",
        header: "Cidade",
        size: 200,
        cell: ({ row }) => {
          const { cidade, uf } = row.original;
          if (!cidade && !uf) {
            return <span className="text-muted-foreground">-</span>;
          }
          return <span>{[cidade, uf].filter(Boolean).join(", ")}</span>;
        },
      },
      {
        accessorKey: "ativo",
        header: "Status",
        size: 110,
        cell: ({ row }) =>
          row.original.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativo" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Inativo" />
          ),
      },
    ];

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      size: 60,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const cliente = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Ações do cliente"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {podeEditar ? (
                  <>
                    <DropdownMenuItem onSelect={() => abrirEdicao(cliente)}>
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void alternar(cliente)}>
                      {cliente.ativo ? "Desativar" : "Reativar"}
                    </DropdownMenuItem>
                  </>
                ) : null}
                {podeExcluir ? (
                  <>
                    {podeEditar ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => abrirExclusao(cliente)}
                    >
                      Excluir
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    });

    return base;
  }, [podeEditar, podeExcluir]);

  return (
    <>
      <DataTable
        idTabela="cadastros.clientes"
        columns={colunas}
        data={filtrados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por nome",
            fixo: true,
            // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
            // deixa o texto da busca filtrando a lista.
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por nome"
              />
            ),
          },
          {
            id: "status",
            rotulo: "Status",
            temValor: status !== "ativos",
            onLimpar: () => setStatus("ativos"),
            elemento: (
              <FiltroSelect
                valor={status === "ativos" ? "" : status}
                onValorChange={(valor) =>
                  setStatus((valor === "" ? "ativos" : valor) as FiltroStatus)
                }
                opcoes={OPCOES_STATUS}
                placeholder="Status"
                todosRotulo="Ativos"
              />
            ),
          },
          {
            id: "tipo",
            rotulo: "Tipo de pessoa",
            ocultoPorPadrao: true,
            temValor: tipo !== "",
            onLimpar: () => setTipo(""),
            elemento: (
              <FiltroSelect
                valor={tipo}
                onValorChange={setTipo}
                opcoes={OPCOES_TIPO}
                placeholder="Tipo"
                todosRotulo="Física e jurídica"
              />
            ),
          },
          {
            id: "uf",
            rotulo: "UF",
            ocultoPorPadrao: true,
            temValor: uf !== "",
            // Soltar a UF solta a cidade: ela pertence à UF.
            onLimpar: () => {
              setUf("");
              setCidade("");
            },
            elemento: (
              <FiltroSelect
                valor={uf}
                onValorChange={(valor) => {
                  setUf(valor);
                  // Trocar a UF derruba a cidade: ela é da anterior.
                  setCidade("");
                }}
                opcoes={opcoesUf}
                placeholder="UF"
                todosRotulo="Todas as UFs"
              />
            ),
          },
          {
            id: "cidade",
            rotulo: "Cidade",
            ocultoPorPadrao: true,
            temValor: cidade !== "",
            onLimpar: () => setCidade(""),
            elemento: (
              <FiltroSelect
                valor={cidade}
                onValorChange={setCidade}
                opcoes={opcoesCidade}
                placeholder="Cidade"
                todosRotulo="Todas as cidades"
                className="max-w-56"
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={Building2}
            titulo="Nenhum cliente encontrado"
            descricao="Cadastre o primeiro órgão ou empresa contratante"
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <ClientesFormDrawer
          aberto={drawerAberto}
          onAbertoChange={(aberto) => {
            setDrawerAberto(aberto);
            if (!aberto) setEdicaoCliente(null);
          }}
          cliente={edicaoCliente}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={exclusaoAberta}
          onAbertoChange={(aberto) => {
            setExclusaoAberta(aberto);
            if (!aberto) setExclusaoCliente(null);
          }}
          titulo="Excluir cliente"
          descricao={`O cliente ${
            exclusaoCliente?.nome ?? ""
          } vai para a lixeira. Registros em uso não podem ser excluídos, desative-os no lugar.`}
          textoConfirmar="Excluir cliente"
          variante="destrutivo"
          exigeMotivo
          onConfirmar={confirmarExclusao}
        />
      ) : null}
    </>
  );
}
