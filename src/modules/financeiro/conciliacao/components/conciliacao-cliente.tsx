"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowDownRight,
  ArrowUpRight,
  Filter,
  Link2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  CelulaVazia,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  FiltroValor,
  GradeKpis,
  KPICard,
  MoneyText,
  StatusBadge,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import {
  dentroDaFaixaValor,
  dentroDoPeriodo,
  usePaginacaoCliente,
} from "@/modules/financeiro/_shared/filtros-cliente";
import {
  buscarSugestoes,
  desconciliar,
} from "@/modules/financeiro/conciliacao/actions";
import type {
  ContaBancariaOpcao,
  ExtratoLista,
  ParcelaVinculada,
  TransacaoLista,
} from "@/modules/financeiro/conciliacao/queries";
import { ConciliarDialog } from "./conciliar-dialog";
import { ImportarOfxDialog } from "./importar-ofx-dialog";

type FiltroConciliacao = "" | "conciliada" | "pendente";

export interface ConciliacaoClienteProps {
  transacoes: TransacaoLista[];
  extratos: ExtratoLista[];
  contas: ContaBancariaOpcao[];
  /** Conta atualmente filtrada via URL ("" = todas). */
  contaId: string;
  podeImportar: boolean;
  podeConciliar: boolean;
  podeDesconciliar: boolean;
}

/** Valor com sinal e cor: crédito verde (+), débito vermelho (-). */
function ValorMovimento({ transacao }: { transacao: TransacaoLista }) {
  const credito = transacao.tipo === "credito";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums",
        credito ? "text-status-aprovado" : "text-status-rejeitado",
      )}
    >
      {credito ? (
        <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <ArrowDownRight className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      <MoneyText valor={Math.abs(transacao.valor)} />
    </span>
  );
}

/**
 * Tela de conciliação: importa OFX, lista as transações do extrato com o
 * valor por sinal/cor, e casa cada transação não conciliada com uma parcela
 * paga (ou desfaz a conciliação). KPIs no topo resumem o estado.
 */
