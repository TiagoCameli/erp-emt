"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog, FormDrawer } from "@/components/canonicos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatarData } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import {
  CampoFormulario,
  SelectAtivo,
  classesFormulario,
} from "@/modules/cadastros/_shared/campos";
import {
  adicionarDocumento,
  criarEquipamento,
  editarEquipamento,
  removerDocumento,
} from "@/modules/cadastros/equipamentos/actions";
import type {
  EquipamentoDocumento,
  EquipamentoLista,
} from "@/modules/cadastros/equipamentos/queries";
import {
  CONTROLE_POR,
  CONTROLE_POR_CONFIG,
  documentoFormSchema,
  equipamentoFormSchema,
  type DocumentoFormInput,
  type EquipamentoFormInput,
} from "@/modules/cadastros/equipamentos/schemas";

const ID_FORM = "form-equipamento";
const ID_FORM_DOCUMENTO = "form-documento";

/** Janela em dias em que um documento já entra como "perto de vencer". */
const DIAS_ALERTA_VENCIMENTO = 30;

/** Valores iniciais do formulário, a partir de um equipamento ou em branco. */
function valoresIniciais(
  equipamento: EquipamentoLista | null,
): EquipamentoFormInput {
  return {
    codigo: equipamento?.codigo ?? "",
    descricao: equipamento?.descricao ?? "",
    tipo: equipamento?.tipo ?? "",
    marca: equipamento?.marca ?? "",
    modelo: equipamento?.modelo ?? "",
    ano:
      equipamento?.ano !== null && equipamento?.ano !== undefined
        ? String(equipamento.ano)
        : "",
    placa: equipamento?.placa ?? "",
    controlePor: equipamento?.controlePor ?? "horimetro",
    ativo: equipamento?.ativo ?? true,
  };
}

/** True quando o documento já venceu ou vence dentro da janela de alerta. */
function vencimentoEmAlerta(vencimento: string | null): boolean {
  if (!vencimento) return false;
  const data = new Date(`${vencimento}T00:00:00`);
  if (Number.isNaN(data.getTime())) return false;
  const limite = new Date();
  limite.setHours(0, 0, 0, 0);
  limite.setDate(limite.getDate() + DIAS_ALERTA_VENCIMENTO);
  return data.getTime() <= limite.getTime();
}

export interface EquipamentosFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Equipamento em edição, ou null para criar um novo. */
  equipamento: EquipamentoLista | null;
  documentos: EquipamentoDocumento[];
  podeEditar: boolean;
}

/**
 * Drawer de criação e edição de equipamento. Mesmo formulário para os dois
 * modos: quando equipamento é null, cria; quando vem preenchido, edita.
 * No modo edição mostra a seção de documentos (listar, adicionar, remover).
 */
