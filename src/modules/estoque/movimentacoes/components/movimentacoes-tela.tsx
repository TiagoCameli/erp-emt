"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeftRight, Boxes } from "lucide-react";

import {
  colunaData,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
} from "@/components/canonicos";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { casaBusca, textoPesquisavel } from "@/lib/busca";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { filtrarFacetado, selecao } from "@/modules/_shared/filtros-facetados";
import { ROTULO_ORIGEM } from "@/modules/estoque/components/posicao-tabela";
import { saldosAtuais, type SaldoAtualLinha } from "@/modules/estoque/movimentacoes/calculo";
import type { MovimentoLinha, TipoMovimento } from "@/modules/estoque/movimentacoes/queries";
import type { OrigemPosicao } from "@/modules/estoque/queries";

const ROTULO_LOCAL: Record<MovimentoLinha["localTipo"], string> = {
  deposito: "Depósito",
  tanque: "Tanque",
  pilha: "Pilha",
};

export const ROTULO_TIPO: Record<TipoMovimento, string> = {
  entrada: "Entrada",
  frete: "Entrada por frete",
  saida: "Saída",
  transferencia_entrada: "Transferência recebida",
  transferencia_saida: "Transferência enviada",
  abastecimento: "Abastecimento",
  esvaziamento: "Esvaziamento",
  consumo_os: "Saída para OS",
};

const SITUACOES_SALDO = ["com_saldo", "todos"] as const;
type SituacaoSaldo = (typeof SITUACOES_SALDO)[number];

function Quantidade({ valor, unidade, sinal = false }: { valor: number; unidade: string | null; sinal?: boolean }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        sinal && valor > 0 && "text-emerald-600 dark:text-emerald-400",
        sinal && valor < 0 && "text-destructive",
      )}
    >
      {sinal && valor > 0 ? "+" : ""}
      {formatarQuantidade(valor)}
      {unidade ? <span className="ml-1 text-muted-foreground">{unidade}</span> : null}
    </span>
  );
}

function NomeDoLocal({ nome, tipo }: { nome: string; tipo: MovimentoLinha["localTipo"] }) {
  return (
    <span>
      {nome}
      <span className="ml-1 text-muted-foreground">({ROTULO_LOCAL[tipo].toLowerCase()})</span>
    </span>
  );
}

function TituloSecao({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="mb-2 mt-6 first:mt-0">
      <h2 className="text-secao font-semibold">{titulo}</h2>
      <p className="text-detalhe text-muted-foreground">{descricao}</p>
    </div>
  );
}

export interface MovimentacoesTelaProps {
  movimentos: MovimentoLinha[];
}

/**
 * Estoque > Movimentações: o saldo atual de cada depósito, tanque e pilha e, embaixo, o
 * extrato de tudo o que entrou e saiu, com o saldo do local depois de cada movimento.
 * Clicar num saldo filtra o extrato por aquele local.
 */
