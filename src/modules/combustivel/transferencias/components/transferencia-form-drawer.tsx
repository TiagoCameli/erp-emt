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
  isoParaDataHoraLocal,
} from "@/modules/combustivel/_shared/rotulos";
import {
  consultarEstoqueTransferencia,
  salvarTransferencia,
} from "@/modules/combustivel/transferencias/actions";
import type { TransferenciaLinha } from "@/modules/combustivel/transferencias/queries";
import {
  litrosParaTexto,
  transferenciaDoForm,
  transferenciaFormSchema,
  type TransferenciaFormInput,
} from "@/modules/combustivel/transferencias/schemas";
import { dicaDoEstoque, useEstoqueNaData } from "./use-estoque-na-data";

const ID_FORM = "form-transferencia";

/** Tanque da EMT oferecido no formulário (nunca de terceiro). */
export interface TanqueOpcao {
  id: string;
  nome: string;
  nivel: number;
  combustivelNome: string | null;
}

function valoresIniciais(transferencia: TransferenciaLinha | null | undefined): TransferenciaFormInput {
  return {
    origemId: transferencia?.origemId ?? "",
    destinoId: transferencia?.destinoId ?? "",
    litros: transferencia ? litrosParaTexto(transferencia.litros) : "",
    dataHora: transferencia ? isoParaDataHoraLocal(transferencia.dataHora) : agoraDataHoraLocal(),
    observacoes: transferencia?.observacoes ?? "",
  };
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
 * Lança ou edita uma transferência entre tanques da EMT. O valor não se digita:
 * a RPC calcula pelo preço médio do tanque de origem até a data. O estoque na
 * data aparece como dica; quem decide é a trava de saldo do banco ao salvar.
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

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(transferencia));
  }, [aberto, transferencia, form]);

  const [origemId, destinoId, litros, dataHora] = useWatch({
    control: form.control,
    name: ["origemId", "destinoId", "litros", "dataHora"],
  });

  const opcoesOrigem = React.useMemo(
    () => tanques.map((t) => ({ valor: t.id, rotulo: t.combustivelNome ? `${t.nome} (${t.combustivelNome})` : t.nome })),
    [tanques],
  );
  const opcoesDestino = React.useMemo(() => opcoesOrigem.filter((o) => o.valor !== origemId), [opcoesOrigem, origemId]);

  const idEmEdicao = transferencia?.id ?? null;
  const dataIso = dataHoraLocalParaIso(dataHora ?? "");
  const consultar = React.useCallback(
    (tanqueId: string, iso: string) => consultarEstoqueTransferencia(tanqueId, iso, idEmEdicao),
    [idEmEdicao],
  );
  const estoque = useEstoqueNaData(consultar, origemId, dataIso, aberto);

  async function aoEnviar(valores: TransferenciaFormInput) {
    const resultado = await salvarTransferencia(idEmEdicao, transferenciaDoForm(valores));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Transferência salva" : "Transferência lançada");
    onAbertoChange(false);
  }

  const dicaEstoque = dicaDoEstoque(estoque, "Disponível na origem nessa data");

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar transferência" : "Nova transferência"}
      descricao="Combustível que passa de um tanque da EMT para outro. O valor sai do preço médio da origem"
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
          <CampoFormulario id="transferencia-origem" rotulo="Tanque de origem" obrigatorio erro={erros.origemId?.message}>
            <Combobox
              id="transferencia-origem"
              valor={origemId ?? ""}
              rotuloDoValor={transferencia?.origemNome}
              onValorChange={(valor) => {
                form.setValue("origemId", valor, { shouldDirty: true, shouldValidate: true });
                if (valor === form.getValues("destinoId")) form.setValue("destinoId", "", { shouldDirty: true });
              }}
              opcoes={opcoesOrigem}
              placeholder="Selecione a origem"
              buscaPlaceholder="Buscar tanque"
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario
            id="transferencia-destino"
            rotulo="Tanque de destino"
            obrigatorio
            erro={erros.destinoId?.message}
          >
            <Combobox
              id="transferencia-destino"
              valor={destinoId ?? ""}
              rotuloDoValor={transferencia?.destinoNome}
              onValorChange={(valor) => form.setValue("destinoId", valor, { shouldDirty: true, shouldValidate: true })}
              opcoes={opcoesDestino}
              placeholder="Selecione o destino"
              buscaPlaceholder="Buscar tanque"
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos colunas={2}>
          <CampoFormulario id="transferencia-data" rotulo="Data e hora" obrigatorio erro={erros.dataHora?.message}>
            <Input
              id="transferencia-data"
              type="datetime-local"
              disabled={salvando}
              {...form.register("dataHora")}
            />
          </CampoFormulario>
          <CampoFormulario
            id="transferencia-litros"
            rotulo="Litros"
            obrigatorio
            ajuda={dicaEstoque}
            erro={erros.litros?.message}
          >
            <InputQuantidade
              id="transferencia-litros"
              valor={litros ?? ""}
              onValorChange={(valor) => form.setValue("litros", valor, { shouldDirty: true })}
              onBlur={() => void form.trigger("litros")}
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario id="transferencia-observacoes" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea id="transferencia-observacoes" rows={3} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
