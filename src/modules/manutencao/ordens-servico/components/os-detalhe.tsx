"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, CheckCircle2, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  MoneyText,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import {
  PRIORIDADE_OS,
  ROTULO_ORIGEM_OS,
  ROTULO_TIPO_OS,
  STATUS_OS,
} from "@/modules/manutencao/_shared/formato";
import type {
  ColaboradorOpcao,
  DepositoOpcao,
  FornecedorOpcao,
  InsumoOpcao,
} from "@/modules/manutencao/_shared/queries";
import {
  cancelarOrdem,
  iniciarOrdem,
  removerMaoObra,
  removerTerceiro,
} from "@/modules/manutencao/ordens-servico/actions";
import type { OrdemDetalhe } from "@/modules/manutencao/ordens-servico/queries";
import { ConcluirOsDialog } from "./concluir-os-dialog";
import { MaoObraFormDrawer } from "./mao-obra-form-drawer";
import { PecaFormDrawer } from "./peca-form-drawer";
import { TerceiroFormDrawer } from "./terceiro-form-drawer";

/** Status em que a OS ainda aceita lançamentos e mudanças de execução. */
const STATUS_ABERTA_EXECUCAO = new Set(["aberta", "em_execucao"]);

/** Card de seção do detalhe (borda + superfície), com título e ação. */
function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-secao font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Linha rotulada para os dados do cabeçalho. */
function Dado({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

/** Leitura de horímetro/km formatada, ou traço quando ausente. */
function Leitura({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-muted-foreground">-</span>;
  return <span className="tabular-nums">{formatarQuantidade(valor)}</span>;
}

export interface OsDetalheViewProps {
  ordem: OrdemDetalhe;
  trilha: EventoTrilha[];
  controlePor: string;
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
  colaboradores: ColaboradorOpcao[];
  fornecedores: FornecedorOpcao[];
  podeEditar: boolean;
}

/**
 * Detalhe da OS: cabeçalho com ações de status conforme o estado, custos por
 * MoneyText, e as três seções (peças, mão de obra, terceiros) com seus drawers
 * de adicionar. Trilha no fim. As ações passam pelas Server Actions, que
 * chamam as RPCs e repassam o erro do banco ao toast.
 */
export function OsDetalheView({
  ordem,
  trilha,
  controlePor,
  insumos,
  depositos,
  colaboradores,
  fornecedores,
  podeEditar,
}: OsDetalheViewProps) {
  const router = useRouter();
  const info = STATUS_OS[ordem.status];

  const [drawerPeca, setDrawerPeca] = React.useState(false);
  const [drawerMaoObra, setDrawerMaoObra] = React.useState(false);
  const [drawerTerceiro, setDrawerTerceiro] = React.useState(false);
  const [dialogConcluir, setDialogConcluir] = React.useState(false);
  const [dialogCancelar, setDialogCancelar] = React.useState(false);
  const [iniciando, setIniciando] = React.useState(false);

  const aceitaLancamentos =
    podeEditar && STATUS_ABERTA_EXECUCAO.has(ordem.status);
  const podeIniciar = podeEditar && ordem.status === "aberta";
  const podeConcluir =
    podeEditar && STATUS_ABERTA_EXECUCAO.has(ordem.status);
  const podeCancelar =
    podeEditar && STATUS_ABERTA_EXECUCAO.has(ordem.status);

  async function aoIniciar() {
    if (iniciando) return;
    setIniciando(true);
    try {
      const resultado = await iniciarOrdem(ordem.id);
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("OS iniciada");
      router.refresh();
    } finally {
      setIniciando(false);
    }
  }

  async function aoCancelar(motivo?: string) {
    const resultado = await cancelarOrdem(ordem.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("OS cancelada");
    router.refresh();
  }

  async function aoRemoverMaoObra(maoObraId: string) {
    const resultado = await removerMaoObra(ordem.id, maoObraId);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Mão de obra removida");
    router.refresh();
  }

  async function aoRemoverTerceiro(terceiroId: string) {
    const resultado = await removerTerceiro(ordem.id, terceiroId);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Serviço de terceiro removido");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Voltar para a lista"
            onClick={() => router.push("/manutencao/ordens-servico")}
          >
            <ArrowLeft />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-titulo font-semibold">
                <span className="codigo-doc">
                  {ordem.numero ?? "Sem número"}
                </span>
              </h1>
              <StatusBadge status={info.badge} rotulo={info.rotulo} />
            </div>
            <p className="text-detalhe text-muted-foreground">
              {ordem.equipamentoDescricao}
              {ordem.equipamentoPlaca ? ` (${ordem.equipamentoPlaca})` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {podeIniciar ? (
            <Button
              type="button"
              size="sm"
              disabled={iniciando}
              onClick={aoIniciar}
            >
              <Play />
              {iniciando ? "Iniciando..." : "Iniciar"}
            </Button>
          ) : null}
          {podeConcluir ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDialogConcluir(true)}
            >
              <CheckCircle2 />
              Concluir
            </Button>
          ) : null}
          {podeCancelar ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDialogCancelar(true)}
            >
              <Ban />
              Cancelar OS
            </Button>
          ) : null}
        </div>
      </div>

      {ordem.motivoCancelamento ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-legenda font-medium text-destructive">
            Motivo do cancelamento
          </p>
          <p className="text-detalhe text-foreground">
            {ordem.motivoCancelamento}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Secao titulo="Dados da OS">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Dado rotulo="Equipamento">
                {ordem.equipamentoCodigo ? (
                  <span className="mr-1.5 text-legenda text-muted-foreground codigo-doc">
                    {ordem.equipamentoCodigo}
                  </span>
                ) : null}
                {ordem.equipamentoDescricao}
              </Dado>
              <Dado rotulo="Centro de custo">
                {ordem.centroCustoNome ? (
                  <>
                    {ordem.centroCustoCodigo ? (
                      <span className="mr-1.5 text-legenda text-muted-foreground codigo-doc">
                        {ordem.centroCustoCodigo}
                      </span>
                    ) : null}
                    {ordem.centroCustoNome}
                  </>
                ) : (
                  "-"
                )}
              </Dado>
              <Dado rotulo="Tipo">{ROTULO_TIPO_OS[ordem.tipo]}</Dado>
              <Dado rotulo="Prioridade">
                <StatusBadge
                  status={PRIORIDADE_OS[ordem.prioridade].badge}
                  rotulo={PRIORIDADE_OS[ordem.prioridade].rotulo}
                />
              </Dado>
              <Dado rotulo="Origem">{ROTULO_ORIGEM_OS[ordem.origem]}</Dado>
              <Dado rotulo="Abertura">{formatarData(ordem.dataAbertura)}</Dado>
              <Dado rotulo="Conclusão">
                {ordem.dataConclusao ? formatarData(ordem.dataConclusao) : "-"}
              </Dado>
              <Dado rotulo="Horímetro (abert. / fech.)">
                <Leitura valor={ordem.horimetroAbertura} />
                {" / "}
                <Leitura valor={ordem.horimetroFechamento} />
              </Dado>
              <Dado rotulo="Km (abert. / fech.)">
                <Leitura valor={ordem.kmAbertura} />
                {" / "}
                <Leitura valor={ordem.kmFechamento} />
              </Dado>
            </div>
            <div className="mt-4">
              <Dado rotulo="Descrição">{ordem.descricao}</Dado>
            </div>
            {ordem.observacao ? (
              <div className="mt-4">
                <Dado rotulo="Observação">{ordem.observacao}</Dado>
              </div>
            ) : null}
          </Secao>

          <Secao titulo="Custos">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Dado rotulo="Peças">
                <MoneyText valor={ordem.custoPecas} />
              </Dado>
              <Dado rotulo="Mão de obra">
                <MoneyText valor={ordem.custoMaoObra} />
              </Dado>
              <Dado rotulo="Terceiros">
                <MoneyText valor={ordem.custoTerceiros} />
              </Dado>
              <Dado rotulo="Total">
                <MoneyText valor={ordem.custoTotal} className="font-semibold" />
              </Dado>
            </div>
          </Secao>

          <Secao
            titulo="Peças"
            acao={
              aceitaLancamentos ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDrawerPeca(true)}
                >
                  <Plus />
                  Adicionar
                </Button>
              ) : null
            }
          >
            {ordem.pecas.length === 0 ? (
              <p className="text-detalhe text-muted-foreground">
                Nenhuma peça baixada.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-detalhe">
                  <thead>
                    <tr className="border-b border-border text-legenda text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Insumo</th>
                      <th className="px-3 py-2 text-left font-medium">
                        Almoxarifado
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Qtd.</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Custo unit.
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Custo total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordem.pecas.map((peca) => (
                      <tr
                        key={peca.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-2">{peca.insumoNome}</td>
                        <td className="px-3 py-2">{peca.depositoNome}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatarQuantidade(peca.quantidade)} {peca.unidadeSigla}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <MoneyText valor={peca.custoUnitario} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <MoneyText valor={peca.custoTotal} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>

          <Secao
            titulo="Mão de obra"
            acao={
              aceitaLancamentos ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDrawerMaoObra(true)}
                >
                  <Plus />
                  Adicionar
                </Button>
              ) : null
            }
          >
            {ordem.maoObra.length === 0 ? (
              <p className="text-detalhe text-muted-foreground">
                Nenhum apontamento de mão de obra.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-detalhe">
                  <thead>
                    <tr className="border-b border-border text-legenda text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">
                        Colaborador
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Horas</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Valor/h
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      {aceitaLancamentos ? (
                        <th className="px-3 py-2 text-right font-medium" />
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {ordem.maoObra.map((linha) => (
                      <tr
                        key={linha.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-2">
                          {linha.colaboradorNome}
                          {linha.colaboradorFuncao ? (
                            <span className="text-muted-foreground">
                              {" "}
                              ({linha.colaboradorFuncao})
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatarQuantidade(linha.horas)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <MoneyText valor={linha.valorHora} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <MoneyText valor={linha.custoTotal} />
                        </td>
                        {aceitaLancamentos ? (
                          <td className="px-3 py-2 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Remover mão de obra"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => aoRemoverMaoObra(linha.id)}
                            >
                              <Trash2 />
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>

          <Secao
            titulo="Terceiros"
            acao={
              aceitaLancamentos ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDrawerTerceiro(true)}
                >
                  <Plus />
                  Adicionar
                </Button>
              ) : null
            }
          >
            {ordem.terceiros.length === 0 ? (
              <p className="text-detalhe text-muted-foreground">
                Nenhum serviço de terceiro.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-detalhe">
                  <thead>
                    <tr className="border-b border-border text-legenda text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">
                        Fornecedor
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Descrição
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Vencimento
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Valor</th>
                      {aceitaLancamentos ? (
                        <th className="px-3 py-2 text-right font-medium" />
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {ordem.terceiros.map((linha) => (
                      <tr
                        key={linha.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-2">
                          {linha.fornecedorNome ?? (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{linha.descricao}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {linha.dataVencimento ? (
                            formatarData(linha.dataVencimento)
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <MoneyText valor={linha.valor} />
                        </td>
                        {aceitaLancamentos ? (
                          <td className="px-3 py-2 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Remover terceiro"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => aoRemoverTerceiro(linha.id)}
                            >
                              <Trash2 />
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>
        </div>

        <div className="lg:col-span-1">
          <Secao titulo="Trilha">
            <Trilha eventos={trilha} />
          </Secao>
        </div>
      </div>

      {aceitaLancamentos ? (
        <>
          <PecaFormDrawer
            aberto={drawerPeca}
            onAbertoChange={setDrawerPeca}
            ordemId={ordem.id}
            insumos={insumos}
            depositos={depositos}
          />
          <MaoObraFormDrawer
            aberto={drawerMaoObra}
            onAbertoChange={setDrawerMaoObra}
            ordemId={ordem.id}
            colaboradores={colaboradores}
          />
          <TerceiroFormDrawer
            aberto={drawerTerceiro}
            onAbertoChange={setDrawerTerceiro}
            ordemId={ordem.id}
            fornecedores={fornecedores}
          />
        </>
      ) : null}

      {podeConcluir ? (
        <ConcluirOsDialog
          aberto={dialogConcluir}
          onAbertoChange={setDialogConcluir}
          ordemId={ordem.id}
          controlePor={controlePor}
        />
      ) : null}

      {podeCancelar ? (
        <ConfirmDialog
          aberto={dialogCancelar}
          onAbertoChange={setDialogCancelar}
          titulo="Cancelar ordem de serviço"
          descricao="Informe o motivo. Só dá para cancelar OS sem peças baixadas; ele fica registrado na trilha."
          textoConfirmar="Cancelar OS"
          variante="destrutivo"
          exigeMotivo
          onConfirmar={aoCancelar}
        />
      ) : null}
    </div>
  );
}
