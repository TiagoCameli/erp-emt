"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputPreco,
  InputQuantidade,
  LinhaCampos,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  agoraDataHoraLocal,
  dataHoraLocalParaIso,
  formatarLitros,
  isoParaDataHoraLocal,
} from "@/modules/combustivel/_shared/rotulos";
import {
  consultarCombustivelNaData,
  consultarEstoqueTransferencia,
  consultarPrecoMedioTanque,
  salvarTransferencia,
} from "@/modules/combustivel/transferencias/actions";
import type { TransferenciaLinha } from "@/modules/combustivel/transferencias/queries";
import {
  avaliarBloqueios,
  conflitoDeCombustivel,
  ehEdicaoSoDeMetadados,
  enviaValor,
  valorAutomatico,
  type CamposFisicos,
} from "@/modules/combustivel/transferencias/regras";
import {
  litrosParaTexto,
  paraLitros,
  transferenciaDoForm,
  transferenciaFormSchema,
  valorParaTexto,
  type TransferenciaFormInput,
} from "@/modules/combustivel/transferencias/schemas";
import { useConsulta, valorDaConsulta } from "./use-estoque-na-data";

const ID_FORM = "form-transferencia";

/** Tanque da EMT oferecido no formulário (nunca de terceiro). */
export interface TanqueOpcao {
  id: string;
  nome: string;
  nivel: number;
  capacidade: number;
  combustivelId: string | null;
  combustivelNome: string | null;
}

function valoresIniciais(transferencia: TransferenciaLinha | null | undefined): TransferenciaFormInput {
  return {
    origemId: transferencia?.origemId ?? "",
    destinoId: transferencia?.destinoId ?? "",
    litros: transferencia ? litrosParaTexto(transferencia.litros) : "",
    // A origem começa em 0 na criação; na edição, o valor salvo.
    valorTotal: transferencia ? valorParaTexto(transferencia.valorTotal) || "0" : "0",
    dataHora: transferencia ? isoParaDataHoraLocal(transferencia.dataHora) : agoraDataHoraLocal(),
    observacoes: transferencia?.observacoes ?? "",
  };
}

/** "Tanque Base (1.234,50 L / 15.000,00 L)", o rótulo da origem. */
function rotuloTanque(tanque: TanqueOpcao): string {
  return `${tanque.nome} (${formatarLitros(tanque.nivel)} / ${formatarLitros(tanque.capacidade)})`;
}

function formatarPrecoLitro(preco: number): string {
  return `R$ ${preco.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/L`;
}

export interface TransferenciaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Transferência em edição. Ausente abre em modo de criação. */
  transferencia?: TransferenciaLinha | null;
  /** Tanques da EMT ativos. Tanque de terceiro nunca entra em transferência. */
  tanques: TanqueOpcao[];
}

/**
 * Lança ou edita uma transferência entre tanques da EMT, como o
 * TransferenciaForm do Gestão Obras:
 *
 * - Valor total editável. Na criação, a tela preenche com litros x preço médio
 *   da vida do tanque de origem (4 casas) sempre que os litros ou o preço
 *   médio mudam, por cima do que foi digitado. Na edição fica o salvo.
 * - Bloqueia sem estoque na origem na data, sem espaço no destino na data e
 *   com combustível diferente no destino (esse último não vale quando só
 *   valor/observação mudam). O banco confere de novo ao salvar.
 */
