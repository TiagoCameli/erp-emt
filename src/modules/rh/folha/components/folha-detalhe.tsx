"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Copy,
  FileText,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Undo2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  ApprovalBar,
  CelulaVazia,
  ConfirmDialog,
  KPICard,
  MoneyText,
  PageHeader,
  StatusBadge,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { baixarBase64, MIME_PDF } from "@/lib/download";
import {
  formatarBRL,
  formatarData,
  formatarDataHora,
  formatarQuantidade,
} from "@/lib/formatadores";
import {
  ROTULO_VINCULO,
  type Vinculo,
} from "@/modules/cadastros/colaboradores/schemas";
import { STATUS_FOLHA } from "@/modules/rh/_shared/formato";
import {
  aprovarFolha,
  desaprovarFolha,
  enviarFolhaParaAprovacao,
  gerarResumoFolhaPdf,
  mandarFolhaParaRevisao,
  tirarDaFolha,
  voltarFolhaParaRascunho,
  voltarParaFolha,
} from "@/modules/rh/folha/actions";
import { mensagemDeAprovacao } from "@/modules/rh/folha/mensagem-aprovacao";
import {
  retidoSemGrupoDeRecolhimento,
  type LancamentosDaFolhaAgrupados,
} from "@/modules/rh/folha/calculo";
import type {
  ColaboradorForaDaFolha,
  CustoCentroCusto,
  FolhaDetalhe,
  FolhaItem,
  ResumoEncargo,
  ResumoProvisao,
} from "@/modules/rh/folha/queries";
import { podeTransicionar } from "@/modules/rh/folha/transicoes";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { BotaoPlanilha } from "./botao-planilha";
import { EditarItemFolhaDrawer } from "./editar-item-folha-drawer";
import { GerarFolhaFormDrawer } from "./gerar-folha-form-drawer";
import { HoleriteDialog } from "./holerite-dialog";
import { LancamentosGerados } from "./lancamentos-gerados";
import { VencimentoFolha } from "./vencimento-folha";

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

/** Competência (yyyy-MM-01) como MM/AAAA. */
function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

/** Rótulo do centro de custo (código - nome) ou fallback. */
function rotuloCentroCusto(grupo: CustoCentroCusto): string {
  if (!grupo.centroCustoNome) return "Sem centro de custo";
  return grupo.centroCustoCodigo
    ? `${grupo.centroCustoCodigo} - ${grupo.centroCustoNome}`
    : grupo.centroCustoNome;
}

export interface FolhaDetalheViewProps {
  folha: FolhaDetalhe;
  custosPorCentro: CustoCentroCusto[];
  resumoEncargos: ResumoEncargo[];
  resumoProvisoes: ResumoProvisao[];
  /** Lançamentos gerados pela aprovação, já separados em salários/guias (Task 7). */
  lancamentos: LancamentosDaFolhaAgrupados;
  /** % do FGTS (parâmetros da folha) para o informativo do holerite. */
  fgtsPercentual: number;
  /**
   * Grupos de recolhimento dos retidos (`folha_parametros`). `null` quando a
   * linha de parâmetros nem existe. Só para o aviso de retido que não vira
   * conta a pagar: nada aqui muda valor nenhum.
   */
  gruposRetido: {
    grupoRecolhimentoInss: string | null;
    grupoRecolhimentoIrrf: string | null;
  } | null;
  trilha: EventoTrilha[];
  /**
   * Raízes e etapas ativas, para o seletor de centro de custo do editor de
   * linha. Vem da página (Server Component) e não de um fetch no cliente: são 73
   * linhas que não mudam durante a edição, e buscá-las ao abrir o drawer faria o
   * campo piscar vazio bem na hora de escolher.
   */
  centrosCusto: readonly CentroCustoOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
  /** Permissão de ver lançamento (financeiro.lancamentos:ver), pro link da seção de lançamentos. */
  podeVerLancamento: boolean;
}

/**
 * Detalhe da folha gerencial: cabeçalho com competência e status; KPIs de
 * bruto, encargos, custo total (custo da empresa) e líquido (o que o
 * colaborador recebe); barra de ações conforme o estado; a tabela de itens por
 * colaborador; e o custo alocado por centro de custo. Os valores são fechados
 * pelas funções do banco; aqui só se exibe. Regerar abre o drawer no rascunho.
 */
