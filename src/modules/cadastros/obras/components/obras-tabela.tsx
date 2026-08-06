"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, MoreHorizontal } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  StatusBadge,
  type OpcaoFiltro,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarQuantidade } from "@/lib/formatadores";
import { opcoesDistintas } from "@/modules/cadastros/_shared/opcoes-filtro";
import { alternarAtivo } from "@/modules/cadastros/obras/actions";
import type { ClienteOpcao, ObraLista } from "@/modules/cadastros/obras/queries";
import {
  STATUS_OBRA,
  STATUS_OBRA_CONFIG,
} from "@/modules/cadastros/obras/schemas";
import { ObrasFormDrawer } from "./obras-form-drawer";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

/**
 * Situação do contrato (coluna `obras.status`). É outra pergunta que o filtro
 * "Status": ali é ativo/inativo no cadastro, aqui é em que pé está a obra.
 */
const OPCOES_SITUACAO = STATUS_OBRA.map((situacao) => ({
  valor: situacao,
  rotulo: STATUS_OBRA_CONFIG[situacao].rotulo,
}));

/** Texto "Rodovia / Lote" quando há os dois, senão o que existir. */
function rodoviaLote(obra: ObraLista): string {
  const partes = [obra.rodovia, obra.lote ? `Lote ${obra.lote}` : null].filter(
    Boolean,
  );
  return partes.length > 0 ? partes.join(" • ") : "-";
}

