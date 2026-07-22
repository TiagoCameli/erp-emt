"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Combobox, FormDrawer } from "@/components/canonicos";
import { SelectAtivo } from "@/modules/cadastros/_shared/campos";
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
import { criar, editar } from "@/modules/cadastros/clientes/actions";
import {
  clientePadrao,
  clienteSchema,
  type ClienteInput,
} from "@/modules/cadastros/clientes/schemas";
import type { ClienteLista } from "@/modules/cadastros/clientes/queries";

const ID_FORM = "form-cliente";

/** Valores do formulário a partir de um cliente existente, null vira "". */
function valoresDoCliente(cliente: ClienteLista): ClienteInput {
  return {
    tipo: cliente.tipo === "pf" ? "pf" : "pj",
    nome: cliente.nome,
    nome_fantasia: cliente.nomeFantasia ?? "",
    cpf_cnpj: cliente.cpfCnpj ?? "",
    inscricao_estadual: cliente.inscricaoEstadual ?? "",
    email: cliente.email ?? "",
    telefone: cliente.telefone ?? "",
    cidade: cliente.cidade ?? "",
    uf: cliente.uf ?? "",
    endereco: cliente.endereco ?? "",
    observacoes: cliente.observacoes ?? "",
    ativo: cliente.ativo,
  };
}

export interface ClientesFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Cliente em edição, ou null para criar um novo. */
  cliente: ClienteLista | null;
}

/**
 * Drawer de criação e edição de cliente. Reaproveita o mesmo formulário:
 * com cliente preenche os campos, sem cliente cria do zero.
 */
export function ClientesFormDrawer({
  aberto,
  onAbertoChange,
  cliente,
}: ClientesFormDrawerProps) {
  const editando = cliente !== null;

  const form = useForm<ClienteInput>({
    resolver: zodResolver(clienteSchema),
    defaultValues: cliente ? valoresDoCliente(cliente) : clientePadrao,
  });

  const salvando = form.formState.isSubmitting;

  React.useEffect(() => {
    if (aberto) {
      form.reset(cliente ? valoresDoCliente(cliente) : clientePadrao);
    }
  }, [aberto, cliente, form]);

  async function aoEnviar(dados: ClienteInput) {
    const resultado = editando
      ? await editar(cliente.id, dados)
      : await criar(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Cliente atualizado" : "Cliente criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar cliente" : "Novo cliente"}
      descricao="Órgãos e empresas contratantes das obras"
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
              "Salvar cliente"
            ) : (
              "Criar cliente"
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
                    opcoes={[
                      { valor: "pj", rotulo: "Pessoa jurídica" },
                      { valor: "pf", rotulo: "Pessoa física" },
                    ]}
                    placeholder="Selecione o tipo"
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
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome ou razão social</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder="DNIT"
                    disabled={salvando}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="nome_fantasia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome fantasia</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder="Nome fantasia"
                    disabled={salvando}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cpf_cnpj"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CPF ou CNPJ</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder="00.000.000/0001-00"
                    disabled={salvando}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="inscricao_estadual"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Inscrição estadual</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder="Inscrição estadual"
                    disabled={salvando}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
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
                    autoComplete="off"
                    placeholder="contato@orgao.gov.br"
                    disabled={salvando}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
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
                    autoComplete="off"
                    placeholder="(68) 0000-0000"
                    disabled={salvando}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-[1fr_6rem] gap-4">
            <FormField
              control={form.control}
              name="cidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cidade</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      placeholder="Rio Branco"
                      disabled={salvando}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
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
                      autoComplete="off"
                      placeholder="AC"
                      maxLength={2}
                      disabled={salvando}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
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
                    autoComplete="off"
                    placeholder="Rua, número, bairro"
                    disabled={salvando}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
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
                    placeholder="Anotações sobre o cliente"
                    rows={3}
                    disabled={salvando}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
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
                  value={field.value}
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
