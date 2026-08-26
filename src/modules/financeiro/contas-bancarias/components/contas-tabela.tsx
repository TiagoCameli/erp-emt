"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Filter,
  Landmark,
  Pencil,
  ReceiptText,
  TriangleAlert,
} from "lucide-react";

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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import {
  dentroDaFaixaValor,
  usePaginacaoCliente,
} from "@/modules/_shared/filtros-cliente";
import { ROTULO_BANCO } from "@/modules/financeiro/_shared/formato";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";
import { ROTULO_TIPO_CONTA } from "@/modules/financeiro/contas-bancarias/schemas";
import { ContasFormDrawer } from "./contas-form-drawer";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativas" },
  { valor: "inativos", rotulo: "Inativas" },
];

/**
 * O rótulo da posição em aplicação. Ele carrega DUAS informações porque elas só
 * fazem sentido juntas: quanto está aplicado e, quando o número é negativo, o que
 * isso significa para o saldo ao lado.
 *
 * Negativo é impossível (não se resgata mais principal do que se aplica), então é
 * medida de aplicação que ninguém importou do extrato — e é exatamente o quanto o
 * saldo da conta está abaixo do real. Sem esta frase, a conta da Caixa mostraria
 * −R$ 3,57 milhões de saldo sem nada na tela explicando de onde vem.
 */
function rotuloAplicacao(conta: ContaLista): string {
  const pos = conta.posicaoAplicacao;
  if (!pos) {
    return "Nenhuma aplicação ou resgate registrado nesta conta.";
  }
  const base =
    `Aplicado ${formatarBRL(pos.aplicado)}, resgatado ${formatarBRL(pos.resgatado)}. ` +
    "Não soma no saldo: o saldo inicial já vem do extrato com o que está aplicado.";
  if (pos.posicao >= 0) return base;
  return (
    `${base} ATENÇÃO: negativo é impossível. Faltam ${formatarBRL(-pos.posicao)} ` +
    "de aplicações que não foram importadas do extrato, e o saldo desta conta " +
    "está esse tanto abaixo do real."
  );
}

/**
 * O que o corte deixou de fora, para o `title` da data. Sem esta frase a pessoa
 * vê "desde 31/12/2025" e não tem como saber se isso escondeu R$ 10 ou R$ 4
 * milhões — e nesta base a resposta real é R$ 4,29 milhões numa conta só.
 */
function rotuloForaDoSaldo(conta: ContaLista): string {
  const desde = formatarData(conta.saldoInicialData);
  const fora = conta.movimentoAnteriorAoCorte;
  if (!fora) {
    return `O saldo parte do extrato de ${desde} e soma só o movimento posterior. Nenhum pagamento anterior a essa data está registrado.`;
  }
  return (
    `O saldo parte do extrato de ${desde} e soma só o movimento posterior. ` +
    `Fora do saldo: ${fora.parcelas} pagamento(s) anteriores, ` +
    `${formatarBRL(fora.recebido)} recebidos e ${formatarBRL(fora.pago)} pagos ` +
    `(já representados pelo saldo de abertura).`
  );
}

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
    size: 190,
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <div className="flex flex-col items-end gap-0.5">
        <MoneyText
          valor={row.original.saldoAtual}
          className="font-semibold text-foreground"
        />
        {/* A data de corte MOSTRA A CARA. Um saldo que ignora movimento antigo
            sem dizer que ignora é o mesmo defeito que ele veio consertar: o
            saldo inicial já era um plug justamente por não ter data. */}
        {row.original.saldoInicialData ? (
          <span
            className="text-legenda text-muted-foreground"
            title={rotuloForaDoSaldo(row.original)}
          >
            desde {formatarData(row.original.saldoInicialData)}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    id: "aplicacao",
    header: "Em aplicação",
    size: 160,
    // Nasce OCULTA: desde 22/08/2026 a varredura do banco não está mais em
    // `lancamentos` (foi para arquivo_morto a pedido do Tiago), então a coluna
    // mostraria "-" nas cinco contas. Ela continua existindo porque volta a
    // servir no dia em que entrar uma aplicação de verdade, e uma posição
    // aplicada NEGATIVA é impossível e precisa aparecer. Coluna que só mostra
    // traço é ruído; coluna que não existe some com o alerta junto.
    meta: { alinharDireita: true, rotulo: "Em aplicação", ocultaPorPadrao: true },
    cell: ({ row }) => {
      const pos = row.original.posicaoAplicacao;
      if (!pos) return <span className="text-muted-foreground">-</span>;
      const impossivel = pos.posicao < 0;
      return (
        <span
          className="inline-flex items-center gap-1.5"
          title={rotuloAplicacao(row.original)}
        >
          {impossivel ? (
            <TriangleAlert
              className="size-3.5 shrink-0 text-status-rejeitado"
              aria-label="Valor impossível: falta importar aplicação do extrato"
            />
          ) : null}
          <MoneyText
            valor={pos.posicao}
            className={impossivel ? "text-status-rejeitado" : undefined}
          />
        </span>
      );
    },
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
 * Listagem de contas bancárias. Clicar numa linha abre o EXTRATO da conta, com
 * todo o dinheiro que entrou e saiu dela.
 *
 * Até 26/08/2026 o clique abria o formulário de edição. A troca é intencional: a
 * pergunta que a linha provoca é "de onde vem esse saldo", não "quero corrigir o
 * cadastro" — o saldo é o que se confere contra o extrato do banco, e cadastro de
 * conta se mexe uma vez por ano. A edição não sumiu: está no menu "..." da linha
 * e no cabeçalho do próprio extrato.
 */
export function ContasTabela({ contas, podeEditar }: ContasTabelaProps) {
  const router = useRouter();
  const [selecionadaId, setSelecionadaId] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [status, setStatus] = React.useState("ativos");
  const [banco, setBanco] = useFiltroSessao("banco", "");
  const [tipo, setTipo] = useFiltroSessao("tipo", "");
  const [saldoDe, setSaldoDe] = useFiltroSessao("saldoDe", "");
  const [saldoAte, setSaldoAte] = useFiltroSessao("saldoAte", "");

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

  function abrirExtrato(conta: ContaLista) {
    router.push(`/financeiro/contas-bancarias/${conta.id}`);
  }

  // Filtros declarados aqui (e não numa FilterBar solta) para entrarem no menu
  // "Filtros" da tabela, junto com a personalização de colunas. Busca e status
  // seguem visíveis; banco, tipo e saldo nascem escondidos.
  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
      // deixa o texto da busca filtrando a lista.
      temValor: busca !== "",
      onLimpar: () => mudarBusca(""),
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
        onRowClick={abrirExtrato}
        // A edição ficou aqui quando a linha passou a abrir o extrato. "Abrir
        // extrato" também aparece no menu, e é de propósito: o menu é o lugar em
        // que quem não sabe que a linha clica descobre que dá.
        acoesLinha={(conta) => (
          <>
            <DropdownMenuItem onSelect={() => abrirExtrato(conta)}>
              <ReceiptText />
              Abrir extrato
            </DropdownMenuItem>
            {podeEditar ? (
              <DropdownMenuItem onSelect={() => abrirEdicao(conta)}>
                <Pencil />
                Editar conta
              </DropdownMenuItem>
            ) : null}
          </>
        )}
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
