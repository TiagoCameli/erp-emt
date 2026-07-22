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
  SelectAtivo,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { criarObra, editarObra } from "@/modules/cadastros/obras/actions";
import type { ClienteOpcao, ObraLista } from "@/modules/cadastros/obras/queries";
import {
  STATUS_OBRA,
  STATUS_OBRA_CONFIG,
  obraFormSchema,
  type ObraFormInput,
} from "@/modules/cadastros/obras/schemas";

const SEM_CLIENTE = "sem-cliente";
const ID_FORM = "form-obra";

/** Valores iniciais do formulário, a partir de uma obra ou em branco. */
function valoresIniciais(obra: ObraLista | null): ObraFormInput {
  return {
    nome: obra?.nome ?? "",
    numeroContrato: obra?.numeroContrato ?? "",
    clienteId: obra?.clienteId ?? undefined,
    rodovia: obra?.rodovia ?? "",
    lote: obra?.lote ?? "",
    uf: obra?.uf ?? "",
    extensaoKm:
      obra?.extensaoKm !== null && obra?.extensaoKm !== undefined
        ? String(obra.extensaoKm).replace(".", ",")
        : "",
    dataInicio: obra?.dataInicio ?? "",
    dataFimPrevista: obra?.dataFimPrevista ?? "",
    status: obra?.status ?? "em_andamento",
    observacoes: obra?.observacoes ?? "",
    ativo: obra?.ativo ?? true,
  };
}

export interface ObrasFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Obra em edição, ou null para criar uma nova. */
  obra: ObraLista | null;
  clientes: ClienteOpcao[];
}

/**
 * Drawer de criação e edição de obra. Mesmo formulário para os dois modos:
 * quando obra é null, cria; quando vem preenchida, edita.
 */
export function ObrasFormDrawer({
  aberto,
  onAbertoChange,
  obra,
  clientes,
}: ObrasFormDrawerProps) {
  const editando = obra !== null;

  const form = useForm<ObraFormInput>({
    resolver: zodResolver(obraFormSchema),
    defaultValues: valoresIniciais(obra),
  });

  // Recarrega os valores ao trocar a obra selecionada ou reabrir.
  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(obra));
  }, [aberto, obra, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(valores: ObraFormInput) {
    const extensao =
      valores.extensaoKm && valores.extensaoKm.trim() !== ""
        ? Number(valores.extensaoKm.replace(",", "."))
        : undefined;

    const dados = {
      nome: valores.nome,
      numeroContrato: valores.numeroContrato,
      clienteId: valores.clienteId,
      rodovia: valores.rodovia,
      lote: valores.lote,
      uf: valores.uf,
      extensaoKm: extensao,
      dataInicio: valores.dataInicio,
      dataFimPrevista: valores.dataFimPrevista,
      status: valores.status,
      observacoes: valores.observacoes,
      ativo: valores.ativo,
    };

    const resultado = editando
      ? await editarObra(obra.id, dados)
      : await criarObra(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    const mensagem =
      "aviso" in resultado && typeof resultado.aviso === "string"
        ? resultado.aviso
        : "Obra salva";
    toast.success(mensagem);
    onAbertoChange(false);
  }

  const clienteValor = form.watch("clienteId") ?? SEM_CLIENTE;
  const statusValor = form.watch("status");

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar obra" : "Nova obra"}
      descricao={
        editando
          ? "Atualize os dados desta obra"
          : "Cadastre uma obra. O centro de custo raiz dela é gerado automaticamente"
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
              "Salvar obra"
            ) : (
              "Criar obra"
            )}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="obra-nome"
          rotulo="Nome"
          obrigatorio
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="obra-nome"
            placeholder="Conservação BR-364 Lote 09"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="obra-numero-contrato"
          rotulo="Número do contrato"
          erro={form.formState.errors.numeroContrato?.message}
        >
          <Input
            id="obra-numero-contrato"
            placeholder="00615/2025"
            disabled={salvando}
            {...form.register("numeroContrato")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="obra-cliente"
          rotulo="Cliente"
          erro={form.formState.errors.clienteId?.message}
        >
          <Combobox
            valor={clienteValor}
            onValorChange={(valor) =>
              form.setValue(
                "clienteId",
                valor === SEM_CLIENTE ? undefined : valor,
                { shouldValidate: true },
              )
            }
            opcoes={[
              { valor: SEM_CLIENTE, rotulo: "Sem cliente" },
              ...clientes.map((cliente) => ({
                valor: cliente.id,
                rotulo: cliente.nome,
              })),
            ]}
            placeholder="Sem cliente"
            disabled={salvando}
            id="obra-cliente"
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="obra-rodovia"
            rotulo="Rodovia"
            erro={form.formState.errors.rodovia?.message}
          >
            <Input
              id="obra-rodovia"
              placeholder="BR-364"
              disabled={salvando}
              {...form.register("rodovia")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="obra-lote"
            rotulo="Lote"
            erro={form.formState.errors.lote?.message}
          >
            <Input
              id="obra-lote"
              placeholder="09"
              disabled={salvando}
              {...form.register("lote")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="obra-uf"
            rotulo="UF"
            erro={form.formState.errors.uf?.message}
          >
            <Input
              id="obra-uf"
              placeholder="AC"
              maxLength={2}
              disabled={salvando}
              {...form.register("uf")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="obra-extensao"
            rotulo="Extensão (km)"
            erro={form.formState.errors.extensaoKm?.message}
          >
            <Input
              id="obra-extensao"
              inputMode="decimal"
              placeholder="120,5"
              className="tabular-nums"
              disabled={salvando}
              {...form.register("extensaoKm")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="obra-data-inicio"
            rotulo="Data de início"
            erro={form.formState.errors.dataInicio?.message}
          >
            <Input
              id="obra-data-inicio"
              type="date"
              disabled={salvando}
              {...form.register("dataInicio")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="obra-data-fim"
            rotulo="Fim previsto"
            erro={form.formState.errors.dataFimPrevista?.message}
          >
            <Input
              id="obra-data-fim"
              type="date"
              disabled={salvando}
              {...form.register("dataFimPrevista")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="obra-status"
          rotulo="Status"
          obrigatorio
          erro={form.formState.errors.status?.message}
        >
          <Combobox
            valor={statusValor}
            onValorChange={(valor) =>
              form.setValue("status", valor as ObraFormInput["status"], {
                shouldValidate: true,
              })
            }
            opcoes={STATUS_OBRA.map((status) => ({
              valor: status,
              rotulo: STATUS_OBRA_CONFIG[status].rotulo,
            }))}
            disabled={salvando}
            id="obra-status"
          />
        </CampoFormulario>

        <CampoFormulario
          id="obra-observacoes"
          rotulo="Observações"
          erro={form.formState.errors.observacoes?.message}
        >
          <Textarea
            id="obra-observacoes"
            rows={3}
            placeholder="Anotações sobre a obra"
            disabled={salvando}
            {...form.register("observacoes")}
          />
        </CampoFormulario>

        <SelectAtivo
          value={form.watch("ativo")}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
        />
      </form>
    </FormDrawer>
  );
}
