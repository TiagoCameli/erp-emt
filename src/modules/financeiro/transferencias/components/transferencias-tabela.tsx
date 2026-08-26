"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeftRight, Filter } from "lucide-react";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  FiltroValor,
  MoneyText,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { formatarData } from "@/lib/formatadores";
import {
  dentroDaFaixaValor,
  usePaginacaoCliente,
} from "@/modules/_shared/filtros-cliente";
import { excluirTransferencia } from "@/modules/financeiro/transferencias/actions";
import type {
  ContaOpcao,
  TransferenciaLista,
} from "@/modules/financeiro/transferencias/queries";
import { TransferenciaFormDrawer } from "./transferencia-form-drawer";

/**
 * Colunas da listagem.
 *
 * "Sai da origem" e "Entra no destino" são colunas separadas de propósito: elas
 * só diferem quando houve tarifa, e é exatamente aí que alguém conferindo o
 * extrato precisa enxergar a diferença sem abrir o registro.
 */
const colunas: ColumnDef<TransferenciaLista, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Número",
    size: 130,
    cell: ({ row }) => (
      <span className="codigo-doc">{row.original.numero}</span>
    ),
  },
  {
    accessorKey: "dataTransferencia",
    header: "Data",
    size: 110,
    cell: ({ row }) => formatarData(row.original.dataTransferencia),
  },
  {
    accessorKey: "contaOrigemNome",
    header: "De",
    size: 240,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.contaOrigemNome}</span>
    ),
  },
  {
    accessorKey: "contaDestinoNome",
    header: "Para",
    size: 240,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.contaDestinoNome}</span>
    ),
  },
  {
    accessorKey: "descricao",
    header: "Descrição",
    size: 260,
    cell: ({ row }) =>
      row.original.descricao ?? (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "totalSaida",
    header: "Sai da origem",
    size: 150,
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <MoneyText
        valor={row.original.totalSaida}
        className="font-semibold text-foreground"
      />
    ),
  },
  {
    accessorKey: "valor",
    header: "Entra no destino",
    size: 150,
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.valor} />,
  },
  {
    accessorKey: "tarifa",
    header: "Tarifa",
    size: 120,
    meta: { alinharDireita: true, ocultaPorPadrao: true },
    cell: ({ row }) =>
      row.original.tarifa > 0 ? (
        <MoneyText valor={row.original.tarifa} />
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
];

export interface TransferenciasTabelaProps {
  transferencias: TransferenciaLista[];
  contas: ContaOpcao[];
  podeEditar: boolean;
  podeExcluir: boolean;
}

/** Listagem de transferências entre contas, com filtros e edição no clique. */
export function TransferenciasTabela({
  transferencias,
  contas,
  podeEditar,
  podeExcluir,
}: TransferenciasTabelaProps) {
  const [selecionadaId, setSelecionadaId] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const [dialogExcluir, setDialogExcluir] = React.useState(false);
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();

  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [conta, setConta] = useFiltroSessao("conta", "");
  const [de, setDe] = useFiltroSessao("de", "");
  const [ate, setAte] = useFiltroSessao("ate", "");
  const [valorDe, setValorDe] = useFiltroSessao("valorDe", "");
  const [valorAte, setValorAte] = useFiltroSessao("valorAte", "");
  // Origem e destino separados do filtro "Conta" (que pega os dois lados de
  // propósito). Com os três, dá para perguntar "o que saiu da CAIXA", "o que
  // entrou no BB" e "da CAIXA PARA o BB" -- esta última era impossível antes,
  // porque um filtro que casa qualquer lado não expressa um PAR.
  const [origem, setOrigem] = useFiltroSessao("origem", "");
  const [destino, setDestino] = useFiltroSessao("destino", "");
  const [criadoDe, setCriadoDe] = useFiltroSessao("criadoDe", "");
  const [criadoAte, setCriadoAte] = useFiltroSessao("criadoAte", "");

  // Deriva da prop para refletir a edição depois do revalidatePath.
  const selecionada =
    transferencias.find((linha) => linha.id === selecionadaId) ?? null;

  function comZerar<T extends unknown[]>(fn: (...args: T) => void) {
    return (...args: T) => {
      fn(...args);
      zerarPagina();
    };
  }

  const mudarBusca = comZerar(setBusca);
  const mudarConta = comZerar(setConta);
  const mudarPeriodo = comZerar((novoDe: string, novoAte: string) => {
    setDe(novoDe);
    setAte(novoAte);
  });
  const mudarValor = comZerar((novoDe: string, novoAte: string) => {
    setValorDe(novoDe);
    setValorAte(novoAte);
  });
  const mudarOrigem = comZerar(setOrigem);
  const mudarDestino = comZerar(setDestino);
  const mudarCriado = comZerar((novoDe: string, novoAte: string) => {
    setCriadoDe(novoDe);
    setCriadoAte(novoAte);
  });

  // As opções saem das contas que aparecem nas transferências, não do cadastro
  // inteiro: oferecer uma conta que nunca transferiu só devolve tabela vazia.
  const opcoesConta = React.useMemo(() => {
    const presentes = new Map<string, string>();
    for (const linha of transferencias) {
      presentes.set(linha.contaOrigemId, linha.contaOrigemNome);
      presentes.set(linha.contaDestinoId, linha.contaDestinoNome);
    }
    return [...presentes.entries()]
      .map(([valor, rotulo]) => ({ valor, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [transferencias]);

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return transferencias.filter((linha) => {
      // O filtro de conta pega os DOIS lados: quem procura uma conta quer ver o
      // que entrou e o que saiu dela, não escolher um lado antes.
      if (
        conta !== "" &&
        linha.contaOrigemId !== conta &&
        linha.contaDestinoId !== conta
      ) {
        return false;
      }
      if (origem !== "" && linha.contaOrigemId !== origem) return false;
      if (destino !== "" && linha.contaDestinoId !== destino) return false;
      if (de !== "" && linha.dataTransferencia < de) return false;
      if (ate !== "" && linha.dataTransferencia > ate) return false;
      // `criadoEm` é timestamp; o filtro é por DIA. Comparar os 10 primeiros
      // caracteres é o corte certo: comparar a string inteira contra "2026-08-26"
      // deixaria de fora tudo que foi criado depois da meia-noite daquele dia.
      const diaCriacao = linha.criadoEm.slice(0, 10);
      if (criadoDe !== "" && diaCriacao < criadoDe) return false;
      if (criadoAte !== "" && diaCriacao > criadoAte) return false;
      if (!dentroDaFaixaValor(linha.valor, valorDe, valorAte)) return false;
      if (
        termo &&
        !`${linha.numero} ${linha.contaOrigemNome} ${linha.contaDestinoNome} ${linha.descricao ?? ""}`
          .toLowerCase()
          .includes(termo)
      ) {
        return false;
      }
      return true;
    });
  }, [
    transferencias,
    busca,
    conta,
    origem,
    destino,
    de,
    ate,
    valorDe,
    valorAte,
    criadoDe,
    criadoAte,
  ]);

  const totais = React.useMemo(
    () =>
      dados.reduce(
        (soma, linha) => ({
          // Centavos inteiros: somar reais em ponto flutuante numa lista de
          // milhares de linhas erra o último centavo do rodapé.
          valor: soma.valor + Math.round(linha.valor * 100),
          tarifa: soma.tarifa + Math.round(linha.tarifa * 100),
        }),
        { valor: 0, tarifa: 0 },
      ),
    [dados],
  );

  function abrirEdicao(linha: TransferenciaLista) {
    if (!podeEditar) return;
    setSelecionadaId(linha.id);
    setAberto(true);
  }

  async function aoExcluir(motivo?: string) {
    if (!selecionada) return;
    const resultado = await excluirTransferencia(selecionada.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Transferência excluída");
    setDialogExcluir(false);
    setAberto(false);
    setSelecionadaId(null);
  }

  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      temValor: busca !== "",
      onLimpar: () => mudarBusca(""),
      elemento: (
        <FiltroBusca
          valor={busca}
          onValorChange={mudarBusca}
          placeholder="Buscar por número, conta ou descrição"
        />
      ),
    },
    {
      id: "conta",
      rotulo: "Conta",
      temValor: conta !== "",
      onLimpar: () => mudarConta(""),
      elemento: (
        <FiltroSelect
          valor={conta}
          onValorChange={mudarConta}
          opcoes={opcoesConta}
          placeholder="Conta"
          todosRotulo="Todas as contas"
        />
      ),
    },
    {
      id: "periodo",
      rotulo: "Período",
      temValor: de !== "" || ate !== "",
      onLimpar: () => mudarPeriodo("", ""),
      elemento: (
        <FiltroPeriodo
          de={de}
          ate={ate}
          onPeriodoChange={mudarPeriodo}
          rotulo="Transferência"
        />
      ),
    },
    {
      id: "origem",
      rotulo: "Conta de origem",
      ocultoPorPadrao: true,
      temValor: origem !== "",
      onLimpar: () => mudarOrigem(""),
      elemento: (
        <FiltroSelect
          valor={origem}
          onValorChange={mudarOrigem}
          opcoes={opcoesConta}
          placeholder="Saiu de"
          todosRotulo="Qualquer origem"
        />
      ),
    },
    {
      id: "destino",
      rotulo: "Conta de destino",
      ocultoPorPadrao: true,
      temValor: destino !== "",
      onLimpar: () => mudarDestino(""),
      elemento: (
        <FiltroSelect
          valor={destino}
          onValorChange={mudarDestino}
          opcoes={opcoesConta}
          placeholder="Entrou em"
          todosRotulo="Qualquer destino"
        />
      ),
    },
    {
      id: "criacao",
      rotulo: "Período de criação",
      ocultoPorPadrao: true,
      temValor: criadoDe !== "" || criadoAte !== "",
      onLimpar: () => mudarCriado("", ""),
      elemento: (
        <FiltroPeriodo
          de={criadoDe}
          ate={criadoAte}
          onPeriodoChange={mudarCriado}
          rotulo="Registro"
        />
      ),
    },
    {
      id: "valor",
      rotulo: "Faixa de valor",
      ocultoPorPadrao: true,
      temValor: valorDe !== "" || valorAte !== "",
      onLimpar: () => mudarValor("", ""),
      elemento: (
        <FiltroValor
          de={valorDe}
          ate={valorAte}
          onValorChange={mudarValor}
          rotulo="Valor"
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        idTabela="financeiro.transferencias"
        columns={colunas}
        data={dados}
        filtros={filtros}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
        onRowClick={podeEditar ? abrirEdicao : undefined}
        emptyState={
          transferencias.length > 0 ? (
            <EmptyState
              icone={Filter}
              titulo="Nenhuma transferência com esses filtros"
              descricao="Existem transferências registradas, mas nenhuma bate com os filtros escolhidos."
              className="border-none bg-transparent"
            />
          ) : (
            <EmptyState
              icone={ArrowLeftRight}
              titulo="Nenhuma transferência registrada"
              descricao="Registre a primeira movimentação de dinheiro entre as contas da empresa"
              className="border-none bg-transparent"
            />
          )
        }
      />

      {dados.length > 0 ? (
        <p className="text-right text-legenda text-muted-foreground">
          {dados.length}{" "}
          {dados.length === 1 ? "transferência" : "transferências"} somando{" "}
          <MoneyText
            valor={totais.valor / 100}
            className="font-medium text-foreground"
          />
          {totais.tarifa > 0 ? (
            <>
              {" "}
              e{" "}
              <MoneyText
                valor={totais.tarifa / 100}
                className="font-medium text-foreground"
              />{" "}
              de tarifa
            </>
          ) : null}
        </p>
      ) : null}

      <TransferenciaFormDrawer
        key={selecionada?.id ?? "nenhuma"}
        aberto={aberto}
        onAbertoChange={setAberto}
        transferencia={selecionada}
        contas={contas}
        onSolicitarExclusao={
          podeExcluir ? () => setDialogExcluir(true) : undefined
        }
      />

      {podeExcluir && selecionada ? (
        <ConfirmDialog
          aberto={dialogExcluir}
          onAbertoChange={setDialogExcluir}
          titulo="Excluir transferência"
          descricao={`A ${selecionada.numero} vai para a lixeira e o dinheiro volta a contar nas duas contas.`}
          exigeMotivo
          textoConfirmar="Excluir"
          variante="destrutivo"
          onConfirmar={aoExcluir}
        />
      ) : null}
    </div>
  );
}
