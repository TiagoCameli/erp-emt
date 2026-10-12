"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, CheckCheck, Pencil, Play, Plus, RotateCcw, Trash2, X } from "lucide-react";

import {
  CelulaVazia,
  ConfirmDialog,
  DataTable,
  MoneyText,
  PageHeader,
  SecaoDetalhe,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { FotosEArquivos } from "@/modules/_shared/anexos/fotos-e-arquivos";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import {
  BADGE_STATUS_OS,
  ROTULO_PRIORIDADE_OS,
  ROTULO_STATUS_OS,
  ROTULO_TIPO_OS,
} from "@/modules/manutencao/_shared/rotulos";
import {
  cancelarOs,
  excluirOs,
  iniciarOs,
  reabrirOs,
  removerLinha,
} from "@/modules/manutencao/servicos/actions";
import { formatarValorOperacional, rotuloPropriedade } from "@/modules/manutencao/servicos/formato";
import type {
  EquipamentoOpcaoOs,
  FornecedorOpcaoOs,
  LinhasOs,
  OleoOs,
  OsDetalhe,
  PecaOs,
  SaldosParaOs,
  TerceiroOs,
} from "@/modules/manutencao/servicos/queries";
import { acoesDaOs } from "@/modules/manutencao/servicos/regras";
import type { TipoLinhaOs } from "@/modules/manutencao/servicos/schemas";
import {
  AdicionarOleoDrawer,
  AdicionarPecaDrawer,
  AdicionarTerceiroDrawer,
} from "./adicionar-linha-drawers";
import { ConcluirOsDrawer } from "./concluir-os-drawer";
import { OsFormDrawer } from "./os-form-drawer";

type DialogoStatus = "iniciar" | "reabrir" | "cancelar" | "excluir";
type DrawerLinha = "peca" | "oleo" | "terceiro";

interface LinhaParaRemover {
  tipo: TipoLinhaOs;
  id: string;
  descricao: string;
}

const UNIDADE_MEDICAO: Record<string, string> = { horimetro: "h", km: "km" };

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

function Medicao({ valor, controlePor }: { valor: number | null; controlePor: string | null }) {
  if (valor === null) return <CelulaVazia />;
  const unidade = UNIDADE_MEDICAO[controlePor ?? ""];
  return (
    <span className="tabular-nums">
      {formatarQuantidade(valor)}
      {unidade ? ` ${unidade}` : ""}
    </span>
  );
}

/** Número da tabela: à direita, tabular, em uma linha. */
function Numero({ children }: { children: React.ReactNode }) {
  return <span className="tabular-nums">{children}</span>;
}

/** Célula do rodapé: o peso vai na célula, que é quem sabe o que é número. */
function Rodape({ children }: { children: React.ReactNode }) {
  return <span className="font-medium tabular-nums">{children}</span>;
}

/**
 * Tabela só de leitura de um bloco de linhas, com o total que veio do banco.
 * `idColunaRotulo` recebe o "Total do bloco" e `idColunaTotal` o valor.
 */
function TabelaLinhas<L extends { id: string }>({
  idTabela,
  colunas,
  linhas,
  total,
  idColunaRotulo,
  idColunaTotal,
  vazio,
  onRemover,
}: {
  idTabela: string;
  colunas: ColumnDef<L, unknown>[];
  linhas: L[];
  total: number;
  idColunaRotulo: string;
  idColunaTotal: string;
  vazio: string;
  onRemover?: (linha: L) => void;
}) {
  const colunasComAcao = React.useMemo<ColumnDef<L, unknown>[]>(
    () =>
      onRemover
        ? [
            ...colunas,
            {
              id: "remover",
              header: "",
              size: 48,
              enableSorting: false,
              enableResizing: false,
              // `rotulo: "Ações"` põe o botão no canto do card no celular.
              meta: { fixa: true, naoTruncar: true, alinharDireita: true, rotulo: "Ações" },
              cell: ({ row }) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remover linha"
                  onClick={() => onRemover(row.original)}
                >
                  <X />
                </Button>
              ),
            },
          ]
        : colunas,
    [colunas, onRemover],
  );

  if (linhas.length === 0) {
    return <p className="text-detalhe text-muted-foreground">{vazio}</p>;
  }
  return (
    <DataTable
      idTabela={idTabela}
      columns={colunasComAcao}
      data={linhas}
      idDaLinha={(linha) => linha.id}
      semPaginacao
      rodape={{
        [idColunaRotulo]: <Rodape>Total do bloco</Rodape>,
        [idColunaTotal]: <Rodape>{formatarValorOperacional(total)}</Rodape>,
      }}
    />
  );
}

