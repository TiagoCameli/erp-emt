"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  criarDocumento,
  editarDocumento,
} from "@/modules/rh/documentos/actions";
import type { DocumentoLista } from "@/modules/rh/documentos/queries";
import {
  documentoFormParaInput,
  documentoFormSchema,
  ROTULO_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  type DocumentoFormInput,
} from "@/modules/rh/documentos/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-documento";

function valoresIniciais(): DocumentoFormInput {
  return {
    colaboradorId: "",
    tipo: "aso",
    descricao: "",
    dataEmissao: "",
    dataVencimento: "",
    observacao: "",
  };
}

export interface DocumentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorOpcao[];
  /** Documento em edição. Ausente significa criar. */
  documento?: DocumentoLista | null;
}

/**
 * Drawer com o formulário de documento. Cria quando não recebe documento e
 * edita quando recebe. Fecha sozinho ao salvar.
 */
export function DocumentoFormDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  documento,
}: DocumentoFormDrawerProps) {
  const editando = Boolean(documento);

  const form = useForm<DocumentoFormInput>({
    resolver: zodResolver(documentoFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (documento) {
      form.reset({
        colaboradorId: documento.colaboradorId,
        tipo: documento.tipo,
        descricao: documento.descricao,
        dataEmissao: documento.dataEmissao ?? "",
        dataVencimento: documento.dataVencimento ?? "",
        observacao: documento.observacao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, documento, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: DocumentoFormInput) {
    const entrada = documentoFormParaInput(dados);
    const resultado = documento
      ? await editarDocumento(documento.id, entrada)
      : await criarDocumento(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Documento salvo" : "Documento criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar documento" : "Novo documento"}
      descricao="Documentos com data de vencimento entram no painel de alertas."
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => onAbertoChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            {editando ? "Salvar documento" : "Criar documento"}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
      >
        <CampoFormulario
          id="documento-colaborador"
          rotulo="Colaborador"
          erro={form.formState.errors.colaboradorId?.message}
        >
          <Combobox
            valor={form.watch("colaboradorId")}
            onValorChange={(valor) =>
              form.setValue("colaboradorId", valor, { shouldValidate: true })
            }
            opcoes={colaboradores.map((colaborador) => ({
              valor: colaborador.id,
              rotulo: `${colaborador.nome}${colaborador.funcao ? ` - ${colaborador.funcao}` : ""}`,
            }))}
            placeholder="Selecione o colaborador"
            className="w-full"
            id="documento-colaborador"
          />
        </CampoFormulario>

        <CampoFormulario
          id="documento-tipo"
          rotulo="Tipo"
          erro={form.formState.errors.tipo?.message}
        >
          <Combobox
            valor={form.watch("tipo")}
            onValorChange={(valor) =>
              form.setValue("tipo", valor as DocumentoFormInput["tipo"], {
                shouldValidate: true,
              })
            }
            opcoes={TIPOS_DOCUMENTO.map((tipo) => ({
              valor: tipo,
              rotulo: ROTULO_TIPO_DOCUMENTO[tipo],
            }))}
            placeholder="Selecione o tipo"
            className="w-full"
            id="documento-tipo"
          />
        </CampoFormulario>

        <CampoFormulario
          id="documento-descricao"
          rotulo="Descrição"
          erro={form.formState.errors.descricao?.message}
        >
          <Input
            id="documento-descricao"
            placeholder="Ex: ASO admissional"
            {...form.register("descricao")}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="documento-emissao"
            rotulo="Emissão"
            erro={form.formState.errors.dataEmissao?.message}
          >
            <Input
              id="documento-emissao"
              type="date"
              {...form.register("dataEmissao")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="documento-vencimento"
            rotulo="Vencimento"
            erro={form.formState.errors.dataVencimento?.message}
          >
            <Input
              id="documento-vencimento"
              type="date"
              {...form.register("dataVencimento")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="documento-observacao"
          rotulo="Observação"
          erro={form.formState.errors.observacao?.message}
        >
          <Textarea
            id="documento-observacao"
            rows={2}
            placeholder="Opcional"
            {...form.register("observacao")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
