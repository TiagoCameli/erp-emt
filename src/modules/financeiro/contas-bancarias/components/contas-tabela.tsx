"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Filter, Landmark } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  FiltroValor,
  MoneyText,
  StatusBadge,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import {
  dentroDaFaixaValor,
  usePaginacaoCliente,
} from "@/modules/financeiro/_shared/filtros-cliente";
import { ROTULO_BANCO } from "@/modules/financeiro/_shared/formato";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";
import { ROTULO_TIPO_CONTA } from "@/modules/financeiro/contas-bancarias/schemas";
import { ContasFormDrawer } from "./contas-form-drawer";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativas" },
  { valor: "inativos", rotulo: "Inativas" },
];

/** Texto "Ag. 0001 / Conta 12345-6" com o que existir, senão um traço. */
function agenciaConta(conta: ContaLista): React.ReactNode {
  const partes = [
    conta.agencia ? `Ag. ${conta.agencia}` : null,
    conta.conta ? `C/C ${conta.conta}` : null,
  ].filter(Boolean);
  if (partes.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }
  return <span className="codigo-doc">{partes.join(" • ")}</span>;
}

// O nome da conta é texto livre e comprido ("Banco do Brasil 1197-5 Amapá"):
// com a largura padrão de 150px ele saía cortado enquanto sobrava espaço à
// direita da tabela. As larguras abaixo dão o espaço ao nome e deixam as
// colunas curtas (tipo, situação) do tamanho do que mostram.
const colunas: ColumnDef<ContaLista, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    size: 300,
    cell: ({ row }) => <span className="font-medium">{row.original.nome}</span>,
  },
  {
    accessorKey: "banco",
    header: "Banco",
    size: 180,
    cell: ({ row }) => ROTULO_BANCO[row.original.banco],
  },
  {
    id: "agenciaConta",
    header: "Agência / Conta",
    size: 220,
    cell: ({ row }) => agenciaConta(row.original),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    size: 150,
    cell: ({ row }) => ROTULO_TIPO_CONTA[row.original.tipo],
  },
  {
    accessorKey: "saldoAtual",
    header: "Saldo atual",
    size: 150,
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <MoneyText
        valor={row.original.saldoAtual}
        className="font-semibold text-foreground"
      />
    ),
  },
  {
    accessorKey: "ativo",
    header: "Ativa",
    size: 110,
    meta: { naoTruncar: true },
    cell: ({ row }) =>
      row.original.ativo ? (
        <StatusBadge status="aprovado" rotulo="Ativa" />
      ) : (
        <StatusBadge status="rascunho" rotulo="Inativa" />
      ),
  },
];

export interface ContasTabelaProps {
  contas: ContaLista[];
  podeEditar: boolean;
}

/**
 * Listagem de contas bancárias. Clicar numa linha abre o drawer de edição
 * quando o usuário tem permissão de editar.
 */