const COLUNAS_PECAS: ColumnDef<PecaOs, unknown>[] = [
  { accessorKey: "insumoNome", header: "Peça", meta: { celular: "titulo" } },
  { accessorKey: "depositoNome", header: "Depósito" },
  {
    accessorKey: "quantidade",
    header: "Quantidade",
    meta: { alinharDireita: true, atomico: true, celular: "destaque" },
    cell: ({ row }) => (
      <Numero>
        {formatarQuantidade(row.original.quantidade)}
        {row.original.unidade ? ` ${row.original.unidade}` : ""}
      </Numero>
    ),
  },
  {
    accessorKey: "custoUnitario",
    header: "Custo unitário",
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <Numero>{formatarValorOperacional(row.original.custoUnitario)}</Numero>,
  },
  {
    accessorKey: "custoTotal",
    header: "Total",
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => <Numero>{formatarValorOperacional(row.original.custoTotal)}</Numero>,
  },
];

const COLUNAS_OLEOS: ColumnDef<OleoOs, unknown>[] = [
  { accessorKey: "tipoOleoNome", header: "Tipo de óleo", meta: { celular: "titulo" } },
  { accessorKey: "insumoNome", header: "Insumo" },
  { accessorKey: "depositoNome", header: "Depósito" },
  {
    accessorKey: "quantidade",
    header: "Quantidade",
    meta: { alinharDireita: true, atomico: true, celular: "destaque" },
    cell: ({ row }) => (
      <Numero>
        {formatarQuantidade(row.original.quantidade)} {row.original.unidade}
      </Numero>
    ),
  },
  {
    accessorKey: "valorUnitario",
    header: "Valor unitário",
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <Numero>{formatarValorOperacional(row.original.valorUnitario)}</Numero>,
  },
  {
    accessorKey: "valorTotal",
    header: "Valor",
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => <Numero>{formatarValorOperacional(row.original.valorTotal)}</Numero>,
  },
];

const COLUNAS_TERCEIROS: ColumnDef<TerceiroOs, unknown>[] = [
  { accessorKey: "fornecedorNome", header: "Fornecedor" },
  { accessorKey: "descricao", header: "Descrição", meta: { celular: "titulo" } },
  {
    accessorKey: "notaFiscal",
    header: "Nota fiscal",
    meta: { atomico: true },
    cell: ({ row }) => row.original.notaFiscal ?? <CelulaVazia />,
  },
  {
    accessorKey: "valor",
    header: "Valor",
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => <Numero>{formatarValorOperacional(row.original.valor)}</Numero>,
  },
];

