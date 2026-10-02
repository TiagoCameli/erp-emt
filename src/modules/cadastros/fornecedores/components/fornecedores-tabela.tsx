"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Truck } from "lucide-react";
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
import { filtrarFacetado, selecao } from "@/modules/_shared/filtros-facetados";
import {
  alternarAtivo,
  excluir,
} from "@/modules/cadastros/fornecedores/actions";
import type { FornecedorLista } from "@/modules/cadastros/fornecedores/queries";
import {
  ROTULO_TIPO,
  TIPOS_FORNECEDOR,
} from "@/modules/cadastros/fornecedores/schemas";
import { FornecedoresFormDrawer } from "./fornecedores-form-drawer";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

type FiltroStatus = "ativos" | "inativos" | "todos";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
  { valor: "todos", rotulo: "Todos" },
];

const OPCOES_TIPO = TIPOS_FORNECEDOR.map((tipo) => ({
  valor: tipo,
  rotulo: ROTULO_TIPO[tipo],
}));

function StatusFornecedor({ ativo }: { ativo: boolean }) {
  return ativo ? (
    <StatusBadge status="aprovado" rotulo="Ativo" />
  ) : (
    <StatusBadge status="rascunho" rotulo="Inativo" />
  );
}

export interface FornecedoresTabelaProps {
  fornecedores: FornecedorLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Listagem de fornecedores: busca, status, tipo de pessoa, UF e cidade, tabela
 * densa e ações por linha (editar, ativar/desativar, excluir). A exclusão é
 * física (move para a lixeira) e exige motivo.
 *
 * A página carrega o cadastro inteiro, então filtrar em memória está correto
 * aqui: o total da tabela é o total real, não o de uma página.
 */
export function FornecedoresTabela({
  fornecedores,
  podeEditar,
  podeExcluir,
}: FornecedoresTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "ativos", ["ativos", "inativos", "todos"]);
  const [tipo, setTipo] = useFiltroSessao("tipo", "");
  const [uf, setUf] = useFiltroSessao("uf", "");
  const [cidade, setCidade] = useFiltroSessao("cidade", "");

  const [editarId, setEditarId] = React.useState<string | null>(null);
  const [drawerAberto, setDrawerAberto] = React.useState(false);

  const [excluirAlvo, setExcluirAlvo] =
    React.useState<FornecedorLista | null>(null);
  const [alternandoId, setAlternandoId] = React.useState<string | null>(null);

  const emEdicao =
    fornecedores.find((fornecedor) => fornecedor.id === editarId) ?? null;

  const opcoesUf = React.useMemo(
    () => opcoesDistintas(fornecedores.map((f) => f.uf)),
    [fornecedores],
  );

  const opcoesCidade = React.useMemo(
    () => opcoesDistintas(fornecedores.map((f) => f.cidade)),
    [fornecedores],
  );