export function MovimentacoesTela({ movimentos }: MovimentacoesTelaProps) {
  // Saldo atual
  const [buscaSaldo, setBuscaSaldo] = useFiltroSessao("saldo_busca", "");
  const [tipoLocalSaldo, setTipoLocalSaldo] = useFiltroSessao("saldo_tipo_local", "");
  const [situacaoSaldo, setSituacaoSaldo] = useFiltroSessao<SituacaoSaldo>(
    "saldo_situacao",
    "com_saldo",
    SITUACOES_SALDO,
  );
  // Extrato
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [de, setDe] = useFiltroSessao("de", "");
  const [ate, setAte] = useFiltroSessao("ate", "");
  const [local, setLocal] = useFiltroSessao("local", "");
  const [tipo, setTipo] = useFiltroSessao("tipo", "");
  const [origem, setOrigem] = useFiltroSessao("origem", "");

  const saldos = React.useMemo(() => saldosAtuais(movimentos), [movimentos]);

  const saldosFiltrados = React.useMemo(
    () =>
      filtrarFacetado(
        saldos,
        { tipoLocal: { selecionados: selecao(tipoLocalSaldo), chave: (linha) => linha.localTipo } },
        [
          (linha) => situacaoSaldo === "todos" || linha.saldo !== 0,
          (linha) =>
            casaBusca(
              textoPesquisavel(
                linha.localNome,
                ROTULO_LOCAL[linha.localTipo],
                linha.insumoNome,
                ROTULO_ORIGEM[linha.origem],
                linha.saldo,
                linha.unidade,
                { data: linha.ultimoMovimento },
              ),
              buscaSaldo,
            ),
        ],
      ),
    [saldos, tipoLocalSaldo, situacaoSaldo, buscaSaldo],
  );

  const { linhas: filtrados, opcoes } = React.useMemo(
    () =>
      filtrarFacetado(
        movimentos,
        {
          local: { selecionados: selecao(local), chave: (movimento) => movimento.localId },
          tipo: { selecionados: selecao(tipo), chave: (movimento) => movimento.tipo },
          origem: { selecionados: selecao(origem), chave: (movimento) => movimento.origem },
        },
        [
          (movimento) => (de === "" || movimento.data >= de) && (ate === "" || movimento.data <= ate),
          (movimento) =>
            casaBusca(
              textoPesquisavel(
                movimento.localNome,
                movimento.insumoNome,
                ROTULO_TIPO[movimento.tipo],
                movimento.referencia,
                movimento.quantidade,
                movimento.unidade,
                { data: movimento.data },
              ),
              busca,
            ),
        ],
      ),
    [movimentos, local, tipo, origem, de, ate, busca],
  );

  const locais = React.useMemo(() => {
    const vistos = new Map<string, string>();
    for (const movimento of movimentos) {
      vistos.set(movimento.localId, `${movimento.localNome} (${ROTULO_LOCAL[movimento.localTipo].toLowerCase()})`);
    }
    return [...vistos]
      .map(([valor, rotulo]) => ({ valor, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [movimentos]);

  const colunasSaldo = React.useMemo<ColumnDef<SaldoAtualLinha, unknown>[]>(
    () => [
      {
        accessorKey: "localNome",
        header: "Local",
        size: 260,
        meta: { celular: "titulo" },
        cell: ({ row }) => (
          <span className="font-medium">
            <NomeDoLocal nome={row.original.localNome} tipo={row.original.localTipo} />
          </span>
        ),
      },
      { accessorKey: "insumoNome", header: "Insumo", size: 240 },
      {
        accessorKey: "origem",
        header: "Tipo",
        size: 130,
        cell: ({ row }) => ROTULO_ORIGEM[row.original.origem],
      },
      {
        accessorKey: "saldo",
        header: "Saldo atual",
        size: 150,
        meta: { alinharDireita: true, atomico: true, celular: "valor" },
        cell: ({ row }) => <Quantidade valor={row.original.saldo} unidade={row.original.unidade} />,
      },
      colunaData<SaldoAtualLinha>("ultimoMovimento", "Último movimento", formatarData),
      {
        accessorKey: "movimentos",
        header: "Movimentos",
        size: 120,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <span className="tabular-nums">{formatarQuantidade(row.original.movimentos)}</span>,
      },
    ],
    [],
  );

  const colunas = React.useMemo<ColumnDef<MovimentoLinha, unknown>[]>(
    () => [
      colunaData<MovimentoLinha>("data", "Data", formatarData),
      {
        accessorKey: "tipo",
        header: "Movimento",
        size: 190,
        meta: { celular: "titulo" },
        cell: ({ row }) => <span className="font-medium">{ROTULO_TIPO[row.original.tipo]}</span>,
      },
      {
        accessorKey: "localNome",
        header: "Local",
        size: 240,
        cell: ({ row }) => <NomeDoLocal nome={row.original.localNome} tipo={row.original.localTipo} />,
      },
      {
        accessorKey: "insumoNome",
        header: "Insumo",
        size: 220,
        cell: ({ row }) => row.original.insumoNome ?? <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "quantidade",
        header: "Quantidade",
        size: 140,
        meta: { alinharDireita: true, atomico: true, celular: "valor" },
        cell: ({ row }) => <Quantidade valor={row.original.quantidade} unidade={row.original.unidade} sinal />,
      },
      {
        accessorKey: "saldo",
        header: "Saldo depois",
        size: 140,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <Quantidade valor={row.original.saldo} unidade={row.original.unidade} />,
      },
      {
        accessorKey: "referencia",
        header: "Referência",
        size: 320,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.referencia ?? ""}</span>,
      },
    ],
    [],
  );

  return (
    <>
      <TituloSecao titulo="Saldo atual" descricao="Um saldo por local e insumo; clique na linha para ver as movimentações do local" />
      <DataTable
        idTabela="estoque.movimentacoes.saldos"
        columns={colunasSaldo}
        data={saldosFiltrados.linhas}
        onRowClick={(linha) => setLocal(linha.localId)}
        filtros={[
          {
            id: "saldo_busca",
            rotulo: "Busca",
            fixo: true,
            temValor: buscaSaldo !== "",
            onLimpar: () => setBuscaSaldo(""),
            elemento: <FiltroBusca valor={buscaSaldo} onValorChange={setBuscaSaldo} placeholder="Local, insumo ou tipo" />,
          },
          {
            id: "saldo_tipo_local",
            rotulo: "Local",
            temValor: tipoLocalSaldo !== "",
            onLimpar: () => setTipoLocalSaldo(""),
            elemento: (
              <FiltroSelect
                valor={tipoLocalSaldo}
                onValorChange={setTipoLocalSaldo}
                opcoes={saldosFiltrados.opcoes(
                  "tipoLocal",
                  (Object.keys(ROTULO_LOCAL) as MovimentoLinha["localTipo"][]).map((valor) => ({
                    valor,
                    rotulo: ROTULO_LOCAL[valor],
                  })),
                )}
                placeholder="Depósito, tanque ou pilha"
                todosRotulo="Todos os locais"
              />
            ),
          },
          {
            id: "saldo_situacao",
            rotulo: "Saldo",
            temValor: situacaoSaldo !== "com_saldo",
            onLimpar: () => setSituacaoSaldo("com_saldo"),
            elemento: (
              <FiltroSelect
                valor={situacaoSaldo}
                onValorChange={(valor) => setSituacaoSaldo(valor === "todos" ? "todos" : "com_saldo")}
                opcoes={[
                  { valor: "com_saldo", rotulo: "Com saldo" },
                  { valor: "todos", rotulo: "Com saldo e zerados" },
                ]}
                obrigatorio
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={Boxes}
            titulo={saldos.length === 0 ? "Nada em estoque" : "Nenhum saldo encontrado"}
            descricao={saldos.length === 0 ? "Os saldos aparecem com a primeira entrada" : "Ajuste a busca ou os filtros"}
            className="border-none bg-transparent"
          />
        }
      />

      <TituloSecao
        titulo="Movimentações"
        descricao="Tudo o que entrou e saiu, da mais nova para a mais velha, com o saldo do local depois de cada uma"
      />
      <DataTable
        idTabela="estoque.movimentacoes"
        columns={colunas}
        data={filtrados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Local, insumo, referência ou data" />
            ),
          },
          {
            id: "periodo",
            rotulo: "Período",
            temValor: de !== "" || ate !== "",
            onLimpar: () => {
              setDe("");
              setAte("");
            },
            elemento: (
              <FiltroPeriodo
                de={de}
                ate={ate}
                onPeriodoChange={(novoDe, novoAte) => {
                  setDe(novoDe);
                  setAte(novoAte);
                }}
              />
            ),
          },
          {
            id: "local",
            rotulo: "Local",
            temValor: local !== "",
            onLimpar: () => setLocal(""),
            elemento: (
              <FiltroSelect
                valor={local}
                onValorChange={setLocal}
                opcoes={opcoes("local", locais)}
                placeholder="Local"
                todosRotulo="Todos os locais"
              />
            ),
          },
          {
            id: "tipo",
            rotulo: "Movimento",
            temValor: tipo !== "",
            onLimpar: () => setTipo(""),
            elemento: (
              <FiltroSelect
                valor={tipo}
                onValorChange={setTipo}
                opcoes={opcoes(
                  "tipo",
                  (Object.keys(ROTULO_TIPO) as TipoMovimento[]).map((valor) => ({ valor, rotulo: ROTULO_TIPO[valor] })),
                )}
                placeholder="Movimento"
                todosRotulo="Todos os movimentos"
              />
            ),
          },
          {
            id: "origem",
            rotulo: "Tipo",
            temValor: origem !== "",
            onLimpar: () => setOrigem(""),
            elemento: (
              <FiltroSelect
                valor={origem}
                onValorChange={setOrigem}
                opcoes={opcoes(
                  "origem",
                  (Object.keys(ROTULO_ORIGEM) as OrigemPosicao[]).map((valor) => ({ valor, rotulo: ROTULO_ORIGEM[valor] })),
                )}
                placeholder="Tipo"
                todosRotulo="Todos os tipos"
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={ArrowLeftRight}
            titulo={movimentos.length === 0 ? "Nenhuma movimentação" : "Nenhuma movimentação encontrada"}
            descricao={
              movimentos.length === 0
                ? "Entradas, saídas e transferências aparecem aqui"
                : "Ajuste a busca, o período ou os filtros"
            }
            className="border-none bg-transparent"
          />
        }
      />
    </>
  );
}