export function TransferenciaFormDrawer({
  aberto,
  onAbertoChange,
  transferencia,
  tanques,
}: TransferenciaFormDrawerProps) {
  const editando = Boolean(transferencia);

  const form = useForm<TransferenciaFormInput>({
    resolver: zodResolver(transferenciaFormSchema),
    defaultValues: valoresIniciais(transferencia),
  });

  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;
  // Na edição o valor só vai para o banco se a pessoa mexeu nele. Na edição a
  // tela nunca escreve no campo, então "sujo" é exatamente "a pessoa mexeu".
  const valorEditado = Boolean(form.formState.dirtyFields.valorTotal);

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(transferencia));
  }, [aberto, transferencia, form]);

  const [origemId, destinoId, litros, valorTotal, dataHora] = useWatch({
    control: form.control,
    name: ["origemId", "destinoId", "litros", "valorTotal", "dataHora"],
  });

  const origem = tanques.find((t) => t.id === origemId) ?? null;
  const destino = tanques.find((t) => t.id === destinoId) ?? null;
  const qtdLitros = paraLitros(litros ?? "") ?? 0;

  const opcoesOrigem = React.useMemo(() => tanques.map((t) => ({ valor: t.id, rotulo: rotuloTanque(t) })), [tanques]);
  const opcoesDestino = React.useMemo(() => opcoesOrigem.filter((o) => o.valor !== origemId), [opcoesOrigem, origemId]);

  const idEmEdicao = transferencia?.id ?? null;
  const dataIso = dataHoraLocalParaIso(dataHora ?? "");

  // Estoque na data (sem contar a própria transferência em edição). Falhou a
  // consulta ou não há data: vale o nível atual, como a origem.
  const estadoEstoqueOrigem = useConsulta(
    aberto && origemId && dataIso ? `origem|${origemId}|${dataIso}|${idEmEdicao ?? ""}` : null,
    async () => {
      const r = await consultarEstoqueTransferencia(origemId, dataIso ?? "", idEmEdicao);
      return "erro" in r ? null : r.litros;
    },
  );
  const estadoEstoqueDestino = useConsulta(
    aberto && destinoId && dataIso ? `destino|${destinoId}|${dataIso}|${idEmEdicao ?? ""}` : null,
    async () => {
      const r = await consultarEstoqueTransferencia(destinoId, dataIso ?? "", idEmEdicao);
      return "erro" in r ? null : r.litros;
    },
  );
  const estadoPreco = useConsulta(aberto && origemId ? `preco|${origemId}` : null, async () => {
    const r = await consultarPrecoMedioTanque(origemId);
    return "erro" in r ? null : r.preco;
  });
  const estadoCombustivel = useConsulta(
    aberto && origemId && dataIso ? `combustivel|${origemId}|${dataIso}` : null,
    async () => {
      const r = await consultarCombustivelNaData(origemId, dataIso ?? "");
      return "erro" in r ? null : { nome: r.nome };
    },
  );

  function estoqueOuNivel(estado: typeof estadoEstoqueOrigem, tanque: TanqueOpcao | null): number | null {
    if (!tanque) return null;
    if (estado.tipo === "ok") return estado.valor;
    if (estado.tipo === "carregando") return null;
    return tanque.nivel;
  }
  const estoqueOrigem = estoqueOuNivel(estadoEstoqueOrigem, origem);
  const estoqueDestino = estoqueOuNivel(estadoEstoqueDestino, destino);
  const precoMedio = valorDaConsulta(estadoPreco, 0);
  const combustivelOrigemNome =
    estadoCombustivel.tipo === "ok"
      ? estadoCombustivel.valor.nome
      : estadoCombustivel.tipo === "erro" || estadoCombustivel.tipo === "vazio"
        ? (origem?.combustivelNome ?? null)
        : undefined;

  // Preenchimento automático do valor, só na criação (o useEffect da origem).
  React.useEffect(() => {
    if (editando) return;
    const automatico = valorAutomatico(qtdLitros, precoMedio);
    if (automatico !== null) {
      form.setValue("valorTotal", valorParaTexto(automatico), { shouldDirty: true, shouldValidate: true });
    }
  }, [editando, qtdLitros, precoMedio, form]);

  const bloqueios = avaliarBloqueios(qtdLitros, origem !== null, estoqueOrigem, destino, estoqueDestino);

  const inicialFisico: CamposFisicos | null = transferencia
    ? {
        origemId: transferencia.origemId,
        destinoId: transferencia.destinoId,
        litros: transferencia.litros,
        dataHora: isoParaDataHoraLocal(transferencia.dataHora),
      }
    : null;
  const soMetadados = ehEdicaoSoDeMetadados(inicialFisico, {
    origemId: origemId ?? "",
    destinoId: destinoId ?? "",
    litros: qtdLitros,
    dataHora: dataHora ?? "",
  });
  const conflito = conflitoDeCombustivel(origem, destino, soMetadados);

  const consultando =
    (origem !== null && estoqueOrigem === null) || (destino !== null && destino.capacidade > 0 && estoqueDestino === null);
  const bloqueado = bloqueios.semEstoqueOrigem || bloqueios.semEspacoDestino || conflito !== null;

  const mensagemEstoque = bloqueios.semEstoqueOrigem
    ? `Estoque insuficiente (${formatarLitros(estoqueOrigem)} disponíveis na data)`
    : bloqueios.semEspacoDestino
      ? `Espaço insuficiente no destino (${formatarLitros(bloqueios.espacoDestino)} de espaço na data)`
      : undefined;
  const mensagemConflito = conflito
    ? `Combustíveis incompatíveis. Origem tem ${origem?.combustivelNome ?? "outro combustível"} e destino tem ${destino?.combustivelNome ?? "outro combustível"}. Esvazie o destino antes ou escolha outro tanque.`
    : undefined;

  async function aoEnviar(valores: TransferenciaFormInput) {
    if (bloqueado || consultando) {
      toast.error(mensagemConflito ?? mensagemEstoque ?? "Aguarde a consulta do estoque dos tanques");
      return;
    }
    const resultado = await salvarTransferencia(
      idEmEdicao,
      transferenciaDoForm(valores, enviaValor(editando, valorEditado)),
    );
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Transferência salva" : "Transferência lançada");
    onAbertoChange(false);
  }

  const dicaOrigem = origem
    ? [
        estoqueOrigem === null
          ? "Consultando o estoque do tanque..."
          : `${formatarLitros(estoqueOrigem)} disponíveis${dataIso ? " na data" : ""}`,
        combustivelOrigemNome === undefined
          ? null
          : `Combustível: ${combustivelOrigemNome ?? "indisponível (tanque sem fonte rastreável)"}`,
      ]
        .filter(Boolean)
        .join(". ")
    : undefined;
  const dicaDestino =
    destino && bloqueios.espacoDestino !== null
      ? `${formatarLitros(bloqueios.espacoDestino)} de espaço${dataIso ? " na data" : ""}`
      : undefined;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar transferência" : "Nova transferência"}
      descricao="Combustível que passa de um tanque da EMT para outro"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando || bloqueado || consultando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar transferência"
            ) : (
              "Lançar transferência"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <LinhaCampos colunas={2}>
          <CampoFormulario id="transferencia-data" rotulo="Data e hora" obrigatorio erro={erros.dataHora?.message}>
            <Input
              id="transferencia-data"
              type="datetime-local"
              disabled={salvando}
              {...form.register("dataHora")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos colunas={2}>
          <CampoFormulario
            id="transferencia-origem"
            rotulo="Tanque de origem"
            obrigatorio
            ajuda={dicaOrigem}
            erro={erros.origemId?.message}
          >
            <Combobox
              id="transferencia-origem"
              valor={origemId ?? ""}
              rotuloDoValor={transferencia?.origemNome}
              onValorChange={(valor) => {
                form.setValue("origemId", valor, { shouldDirty: true, shouldValidate: true });
                if (valor === form.getValues("destinoId")) form.setValue("destinoId", "", { shouldDirty: true });
              }}
              opcoes={opcoesOrigem}
              placeholder={tanques.length === 0 ? "Nenhum tanque ativo" : "Selecione o tanque de origem"}
              buscaPlaceholder="Buscar tanque"
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario
            id="transferencia-destino"
            rotulo="Tanque de destino"
            obrigatorio
            ajuda={dicaDestino}
            erro={erros.destinoId?.message ?? mensagemConflito}
          >
            <Combobox
              id="transferencia-destino"
              valor={destinoId ?? ""}
              rotuloDoValor={transferencia?.destinoNome}
              onValorChange={(valor) => form.setValue("destinoId", valor, { shouldDirty: true, shouldValidate: true })}
              opcoes={opcoesDestino}
              placeholder={
                !origemId
                  ? "Selecione a origem primeiro"
                  : opcoesDestino.length === 0
                    ? "Nenhum outro tanque disponível"
                    : "Selecione o tanque de destino"
              }
              buscaPlaceholder="Buscar tanque"
              disabled={salvando || !origemId}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos colunas={2}>
          <CampoFormulario
            id="transferencia-litros"
            rotulo="Quantidade (litros)"
            obrigatorio
            erro={erros.litros?.message ?? mensagemEstoque}
          >
            <InputQuantidade
              id="transferencia-litros"
              valor={litros ?? ""}
              onValorChange={(valor) => form.setValue("litros", valor, { shouldDirty: true })}
              onBlur={() => void form.trigger("litros")}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario
            id="transferencia-valor"
            rotulo="Valor total (R$)"
            obrigatorio
            ajuda={precoMedio > 0 ? `Preço médio do tanque de origem: ${formatarPrecoLitro(precoMedio)}` : undefined}
            erro={erros.valorTotal?.message}
          >
            <InputPreco
              id="transferencia-valor"
              valor={valorTotal ?? ""}
              onValorChange={(valor) => form.setValue("valorTotal", valor, { shouldDirty: true })}
              onBlur={() => void form.trigger("valorTotal")}
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario id="transferencia-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea
            id="transferencia-observacoes"
            rows={3}
            placeholder="Alguma observação sobre a transferência"
            disabled={salvando}
            {...form.register("observacoes")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