export function ConciliacaoCliente({
  transacoes,
  extratos,
  contas,
  contaId,
  podeImportar,
  podeConciliar,
  podeDesconciliar,
}: ConciliacaoClienteProps) {
  const router = useRouter();
  const [importarAberto, setImportarAberto] = React.useState(false);
  const [conciliarAberto, setConciliarAberto] = React.useState(false);
  const [transacaoAtiva, setTransacaoAtiva] =
    React.useState<TransacaoLista | null>(null);
  const [sugestoes, setSugestoes] = React.useState<ParcelaVinculada[]>([]);
  const [carregandoSugestoes, setCarregandoSugestoes] = React.useState(false);
  const [desconciliarAlvo, setDesconciliarAlvo] =
    React.useState<TransacaoLista | null>(null);
  const [conciliacao, setConciliacao] = React.useState<FiltroConciliacao>("");
  const [busca, setBusca] = React.useState("");
  const [extratoId, setExtratoId] = React.useState("");
  const [tipo, setTipo] = React.useState("");
  const [dataDe, setDataDe] = React.useState("");
  const [dataAte, setDataAte] = React.useState("");
  const [valorDe, setValorDe] = React.useState("");
  const [valorAte, setValorAte] = React.useState("");
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();

  const opcoesConta = React.useMemo(
    () =>
      contas.map((conta) => ({
        valor: conta.id,
        rotulo: `${conta.nome} (${conta.bancoRotulo})`,
      })),
    [contas],
  );

  // Só os extratos da conta em foco: oferecer extrato de outra conta devolveria
  // tabela vazia, porque a listagem já vem filtrada por conta no servidor.
  const opcoesExtrato = React.useMemo(
    () =>
      extratos
        .filter(
          (extrato) => contaId === "" || extrato.contaBancariaId === contaId,
        )
        .map((extrato) => ({
          valor: extrato.id,
          rotulo: [
            extrato.nomeArquivo ?? extrato.contaBancariaNome,
            extrato.periodoInicio && extrato.periodoFim
              ? `${formatarData(extrato.periodoInicio)} a ${formatarData(extrato.periodoFim)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
        })),
    [extratos, contaId],
  );

  // Trocar filtro volta para a primeira página, senão a pessoa filtra e cai
  // numa página vazia.
  function mudarBusca(valor: string) {
    setBusca(valor);
    zerarPagina();
  }
  function mudarConciliacao(valor: string) {
    setConciliacao(valor as FiltroConciliacao);
    zerarPagina();
  }
  function mudarExtrato(valor: string) {
    setExtratoId(valor);
    zerarPagina();
  }
  function mudarTipo(valor: string) {
    setTipo(valor);
    zerarPagina();
  }
  function mudarPeriodo(de: string, ate: string) {
    setDataDe(de);
    setDataAte(ate);
    zerarPagina();
  }
  function mudarValor(de: string, ate: string) {
    setValorDe(de);
    setValorAte(ate);
    zerarPagina();
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return transacoes.filter((transacao) => {
      if (conciliacao === "conciliada" && !transacao.conciliada) return false;
      if (conciliacao === "pendente" && transacao.conciliada) return false;
      if (extratoId !== "" && transacao.extratoId !== extratoId) return false;
      if (tipo !== "" && transacao.tipo !== tipo) return false;
      if (!dentroDoPeriodo(transacao.dataMovimento, dataDe, dataAte)) {
        return false;
      }
      // Débito vem negativo do OFX: a faixa compara o módulo, que é o número
      // que a pessoa lê na tela.
      if (
        !dentroDaFaixaValor(Math.abs(transacao.valor), valorDe, valorAte)
      ) {
        return false;
      }
      if (termo !== "") {
        const parcela = transacao.parcela;
        const alvo = `${transacao.memo ?? ""} ${parcela?.lancamentoNumero ?? ""} ${
          parcela?.lancamentoDescricao ?? ""
        } ${parcela?.fornecedorNome ?? ""}`;
        if (!alvo.toLowerCase().includes(termo)) return false;
      }
      return true;
    });
  }, [
    transacoes,
    conciliacao,
    extratoId,
    tipo,
    dataDe,
    dataAte,
    valorDe,
    valorAte,
    busca,
  ]);

  const filtrando =
    contaId !== "" ||
    conciliacao !== "" ||
    extratoId !== "" ||
    tipo !== "" ||
    dataDe !== "" ||
    dataAte !== "" ||
    valorDe !== "" ||
    valorAte !== "" ||
    busca.trim() !== "";

  const totalTransacoes = transacoes.length;
  const totalConciliadas = transacoes.filter((t) => t.conciliada).length;
  const totalPendentes = totalTransacoes - totalConciliadas;

  /**
   * A conta é o único filtro server-side desta tela (a consulta traz só as
   * transações dela). Trocar a conta larga o extrato escolhido, que pertence à
   * conta antiga, e volta para a primeira página.
   */
  function trocarConta(valor: string) {
    const params = new URLSearchParams(window.location.search);
    if (valor) params.set("conta", valor);
    else params.delete("conta");
    const query = params.toString();
    setExtratoId("");
    zerarPagina();
    router.replace(query ? `?${query}` : "?", { scroll: false });
  }

  function abrirConciliar(transacao: TransacaoLista) {
    setTransacaoAtiva(transacao);
    setSugestoes([]);
    setCarregandoSugestoes(true);
    setConciliarAberto(true);
    void buscarSugestoes({
      contaBancariaId: transacao.contaBancariaId,
      valor: transacao.valor,
      dataMovimento: transacao.dataMovimento,
    }).then((resposta) => {
      if ("erro" in resposta) {
        toast.error(resposta.erro);
        setSugestoes([]);
      } else {
        setSugestoes(resposta.sugestoes);
      }
      setCarregandoSugestoes(false);
    });
  }

  async function confirmarDesconciliar() {
    if (!desconciliarAlvo) return;
    const resposta = await desconciliar(desconciliarAlvo.id);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    toast.success("Conciliação desfeita");
    setDesconciliarAlvo(null);
    router.refresh();
  }

  const colunas: ColumnDef<TransacaoLista, unknown>[] = React.useMemo(
    () => [
      {
        accessorKey: "dataMovimento",
        header: "Data",
        size: 120,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.dataMovimento)}
          </span>
        ),
      },
      {
        // O histórico é o texto que identifica a transação no extrato: é a
        // coluna mais larga da tela. Quem corta com reticências e põe o texto
        // inteiro no tooltip é a DataTable, então a célula devolve o texto cru
        // (o `max-w-md` que estava aqui não valia nada: a coluna tinha 150px).
        accessorKey: "memo",
        header: "Histórico",
        size: 380,
        cell: ({ row }) => row.original.memo ?? <CelulaVazia />,
      },
      {
        accessorKey: "valor",
        header: "Valor",
        size: 140,
        meta: { alinharDireita: true },
        cell: ({ row }) => <ValorMovimento transacao={row.original} />,
      },
      {
        id: "conciliada",
        header: "Conciliada",
        // Duas linhas na mesma célula: sem `naoTruncar` a DataTable embrulha
        // tudo num `truncate`, e é a segunda linha, o lançamento conciliado,
        // que o Tiago perde. Quem corta o texto longo é a legenda, abaixo.
        // A largura acompanha o conteúdo, que é mais largo que o cabeçalho.
        size: 260,
        meta: { naoTruncar: true },
        cell: ({ row }) => {
          const transacao = row.original;
          if (!transacao.conciliada || !transacao.parcela) {
            return (
              <StatusBadge
                status="pendente_aprovacao"
                rotulo="Não conciliada"
              />
            );
          }
          const parcela = transacao.parcela;
          const referencia = `${
            parcela.lancamentoNumero ? `${parcela.lancamentoNumero} · ` : ""
          }${parcela.lancamentoDescricao} (parcela ${parcela.numeroParcela})`;
          return (
            // items-center porque o badge é w-fit: sem isso ele encosta na
            // esquerda e desalinha do cabeçalho centralizado.
            <div className="flex flex-col items-center gap-0.5">
              <StatusBadge status="aprovado" rotulo="Conciliada" />
              {/* A descrição do lançamento é texto livre, então o corte com
                  reticências mora aqui, e o texto inteiro fica no tooltip. */}
              <span
                className="max-w-full truncate text-legenda text-muted-foreground"
                title={referencia}
              >
                {referencia}
              </span>
            </div>
          );
        },
      },
      {
        id: "acoes",
        header: "",
        size: 150,
        meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
        cell: ({ row }) => {
          const transacao = row.original;
          if (transacao.conciliada) {
            if (!podeDesconciliar) return null;
            return (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDesconciliarAlvo(transacao)}
              >
                <X />
                Desconciliar
              </Button>
            );
          }
          if (!podeConciliar) return null;
          return (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => abrirConciliar(transacao)}
            >
              <Link2 />
              Conciliar
            </Button>
          );
        },
      },
    ],
    [podeConciliar, podeDesconciliar],
  );

  // Filtros declarados aqui (e não numa FilterBar solta) para entrarem no menu
  // "Filtros" da tabela, junto com a personalização de colunas. Conta e situação
  // seguem visíveis; a busca entra visível porque é a busca principal da tela, e
  // extrato, tipo, período e valor nascem escondidos.
  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      elemento: (
        <FiltroBusca
          valor={busca}
          onValorChange={mudarBusca}
          placeholder="Buscar por histórico ou lançamento conciliado"
        />
      ),
    },
    {
      id: "conta",
      rotulo: "Conta bancária",
      temValor: contaId !== "",
      onLimpar: () => trocarConta(""),
      elemento: (
        <FiltroSelect
          valor={contaId}
          onValorChange={trocarConta}
          opcoes={opcoesConta}
          placeholder="Conta bancária"
          todosRotulo="Todas as contas"
          className="max-w-56"
        />
      ),
    },
    {
      id: "situacao",
      rotulo: "Situação",
      temValor: conciliacao !== "",
      onLimpar: () => mudarConciliacao(""),
      elemento: (
        <FiltroSelect
          valor={conciliacao}
          onValorChange={mudarConciliacao}
          opcoes={[
            { valor: "conciliada", rotulo: "Conciliadas" },
            { valor: "pendente", rotulo: "Pendentes" },
          ]}
          placeholder="Situação"
          todosRotulo="Todas as situações"
        />
      ),
    },
    {
      id: "extrato",
      rotulo: "Extrato importado",
      ocultoPorPadrao: true,
      temValor: extratoId !== "",
      onLimpar: () => mudarExtrato(""),
      elemento: (
        <FiltroSelect
          valor={extratoId}
          onValorChange={mudarExtrato}
          opcoes={opcoesExtrato}
          placeholder="Extrato importado"
          todosRotulo="Todos os extratos"
          className="max-w-64"
        />
      ),
    },
    {
      id: "tipo",
      rotulo: "Crédito ou débito",
      ocultoPorPadrao: true,
      temValor: tipo !== "",
      onLimpar: () => mudarTipo(""),
      elemento: (
        <FiltroSelect
          valor={tipo}
          onValorChange={mudarTipo}
          opcoes={[
            { valor: "credito", rotulo: "Créditos (entradas)" },
            { valor: "debito", rotulo: "Débitos (saídas)" },
          ]}
          placeholder="Crédito ou débito"
          todosRotulo="Créditos e débitos"
        />
      ),
    },
    {
      id: "periodo",
      rotulo: "Período do movimento",
      ocultoPorPadrao: true,
      temValor: dataDe !== "" || dataAte !== "",
      onLimpar: () => mudarPeriodo("", ""),
      elemento: (
        <FiltroPeriodo
          de={dataDe}
          ate={dataAte}
          onPeriodoChange={mudarPeriodo}
          rotulo="Movimento"
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
    <div className="flex flex-col gap-4">
      <GradeKpis>
        <KPICard titulo="Transações" valor={totalTransacoes} />
        <KPICard
          titulo="Conciliadas"
          valor={totalConciliadas}
          detalhe={
            totalTransacoes > 0
              ? `${Math.round((totalConciliadas / totalTransacoes) * 100)}% do extrato`
              : undefined
          }
        />
        <KPICard titulo="Pendentes" valor={totalPendentes} />
      </GradeKpis>

      <DataTable
        idTabela="financeiro.conciliacao"
        columns={colunas}
        data={dados}
        filtros={filtros}
        pageIndex={paginacao.pageIndex}
        pageSize={paginacao.pageSize}
        onPaginationChange={setPaginacao}
        toolbar={
          podeImportar ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setImportarAberto(true)}
            >
              <Upload />
              Importar OFX
            </Button>
          ) : undefined
        }
        emptyState={
          extratos.length === 0 ? (
            <EmptyState
              icone={Upload}
              titulo="Nenhum extrato importado"
              descricao="Importe um arquivo OFX do banco para começar a conciliar."
              acao={
                podeImportar ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setImportarAberto(true)}
                  >
                    <Upload />
                    Importar OFX
                  </Button>
                ) : undefined
              }
              className="border-none bg-transparent"
            />
          ) : (
            <EmptyState
              icone={filtrando ? Filter : Upload}
              titulo={
                filtrando
                  ? "Nenhuma transação com esses filtros"
                  : "Nenhuma transação neste extrato"
              }
              descricao={
                filtrando
                  ? "Ajuste ou limpe os filtros para ver o restante das transações."
                  : "O extrato importado não tem transações."
              }
              className="border-none bg-transparent"
            />
          )
        }
      />

      <ImportarOfxDialog
        key={importarAberto ? "import-aberto" : "import-fechado"}
        aberto={importarAberto}
        onAbertoChange={setImportarAberto}
        contas={contas}
        contaInicialId={contaId || undefined}
      />

      <ConciliarDialog
        aberto={conciliarAberto}
        onAbertoChange={setConciliarAberto}
        transacao={transacaoAtiva}
        sugestoes={sugestoes}
        carregando={carregandoSugestoes}
        onConciliada={() => setConciliarAberto(false)}
      />

      <ConfirmDialog
        aberto={desconciliarAlvo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setDesconciliarAlvo(null);
        }}
        titulo="Desfazer conciliação"
        descricao="A transação volta a ficar pendente e a parcela é liberada para nova conciliação. Confirma?"
        textoConfirmar="Desconciliar"
        variante="destrutivo"
        onConfirmar={confirmarDesconciliar}
      />
    </div>
  );
}