  // Facetado: cada filtro só oferece o que existe na lista filtrada pelos
  // outros (ver `_shared/filtros-facetados`). É isso que faz a cidade seguir a
  // UF escolhida, e o tipo seguir a cidade.
  const { linhas: filtrados, opcoes } = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return filtrarFacetado(
      fornecedores,
      {
        status: {
          selecionados: status === "todos" ? [] : [status],
          casa: (fornecedor, valor) =>
            valor === "todos" || (valor === "ativos") === fornecedor.ativo,
        },
        tipo: { selecionados: selecao(tipo), chave: (f) => f.tipo },
        uf: { selecionados: selecao(uf), chave: (f) => f.uf?.trim() },
        cidade: { selecionados: selecao(cidade), chave: (f) => f.cidade?.trim() },
      },
      [
        (fornecedor) => {
          if (termo.length === 0) return true;
          const alvo = [
            fornecedor.razaoSocial,
            fornecedor.nomeFantasia,
            fornecedor.cnpjCpf,
          ]
            .filter((valor): valor is string => valor !== null)
            .join(" ")
            .toLowerCase();
          return alvo.includes(termo);
        },
      ],
    );
  }, [fornecedores, busca, status, tipo, uf, cidade]);

  function abrirEdicao(fornecedor: FornecedorLista) {
    setEditarId(fornecedor.id);
    setDrawerAberto(true);
  }

  async function trocarAtivo(fornecedor: FornecedorLista) {
    setAlternandoId(fornecedor.id);
    const resultado = await alternarAtivo(fornecedor.id, !fornecedor.ativo);
    setAlternandoId(null);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(fornecedor.ativo ? "Fornecedor desativado" : "Fornecedor reativado");
  }

  async function confirmarExclusao(motivo?: string) {
    if (!excluirAlvo) return;
    const resultado = await excluir(excluirAlvo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Fornecedor enviado para a lixeira");
    setExcluirAlvo(null);
  }

  const colunas: ColumnDef<FornecedorLista, unknown>[] = React.useMemo(() => {
    const base: ColumnDef<FornecedorLista, unknown>[] = [
      {
        accessorKey: "razaoSocial",
        header: "Razão social",
        size: 340,
        // Célula de duas linhas: sem `naoTruncar` a DataTable embrulha as duas
        // num truncate de uma linha só, que corta no seco e esconde a fantasia
        // quando a altura da linha é fixa. O corte passa a ser linha a linha,
        // com o texto inteiro no tooltip, como na CelulaDescricaoCategoria.
        meta: { naoTruncar: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div
              className="truncate font-medium"
              title={row.original.razaoSocial}
            >
              {row.original.razaoSocial}
            </div>
            {row.original.nomeFantasia ? (
              <div
                className="truncate text-detalhe text-muted-foreground"
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
            {ROTULO_TIPO[row.original.tipo]}
          </span>
        ),
      },
      {
        accessorKey: "cnpjCpf",
        header: "CNPJ/CPF",
        size: 170,
        cell: ({ row }) =>
          row.original.cnpjCpf ? (
            <span className="codigo-doc tabular-nums">
              {row.original.cnpjCpf}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: "localizacao",
        header: "Cidade/UF",
        size: 170,
        // Secundária: quem trabalha logística liga no menu "Colunas".
        meta: { ocultaPorPadrao: true },
        cell: ({ row }) => {
          const { cidade, uf } = row.original;
          const texto = [cidade, uf].filter(Boolean).join(" / ");
          return texto ? (
            <span>{texto}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: "telefone",
        header: "Telefone",
        size: 150,
        meta: { ocultaPorPadrao: true },
        cell: ({ row }) =>
          row.original.telefone ? (
            <span className="tabular-nums">{row.original.telefone}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "ativo",
        header: "Status",
        size: 110,
        cell: ({ row }) => <StatusFornecedor ativo={row.original.ativo} />,
      },
    ];

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      size: 60,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const fornecedor = row.original;
        const alternando = alternandoId === fornecedor.id;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Abrir ações do fornecedor"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <>
                  <DropdownMenuItem onSelect={() => abrirEdicao(fornecedor)}>
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={alternando}
                    onSelect={(evento) => {
                      evento.preventDefault();
                      void trocarAtivo(fornecedor);
                    }}
                  >
                    {fornecedor.ativo ? "Desativar" : "Reativar"}
                  </DropdownMenuItem>
                </>
              ) : null}
              {podeExcluir ? (
                <>
                  {podeEditar ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setExcluirAlvo(fornecedor)}
                  >
                    Excluir
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeEditar, podeExcluir, alternandoId]);

  return (
    <>
      <DataTable
        idTabela="cadastros.fornecedores"
        columns={colunas}
        data={filtrados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por nome ou documento",
            fixo: true,
            // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
            // deixa o texto da busca filtrando a lista.
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por nome ou documento"
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
                valor={status === "todos" ? "todos" : status}
                onValorChange={(valor) =>
                  setStatus((valor === "" ? "todos" : valor) as FiltroStatus)
                }
                opcoes={opcoes("status", OPCOES_STATUS)}
                placeholder="Status"
                todosRotulo="Todos"
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
                opcoes={opcoes("tipo", OPCOES_TIPO)}
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
                opcoes={opcoes("uf", opcoesUf)}
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
                opcoes={opcoes("cidade", opcoesCidade)}
                placeholder="Cidade"
                todosRotulo="Todas as cidades"
                className="max-w-56"
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={Truck}
            titulo="Nenhum fornecedor encontrado"
            descricao="Cadastre um fornecedor ou ajuste os filtros de busca"
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <FornecedoresFormDrawer
          key={emEdicao?.id ?? "edicao-nenhum"}
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          fornecedor={emEdicao}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={excluirAlvo !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setExcluirAlvo(null);
          }}
          titulo="Excluir fornecedor"
          descricao={
            excluirAlvo
              ? `O fornecedor ${excluirAlvo.razaoSocial} vai para a lixeira. Informe o motivo.`
              : "O fornecedor vai para a lixeira."
          }
          textoConfirmar="Excluir fornecedor"
          variante="destrutivo"
          exigeMotivo
          onConfirmar={confirmarExclusao}
        />
      ) : null}
    </>
  );
}