export interface OsDetalheViewProps {
  os: OsDetalhe;
  linhas: LinhasOs;
  trilha: EventoTrilha[];
  /** Fotos e documentos do serviço executado. */
  anexos: AnexoDoDocumento[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Carregados só quando a OS aceita edição e o usuário pode editar. */
  equipamentos: EquipamentoOpcaoOs[];
  centros: CentroCustoOpcao[];
  fornecedores: FornecedorOpcaoOs[];
  saldos: SaldosParaOs;
}

/**
 * Detalhe da OS. Todos os números de custo vêm do banco (gatilho): a tela nunca
 * soma nem envia custo. As ações aparecem pelo status e pela permissão
 * (`acoesDaOs`), e o banco checa as duas de novo.
 */
export function OsDetalheView({
  os,
  linhas,
  trilha,
  anexos,
  podeEditar,
  podeExcluir,
  equipamentos,
  centros,
  fornecedores,
  saldos,
}: OsDetalheViewProps) {
  const router = useRouter();
  const acoes = acoesDaOs(os.status, { editar: podeEditar, excluir: podeExcluir });

  const [editando, setEditando] = React.useState(false);
  const [concluindo, setConcluindo] = React.useState(false);
  const [dialogo, setDialogo] = React.useState<DialogoStatus | null>(null);
  const [drawerLinha, setDrawerLinha] = React.useState<DrawerLinha | null>(null);
  const [removendo, setRemovendo] = React.useState<LinhaParaRemover | null>(null);

  function depoisDoSucesso(contexto: string) {
    semDerrubarSucesso(contexto, () => router.refresh());
  }

  async function aoIniciar() {
    const resultado = await iniciarOs(os.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Execução iniciada. O equipamento está em manutenção");
    depoisDoSucesso("manutencao.servicos.iniciar");
  }

  async function aoReabrir(motivo?: string) {
    const resultado = await reabrirOs(os.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`${os.numero} reaberta`);
    depoisDoSucesso("manutencao.servicos.reabrir");
  }

  async function aoCancelar(motivo?: string) {
    const resultado = await cancelarOs(os.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`${os.numero} cancelada. Peças e óleos voltaram ao almoxarifado`);
    depoisDoSucesso("manutencao.servicos.cancelar");
  }

  async function aoExcluir(motivo?: string) {
    const resultado = await excluirOs(os.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`${os.numero} excluída`);
    semDerrubarSucesso("manutencao.servicos.excluir", () => router.push("/manutencao/servicos"));
  }

  async function aoRemoverLinha() {
    if (!removendo) return;
    const resultado = await removerLinha({ osId: os.id, tipo: removendo.tipo, linhaId: removendo.id });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(removendo.tipo === "terceiro" ? "Linha removida" : "Linha removida e devolvida ao almoxarifado");
    depoisDoSucesso("manutencao.servicos.removerLinha");
  }

  const onRemover = acoes.removerLinha;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        className="mb-0"
        modulo="Manutenção · Caderno de serviços"
        titulo={os.numero}
        tituloMono
        descricao={os.equipamentoNome}
        voltarPara={{ rota: "/manutencao/servicos", rotulo: "Voltar para o caderno de serviços" }}
        selos={<StatusBadge status={BADGE_STATUS_OS[os.status]} rotulo={ROTULO_STATUS_OS[os.status]} />}
        acoes={
          <>
            {acoes.editarCabecalho ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setEditando(true)}>
                <Pencil />
                Editar
              </Button>
            ) : null}
            {acoes.iniciar ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogo("iniciar")}>
                <Play />
                Iniciar OS
              </Button>
            ) : null}
            {acoes.concluir ? (
              <Button type="button" size="sm" onClick={() => setConcluindo(true)}>
                <CheckCheck />
                Concluir OS
              </Button>
            ) : null}
            {acoes.reabrir ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogo("reabrir")}>
                <RotateCcw />
                Reabrir OS
              </Button>
            ) : null}
            {acoes.cancelar ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDialogo("cancelar")}
              >
                <Ban />
                Cancelar OS
              </Button>
            ) : null}
            {acoes.excluir ? (
              <Button type="button" variant="destructive" size="sm" onClick={() => setDialogo("excluir")}>
                <Trash2 />
                Excluir OS
              </Button>
            ) : null}
          </>
        }
      />

      {os.status === "cancelada" && os.motivoCancelamento ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-legenda font-medium text-destructive">Motivo do cancelamento</p>
          <p className="text-detalhe text-foreground">{os.motivoCancelamento}</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <SecaoDetalhe card titulo="Dados da OS">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Dado rotulo="Equipamento">
                {os.equipamentoNome || <CelulaVazia />}
                {os.equipamentoPropriedade ? (
                  <span className="text-muted-foreground"> · {rotuloPropriedade(os.equipamentoPropriedade)}</span>
                ) : null}
              </Dado>
              <Dado rotulo="Centro de custo">{os.centroCustoNome || <CelulaVazia />}</Dado>
              <Dado rotulo="Tipo">{ROTULO_TIPO_OS[os.tipo] ?? os.tipo}</Dado>
              <Dado rotulo="Prioridade">{ROTULO_PRIORIDADE_OS[os.prioridade] ?? os.prioridade}</Dado>
              <Dado rotulo="Abertura">{formatarData(os.dataAbertura)}</Dado>
              <Dado rotulo="Início">{os.dataInicio ? formatarData(os.dataInicio) : <CelulaVazia />}</Dado>
              <Dado rotulo="Conclusão">{os.dataConclusao ? formatarData(os.dataConclusao) : <CelulaVazia />}</Dado>
              <Dado rotulo="Medição de abertura">
                <Medicao valor={os.medicaoAbertura} controlePor={os.equipamentoControlePor} />
              </Dado>
              <Dado rotulo="Medição de conclusão">
                <Medicao valor={os.medicaoConclusao} controlePor={os.equipamentoControlePor} />
              </Dado>
              {os.numeroLegado ? <Dado rotulo="Número na origem">{os.numeroLegado}</Dado> : null}
            </div>
            <div className="mt-4 grid gap-4">
              <Dado rotulo="Descrição do serviço">
                <span className="whitespace-pre-line">{os.descricao}</span>
              </Dado>
              {os.defeitoReportado ? (
                <Dado rotulo="Defeito reportado">
                  <span className="whitespace-pre-line">{os.defeitoReportado}</span>
                </Dado>
              ) : null}
              {os.causaRaiz ? (
                <Dado rotulo="Causa">
                  <span className="whitespace-pre-line">{os.causaRaiz}</span>
                </Dado>
              ) : null}
              {os.observacoes ? (
                <Dado rotulo="Observações">
                  <span className="whitespace-pre-line">{os.observacoes}</span>
                </Dado>
              ) : null}
            </div>
          </SecaoDetalhe>

          <SecaoDetalhe
            card
            titulo="Peças"
            acao={
              acoes.adicionarLinha ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setDrawerLinha("peca")}>
                  <Plus />
                  Adicionar peça
                </Button>
              ) : null
            }
          >
            <TabelaLinhas
              idTabela="manutencao.servicos.detalhe.pecas"
              linhas={linhas.pecas}
              total={os.custoPecas}
              idColunaRotulo="insumoNome"
              idColunaTotal="custoTotal"
              vazio="Nenhuma peça lançada"
              onRemover={
                onRemover
                  ? (linha) => setRemovendo({ tipo: "peca", id: linha.id, descricao: linha.insumoNome })
                  : undefined
              }
              colunas={COLUNAS_PECAS}
            />
          </SecaoDetalhe>

          <SecaoDetalhe
            card
            titulo="Óleos"
            acao={
              acoes.adicionarLinha ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setDrawerLinha("oleo")}>
                  <Plus />
                  Adicionar óleo
                </Button>
              ) : null
            }
          >
            <TabelaLinhas
              idTabela="manutencao.servicos.detalhe.oleos"
              linhas={linhas.oleos}
              total={os.custoOleos}
              idColunaRotulo="tipoOleoNome"
              idColunaTotal="valorTotal"
              vazio="Nenhum óleo lançado"
              onRemover={
                onRemover
                  ? (linha) =>
                      setRemovendo({ tipo: "oleo", id: linha.id, descricao: `${linha.tipoOleoNome} (${linha.insumoNome})` })
                  : undefined
              }
              colunas={COLUNAS_OLEOS}
            />
          </SecaoDetalhe>

          <SecaoDetalhe
            card
            titulo="Serviços de terceiros"
            acao={
              acoes.adicionarLinha ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setDrawerLinha("terceiro")}>
                  <Plus />
                  Adicionar terceiro
                </Button>
              ) : null
            }
          >
            <TabelaLinhas
              idTabela="manutencao.servicos.detalhe.terceiros"
              linhas={linhas.terceiros}
              total={os.custoTerceiros}
              idColunaRotulo="fornecedorNome"
              idColunaTotal="valor"
              vazio="Nenhum serviço de terceiro lançado"
              onRemover={
                onRemover
                  ? (linha) => setRemovendo({ tipo: "terceiro", id: linha.id, descricao: linha.descricao })
                  : undefined
              }
              colunas={COLUNAS_TERCEIROS}
            />
          </SecaoDetalhe>

          <SecaoDetalhe card titulo="Fotos e documentos do serviço">
            <FotosEArquivos
              entidade="manutencao_os"
              entidadeId={os.id}
              anexos={anexos}
              podeEditar={acoes.anexar}
              onMudou={() => router.refresh()}
            />
          </SecaoDetalhe>
        </div>

        <div className="flex flex-col gap-4">
          <SecaoDetalhe card titulo="Custo da OS">
            <dl className="flex flex-col gap-2 text-detalhe">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Peças</dt>
                <dd>
                  <MoneyText valor={os.custoPecas} />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Óleos</dt>
                <dd>
                  <MoneyText valor={os.custoOleos} />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Terceiros</dt>
                <dd>
                  <MoneyText valor={os.custoTerceiros} />
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-border pt-2 font-semibold">
                <dt>Custo total</dt>
                <dd>
                  <MoneyText valor={os.custoTotal} />
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-legenda text-muted-foreground">
              Calculado pelo banco a partir das linhas. Não gera lançamento financeiro.
            </p>
          </SecaoDetalhe>

          <SecaoDetalhe card titulo="Histórico">
            <Trilha eventos={trilha} />
          </SecaoDetalhe>
        </div>
      </div>

      {acoes.editarCabecalho ? (
        <OsFormDrawer
          aberto={editando}
          onAbertoChange={setEditando}
          os={os}
          equipamentos={equipamentos}
          centros={centros}
        />
      ) : null}

      {acoes.concluir ? (
        <ConcluirOsDrawer aberto={concluindo} onAbertoChange={setConcluindo} osId={os.id} numero={os.numero} />
      ) : null}

      {acoes.adicionarLinha ? (
        <>
          <AdicionarPecaDrawer
            aberto={drawerLinha === "peca"}
            onAbertoChange={(aberto) => setDrawerLinha(aberto ? "peca" : null)}
            osId={os.id}
            saldos={saldos.pecas}
          />
          <AdicionarOleoDrawer
            aberto={drawerLinha === "oleo"}
            onAbertoChange={(aberto) => setDrawerLinha(aberto ? "oleo" : null)}
            osId={os.id}
            saldos={saldos.oleos}
          />
          <AdicionarTerceiroDrawer
            aberto={drawerLinha === "terceiro"}
            onAbertoChange={(aberto) => setDrawerLinha(aberto ? "terceiro" : null)}
            osId={os.id}
            fornecedores={fornecedores}
          />
        </>
      ) : null}

      <ConfirmDialog
        aberto={dialogo === "iniciar"}
        onAbertoChange={(aberto) => setDialogo(aberto ? "iniciar" : null)}
        titulo={`Iniciar ${os.numero}`}
        descricao="A OS passa para em execução e o equipamento fica em manutenção até não sobrar OS em execução dele."
        textoConfirmar="Iniciar OS"
        onConfirmar={aoIniciar}
      />
      <ConfirmDialog
        aberto={dialogo === "reabrir"}
        onAbertoChange={(aberto) => setDialogo(aberto ? "reabrir" : null)}
        titulo={`Reabrir ${os.numero}`}
        descricao="A OS volta para aberta, perde a data e a medição de conclusão e pode ser editada de novo. O motivo fica no histórico."
        textoConfirmar="Reabrir OS"
        exigeMotivo
        onConfirmar={aoReabrir}
      />
      <ConfirmDialog
        aberto={dialogo === "cancelar"}
        onAbertoChange={(aberto) => setDialogo(aberto ? "cancelar" : null)}
        titulo={`Cancelar ${os.numero}`}
        descricao="Cancelar estorna o almoxarifado: as peças e os óleos desta OS voltam ao saldo e todas as linhas saem da OS. O custo zera."
        textoConfirmar="Cancelar OS"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoCancelar}
      />
      <ConfirmDialog
        aberto={dialogo === "excluir"}
        onAbertoChange={(aberto) => setDialogo(aberto ? "excluir" : null)}
        titulo={`Excluir ${os.numero}`}
        descricao="A OS vai para a lixeira e o que ela baixou do almoxarifado volta ao saldo."
        textoConfirmar="Excluir OS"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoExcluir}
      />
      <ConfirmDialog
        aberto={removendo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setRemovendo(null);
        }}
        titulo="Remover linha"
        descricao={
          removendo
            ? removendo.tipo === "terceiro"
              ? `O serviço "${removendo.descricao}" sai da OS.`
              : `"${removendo.descricao}" sai da OS e a quantidade volta ao saldo do almoxarifado.`
            : ""
        }
        textoConfirmar="Remover linha"
        variante="destrutivo"
        onConfirmar={aoRemoverLinha}
      />
    </div>
  );
}
