"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Truck } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  StatusBadge,
} from "@/components/canonicos";
import {
  opcoesDistintas,
  opcoesNumericasDistintas,
} from "@/modules/cadastros/_shared/opcoes-filtro";
import type {
  EquipamentoDocumento,
  EquipamentoLista,
} from "@/modules/cadastros/equipamentos/queries";
import {
  CONTROLE_POR,
  CONTROLE_POR_CONFIG,
} from "@/modules/cadastros/equipamentos/schemas";
import { EquipamentosFormDrawer } from "./equipamentos-form-drawer";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

type FiltroStatus = "ativos" | "inativos" | "todos";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

const OPCOES_CONTROLE = CONTROLE_POR.map((controle) => ({
  valor: controle,
  rotulo: CONTROLE_POR_CONFIG[controle],
}));

const colunas: ColumnDef<EquipamentoLista, unknown>[] = [
  {
    accessorKey: "codigo",
    header: "Código",
    size: 130,
    cell: ({ row }) =>
      row.original.codigo ? (
        <span className="codigo-doc">{row.original.codigo}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "descricao",
    header: "Descrição",
    size: 340,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.descricao}</span>
    ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    size: 170,
    // Secundária: código, descrição e placa já identificam o equipamento.
    meta: { ocultaPorPadrao: true },
    cell: ({ row }) =>
      row.original.tipo ? (
        <span>{row.original.tipo}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "placa",
    header: "Placa",
    size: 130,
    cell: ({ row }) =>
      row.original.placa ? (
        <span className="codigo-doc">{row.original.placa}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
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

export interface EquipamentosTabelaProps {
  equipamentos: EquipamentoLista[];
  documentosPorEquipamento: Record<string, EquipamentoDocumento[]>;
  podeEditar: boolean;
}

/**
 * Listagem de equipamentos: busca por código, descrição ou placa, e filtros de
 * status, tipo, marca, forma de controle e ano. Clicar numa linha abre o drawer
 * de edição (com a seção de documentos) quando o usuário tem permissão de
 * editar.
 *
 * A página carrega a frota inteira, então filtrar em memória está correto.
 */
export function EquipamentosTabela({
  equipamentos,
  documentosPorEquipamento,
  podeEditar,
}: EquipamentosTabelaProps) {
  const [selecionadoId, setSelecionadoId] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = useFiltroSessao("busca", "");
  // "todos" para não mudar o que a tela mostra hoje: a listagem nunca escondeu
  // equipamento inativo, e ganhar um filtro não pode sumir com linha nenhuma.
  const [status, setStatus] = useFiltroSessao<FiltroStatus>("status", "todos", ["ativos", "inativos", "todos"]);
  const [tipo, setTipo] = useFiltroSessao("tipo", "");
  const [marca, setMarca] = useFiltroSessao("marca", "");
  const [controle, setControle] = useFiltroSessao("controle", "");
  const [ano, setAno] = useFiltroSessao("ano", "");

  // Deriva da prop pra refletir edições depois do revalidatePath.
  const equipamentoSelecionado =
    equipamentos.find((equipamento) => equipamento.id === selecionadoId) ?? null;
  const documentos = selecionadoId
    ? (documentosPorEquipamento[selecionadoId] ?? [])
    : [];

  // Tipo e marca são texto livre no cadastro: as opções são o que já existe.
  const opcoesTipo = React.useMemo(
    () => opcoesDistintas(equipamentos.map((e) => e.tipo)),
    [equipamentos],
  );
  const opcoesMarca = React.useMemo(
    () => opcoesDistintas(equipamentos.map((e) => e.marca)),
    [equipamentos],
  );
  const opcoesAno = React.useMemo(
    () => opcoesNumericasDistintas(equipamentos.map((e) => e.ano)),
    [equipamentos],
  );

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return equipamentos.filter((equipamento) => {
      if (status === "ativos" && !equipamento.ativo) return false;
      if (status === "inativos" && equipamento.ativo) return false;
      if (tipo !== "" && equipamento.tipo !== tipo) return false;
      if (marca !== "" && equipamento.marca !== marca) return false;
      if (controle !== "" && equipamento.controlePor !== controle) return false;
      if (ano !== "" && String(equipamento.ano ?? "") !== ano) return false;
      if (termo === "") return true;
      // Código, descrição e placa: os três jeitos de alguém apontar para uma
      // máquina no pátio.
      const alvo = [equipamento.codigo, equipamento.descricao, equipamento.placa]
        .filter((valor): valor is string => valor !== null)
        .join(" ")
        .toLowerCase();
      return alvo.includes(termo);
    });
  }, [equipamentos, busca, status, tipo, marca, controle, ano]);

  function abrirEdicao(equipamento: EquipamentoLista) {
    if (!podeEditar) return;
    setSelecionadoId(equipamento.id);
    setAberto(true);
  }

  return (
    <>
      <DataTable
        idTabela="cadastros.equipamentos"
        columns={colunas}
        data={dados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por código, descrição ou placa",
            fixo: true,
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por código, descrição ou placa"
              />
            ),
          },
          {
            id: "status",
            rotulo: "Status",
            ocultoPorPadrao: true,
            temValor: status !== "todos",
            onLimpar: () => setStatus("todos"),
            elemento: (
              <FiltroSelect
                valor={status === "todos" ? "" : status}
                onValorChange={(valor) =>
                  setStatus(valor === "" ? "todos" : (valor as FiltroStatus))
                }
                opcoes={OPCOES_STATUS}
                placeholder="Status"
                todosRotulo="Todos"
              />
            ),
          },
          {
            id: "tipo",
            rotulo: "Tipo",
            ocultoPorPadrao: true,
            temValor: tipo !== "",
            onLimpar: () => setTipo(""),
            elemento: (
              <FiltroSelect
                valor={tipo}
                onValorChange={setTipo}
                opcoes={opcoesTipo}
                placeholder="Tipo"
                todosRotulo="Todos os tipos"
                className="max-w-56"
              />
            ),
          },
          {
            id: "marca",
            rotulo: "Marca",
            ocultoPorPadrao: true,
            temValor: marca !== "",
            onLimpar: () => setMarca(""),
            elemento: (
              <FiltroSelect
                valor={marca}
                onValorChange={setMarca}
                opcoes={opcoesMarca}
                placeholder="Marca"
                todosRotulo="Todas as marcas"
                className="max-w-56"
              />
            ),
          },
          {
            id: "controle",
            rotulo: "Forma de controle",
            ocultoPorPadrao: true,
            temValor: controle !== "",
            onLimpar: () => setControle(""),
            elemento: (
              <FiltroSelect
                valor={controle}
                onValorChange={setControle}
                opcoes={OPCOES_CONTROLE}
                placeholder="Controle"
                todosRotulo="Todas as formas"
              />
            ),
          },
          {
            id: "ano",
            rotulo: "Ano",
            ocultoPorPadrao: true,
            temValor: ano !== "",
            onLimpar: () => setAno(""),
            elemento: (
              <FiltroSelect
                valor={ano}
                onValorChange={setAno}
                opcoes={opcoesAno}
                placeholder="Ano"
                todosRotulo="Todos os anos"
              />
            ),
          },
        ]}
        onRowClick={podeEditar ? abrirEdicao : undefined}
        emptyState={
          <EmptyState
            icone={Truck}
            titulo="Nenhum equipamento encontrado"
            descricao="Ajuste os filtros ou cadastre o primeiro equipamento"
            className="border-none bg-transparent"
          />
        }
      />

      <EquipamentosFormDrawer
        key={equipamentoSelecionado?.id ?? "nenhum"}
        aberto={aberto}
        onAbertoChange={setAberto}
        equipamento={equipamentoSelecionado}
        documentos={documentos}
        podeEditar={podeEditar}
      />
    </>
  );
}
