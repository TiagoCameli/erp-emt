"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Combobox, FormDrawer } from "@/components/canonicos";
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
import { Textarea } from "@/components/ui/textarea";
import { SelectAtivo } from "@/modules/cadastros/_shared/campos";
import { criar, editar } from "@/modules/cadastros/fornecedores/actions";
import type { FornecedorLista } from "@/modules/cadastros/fornecedores/queries";
import {
  fornecedorSchema,
  ROTULO_TIPO,
  TIPOS_FORNECEDOR,
  type FornecedorInput,
} from "@/modules/cadastros/fornecedores/schemas";

const ID_FORM = "form-fornecedor";

function valoresPadrao(fornecedor: FornecedorLista | null): FornecedorInput {
  return {
    tipo: fornecedor?.tipo ?? "pj",
    razaoSocial: fornecedor?.razaoSocial ?? "",
    nomeFantasia: fornecedor?.nomeFantasia ?? "",
    cnpjCpf: fornecedor?.cnpjCpf ?? "",
    inscricaoEstadual: fornecedor?.inscricaoEstadual ?? "",
    email: fornecedor?.email ?? "",
    telefone: fornecedor?.telefone ?? "",
    cidade: fornecedor?.cidade ?? "",
    uf: fornecedor?.uf ?? "",
    endereco: fornecedor?.endereco ?? "",
    observacoes: fornecedor?.observacoes ?? "",
    ativo: fornecedor?.ativo ?? true,
  };
}

export interface FornecedoresFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Quando presente, o drawer edita; senão, cria. */
  fornecedor: FornecedorLista | null;
}

/**
 * Drawer de cadastro de fornecedor: cria quando não recebe fornecedor,
 * edita quando recebe. Use uma key na montagem (id do fornecedor ou "novo")
 * para resetar o formulário entre aberturas.
 */
export function FornecedoresFormDrawer({
  aberto,
  onAbertoChange,
  fornecedor,
}: FornecedoresFormDrawerProps) {
  const editando = fornecedor !== null;

  const form = useForm<FornecedorInput>({
    resolver: zodResolver(fornecedorSchema),
    defaultValues: valoresPadrao(fornecedor),
  });

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: FornecedorInput) {
    const resultado = editando
      ? await editar(fornecedor.id, dados)
      : await criar(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Fornecedor salvo" : "Fornecedor criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar fornecedor" : "Novo fornecedor"}
      descricao={
        editando
          ? "Atualize os dados do fornecedor"
          : "Cadastre um novo fornecedor de materiais, peças, serviços ou fretes"
      }
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar fornecedor"
            ) : (
              "Criar fornecedor"
            )}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={ID_FORM}
          onSubmit={form.handleSubmit(aoEnviar)}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="tipo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <FormControl>
                  <Combobox
                    valor={field.value}
                    onValorChange={field.onChange}
                    opcoes={TIPOS_FORNECEDOR.map((tipo) => ({
                      valor: tipo,
                      rotulo: ROTULO_TIPO[tipo],
                    }))}
                    disabled={salvando}
                    className="w-full"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="razaoSocial"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Razão social</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Nome ou razão social"
                    disabled={salvando}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="nomeFantasia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome fantasia</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Nome fantasia"
                    disabled={salvando}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cnpjCpf"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CNPJ ou CPF</FormLabel>
                <FormControl>
                  <Input
                    placeholder="00.000.000/0001-00"
                    disabled={salvando}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="inscricaoEstadual"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Inscrição estadual</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Inscrição estadual"
                    disabled={salvando}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="contato@fornecedor.com"
                    disabled={salvando}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="telefone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefone</FormLabel>
                <FormControl>
                  <Input
                    placeholder="(68) 90000-0000"
                    disabled={salvando}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="cidade"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Cidade</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Cruzeiro do Sul"
                      disabled={salvando}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="uf"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>UF</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="AC"
                      maxLength={2}
                      disabled={salvando}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="endereco"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Endereço</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Rua, número, bairro"
                    disabled={salvando}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="observacoes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observações</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Anotações sobre o fornecedor"
                    rows={3}
                    disabled={salvando}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ativo"
            render={({ field }) => (
              <FormItem>
                <SelectAtivo
                  value={field.value ?? true}
                  onChange={field.onChange}
                  disabled={salvando}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FormDrawer>
  );
}
