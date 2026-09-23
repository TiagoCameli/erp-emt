"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputQuantidade,
  LinhaCampos,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO, formatarData, formatarQuantidade } from "@/lib/formatadores";
import { editar, registrar, ultimaLeitura } from "@/modules/manutencao/medicoes/actions";
import type {
  EquipamentoMedicaoOpcao,
  MedicaoLista,
  UltimaLeitura,
} from "@/modules/manutencao/medicoes/queries";
import {
  formParaMedicao,
  leituraMenorQueUltima,
  leituraParaNumero,
  leituraParaTexto,
  medicaoFormSchema,
  ROTULO_ORIGEM_MEDICAO,
  ROTULO_TIPO_MEDICAO,
  UNIDADE_MEDICAO,
  type MedicaoFormInput,
} from "@/modules/manutencao/medicoes/schemas";

const ID_FORM = "form-medicao";

function valoresIniciais(medicao: MedicaoLista | null | undefined): MedicaoFormInput {
  return {
    equipamentoId: medicao?.equipamentoId ?? "",
    data: medicao?.data ?? dataHojeISO(),
    valor: medicao ? leituraParaTexto(medicao.valor) : "",
    observacoes: medicao?.observacoes ?? "",
  };
}

/** Resultado da busca da última leitura, amarrado ao equipamento que a pediu. */
type EstadoUltima =
  | { equipamentoId: string; ultima: UltimaLeitura | null }
  | { equipamentoId: string; erro: string };

export interface MedicaoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Todos os equipamentos com horímetro ou km; lançar oferece só os ativos. */
  equipamentos: EquipamentoMedicaoOpcao[];
  /** Leitura em edição. Ausente lança uma nova. */
  medicao?: MedicaoLista | null;
}

/**
 * Lançar e editar leitura de horímetro ou km. Mostra a última leitura do
 * equipamento escolhido e avisa, sem bloquear, quando o valor digitado é menor
 * (troca de painel acontece, e o banco aceita).
 */