export function EquipamentosFormDrawer({
  aberto,
  onAbertoChange,
  equipamento,
  documentos,
  podeEditar,
}: EquipamentosFormDrawerProps) {
  const editando = equipamento !== null;

  const form = useForm<EquipamentoFormInput>({
    resolver: zodResolver(equipamentoFormSchema),
    defaultValues: valoresIniciais(equipamento),
  });

  // Recarrega os valores ao trocar o equipamento selecionado ou reabrir.
  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(equipamento));
  }, [aberto, equipamento, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(valores: EquipamentoFormInput) {
    const ano =
      valores.ano && valores.ano.trim() !== ""
        ? Number(valores.ano.trim())
        : undefined;

    const dados = {
      codigo: valores.codigo,
      descricao: valores.descricao,
      tipo: valores.tipo,
      marca: valores.marca,
      modelo: valores.modelo,
      ano,
      placa: valores.placa,
      controlePor: valores.controlePor,
      ativo: valores.ativo,
    };

    const resultado = editando
      ? await editarEquipamento(equipamento.id, dados)
      : await criarEquipamento(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    const mensagem =
      "aviso" in resultado && typeof resultado.aviso === "string"
        ? resultado.aviso
        : "Equipamento salvo";
    toast.success(mensagem);
    onAbertoChange(false);
  }

  const controleValor = form.watch("controlePor");

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar equipamento" : "Novo equipamento"}
      descricao={
        editando
          ? "Atualize os dados deste equipamento"
          : "Cadastre um equipamento. A etapa dele no centro de custo de Manutenção é gerada automaticamente"
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
              "Salvar equipamento"
            ) : (
              "Criar equipamento"
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
        <div className="grid grid-cols-2 gap-4">
          <CampoFormulario
            id="equipamento-codigo"
            rotulo="Código"
            ajuda="Patrimônio ou número de frota"
            erro={form.formState.errors.codigo?.message}
          >
            <Input
              id="equipamento-codigo"
              placeholder="EQ-001"
              className="codigo-doc"
              disabled={salvando}
              {...form.register("codigo")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="equipamento-placa"
            rotulo="Placa"
            erro={form.formState.errors.placa?.message}
          >
            <Input
              id="equipamento-placa"
              placeholder="ABC1D23"
              className="codigo-doc"
              maxLength={10}
              disabled={salvando}
              {...form.register("placa")}
            />
          </CampoFormulario>
        </div>

        <CampoFormulario
          id="equipamento-descricao"
          rotulo="Descrição"
          obrigatorio
          erro={form.formState.errors.descricao?.message}
        >
          <Input
            id="equipamento-descricao"
            placeholder="Escavadeira CAT 320"
            disabled={salvando}
            {...form.register("descricao")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="equipamento-tipo"
          rotulo="Tipo"
          ajuda="Ex: escavadeira, caminhão, motoniveladora"
          erro={form.formState.errors.tipo?.message}
        >
          <Input
            id="equipamento-tipo"
            placeholder="escavadeira"
            disabled={salvando}
            {...form.register("tipo")}
          />
        </CampoFormulario>

        <div className="grid grid-cols-2 gap-4">
          <CampoFormulario
            id="equipamento-marca"
            rotulo="Marca"
            erro={form.formState.errors.marca?.message}
          >
            <Input
              id="equipamento-marca"
              placeholder="Caterpillar"
              disabled={salvando}
              {...form.register("marca")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="equipamento-modelo"
            rotulo="Modelo"
            erro={form.formState.errors.modelo?.message}
          >
            <Input
              id="equipamento-modelo"
              placeholder="320"
              disabled={salvando}
              {...form.register("modelo")}
            />
          </CampoFormulario>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <CampoFormulario
            id="equipamento-ano"
            rotulo="Ano"
            erro={form.formState.errors.ano?.message}
          >
            <Input
              id="equipamento-ano"
              inputMode="numeric"
              placeholder="2020"
              className="tabular-nums"
              maxLength={4}
              disabled={salvando}
              {...form.register("ano")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="equipamento-controle"
            rotulo="Controle por"
            obrigatorio
            erro={form.formState.errors.controlePor?.message}
          >
            <Select
              value={controleValor}
              onValueChange={(valor) =>
                form.setValue(
                  "controlePor",
                  valor as EquipamentoFormInput["controlePor"],
                  { shouldValidate: true },
                )
              }
              disabled={salvando}
            >
              <SelectTrigger id="equipamento-controle" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTROLE_POR.map((controle) => (
                  <SelectItem key={controle} value={controle}>
                    {CONTROLE_POR_CONFIG[controle]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoFormulario>
        </div>

        <SelectAtivo
          value={form.watch("ativo")}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
        />
      </form>

      {editando ? (
        <SecaoDocumentos
          equipamentoId={equipamento.id}
          documentos={documentos}
          podeEditar={podeEditar}
        />
      ) : (
        <p className="mt-6 border-t border-border pt-5 text-detalhe text-muted-foreground">
          Salve o equipamento para registrar os documentos dele.
        </p>
      )}
    </FormDrawer>
  );
}

/** Valores iniciais em branco do formulário de documento. */
const DOCUMENTO_EM_BRANCO: DocumentoFormInput = {
  tipo: "",
  descricao: "",
  vencimento: "",
};

interface SecaoDocumentosProps {
  equipamentoId: string;
  documentos: EquipamentoDocumento[];
  podeEditar: boolean;
}

/**
 * Seção de documentos no detalhe do equipamento: subtabela com vencimento
 * formatado e badge âmbar quando vencido ou perto, mais o formulário de
 * adicionar. Remoção pede confirmação.
 */
function SecaoDocumentos({
  equipamentoId,
  documentos,
  podeEditar,
}: SecaoDocumentosProps) {
  const [adicionando, setAdicionando] = React.useState(false);
  const [paraRemover, setParaRemover] =
    React.useState<EquipamentoDocumento | null>(null);

  const form = useForm<DocumentoFormInput>({
    resolver: zodResolver(documentoFormSchema),
    defaultValues: DOCUMENTO_EM_BRANCO,
  });

  const salvando = form.formState.isSubmitting;

  async function aoAdicionar(valores: DocumentoFormInput) {
    const resultado = await adicionarDocumento({
      equipamentoId,
      tipo: valores.tipo,
      descricao: valores.descricao === "" ? undefined : valores.descricao,
      vencimento: valores.vencimento === "" ? undefined : valores.vencimento,
    });

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success("Documento adicionado");
    form.reset(DOCUMENTO_EM_BRANCO);
    setAdicionando(false);
  }

  async function confirmarRemocao() {
    if (!paraRemover) return;
    const resultado = await removerDocumento(paraRemover.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Documento removido");
    setParaRemover(null);
  }

  return (
    <section className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-secao font-semibold">Documentos</h3>
          <p className="text-legenda text-muted-foreground">
            Licenciamento, seguro, laudos e outros documentos do equipamento
          </p>
        </div>
        {podeEditar ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdicionando((valor) => !valor)}
          >
            <Plus />
            Adicionar documento
          </Button>
        ) : null}
      </div>

      {podeEditar && adicionando ? (
        <form
          id={ID_FORM_DOCUMENTO}
          onSubmit={form.handleSubmit(aoAdicionar)}
          className="flex flex-col gap-3 rounded-md border border-border bg-surface/50 p-4"
          noValidate
        >
          <CampoFormulario
            id="documento-tipo"
            rotulo="Tipo"
            obrigatorio
            erro={form.formState.errors.tipo?.message}
          >
            <Input
              id="documento-tipo"
              placeholder="Licenciamento"
              disabled={salvando}
              {...form.register("tipo")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="documento-descricao"
            rotulo="Descrição"
            erro={form.formState.errors.descricao?.message}
          >
            <Input
              id="documento-descricao"
              placeholder="CRLV 2026"
              disabled={salvando}
              {...form.register("descricao")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="documento-vencimento"
            rotulo="Vencimento"
            erro={form.formState.errors.vencimento?.message}
          >
            <Input
              id="documento-vencimento"
              type="date"
              disabled={salvando}
              {...form.register("vencimento")}
            />
          </CampoFormulario>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={() => {
                form.reset(DOCUMENTO_EM_BRANCO);
                setAdicionando(false);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={salvando}>
              {salvando ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar documento"
              )}
            </Button>
          </div>
        </form>
      ) : null}

      {documentos.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-detalhe text-muted-foreground">
          Nenhum documento registrado
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {documentos.map((documento) => {
            const alerta = vencimentoEmAlerta(documento.vencimento);
            return (
              <li
                key={documento.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-detalhe font-medium">
                    {documento.tipo}
                  </span>
                  {documento.descricao ? (
                    <span className="truncate text-legenda text-muted-foreground">
                      {documento.descricao}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {documento.vencimento ? (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "border-transparent tabular-nums",
                        alerta
                          ? "bg-status-pendente/10 text-status-pendente"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {formatarData(documento.vencimento)}
                    </Badge>
                  ) : (
                    <span className="text-legenda text-muted-foreground">
                      Sem vencimento
                    </span>
                  )}
                  {podeEditar ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remover documento ${documento.tipo}`}
                      onClick={() => setParaRemover(documento)}
                    >
                      <Trash2 className="text-status-rejeitado" />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        aberto={paraRemover !== null}
        onAbertoChange={(valor) => {
          if (!valor) setParaRemover(null);
        }}
        titulo="Remover documento"
        descricao={
          paraRemover
            ? `Remover o documento "${paraRemover.tipo}" deste equipamento? Essa ação não pode ser desfeita.`
            : ""
        }
        textoConfirmar="Remover documento"
        variante="destrutivo"
        onConfirmar={confirmarRemocao}
      />
    </section>
  );
}
