"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCheck, Pencil, Play, Plus, RotateCcw, Trash2, X } from "lucide-react";

import {
  CelulaVazia,
  ConfirmDialog,
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
  OsDetalhe,
  SaldosParaOs,
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

/** Tabela só de leitura de um bloco de linhas, com o total que veio do banco. */
function TabelaLinhas<L extends { id: string }>({
  colunas,
  linhas,
  total,
  vazio,
  onRemover,
}: {
  colunas: { rotulo: string; direita?: boolean; celula: (linha: L) => React.ReactNode }[];
  linhas: L[];
  total: number;
  vazio: string;
  onRemover?: (linha: L) => void;
}) {
  if (linhas.length === 0) {
    return <p className="text-detalhe text-muted-foreground">{vazio}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-detalhe">
        <thead>
          <tr className="border-b border-border text-legenda text-muted-foreground">
            {colunas.map((coluna) => (
              <th
                key={coluna.rotulo}
                className={`px-3 py-2 font-medium ${coluna.direita ? "text-right" : "text-center"}`}
              >
                {coluna.rotulo}
              </th>
            ))}
            {onRemover ? <th className="w-10 px-2 py-2" aria-label="Ações" /> : null}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.id} className="border-b border-border last:border-0">
              {colunas.map((coluna) => (
                <td
                  key={coluna.rotulo}
                  className={`px-3 py-2 ${coluna.direita ? "text-right tabular-nums" : "text-center"}`}
                >
                  {coluna.celula(linha)}
                </td>
              ))}
              {onRemover ? (
                <td className="px-2 py-1 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover linha"
                    onClick={() => onRemover(linha)}
                  >
                    <X />
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-medium">
            <td className="px-3 py-2 text-right" colSpan={colunas.length - 1}>
              Total do bloco
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{formatarValorOperacional(total)}</td>
            {onRemover ? <td /> : null}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export interface OsDetalheViewProps {
  os: OsDetalhe;
  linhas: LinhasOs;
  trilha: EventoTrilha[];
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
              linhas={linhas.pecas}
              total={os.custoPecas}
              vazio="Nenhuma peça lançada"
              onRemover={
                onRemover
                  ? (linha) => setRemovendo({ tipo: "peca", id: linha.id, descricao: linha.insumoNome })
                  : undefined
              }
              colunas={[
                { rotulo: "Peça", celula: (linha) => linha.insumoNome },
                { rotulo: "Depósito", celula: (linha) => linha.depositoNome },
                {
                  rotulo: "Quantidade",
                  direita: true,
                  celula: (linha) =>
                    `${formatarQuantidade(linha.quantidade)}${linha.unidade ? ` ${linha.unidade}` : ""}`,
                },
                {
                  rotulo: "Custo unitário",
                  direita: true,
                  celula: (linha) => formatarValorOperacional(linha.custoUnitario),
                },
                { rotulo: "Total", direita: true, celula: (linha) => formatarValorOperacional(linha.custoTotal) },
              ]}
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
              linhas={linhas.oleos}
              total={os.custoOleos}
              vazio="Nenhum óleo lançado"
              onRemover={
                onRemover
                  ? (linha) =>
                      setRemovendo({ tipo: "oleo", id: linha.id, descricao: `${linha.tipoOleoNome} (${linha.insumoNome})` })
                  : undefined
              }
              colunas={[
                { rotulo: "Tipo de óleo", celula: (linha) => linha.tipoOleoNome },
                { rotulo: "Insumo", celula: (linha) => linha.insumoNome },
                { rotulo: "Depósito", celula: (linha) => linha.depositoNome },
                {
                  rotulo: "Quantidade",
                  direita: true,
                  celula: (linha) => `${formatarQuantidade(linha.quantidade)} ${linha.unidade}`,
                },
                {
                  rotulo: "Valor unitário",
                  direita: true,
                  celula: (linha) => formatarValorOperacional(linha.valorUnitario),
                },
                { rotulo: "Valor", direita: true, celula: (linha) => formatarValorOperacional(linha.valorTotal) },
              ]}
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
              linhas={linhas.terceiros}
              total={os.custoTerceiros}
              vazio="Nenhum serviço de terceiro lançado"
              onRemover={
                onRemover
                  ? (linha) => setRemovendo({ tipo: "terceiro", id: linha.id, descricao: linha.descricao })
                  : undefined
              }
              colunas={[
                { rotulo: "Fornecedor", celula: (linha) => linha.fornecedorNome },
                { rotulo: "Descrição", celula: (linha) => linha.descricao },
                { rotulo: "Nota fiscal", celula: (linha) => linha.notaFiscal ?? <CelulaVazia /> },
                { rotulo: "Valor", direita: true, celula: (linha) => formatarValorOperacional(linha.valor) },
              ]}
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
