"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import {
  ApprovalBar,
  CampoFormulario,
  Combobox,
  ConfirmDialog,
  GradeKpis,
  InputMoeda,
  KPICard,
  LinhaCampos,
  MoneyText,
  Trilha,
  type EventoTrilha,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import {
  ROTULO_AVISO,
  ROTULO_TIPO_RESCISAO,
  STATUS_RESCISAO,
} from "@/modules/rh/rescisoes/formato";
import {
  adicionarItemRescisao,
  aprovarRescisao,
  desaprovarRescisao,
  editarItemRescisao,
  enviarRescisaoParaAprovacao,
  rejeitarRescisao,
  removerItemRescisao,
} from "@/modules/rh/rescisoes/actions";
import type {
  ItemRescisao,
  RescisaoDetalhe as RescisaoDetalheDados,
} from "@/modules/rh/rescisoes/queries";

import { GerarRescisaoDrawer } from "./gerar-rescisao-drawer";
import { ReciboRescisaoDialog } from "./recibo-rescisao-dialog";

export interface RescisaoDetalheProps {
  rescisao: RescisaoDetalheDados;
  trilha: EventoTrilha[];
  podeEditar: boolean;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
}

/** Número do banco no formato que o InputMoeda edita. */
function paraCampo(valor: number): string {
  return String(valor).replace(".", ",");
}