export function FolhaDetalheView({
  folha,
  custosPorCentro,
  resumoEncargos,
  resumoProvisoes,
  lancamentos,
  fgtsPercentual,
  gruposRetido,
  trilha,
  centrosCusto,
  podeCriar,
  podeEditar,
  podeAprovar,
  podeDesaprovar,
  podeVerLancamento,
}: FolhaDetalheViewProps) {
  const router = useRouter();
  const info = STATUS_FOLHA[folha.status];

  const rascunho = folha.status === "rascunho";
  // Enviar só existe de rascunho pra pendente_aprovacao: podeTransicionar é a
  // mesma fonte que o trigger do banco espelha, então a UI habilita exatamente
  // o que o UPDATE direto vai aceitar.
  const podeEnviar = podeTransicionar(folha.status, "pendente_aprovacao");
  // ApprovalBar cobre aprovar/rejeitar (a partir de pendente_aprovacao) e
  // desaprovar (a partir de aprovado) — os dois únicos status com alguma
  // transição de saída que não seja "enviar".
  const mostrarApprovalBar =
    podeTransicionar(folha.status, "aprovado") ||
    podeTransicionar(folha.status, "rascunho");
  // Sem faixas de INSS/IRRF cadastradas, todos os itens saem com desconto 0 e
  // o líquido vira igual ao bruto; avisamos para não passar a impressão errada.
  const semDescontosLegais =
    folha.itens.length > 0 &&
    folha.itens.every((item) => item.inss === 0 && item.irrf === 0);
  // Retido que não vai virar conta a pagar por falta de grupo de recolhimento.
  // Avisa e não bloqueia: config vazia é deploy seguro, e a folha pode servir só
  // como custo gerencial por um tempo. Mostrado já no rascunho, para o aviso
  // chegar ANTES de alguém aprovar. É a segunda causa de resíduo da identidade
  // de conferência (a lista tem duas; ver obj_description da fn_aprovar_folha).
  const retidoSemGrupo = retidoSemGrupoDeRecolhimento(folha, gruposRetido);
  const impostosSemGrupo = [
    retidoSemGrupo.inss > 0 ? "INSS" : null,
    retidoSemGrupo.irrf > 0 ? "IRRF" : null,
  ].filter((nome): nome is string => nome !== null);
  // Total da seção "Provisões por tipo": soma sobre `resumoProvisoes`, a
  // mesma fonte das linhas da tabela, para a linha de total sempre bater com
  // as duas colunas ao lado (ver comentário na própria linha, mais abaixo).
  const totalProvisoes = resumoProvisoes.reduce(
    (soma, provisao) => ({
      principal: soma.principal + provisao.principal,
      encargos: soma.encargos + provisao.encargos,
      total: soma.total + provisao.total,
    }),
    { principal: 0, encargos: 0, total: 0 },
  );

  // Alterar valor de linha só em rascunho: aprovado editado é folha que fecha
  // diferente do lançamento que já saiu no Financeiro. Mesma trava está na
  // fn_editar_item_folha, e as duas concordam de propósito.
  const podeEditarLinha = podeEditar && rascunho;
  // Quantas pessoas têm desconto de salário neste mês. O KPI diz isso em vez de
  // um percentual único, porque o desconto é por pessoa: "7,5% aplicado" seria
  // falso para as outras 57 linhas.
  const itensComDesconto = folha.itens.filter(
    (item) => item.descontos > 0,
  ).length;
  const detalheDescontos =
    itensComDesconto === 0
      ? "Ninguém com desconto neste mês"
      : `${itensComDesconto} ${
          itensComDesconto === 1 ? "pessoa" : "pessoas"
        } com desconto no salário`;

  const [dialogEnviar, setDialogEnviar] = React.useState(false);
  /** O PDF é gerado no servidor: sem o spinner, o botão parece não ter feito nada. */
  const [copiandoPedido, setCopiandoPedido] = React.useState(false);
  const [drawerRegerar, setDrawerRegerar] = React.useState(false);
  const [holeriteItem, setHoleriteItem] = React.useState<FolhaItem | null>(
    null,
  );
  const [itemEmEdicao, setItemEmEdicao] = React.useState<FolhaItem | null>(
    null,
  );
  /** Linha em que se clicou "Tirar": alimenta o diálogo de confirmação. */
  const [itemParaTirar, setItemParaTirar] = React.useState<FolhaItem | null>(
    null,
  );
  /**
   * Id do colaborador que está voltando para a folha, para o botão dele virar
   * spinner. Guarda o ID e não um booleano: com um booleano, clicar em "Colocar
   * de volta" numa linha deixaria TODAS as linhas girando, e a operação demora
   * (ela regenera a folha inteira).
   */
  const [voltandoId, setVoltandoId] = React.useState<string | null>(null);

  /**
   * Clicar na LINHA abre o editor daquela pessoa (pedido do Tiago, 29/08/2026).
   *
   * Ignora o clique que nasceu dentro de um controle: sem esta checagem, clicar
   * em "Holerite" abriria o holerite E o editor por baixo dele, e abrir o
   * `<details>` da provisão abriria o drawer junto.
   *
   * O botão "Editar" continua na linha de propósito: `<tr>` não vira botão
   * acessível (role="button" dentro de tabela quebra a semântica da grade), e
   * ele é o caminho que funciona por teclado e leitor de tela. O clique na linha
   * é atalho de mouse, não a única porta.
   */
  function aoClicarNaLinha(
    evento: React.MouseEvent<HTMLTableRowElement>,
    item: FolhaItem,
  ) {
    if (!podeEditarLinha) return;
    const alvo = evento.target as HTMLElement;
    if (alvo.closest("button, a, summary, input, select, textarea")) return;
    setItemEmEdicao(item);
  }

  async function aoTirarDaFolha(motivo?: string) {
    if (!itemParaTirar) return;
    const resultado = await tirarDaFolha(
      folha.id,
      itemParaTirar.colaboradorId,
      motivo,
    );
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`${itemParaTirar.colaboradorNome} saiu desta folha`);
    setItemParaTirar(null);
  }

  async function aoVoltarParaFolha(fora: ColaboradorForaDaFolha) {
    setVoltandoId(fora.colaboradorId);
    const resultado = await voltarParaFolha(folha.id, fora.colaboradorId);
    setVoltandoId(null);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`${fora.nome} voltou para esta folha`);
  }

  async function aoEnviarParaAprovacao() {
    const resultado = await enviarFolhaParaAprovacao(folha.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Folha enviada para aprovação");
    router.refresh();
  }

  async function aoAprovar() {
    const resultado = await aprovarFolha(folha.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Folha aprovada. Lançamentos gerados no Financeiro");
    router.refresh();
  }

  async function aoMandarParaRevisao(motivo: string) {
    const resultado = await mandarFolhaParaRevisao(folha.id, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Folha devolvida para revisão");
    router.refresh();
  }

  /**
   * Quem montou a folha puxa de volta o que enviou. Sem diálogo de confirmação:
   * a folha volta para rascunho e nada mais acontece — nenhum lançamento foi
   * gerado ainda, e reenviar é um clique. Pedir confirmação para desfazer algo
   * reversível é atrito sem contrapartida.
   */
  async function aoVoltarParaRascunho() {
    const resultado = await voltarFolhaParaRascunho(folha.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Folha de volta em rascunho");
    router.refresh();
  }

  /**
   * Copia o pedido de aprovação pronto para colar no WhatsApp.
   *
   * `window.location.origin` porque o link precisa apontar para onde a pessoa
   * está: uma constante mandaria o preview da Vercel para produção, e quem
   * recebesse aprovaria a folha errada.
   */
  /**
   * Copia a mensagem de aprovação E baixa o resumo em PDF (pedido do Tiago,
   * 29/08/2026: "a mensagem ... também envia um pdf com um resumo de cada
   * funcionário").
   *
   * Os dois numa ação só porque é uma coisa só na cabeça de quem usa: pedir a
   * aprovação. Não dá para o PDF viajar junto na área de transferência — o
   * WhatsApp não cola arquivo —, então ele desce como download e a pessoa anexa.
   * O toast é quem diz isso, senão o arquivo aparece na pasta sem explicação.
   *
   * A ORDEM IMPORTA: o PDF primeiro. Se ele falhar, a mensagem não é copiada e o
   * erro aparece — copiar antes deixaria a pessoa mandar o pedido achando que o
   * anexo estava junto.
   */
  async function aoCopiarMensagem() {
    if (copiandoPedido) return;
    setCopiandoPedido(true);
    try {
      const resumo = await gerarResumoFolhaPdf(folha.id);
      if ("erro" in resumo) {
        toast.error(resumo.erro);
        return;
      }

      const texto = mensagemDeAprovacao(
        {
          id: folha.id,
          competencia: folha.competencia,
          colaboradores: folha.itens.length,
          custoTotal: folha.custoTotal,
          liquido: folha.valorLiquido,
        },
        window.location.origin,
      );

      try {
        await navigator.clipboard.writeText(texto);
      } catch {
        // `writeText` falha sem permissão de área de transferência (navegador
        // antigo, http, aba sem foco). Avisar é melhor que o silêncio de um
        // botão que parece ter funcionado. O PDF já foi gerado, então o aviso
        // diz o que sobrou de utilizável.
        toast.error(
          "Não foi possível copiar a mensagem. Verifique a permissão de área de transferência do navegador",
        );
        return;
      }

      baixarBase64(resumo.base64, resumo.nomeArquivo, MIME_PDF);
      toast.success(
        "Mensagem copiada e resumo baixado. Cole no WhatsApp e anexe o PDF",
      );
    } finally {
      setCopiandoPedido(false);
    }
  }

  async function aoDesaprovar(motivo: string) {
    const resultado = await desaprovarFolha(folha.id, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Aprovação desfeita. Lançamentos apagados");
    router.refresh();
  }

  /**
   * O que dá para fazer enquanto a folha espera aprovação, do lado de quem a
   * montou. Some assim que ela é aprovada: aí o caminho de volta é Desaprovar,
   * que apaga lançamento e exige motivo.
   */
  const acoesDaEspera =
    folha.status === "pendente_aprovacao" ? (
      <>
        <Button
          type="button"
          variant="outline"
          disabled={copiandoPedido}
          onClick={aoCopiarMensagem}
        >
          {copiandoPedido ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <Copy />
          )}
          Copiar pedido
        </Button>
        {podeEditar ? (
          <Button type="button" variant="outline" onClick={aoVoltarParaRascunho}>
            <Undo2 />
            Voltar para rascunho
          </Button>
        ) : null}
      </>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        className="mb-0"
        modulo="RH · Folha"
        titulo={
          <span className="tabular-nums">
            {formatarCompetencia(folha.competencia)}
          </span>
        }
        descricao={
          <>
            Folha gerencial · {folha.itens.length}{" "}
            {folha.itens.length === 1 ? "colaborador" : "colaboradores"}
            {folha.status === "aprovado" && folha.aprovadoEm
              ? ` · aprovada em ${formatarDataHora(folha.aprovadoEm)}${
                  folha.aprovadoPorNome ? ` por ${folha.aprovadoPorNome}` : ""
                }`
              : ""}
          </>
        }
        voltarPara={{ rota: "/rh/folha", rotulo: "Voltar para as folhas" }}
        selos={<StatusBadge status={info.badge} rotulo={info.rotulo} />}
        acoes={
          <>
          {podeCriar && rascunho ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDrawerRegerar(true)}
            >
              <RefreshCw />
              Regerar
            </Button>
          ) : null}
          {podeEditar && podeEnviar && folha.itens.length > 0 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setDialogEnviar(true)}
            >
              Enviar para aprovação
            </Button>
          ) : null}
          <BotaoPlanilha folhaId={folha.id} />
          </>
        }
      />

      {/*
        Antes da ApprovalBar de propósito: quem vai aprovar precisa ver para
        quando a folha está programada ANTES de bater o martelo, não depois de
        rolar a página até os lançamentos.
      */}
      <VencimentoFolha
        folhaId={folha.id}
        status={folha.status}
        dataVencimento={folha.dataVencimento}
        podeEditar={podeEditar}
      />

      {mostrarApprovalBar ? (
        <ApprovalBar
          status={folha.status}
          rotulo={info.rotulo}
          podeAprovar={podeAprovar}
          podeDesaprovar={podeDesaprovar}
          onAprovar={aoAprovar}
          onRejeitar={aoMandarParaRevisao}
          onDesaprovar={aoDesaprovar}
          textosRejeitar={{
            botao: "Mandar para revisão",
            titulo: "Mandar a folha para revisão",
            descricao:
              "Diga o que precisa ser corrigido. A folha volta para rascunho e o motivo aparece para quem for ajustar.",
            confirmar: "Mandar para revisão",
          }}
          acoesExtras={acoesDaEspera}
        />
      ) : null}

      {semDescontosLegais ? (
        <div className="rounded-md border border-status-pendente/30 bg-status-pendente/5 px-4 py-3">
          <p className="text-detalhe text-foreground">
            Sem descontos legais aplicados (INSS e IRRF zerados). Cadastre as
            faixas vigentes em Parâmetros da Folha para a folha calcular os
            descontos.
          </p>
        </div>
      ) : null}

      {impostosSemGrupo.length > 0 ? (
        <div className="rounded-md border border-status-pendente/30 bg-status-pendente/5 px-4 py-3">
          <p className="text-detalhe text-foreground">
            {impostosSemGrupo.join(" e ")} retido dos colaboradores, somando{" "}
            <MoneyText valor={retidoSemGrupo.total} />, não vira conta a pagar:{" "}
            {impostosSemGrupo.length > 1
              ? "os grupos de recolhimento estão"
              : "o grupo de recolhimento está"}{" "}
            sem configuração. O desconto continua no holerite e no líquido, mas
            a guia que a empresa recolhe não aparece no Financeiro. Configure em
            RH &gt; Parâmetros da Folha (/rh/parametros-folha)
            {folha.status === "aprovado"
              ? " e depois desaprove e reaprove esta folha, para a aprovação gerar a guia."
              : " antes de aprovar."}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPICard
          titulo="Bruto"
          valor={<MoneyText valor={folha.valorBruto} />}
          detalhe={
            folha.valorGratificacoes > 0
              ? `Salário base + extras + gratificação (${formatarBRL(folha.valorGratificacoes)})`
              : "Salário base + extras + gratificação"
          }
        />
        <KPICard
          titulo="Descontos"
          valor={<MoneyText valor={folha.valorDescontos} />}
          detalhe={detalheDescontos}
        />
        <KPICard
          titulo="Custo total"
          valor={<MoneyText valor={folha.custoTotal} />}
          detalhe="Custo da empresa (bruto + provisão)"
        />
        <KPICard
          titulo="Líquido"
          valor={<MoneyText valor={folha.valorLiquido} />}
          detalhe={
            semDescontosLegais
              ? "A receber (bruto − descontos − adiantamentos)"
              : "A receber (bruto − INSS − IRRF − descontos − adiantamentos)"
          }
        />
      </div>

      {folha.motivoRejeicao && rascunho ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-legenda font-medium text-destructive">
            Motivo do registro
          </p>
          <p className="text-detalhe text-foreground">{folha.motivoRejeicao}</p>
        </div>
      ) : null}

      <Secao titulo="Itens por colaborador">
        {folha.itens.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">
            Nenhum colaborador nesta folha. Entram os colaboradores ativos de
            vínculo CLT, terceiro e diarista: CLT e terceiro pelo salário do
            cadastro, diarista pela soma das diárias em aberto do mês. Confira o
            cadastro e regere a folha.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-detalhe">
              <thead>
                {/* Centralizado é o padrão de tabela do app (ver DataTable); só
                    dinheiro, quantidade, total, percentual e horas vão à
                    direita. */}
                <tr className="border-b border-border text-legenda text-muted-foreground">
                  <th className="px-3 py-2 text-center font-medium">
                    Colaborador
                  </th>
                  <th className="px-3 py-2 text-center font-medium">Vínculo</th>
                  <th className="px-3 py-2 text-center font-medium">Função</th>
                  <th className="px-3 py-2 text-center font-medium">
                    Centro de custo
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Salário base
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Gratificação
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Horas normais
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Horas extras
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Valor extras
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Desconto</th>
                  <th className="px-3 py-2 text-right font-medium">Provisão</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Adiantamentos
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Custo total
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Líquido</th>
                  <th className="px-3 py-2 text-right font-medium">
                    <span className="sr-only">Ações da linha</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {folha.itens.map((item) => (
                  <tr
                    key={item.id}
                    className={
                      podeEditarLinha
                        ? "cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                        : "border-b border-border last:border-0"
                    }
                    title={
                      podeEditarLinha
                        ? `Editar a linha de ${item.colaboradorNome}`
                        : undefined
                    }
                    onClick={(evento) => aoClicarNaLinha(evento, item)}
                  >
                    <td className="px-3 py-2 text-center font-medium">
                      {item.colaboradorNome}
                      {/* Selo de linha editada à mão: sem ele, um salário
                          ajustado e um salário vindo do cadastro ficam
                          indistinguíveis, e o Regerar trata os dois de formas
                          diferentes (preserva um, recalcula o outro). */}
                      {item.editadoManualmente ? (
                        <span
                          className="ml-1.5 align-middle text-legenda font-normal text-status-pendente"
                          title="Valores desta linha foram alterados à mão. Regerar a folha preserva o que foi digitado."
                        >
                          editado
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">
                      {ROTULO_VINCULO[item.colaboradorVinculo as Vinculo] ??
                        item.colaboradorVinculo}
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">
                      {item.colaboradorFuncao ?? <CelulaVazia />}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {item.centroCustoNome ? (
                        <span>
                          {item.centroCustoCodigo ? (
                            <span className="codigo-doc text-muted-foreground">
                              {item.centroCustoCodigo}{" "}
                            </span>
                          ) : null}
                          {item.centroCustoNome}
                        </span>
                      ) : (
                        <CelulaVazia />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={item.salarioBase} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {item.gratificacao > 0 ? (
                        <MoneyText valor={item.gratificacao} />
                      ) : (
                        <span className="text-muted-foreground">
                          <MoneyText valor={0} />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarQuantidade(item.horasNormais)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarQuantidade(item.horasExtras)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={item.valorExtras} />
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {/* Só o valor, sem legenda. Aqui havia o percentual
                          embaixo ("7,5% desta pessoa"), que explicava de onde
                          vinham os R$ 121,58 — mas desde 26/08/2026 não vêm de
                          conta nenhuma: o desconto é digitado em reais, porque
                          7,5% de R$ 1.621,00 dá 121,575 e o centavo que o
                          contracheque usa não se deduz por fórmula. Repetir
                          "121,58 (7,5%)" agora seria afirmar uma origem que o
                          número não tem.
                          Quem não tem desconto fica com um R$ 0,00 apagado, e
                          não em branco: coluna de dinheiro com célula vazia se
                          lê como dado faltando. */}
                      {item.descontos > 0 ? (
                        // As HORAS embaixo do valor, quando o desconto foi
                        // informado por elas (26/08/2026). Diferente do
                        // percentual que ficava aqui antes: hora não é uma
                        // fórmula que reproduz o valor, é o motivo do desconto —
                        // e é o que responde "por que saíram R$ 64,84 desta
                        // pessoa" sem abrir a linha.
                        <div className="flex flex-col items-end">
                          <MoneyText valor={item.descontos} />
                          {item.descontoHoras !== null &&
                          item.descontoHoras > 0 ? (
                            <span className="text-legenda">
                              {formatarQuantidade(item.descontoHoras)}h não
                              trabalhadas
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          <MoneyText valor={0} />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {item.provisoesDetalhe.length > 0 ? (
                        <details className="group">
                          <summary className="flex cursor-pointer list-none items-center justify-end gap-1 select-none [&::-webkit-details-marker]:hidden">
                            <MoneyText valor={item.provisoes} />
                            <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
                          </summary>
                          <ul className="mt-1.5 space-y-1 border-t border-border pt-1.5 text-left text-legenda">
                            {item.provisoesDetalhe.map((provisao) => (
                              <li
                                key={provisao.nome}
                                className="flex flex-col gap-0.5"
                              >
                                <span className="font-medium text-foreground">
                                  {provisao.nome}
                                </span>
                                <span className="flex items-center justify-between gap-3">
                                  <span>Principal</span>
                                  <MoneyText valor={provisao.valorPrincipal} />
                                </span>
                                <span className="flex items-center justify-between gap-3">
                                  <span>Encargos</span>
                                  <MoneyText valor={provisao.valorEncargos} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <MoneyText valor={item.provisoes} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      <MoneyText valor={item.adiantamentos} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText
                        valor={item.custoTotal}
                        className="font-medium"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText
                        valor={item.valorLiquido}
                        className="font-medium"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {podeEditarLinha ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setItemEmEdicao(item)}
                          >
                            <Pencil />
                            Editar
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setHoleriteItem(item)}
                        >
                          <FileText />
                          Holerite
                        </Button>
                        {podeEditarLinha ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title={`Tirar ${item.colaboradorNome} desta folha`}
                            onClick={() => setItemParaTirar(item)}
                          >
                            <UserMinus />
                            Tirar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {/*
        Quem foi tirado desta folha. A seção só existe quando há alguém fora:
        um bloco vazio permanente daria a entender que tirar gente da folha é
        parte do fluxo normal, e não a exceção que é.

        Sem esta lista não haveria caminho de volta: quem sai perde a linha em
        `folha_itens` e simplesmente desapareceria da tela.
      */}
      {folha.foraDaFolha.length > 0 ? (
        <Secao titulo={`Fora desta folha (${folha.foraDaFolha.length})`}>
          <p className="mb-2 text-detalhe text-muted-foreground">
            Estes colaboradores continuam ativos na empresa e entram
            normalmente na folha da próxima competência. Eles só não entram
            nesta, nem nos totais acima.
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-detalhe">
              <thead>
                <tr className="border-b border-border text-legenda text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">
                    Colaborador
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Função</th>
                  <th className="px-3 py-2 text-left font-medium">Motivo</th>
                  <th className="px-3 py-2 text-right font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {folha.foraDaFolha.map((fora) => (
                  <tr
                    key={fora.colaboradorId}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{fora.nome}</span>
                        <span className="text-legenda text-muted-foreground">
                          {ROTULO_VINCULO[fora.vinculo as Vinculo] ??
                            fora.vinculo}
                          {" · tirado em "}
                          {formatarData(fora.tiradoEm)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {fora.funcao ?? <CelulaVazia />}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {fora.motivo ?? <CelulaVazia />}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {podeEditarLinha ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={voltandoId !== null}
                          onClick={() => void aoVoltarParaFolha(fora)}
                        >
                          {voltandoId === fora.colaboradorId ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <UserPlus />
                          )}
                          Colocar de volta
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      ) : null}

      <Secao titulo="Custo por centro de custo">
        {custosPorCentro.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">
            Sem custo alocado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-detalhe">
              <thead>
                <tr className="border-b border-border text-legenda text-muted-foreground">
                  <th className="px-3 py-2 text-center font-medium">
                    Centro de custo
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Custo total
                  </th>
                </tr>
              </thead>
              <tbody>
                {custosPorCentro.map((grupo) => (
                  <tr
                    key={grupo.centroCustoId ?? "__sem_centro__"}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 text-center">
                      {rotuloCentroCusto(grupo)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={grupo.custoTotal} />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="px-3 py-2 text-center font-semibold">Total</td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText
                      valor={folha.custoTotal}
                      className="font-semibold"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {resumoEncargos.length > 0 ? (
        <Secao titulo="Encargos por tipo">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-detalhe">
              <thead>
                <tr className="border-b border-border text-legenda text-muted-foreground">
                  <th className="px-3 py-2 text-center font-medium">Encargo</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumoEncargos.map((encargo) => (
                  <tr
                    key={encargo.nome}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 text-center">{encargo.nome}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={encargo.total} />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="px-3 py-2 text-center font-semibold">Total</td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText
                      valor={folha.valorEncargos}
                      className="font-semibold"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Secao>
      ) : null}

      {resumoProvisoes.length > 0 ? (
        <Secao titulo="Provisões por tipo">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-detalhe">
              <thead>
                <tr className="border-b border-border text-legenda text-muted-foreground">
                  <th className="px-3 py-2 text-center font-medium">
                    Provisão
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Principal
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Encargos</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumoProvisoes.map((provisao) => (
                  <tr
                    key={provisao.nome}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 text-center">{provisao.nome}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={provisao.principal} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={provisao.encargos} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText
                        valor={provisao.total}
                        className="font-medium"
                      />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="px-3 py-2 text-center font-semibold">Total</td>
                  {/* Fonte única: soma sobre `resumoProvisoes`, a mesma lista
                      que preenche as linhas acima — as 3 células desta linha
                      sempre somam entre si. `folha.valorProvisoes` (o banco) é
                      a fonte do KPI de custo total, onde uma eventual
                      divergência entre item e consolidado aparece. */}
                  <td className="px-3 py-2 text-right">
                    <MoneyText
                      valor={totalProvisoes.principal}
                      className="font-semibold"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText
                      valor={totalProvisoes.encargos}
                      className="font-semibold"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText
                      valor={totalProvisoes.total}
                      className="font-semibold"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Secao>
      ) : null}

      <Secao titulo="Lançamentos gerados">
        <LancamentosGerados
          status={folha.status}
          agrupado={lancamentos}
          podeVerLancamento={podeVerLancamento}
        />
      </Secao>

      <Secao titulo="Trilha">
        <Trilha eventos={trilha} />
      </Secao>

      {podeCriar && rascunho ? (
        <GerarFolhaFormDrawer
          aberto={drawerRegerar}
          onAbertoChange={setDrawerRegerar}
          competenciaInicial={folha.competencia.slice(0, 7)}
          onGerada={() => router.refresh()}
        />
      ) : null}

      {podeEditarLinha ? (
        <EditarItemFolhaDrawer
          aberto={itemEmEdicao !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setItemEmEdicao(null);
          }}
          item={itemEmEdicao}
          folhaId={folha.id}
          centros={centrosCusto}
          onSalvo={() => router.refresh()}
        />
      ) : null}

      {podeEditar && podeEnviar && folha.itens.length > 0 ? (
        <ConfirmDialog
          aberto={dialogEnviar}
          onAbertoChange={setDialogEnviar}
          titulo="Enviar para aprovação"
          descricao="A folha vai para o Admin aprovar. Enquanto estiver pendente, ela não pode ser regerada."
          textoConfirmar="Enviar para aprovação"
          onConfirmar={aoEnviarParaAprovacao}
        />
      ) : null}

      {/*
        A descrição responde a pergunta que o botão provoca — "isso demite a
        pessoa?" — antes de alguém precisar perguntar. E avisa que a folha é
        regerada, porque a operação demora alguns segundos e mexe nos totais.

        O motivo é EXIGIDO aqui, embora a coluna aceite null: em setembro alguém
        vai querer saber por que fulano não recebeu em agosto, e essa é a única
        parte que a auditoria não consegue reconstruir sozinha.

        Condição própria (`podeEditarLinha`), e não a do diálogo de enviar: esta
        ação existe em rascunho mesmo quando a folha ainda não tem item nenhum
        para enviar.
      */}
      {podeEditarLinha ? (
        <ConfirmDialog
          aberto={itemParaTirar !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setItemParaTirar(null);
          }}
          titulo={
            itemParaTirar
              ? `Tirar ${itemParaTirar.colaboradorNome} desta folha`
              : "Tirar da folha"
          }
          descricao="Ele NÃO é desligado da empresa: continua ativo e entra normalmente na folha da próxima competência. Só sai desta, e os totais são recalculados."
          textoConfirmar="Tirar desta folha"
          variante="destrutivo"
          exigeMotivo
          onConfirmar={aoTirarDaFolha}
        />
      ) : null}

      <HoleriteDialog
        item={holeriteItem}
        competencia={folha.competencia}
        fgtsPercentual={fgtsPercentual}
        aberto={holeriteItem !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setHoleriteItem(null);
        }}
      />
    </div>
  );
}
