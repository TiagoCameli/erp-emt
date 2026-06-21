"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { FormDrawer } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      <Form {...form}>
        <form
          id={ID_FORM}
          onSubmit={form.handleSubmit(aoEnviar)}
          className="flex flex-col gap-5"
        >
          <FormField
            control={form.control}
            name="colaboradorId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Colaborador</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o colaborador" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {colaboradores.map((colaborador) => (
                      <SelectItem key={colaborador.id} value={colaborador.id}>
                        {colaborador.nome}
                        {colaborador.funcao ? ` - ${colaborador.funcao}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tipo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIPOS_DOCUMENTO.map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {ROTULO_TIPO_DOCUMENTO[tipo]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="descricao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: ASO admissional" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dataEmissao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Emissão</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dataVencimento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vencimento</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="observacao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observação</FormLabel>
                <FormControl>
                  <Textarea rows={2} placeholder="Opcional" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FormDrawer>
  );
}