export function RescisaoDetalhe({
  rescisao,
  trilha,
  podeEditar,
  podeAprovar,
  podeDesaprovar,
}: RescisaoDetalheProps) {
  const router = useRouter();
  const [itemEditando, setItemEditando] = React.useState<ItemRescisao | null>(
    null,
  );
  const [valorEditado, setValorEditado] = React.useState("");
  const [salvandoItem, setSalvandoItem] = React.useState(false);
  const [itemParaRemover, setItemParaRemover] =
    React.useState<ItemRescisao | null>(null);
  const [adicionando, setAdicionando] = React.useState(false);
  const [novaDescricao, setNovaDescricao] = React.useState("");
  const [novaNatureza, setNovaNatureza] = React.useState("desconto");
  const [novoValor, setNovoValor] = React.useState("");
  const [salvandoNova, setSalvandoNova] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [recalcularAberto, setRecalcularAberto] = React.useState(false);

  const emRascunho = rescisao.status === "rascunho";
  const podeMexer = podeEditar && emRascunho;
  const info = STATUS_RESCISAO[rescisao.status];

  const proventos = rescisao.itens.filter(
    (item) => item.natureza === "provento",
  );
  const descontos = rescisao.itens.filter(
    (item) => item.natureza === "desconto",
  );

  async function salvarItem() {
    if (!itemEditando) return;
    setSalvandoItem(true);
    const resultado = await editarItemRescisao({
      itemId: itemEditando.id,
      valor: valorEditado,
    });
    setSalvandoItem(false);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Verba atualizada");
    setItemEditando(null);
    router.refresh();
  }

  async function salvarNova() {
    setSalvandoNova(true);
    const resultado = await adicionarItemRescisao({
      rescisaoId: rescisao.id,
      descricao: novaDescricao,
      natureza: novaNatureza,
      valor: novoValor,
    });
    setSalvandoNova(false);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Verba acrescentada");
    setAdicionando(false);
    setNovaDescricao("");
    setNovoValor("");
    router.refresh();
  }

  function linhasDaSecao(itens: ItemRescisao[]) {
    if (itens.length === 0) {
      return (
        <tr>
          <td
            colSpan={podeMexer ? 4 : 3}
            className="text-muted-foreground px-3 py-3 text-[13px]"
          >
            Nenhuma verba nesta seção.
          </td>
        </tr>
      );
    }
    return itens.map((item) => (
      <tr key={item.id} className="border-border border-t">
        <td className="px-3 py-2">
          <span className="font-medium">{item.descricao}</span>
          {item.editadoManualmente ? (
            <span className="text-muted-foreground ml-2 text-[11px] uppercase">
              editado
            </span>
          ) : null}
        </td>
        <td className="text-muted-foreground px-3 py-2 text-[13px]">
          {item.referencia ?? "—"}
        </td>
        <td className="px-3 py-2 text-right">
          <MoneyText valor={item.valor} />
        </td>
        {podeMexer ? (
          <td className="px-3 py-2 text-right whitespace-nowrap">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setItemEditando(item);
                setValorEditado(paraCampo(item.valor));
              }}
            >
              <Pencil />
              Editar
            </Button>
            {item.codigo === null ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setItemParaRemover(item)}
              >
                <Trash2 />
                Remover
              </Button>
            ) : null}
          </td>
        ) : null}
      </tr>
    ));
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => router.push("/rh/rescisoes")}
      >
        <ArrowLeft />
        Rescisões
      </Button>

      <div className="border-border bg-surface rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-muted-foreground">
              {rescisao.numero}
            </p>
            <h2 className="text-lg font-semibold">
              {rescisao.colaboradorNome}
            </h2>
            <p className="text-muted-foreground text-[13px]">
              {ROTULO_TIPO_RESCISAO[rescisao.tipo]} · aviso{" "}
              {ROTULO_AVISO[rescisao.aviso].toLowerCase()} · desligamento em{" "}
              {formatarData(rescisao.dataDesligamento)}
            </p>
          </div>
          <ReciboRescisaoDialog rescisao={rescisao} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] md:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Admissão</dt>
            <dd>{formatarData(rescisao.colaboradorAdmissao) || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Base da rescisão</dt>
            <dd className="tabular-nums">
              {formatarBRL(rescisao.remuneracaoBase)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Saldo do FGTS informado</dt>
            <dd className="tabular-nums">{formatarBRL(rescisao.saldoFgts)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vencimento do pagamento</dt>
            <dd>{formatarData(rescisao.dataVencimento) || "—"}</dd>
          </div>
        </dl>
      </div>

      {/* Os dois avisos que mudam o que a pessoa recebe, e que o sistema não
          resolve sozinho. Ficam ANTES da tabela: depois dela ninguém lê. */}
      {emRascunho ? (
        <div className="space-y-2">
          {rescisao.periodosVencidosSugeridos !== null &&
          rescisao.periodosVencidosSugeridos > 0 &&
          rescisao.feriasVencidasPeriodos === 0 ? (
            <p className="border-status-pendente/30 bg-status-pendente/5 text-status-pendente flex gap-2 rounded-md border p-3 text-[13px]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                A rescisão está com <strong>zero</strong> período de férias
                vencidas. Desde a admissão há{" "}
                {rescisao.periodosVencidosSugeridos} período(s) aquisitivo(s)
                completo(s) e nenhuma férias registrada no sistema — confira
                quantos realmente estão vencidos e recalcule.
              </span>
            </p>
          ) : null}
          {rescisao.adiantamentoEmAberto > 0 ? (
            <p className="border-status-pendente/30 bg-status-pendente/5 text-status-pendente flex gap-2 rounded-md border p-3 text-[13px]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {rescisao.colaboradorNome} tem{" "}
                {formatarBRL(rescisao.adiantamentoEmAberto)} de adiantamento em
                aberto. A rescisão <strong>não desconta sozinha</strong>: a
                folha da competência ainda vai descontar o que couber. Se
                precisar cobrar o resto aqui, acrescente uma verba de desconto.
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {rescisao.motivoRejeicao ? (
        <p className="border-status-rejeitado/30 bg-status-rejeitado/5 text-status-rejeitado rounded-md border p-3 text-[13px]">
          <strong>Devolvida:</strong> {rescisao.motivoRejeicao}
        </p>
      ) : null}

      <GradeKpis>
        <KPICard
          titulo="Proventos"
          valor={<MoneyText valor={rescisao.valorProventos} />}
          detalhe={`${proventos.length} verba(s)`}
        />
        <KPICard
          titulo="Descontos"
          valor={<MoneyText valor={rescisao.valorDescontos} />}
          detalhe={`${descontos.length} verba(s)`}
        />
        <KPICard
          titulo="Líquido a pagar"
          valor={<MoneyText valor={rescisao.valorLiquido} />}
          detalhe={
            rescisao.lancamentoId
              ? "Conta a pagar gerada na aprovação"
              : "A conta a pagar nasce na aprovação"
          }
        />
      </GradeKpis>

      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted-foreground text-left text-[12px] uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Verba</th>
              <th className="px-3 py-2 font-medium">Referência</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              {podeMexer ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-surface/60">
              <td
                colSpan={podeMexer ? 4 : 3}
                className="px-3 py-1.5 text-[12px] font-semibold uppercase"
              >
                Proventos
              </td>
            </tr>
            {linhasDaSecao(proventos)}
            <tr className="bg-surface/60 border-border border-t">
              <td
                colSpan={podeMexer ? 4 : 3}
                className="px-3 py-1.5 text-[12px] font-semibold uppercase"
              >
                Descontos
              </td>
            </tr>
            {linhasDaSecao(descontos)}
          </tbody>
          <tfoot className="border-border bg-surface border-t-2">
            <tr>
              <td colSpan={2} className="px-3 py-2 font-semibold">
                Líquido a pagar
              </td>
              <td className="px-3 py-2 text-right font-semibold">
                <MoneyText valor={rescisao.valorLiquido} />
              </td>
              {podeMexer ? <td /> : null}
            </tr>
          </tfoot>
        </table>
      </div>

      {podeMexer ? (
        <div className="border-border rounded-lg border p-3">
          {adicionando ? (
            <div className="space-y-3">
              <LinhaCampos>
                <CampoFormulario
                  id="nova-verba-descricao"
                  rotulo="Descrição"
                  largura="medio"
                >
                  <Input
                    id="nova-verba-descricao"
                    value={novaDescricao}
                    onChange={(evento) => setNovaDescricao(evento.target.value)}
                    placeholder="Pensão alimentícia, vale-transporte..."
                    disabled={salvandoNova}
                  />
                </CampoFormulario>
                <CampoFormulario
                  id="nova-verba-natureza"
                  rotulo="Natureza"
                  largura="curto"
                >
                  <Combobox
                    valor={novaNatureza}
                    onValorChange={setNovaNatureza}
                    opcoes={[
                      { valor: "provento", rotulo: "Provento" },
                      { valor: "desconto", rotulo: "Desconto" },
                    ]}
                    disabled={salvandoNova}
                  />
                </CampoFormulario>
                <CampoFormulario
                  id="nova-verba-valor"
                  rotulo="Valor"
                  largura="curto"
                >
                  <InputMoeda
                    id="nova-verba-valor"
                    valor={novoValor}
                    onValorChange={setNovoValor}
                    disabled={salvandoNova}
                  />
                </CampoFormulario>
              </LinhaCampos>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={salvarNova}
                  disabled={salvandoNova || novaDescricao.trim().length < 2}
                >
                  {salvandoNova ? (
                    <LoaderCircle
                      className="size-4 animate-spin"
                      aria-hidden
                    />
                  ) : null}
                  Acrescentar verba
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAdicionando(false)}
                  disabled={salvandoNova}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAdicionando(true)}
            >
              <Plus />
              Acrescentar verba
            </Button>
          )}
        </div>
      ) : null}

      <ApprovalBar
        status={rescisao.status}
        rotulo={info.rotulo}
        podeAprovar={podeAprovar}
        podeDesaprovar={podeDesaprovar}
        onAprovar={async () => {
          const resultado = await aprovarRescisao(rescisao.id);
          if ("erro" in resultado) {
            toast.error(resultado.erro);
            return;
          }
          toast.success(
            `${rescisao.colaboradorNome} foi desligado e a conta a pagar foi gerada`,
          );
          router.refresh();
        }}
        onRejeitar={async (motivo) => {
          const resultado = await rejeitarRescisao({
            rescisaoId: rescisao.id,
            motivo,
          });
          if ("erro" in resultado) {
            toast.error(resultado.erro);
            return;
          }
          toast.success("Rescisão devolvida para rascunho");
          router.refresh();
        }}
        onDesaprovar={async (motivo) => {
          const resultado = await desaprovarRescisao({
            rescisaoId: rescisao.id,
            motivo,
          });
          if ("erro" in resultado) {
            toast.error(resultado.erro);
            return;
          }
          toast.success(
            `${rescisao.colaboradorNome} voltou a ficar ativo e a conta a pagar foi apagada`,
          );
          router.refresh();
        }}
        textosRejeitar={{
          botao: "Devolver",
          titulo: "Devolver a rescisão",
          descricao:
            "A rescisão volta para rascunho e pode ser corrigida. Informe o motivo; ele fica registrado na auditoria.",
          confirmar: "Devolver",
        }}
        acoesExtras={
          podeMexer ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRecalcularAberto(true)}
              >
                <RefreshCw />
                Recalcular
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={enviando}
                onClick={async () => {
                  setEnviando(true);
                  const resultado = await enviarRescisaoParaAprovacao(
                    rescisao.id,
                  );
                  setEnviando(false);
                  if ("erro" in resultado) {
                    toast.error(resultado.erro);
                    return;
                  }
                  toast.success("Rescisão enviada para aprovação");
                  router.refresh();
                }}
              >
                {enviando ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : null}
                Enviar para aprovação
              </Button>
            </>
          ) : undefined
        }
      />

      <Trilha eventos={trilha} />

      <ConfirmDialog
        aberto={itemEditando !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setItemEditando(null);
        }}
        titulo={`Editar ${itemEditando?.descricao ?? "verba"}`}
        descricao="O valor digitado passa a valer e sobrevive ao Recalcular. Para tirar a verba da conta, deixe R$ 0,00."
        textoConfirmar={salvandoItem ? "Salvando..." : "Salvar valor"}
        conteudo={
          <CampoFormulario id="verba-valor" rotulo="Valor">
            <InputMoeda
              id="verba-valor"
              valor={valorEditado}
              onValorChange={setValorEditado}
              disabled={salvandoItem}
            />
          </CampoFormulario>
        }
        onConfirmar={salvarItem}
      />

      <ConfirmDialog
        aberto={itemParaRemover !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setItemParaRemover(null);
        }}
        titulo="Remover a verba"
        descricao={`"${itemParaRemover?.descricao ?? ""}" sai do documento e do total. Só linhas acrescentadas à mão podem ser removidas.`}
        textoConfirmar="Remover"
        variante="destrutivo"
        onConfirmar={async () => {
          if (!itemParaRemover) return;
          const resultado = await removerItemRescisao(itemParaRemover.id);
          if ("erro" in resultado) {
            toast.error(resultado.erro);
            return;
          }
          toast.success("Verba removida");
          setItemParaRemover(null);
          router.refresh();
        }}
      />

      {podeMexer ? (
        <GerarRescisaoDrawer
          aberto={recalcularAberto}
          onAbertoChange={setRecalcularAberto}
          colaboradores={[
            {
              id: rescisao.colaboradorId,
              nome: rescisao.colaboradorNome,
              salario: rescisao.remuneracaoBase,
              dataAdmissao: rescisao.colaboradorAdmissao,
            },
          ]}
          onGerada={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