export function ContasTabela({ contas, podeEditar }: ContasTabelaProps) {
  const [selecionadaId, setSelecionadaId] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("ativos");
  const [banco, setBanco] = React.useState("");
  const [tipo, setTipo] = React.useState("");
  const [saldoDe, setSaldoDe] = React.useState("");
  const [saldoAte, setSaldoAte] = React.useState("");

  // Deriva da prop pra refletir edições depois do revalidatePath.
  const contaSelecionada =
    contas.find((conta) => conta.id === selecionadaId) ?? null;

  // Trocar filtro volta para a primeira página: filtrar e cair numa página
  // vazia faz a pessoa concluir que não existe conta com aquele critério.
  function mudarBusca(valor: string) {
    setBusca(valor);
    zerarPagina();
  }
  function mudarStatus(valor: string) {
    setStatus(valor === "" ? "todos" : valor);
    zerarPagina();
  }
  function mudarBanco(valor: string) {
    setBanco(valor);
    zerarPagina();
  }
  function mudarTipo(valor: string) {
    setTipo(valor);
    zerarPagina();
  }
  function mudarSaldo(de: string, ate: string) {
    setSaldoDe(de);
    setSaldoAte(ate);
    zerarPagina();
  }

  // As opções saem das contas que existem, não da lista completa de bancos:
  // oferecer Sicredi sem nenhuma conta Sicredi só devolve tabela vazia.
  const opcoesBanco = React.useMemo(() => {
    const presentes = new Set(contas.map((conta) => conta.banco));
    return [...presentes]
      .map((valor) => ({ valor, rotulo: ROTULO_BANCO[valor] }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [contas]);

  const opcoesTipo = React.useMemo(() => {
    const presentes = new Set(contas.map((conta) => conta.tipo));
    return [...presentes]
      .map((valor) => ({ valor, rotulo: ROTULO_TIPO_CONTA[valor] }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [contas]);

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return contas.filter((conta) => {
      if (status === "ativos" && !conta.ativo) return false;
      if (status === "inativos" && conta.ativo) return false;
      if (banco !== "" && conta.banco !== banco) return false;
      if (tipo !== "" && conta.tipo !== tipo) return false;
      if (!dentroDaFaixaValor(conta.saldoAtual, saldoDe, saldoAte)) return false;
      // A busca cobre nome, agência e conta: quem procura "1234" está com o
      // extrato na mão, não lembrando o apelido da conta.
      if (
        termo &&
        !`${conta.nome} ${conta.agencia ?? ""} ${conta.conta ?? ""}`
          .toLowerCase()
          .includes(termo)
      ) {
        return false;
      }
      return true;
    });
  }, [contas, busca, status, banco, tipo, saldoDe, saldoAte]);

  function abrirEdicao(conta: ContaLista) {
    if (!podeEditar) return;
    setSelecionadaId(conta.id);
    setAberto(true);
  }

  // Filtros declarados aqui (e não numa FilterBar solta) para entrarem no menu
  // "Filtros" da tabela, junto com a personalização de colunas. Busca e status
  // seguem visíveis; banco, tipo e saldo nascem escondidos.
  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      elemento: (
        <FiltroBusca
          valor={busca}
          onValorChange={mudarBusca}
          placeholder="Buscar por nome, agência ou conta"
        />
      ),
    },
    {
      id: "status",
      rotulo: "Status",
      temValor: status !== "todos",
      onLimpar: () => mudarStatus(""),
      elemento: (
        <FiltroSelect
          valor={status === "todos" ? "" : status}
          onValorChange={mudarStatus}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todas"
        />
      ),
    },
    {
      id: "banco",
      rotulo: "Banco",
      ocultoPorPadrao: true,
      temValor: banco !== "",
      onLimpar: () => mudarBanco(""),
      elemento: (
        <FiltroSelect
          valor={banco}
          onValorChange={mudarBanco}
          opcoes={opcoesBanco}
          placeholder="Banco"
          todosRotulo="Todos os bancos"
        />
      ),
    },
    {
      id: "tipo",
      rotulo: "Tipo de conta",
      ocultoPorPadrao: true,
      temValor: tipo !== "",
      onLimpar: () => mudarTipo(""),
      elemento: (
        <FiltroSelect
          valor={tipo}
          onValorChange={mudarTipo}
          opcoes={opcoesTipo}
          placeholder="Tipo de conta"
          todosRotulo="Todos os tipos"
        />
      ),
    },
    {
      id: "saldo",
      rotulo: "Faixa de saldo",
      ocultoPorPadrao: true,
      temValor: saldoDe !== "" || saldoAte !== "",
      onLimpar: () => mudarSaldo("", ""),
      elemento: (
        <FiltroValor
          de={saldoDe}
          ate={saldoAte}
          onValorChange={mudarSaldo}
          rotulo="Saldo"
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        idTabela="financeiro.contas-bancarias"
        columns={colunas}
        data={dados}
        filtros={filtros}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
        onRowClick={podeEditar ? abrirEdicao : undefined}
        emptyState={
          // Existe conta cadastrada e nada na tela é filtro (a tela já abre
          // filtrada em "Ativas"), não cadastro vazio.
          contas.length > 0 ? (
            <EmptyState
              icone={Filter}
              titulo="Nenhuma conta com esses filtros"
              descricao="Existem contas cadastradas, mas nenhuma bate com os filtros escolhidos."
              className="border-none bg-transparent"
            />
          ) : (
            <EmptyState
              icone={Landmark}
              titulo="Nenhuma conta bancária cadastrada"
              descricao="Cadastre a primeira conta para registrar pagamentos e conciliar extratos"
              className="border-none bg-transparent"
            />
          )
        }
      />

      <ContasFormDrawer
        key={contaSelecionada?.id ?? "nenhuma"}
        aberto={aberto}
        onAbertoChange={setAberto}
        conta={contaSelecionada}
      />
    </div>
  );
}