const colunas: ColumnDef<ObraLista, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    size: 320,
    cell: ({ row }) => <span className="font-medium">{row.original.nome}</span>,
  },
  {
    accessorKey: "numeroContrato",
    header: "Contrato",
    size: 160,
    cell: ({ row }) =>
      row.original.numeroContrato ? (
        <span className="codigo-doc">{row.original.numeroContrato}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    id: "rodoviaLote",
    header: "Rodovia / Lote",
    size: 190,
    cell: ({ row }) => rodoviaLote(row.original),
  },
  {
    id: "extensao",
    header: "Extensão",
    size: 120,
    // Secundária: quem precisa da quilometragem liga no menu "Colunas".
    meta: { alinharDireita: true, ocultaPorPadrao: true },
    cell: ({ row }) =>
      row.original.extensaoKm !== null ? (
        <span className="tabular-nums">
          {formatarQuantidade(row.original.extensaoKm)} km
        </span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 130,
    cell: ({ row }) => {
      const config = STATUS_OBRA_CONFIG[row.original.status];
      return (
        <StatusBadge
          status={row.original.status}
          rotulo={config.rotulo}
          className={config.classes}
        />
      );
    },
  },
  {
    accessorKey: "ativo",
    header: "Ativo",
    size: 110,
    cell: ({ row }) =>
      row.original.ativo ? (
        <StatusBadge status="aprovado" rotulo="Ativo" />
      ) : (
        <StatusBadge status="rascunho" rotulo="Inativo" />
      ),
  },
];

export interface ObrasTabelaProps {
  obras: ObraLista[];
  clientes: ClienteOpcao[];
  podeEditar: boolean;
}

/**
 * Listagem de obras. Clicar numa linha abre o drawer de edição
 * quando o usuário tem permissão de editar.
 *
 * A página carrega todas as obras (dezenas de contratos, não milhares), então
 * filtrar em memória está correto: o total da tabela é o total real.
 */
export function ObrasTabela({ obras, clientes, podeEditar }: ObrasTabelaProps) {
  const [selecionadaId, setSelecionadaId] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = useFiltroSessao("status", "ativos");
  const [situacao, setSituacao] = useFiltroSessao("situacao", "");
  const [clienteId, setClienteId] = useFiltroSessao("clienteId", "");
  const [uf, setUf] = useFiltroSessao("uf", "");
  const [rodovia, setRodovia] = useFiltroSessao("rodovia", "");
  const [lote, setLote] = useFiltroSessao("lote", "");
  const [inicioDe, setInicioDe] = useFiltroSessao("inicioDe", "");
  const [inicioAte, setInicioAte] = useFiltroSessao("inicioAte", "");
  const [fimDe, setFimDe] = useFiltroSessao("fimDe", "");
  const [fimAte, setFimAte] = useFiltroSessao("fimAte", "");

  // Deriva da prop pra refletir edições depois do revalidatePath.
  const obraSelecionada =
    obras.find((obra) => obra.id === selecionadaId) ?? null;

  // Clientes vindos das próprias obras, não da lista de clientes ativos: cliente
  // desativado continua tendo obra, e ela não pode ficar sem filtro.
  const opcoesCliente = React.useMemo<OpcaoFiltro[]>(() => {
    const porId = new Map<string, string>();
    for (const obra of obras) {
      if (obra.clienteId) {
        porId.set(obra.clienteId, obra.clienteNome ?? "Cliente sem nome");
      }
    }
    return [...porId.entries()]
      .map(([valor, rotulo]) => ({ valor, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [obras]);

  const opcoesUf = React.useMemo(
    () => opcoesDistintas(obras.map((obra) => obra.uf)),
    [obras],
  );
  const opcoesRodovia = React.useMemo(
    () => opcoesDistintas(obras.map((obra) => obra.rodovia)),
    [obras],
  );
  const opcoesLote = React.useMemo(
    () => opcoesDistintas(obras.map((obra) => obra.lote)),
    [obras],
  );

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return obras.filter((obra) => {
      if (status === "ativos" && !obra.ativo) return false;
      if (status === "inativos" && obra.ativo) return false;
      if (situacao !== "" && obra.status !== situacao) return false;
      if (clienteId !== "" && obra.clienteId !== clienteId) return false;
      if (uf !== "" && obra.uf !== uf) return false;
      if (rodovia !== "" && obra.rodovia !== rodovia) return false;
      if (lote !== "" && obra.lote !== lote) return false;
      // Datas em "YYYY-MM-DD": comparação de string já é cronológica. Obra sem
      // data sai quando o período está preenchido, senão a linha entraria sem
      // ninguém saber se ela cabe na janela pedida.
      if (inicioDe !== "" && (!obra.dataInicio || obra.dataInicio < inicioDe)) {
        return false;
      }
      if (
        inicioAte !== "" &&
        (!obra.dataInicio || obra.dataInicio > inicioAte)
      ) {
        return false;
      }
      if (fimDe !== "" && (!obra.dataFimPrevista || obra.dataFimPrevista < fimDe)) {
        return false;
      }
      if (
        fimAte !== "" &&
        (!obra.dataFimPrevista || obra.dataFimPrevista > fimAte)
      ) {
        return false;
      }
      if (termo && !obra.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [
    obras,
    busca,
    status,
    situacao,
    clienteId,
    uf,
    rodovia,
    lote,
    inicioDe,
    inicioAte,
    fimDe,
    fimAte,
  ]);

  const abrirEdicao = React.useCallback(
    (obra: ObraLista) => {
      if (!podeEditar) return;
      setSelecionadaId(obra.id);
      setAberto(true);
    },
    [podeEditar],
  );

  const alternar = React.useCallback(async (obra: ObraLista) => {
    const resultado = await alternarAtivo(obra.id, !obra.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(obra.ativo ? "Obra desativada" : "Obra reativada");
  }, []);

  // Coluna de ações (menu ⋮) só quando o usuário pode editar. Reaproveita as
  // colunas base e acrescenta Editar + Desativar/Reativar, no padrão dos
  // outros cadastros. O clique na linha continua abrindo a edição.
  const colunasComAcoes = React.useMemo<ColumnDef<ObraLista, unknown>[]>(() => {
    if (!podeEditar) return colunas;
    return [
      ...colunas,
      {
        id: "acoes",
        header: "",
        size: 60,
        meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
        cell: ({ row }) => {
          const obra = row.original;
          return (
            <div
              className="flex justify-end"
              onClick={(evento) => evento.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Ações da obra"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => abrirEdicao(obra)}>
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void alternar(obra)}>
                    {obra.ativo ? "Desativar" : "Reativar"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ];
  }, [podeEditar, abrirEdicao, alternar]);

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        idTabela="cadastros.obras"
        columns={colunasComAcoes}
        data={dados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por nome",
            fixo: true,
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
                valor={status === "todos" ? "" : status}
                onValorChange={(valor) =>
                  setStatus(valor === "" ? "todos" : valor)
                }
                opcoes={OPCOES_STATUS}
                placeholder="Status"
                todosRotulo="Todos"
              />
            ),
          },
          {
            id: "situacao",
            rotulo: "Situação da obra",
            ocultoPorPadrao: true,
            temValor: situacao !== "",
            onLimpar: () => setSituacao(""),
            elemento: (
              <FiltroSelect
                valor={situacao}
                onValorChange={setSituacao}
                opcoes={OPCOES_SITUACAO}
                placeholder="Situação"
                todosRotulo="Todas as situações"
              />
            ),
          },
          {
            id: "cliente",
            rotulo: "Cliente",
            ocultoPorPadrao: true,
            temValor: clienteId !== "",
            onLimpar: () => setClienteId(""),
            elemento: (
              <FiltroSelect
                valor={clienteId}
                onValorChange={setClienteId}
                opcoes={opcoesCliente}
                placeholder="Cliente"
                todosRotulo="Todos os clientes"
                className="max-w-56"
              />
            ),
          },
          {
            id: "uf",
            rotulo: "UF",
            ocultoPorPadrao: true,
            temValor: uf !== "",
            onLimpar: () => setUf(""),
            elemento: (
              <FiltroSelect
                valor={uf}
                onValorChange={setUf}
                opcoes={opcoesUf}
                placeholder="UF"
                todosRotulo="Todas as UFs"
              />
            ),
          },
          {
            id: "rodovia",
            rotulo: "Rodovia",
            ocultoPorPadrao: true,
            temValor: rodovia !== "",
            onLimpar: () => setRodovia(""),
            elemento: (
              <FiltroSelect
                valor={rodovia}
                onValorChange={setRodovia}
                opcoes={opcoesRodovia}
                placeholder="Rodovia"
                todosRotulo="Todas as rodovias"
              />
            ),
          },
          {
            id: "lote",
            rotulo: "Lote",
            ocultoPorPadrao: true,
            temValor: lote !== "",
            onLimpar: () => setLote(""),
            elemento: (
              <FiltroSelect
                valor={lote}
                onValorChange={setLote}
                opcoes={opcoesLote}
                placeholder="Lote"
                todosRotulo="Todos os lotes"
              />
            ),
          },
          {
            id: "inicio",
            rotulo: "Período de início",
            ocultoPorPadrao: true,
            temValor: inicioDe !== "" || inicioAte !== "",
            onLimpar: () => {
              setInicioDe("");
              setInicioAte("");
            },
            elemento: (
              <FiltroPeriodo
                de={inicioDe}
                ate={inicioAte}
                rotulo="Início"
                onPeriodoChange={(novoDe, novoAte) => {
                  setInicioDe(novoDe);
                  setInicioAte(novoAte);
                }}
              />
            ),
          },
          {
            id: "fimPrevisto",
            rotulo: "Período de fim previsto",
            ocultoPorPadrao: true,
            temValor: fimDe !== "" || fimAte !== "",
            onLimpar: () => {
              setFimDe("");
              setFimAte("");
            },
            elemento: (
              <FiltroPeriodo
                de={fimDe}
                ate={fimAte}
                rotulo="Fim previsto"
                onPeriodoChange={(novoDe, novoAte) => {
                  setFimDe(novoDe);
                  setFimAte(novoAte);
                }}
              />
            ),
          },
        ]}
        onRowClick={podeEditar ? abrirEdicao : undefined}
        emptyState={
          <EmptyState
            icone={Building2}
            titulo="Nenhuma obra cadastrada"
            descricao="Cadastre a primeira obra para começar"
            className="border-none bg-transparent"
          />
        }
      />

      <ObrasFormDrawer
        key={obraSelecionada?.id ?? "nenhuma"}
        aberto={aberto}
        onAbertoChange={setAberto}
        obra={obraSelecionada}
        clientes={clientes}
      />
    </div>
  );
}