export function MedicaoFormDrawer({ aberto, onAbertoChange, equipamentos, medicao }: MedicaoFormDrawerProps) {
  const editando = Boolean(medicao);

  const form = useForm<MedicaoFormInput>({
    resolver: zodResolver(medicaoFormSchema),
    defaultValues: valoresIniciais(medicao),
  });

  const salvando = form.formState.isSubmitting;

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(medicao));
  }, [aberto, medicao, form]);

  const equipamentoId = form.watch("equipamentoId");
  const valorTexto = form.watch("valor");

  const opcoes = React.useMemo(
    () =>
      equipamentos
        .filter((equipamento) => equipamento.ativo || equipamento.id === medicao?.equipamentoId)
        .map((equipamento) => ({
          valor: equipamento.id,
          rotulo: `${equipamento.rotulo}, ${ROTULO_TIPO_MEDICAO[equipamento.controlePor].toLowerCase()}`,
        })),
    [equipamentos, medicao?.equipamentoId],
  );

  const equipamento = equipamentos.find((item) => item.id === equipamentoId) ?? null;

  const [estadoUltima, setEstadoUltima] = React.useState<EstadoUltima | null>(null);

  React.useEffect(() => {
    if (!aberto || equipamentoId === "") return;
    let cancelado = false;
    void ultimaLeitura(equipamentoId, medicao?.id)
      .then((resultado) => {
        if (cancelado) return;
        setEstadoUltima(
          "erro" in resultado ? { equipamentoId, erro: resultado.erro } : { equipamentoId, ultima: resultado.ultima },
        );
      })
      .catch(() => {
        if (!cancelado) setEstadoUltima({ equipamentoId, erro: "Não foi possível carregar a última leitura" });
      });
    return () => {
      cancelado = true;
    };
  }, [aberto, equipamentoId, medicao?.id]);

  // Resposta de outro equipamento (troca rápida) não vale: continua carregando.
  const ultimaAtual = estadoUltima && estadoUltima.equipamentoId === equipamentoId ? estadoUltima : null;
  const ultima = ultimaAtual && "ultima" in ultimaAtual ? ultimaAtual.ultima : null;
  const referencia = ultima?.valor ?? equipamento?.medicaoInicial ?? null;
  const unidade = equipamento ? UNIDADE_MEDICAO[equipamento.controlePor] : "";
  const menor = leituraMenorQueUltima(leituraParaNumero(valorTexto), referencia);

  async function aoEnviar(valores: MedicaoFormInput) {
    const dados = formParaMedicao(valores);
    const resultado = medicao
      ? await editar({ id: medicao.id, data: dados.data, valor: dados.valor, observacoes: dados.observacoes })
      : await registrar(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Leitura salva" : "Leitura lançada");
    onAbertoChange(false);
  }

  function textoUltima() {
    if (!equipamento) return null;
    if (!ultimaAtual) return "Carregando a última leitura...";
    if ("erro" in ultimaAtual) return ultimaAtual.erro;
    if (ultima) {
      return `Última leitura: ${formatarQuantidade(ultima.valor)} ${unidade} em ${formatarData(ultima.data)} (${ROTULO_ORIGEM_MEDICAO[ultima.origem].toLowerCase()})`;
    }
    if (equipamento.medicaoInicial !== null) {
      return `Sem leitura lançada. Medição inicial do cadastro: ${formatarQuantidade(equipamento.medicaoInicial)} ${unidade}`;
    }
    return "Sem leitura lançada para este equipamento";
  }

  const rotuloValor = equipamento ? ROTULO_TIPO_MEDICAO[equipamento.controlePor] : "Leitura";

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar leitura" : "Lançar leitura"}
      descricao={
        editando
          ? "Corrija a data, o valor ou a observação desta leitura"
          : "Registre o horímetro ou o km de um equipamento"
      }
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar leitura"
            ) : (
              "Lançar leitura"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario
          id="medicao-equipamento"
          rotulo="Equipamento"
          obrigatorio
          ajuda={editando ? "O equipamento da leitura não muda na edição" : undefined}
          erro={form.formState.errors.equipamentoId?.message}
        >
          <Combobox
            id="medicao-equipamento"
            valor={equipamentoId}
            onValorChange={(valor) =>
              form.setValue("equipamentoId", valor, { shouldValidate: true, shouldDirty: true })
            }
            opcoes={opcoes}
            placeholder="Escolha o equipamento"
            buscaPlaceholder="Buscar por código, descrição ou placa"
            vazioTexto="Nenhum equipamento com horímetro ou km"
            disabled={salvando || editando}
          />
        </CampoFormulario>

        <LinhaCampos colunas={2}>
          <CampoFormulario id="medicao-data" rotulo="Data" obrigatorio erro={form.formState.errors.data?.message}>
            <Input id="medicao-data" type="date" max={dataHojeISO()} disabled={salvando} {...form.register("data")} />
          </CampoFormulario>

          <CampoFormulario
            id="medicao-valor"
            rotulo={unidade ? `${rotuloValor} (${unidade})` : rotuloValor}
            obrigatorio
            erro={form.formState.errors.valor?.message}
          >
            <InputQuantidade
              id="medicao-valor"
              valor={valorTexto}
              onValorChange={(valor) => form.setValue("valor", valor, { shouldValidate: true, shouldDirty: true })}
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        {equipamento ? (
          <p className="text-legenda text-muted-foreground tabular-nums" aria-live="polite">
            {textoUltima()}
          </p>
        ) : null}

        {menor && referencia !== null ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-status-pendente/30 bg-status-pendente/5 px-3 py-3"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-pendente" aria-hidden="true" />
            <div>
              <p className="text-detalhe font-medium">
                A leitura é menor que a {ultima ? "última" : "medição inicial"}: {formatarQuantidade(referencia)}{" "}
                {unidade}
              </p>
              <p className="text-legenda text-muted-foreground">
                Confira o número. Se o painel foi trocado ou zerado, pode salvar assim e explicar na observação.
              </p>
            </div>
          </div>
        ) : null}

        <CampoFormulario id="medicao-observacoes" rotulo="Observação" erro={form.formState.errors.observacoes?.message}>
          <Textarea
            id="medicao-observacoes"
            rows={3}
            placeholder="Troca do painel, leitura feita na oficina"
            disabled={salvando}
            {...form.register("observacoes")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
