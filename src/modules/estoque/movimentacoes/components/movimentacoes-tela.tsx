"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, ArrowLeftRight, Boxes } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  colunaData,
  Combobox,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  GradeKpis,
  KPICard,
} from "@/components/canonicos";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { Button } from "@/components/ui/button";
import { casaBusca, textoPesquisavel } from "@/lib/busca";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { filtrarFacetado, selecao } from "@/modules/_shared/filtros-facetados";
import { ROTULO_ORIGEM } from "@/modules/estoque/components/posicao-tabela";
import { resumoDoLocal, saldosAtuais, type SaldoAtualLinha } from "@/modules/estoque/movimentacoes/calculo";
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

/** O local aberto vive na URL: o link da aba Pilhas e da aba Tanques cai direto nele. */
const PARAM_LOCAL = "local";

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
 * Estoque > Movimentações. Escolhe-se o local (pilha, depósito ou tanque) no topo, ou
 * clicando no saldo dele, e a tela mostra o saldo de agora, quanto entrou e saiu, e o
 * extrato só daquele local, com o saldo depois de cada movimento. Sem local escolhido,
 * mostra o saldo de todos e o extrato geral.
 */
export function MovimentacoesTela({ movimentos }: MovimentacoesTelaProps) {
  // O local é navegação, não filtro: fica na URL, fora do "Limpar filtros".
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const localAberto = searchParams.get(PARAM_LOCAL) ?? "";
  const abrirLocal = React.useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id === "") params.delete(PARAM_LOCAL);
      else params.set(PARAM_LOCAL, id);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Saldo atual (só sem local aberto)
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
  const [tipo, setTipo] = useFiltroSessao("tipo", "");
  const [origem, setOrigem] = useFiltroSessao("origem", "");

  const saldos = React.useMemo(() => saldosAtuais(movimentos), [movimentos]);

  const locais = React.useMemo(() => {
    const vistos = new Map<string, { valor: string; rotulo: string }>();
    for (const linha of saldos) {
      vistos.set(linha.localId, {
        valor: linha.localId,
        rotulo: `${linha.localNome} (${ROTULO_LOCAL[linha.localTipo].toLowerCase()})`,
      });
    }
    return [...vistos.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [saldos]);

  const saldosDoLocal = React.useMemo(
    () => saldos.filter((linha) => linha.localId === localAberto),
    [saldos, localAberto],
  );
  const doLocal = React.useMemo(
    () => (localAberto === "" ? movimentos : movimentos.filter((movimento) => movimento.localId === localAberto)),
    [movimentos, localAberto],
  );

  const saldosFiltrados = React.useMemo(
    () =>
      filtrarFacetado(
        saldos,
        {
          tipoLocal: {
            selecionados: selecao(tipoLocalSaldo),
            chave: (linha) => linha.localTipo,
          },
        },
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
        doLocal,
        {
          tipo: {
            selecionados: selecao(tipo),
            chave: (movimento) => movimento.tipo,
          },
          origem: {
            selecionados: selecao(origem),
            chave: (movimento) => movimento.origem,
          },
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
    [doLocal, tipo, origem, de, ate, busca],
  );

  // Entrou e saiu no período e nos filtros escolhidos; o saldo é sempre o de agora.
  const resumo = React.useMemo(() => resumoDoLocal(filtrados), [filtrados]);
  const temFiltroNoExtrato = busca !== "" || de !== "" || ate !== "" || tipo !== "" || origem !== "";

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

  const primeiroSaldo = saldosDoLocal[0];
  const nomeAberto = primeiroSaldo
    ? `${primeiroSaldo.localNome} (${ROTULO_LOCAL[primeiroSaldo.localTipo].toLowerCase()})`
    : "";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex w-full max-w-md flex-col gap-1">
          <span className="text-legenda font-semibold tracking-wide text-muted-foreground uppercase">
            Pilha, depósito ou tanque
          </span>
          <Combobox
            valor={localAberto}
            onValorChange={abrirLocal}
            opcoes={locais}
            limpavel
            placeholder="Todos os locais"
            buscaPlaceholder="Buscar local"
            vazioTexto="Nenhum local com movimentação"
          />
        </div>
        {localAberto !== "" ? (
          <Button type="button" variant="outline" size="sm" onClick={() => abrirLocal("")}>
            <ArrowLeft />
            Todos os locais
          </Button>
        ) : null}
      </div>

      {localAberto !== "" ? (
        primeiroSaldo ? (
          <>
            <TituloSecao
              titulo={nomeAberto}
              descricao={`${ROTULO_ORIGEM[primeiroSaldo.origem]} · último movimento em ${formatarData(primeiroSaldo.ultimoMovimento)}`}
            />
            <GradeKpis id="estoque.movimentacoes.local" titulo="Resumo do local" className="mb-4">
              {saldosDoLocal.map((linha) => (
                <KPICard
                  key={linha.chave}
                  idCard={`saldo-${linha.chave}`}
                  titulo={`Saldo atual · ${linha.insumoNome}`}
                  valor={<Quantidade valor={linha.saldo} unidade={linha.unidade} />}
                />
              ))}
              {/* Entrou e saiu só somam com um insumo só: num depósito com vários, misturaria unidades. */}
              {saldosDoLocal.length === 1 ? (
                <>
                  <KPICard
                    idCard="entrou"
                    titulo={temFiltroNoExtrato ? "Entrou (nos filtros)" : "Entrou"}
                    valor={<Quantidade valor={resumo.entrou} unidade={primeiroSaldo.unidade} />}
                  />
                  <KPICard
                    idCard="saiu"
                    titulo={temFiltroNoExtrato ? "Saiu (nos filtros)" : "Saiu"}
                    valor={<Quantidade valor={resumo.saiu} unidade={primeiroSaldo.unidade} />}
                  />
                </>
              ) : null}
              <KPICard
                idCard="movimentos"
                titulo={temFiltroNoExtrato ? "Movimentos (nos filtros)" : "Movimentos"}
                valor={<span className="tabular-nums">{formatarQuantidade(resumo.movimentos)}</span>}
              />
            </GradeKpis>
          </>
        ) : (
          <EmptyState
            icone={ArrowLeftRight}
            titulo="Nenhuma movimentação neste local"
            descricao="O local ainda não teve entrada nem saída. Escolha outro ou volte para todos os locais"
            className="mb-4"
          />
        )
      ) : (
        <>
          <TituloSecao
            titulo="Saldo atual"
            descricao="Um saldo por local e insumo; clique na linha para abrir o local"
          />
          <DataTable
            idTabela="estoque.movimentacoes.saldos"
            columns={colunasSaldo}
            data={saldosFiltrados.linhas}
            onRowClick={(linha) => abrirLocal(linha.localId)}
            filtros={[
              {
                id: "saldo_busca",
                rotulo: "Busca",
                fixo: true,
                temValor: buscaSaldo !== "",
                onLimpar: () => setBuscaSaldo(""),
                elemento: (
                  <FiltroBusca valor={buscaSaldo} onValorChange={setBuscaSaldo} placeholder="Local, insumo ou tipo" />
                ),
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
                descricao={
                  saldos.length === 0 ? "Os saldos aparecem com a primeira entrada" : "Ajuste a busca ou os filtros"
                }
                className="border-none bg-transparent"
              />
            }
          />
        </>
      )}

      {localAberto === "" || primeiroSaldo ? (
        <>
          <TituloSecao
            titulo={localAberto === "" ? "Movimentações de todos os locais" : "Movimentações do local"}
            descricao="Da mais nova para a mais velha, com o saldo do local depois de cada uma"
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
                  <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Insumo, referência ou data" />
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
                      (Object.keys(ROTULO_TIPO) as TipoMovimento[]).map((valor) => ({
                        valor,
                        rotulo: ROTULO_TIPO[valor],
                      })),
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
                      (Object.keys(ROTULO_ORIGEM) as OrigemPosicao[]).map((valor) => ({
                        valor,
                        rotulo: ROTULO_ORIGEM[valor],
                      })),
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
                titulo={doLocal.length === 0 ? "Nenhuma movimentação" : "Nenhuma movimentação encontrada"}
                descricao={
                  doLocal.length === 0
                    ? "Entradas, saídas e transferências aparecem aqui"
                    : "Ajuste a busca, o período ou os filtros"
                }
                className="border-none bg-transparent"
              />
            }
          />
        </>
      ) : null}
    </>
  );
}
