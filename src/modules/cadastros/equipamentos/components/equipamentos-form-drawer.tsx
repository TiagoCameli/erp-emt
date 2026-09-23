"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  ConfirmDialog,
  FormDrawer,
  InputQuantidade,
  LinhaCampos,
  SelectAtivo,
  submeterComAviso,
} from "@/components/canonicos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarData } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import {
  adicionarDocumento,
  carregarAnexosDosDocumentos,
  criarEquipamento,
  editarEquipamento,
  removerDocumento,
} from "@/modules/cadastros/equipamentos/actions";
import type {
  EquipamentoDocumento,
  EquipamentoLista,
} from "@/modules/cadastros/equipamentos/queries";
import {
  AJUDA_PROPRIEDADE,
  CONTROLE_POR,
  CONTROLE_POR_CONFIG,
  documentoFormSchema,
  equipamentoFormSchema,
  medicaoParaNumero,
  PROPRIEDADES,
  ROTULO_PROPRIEDADE,
  ROTULO_STATUS_EQUIPAMENTO,
  STATUS_EQUIPAMENTO,
  type DocumentoFormInput,
  type EquipamentoFormInput,
} from "@/modules/cadastros/equipamentos/schemas";

import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";

import {
  AnexosDocumentoEquipamento,
  BotaoAnexosDocumento,
} from "./documento-anexos";
import { SecaoFichaTecnica } from "./ficha-tecnica-secao";

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
    propriedade: equipamento?.propriedade ?? "propria",
    status: equipamento?.status ?? "ativa",
    medicaoInicial:
      equipamento?.medicaoInicial != null
        ? String(equipamento.medicaoInicial).replace(".", ",")
        : "",
    numeroSerie: equipamento?.numeroSerie ?? "",
    dataAquisicao: equipamento?.dataAquisicao ?? "",
    dataVenda: equipamento?.dataVenda ?? "",
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
 * No modo edição mostra a ficha técnica (formulário e botão próprios) e a
 * seção de documentos (listar, adicionar, remover).
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

  // A ficha técnica tem formulário e botão próprios; a alteração não salva
  // dela também segura o fechamento do drawer.
  const [fichaSuja, setFichaSuja] = React.useState(false);
  React.useEffect(() => {
    if (!aberto) setFichaSuja(false);
  }, [aberto]);

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
      propriedade: valores.propriedade,
      status: valores.status,
      medicaoInicial: medicaoParaNumero(valores.medicaoInicial),
      numeroSerie: valores.numeroSerie,
      dataAquisicao:
        valores.dataAquisicao === "" ? undefined : valores.dataAquisicao,
      dataVenda: valores.dataVenda === "" ? undefined : valores.dataVenda,
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
      temAlteracoesNaoSalvas={
        (form.formState.isDirty || fichaSuja) && !salvando
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
        onSubmit={submeterComAviso(form, aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <LinhaCampos>
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
        </LinhaCampos>

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

        <LinhaCampos>
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
        </LinhaCampos>

        <LinhaCampos>
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
            <Combobox
              valor={controleValor}
              onValorChange={(valor) =>
                form.setValue(
                  "controlePor",
                  valor as EquipamentoFormInput["controlePor"],
                  { shouldValidate: true },
                )
              }
              opcoes={CONTROLE_POR.map((controle) => ({
                valor: controle,
                rotulo: CONTROLE_POR_CONFIG[controle],
              }))}
              disabled={salvando}
              id="equipamento-controle"
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos colunas={2}>
          <CampoFormulario
            id="equipamento-propriedade"
            rotulo="De quem é"
            obrigatorio
            ajuda={AJUDA_PROPRIEDADE[form.watch("propriedade")]}
            erro={form.formState.errors.propriedade?.message}
          >
            <Combobox
              valor={form.watch("propriedade")}
              onValorChange={(valor) =>
                form.setValue(
                  "propriedade",
                  valor as EquipamentoFormInput["propriedade"],
                  { shouldValidate: true, shouldDirty: true },
                )
              }
              opcoes={PROPRIEDADES.map((propriedade) => ({
                valor: propriedade,
                rotulo: ROTULO_PROPRIEDADE[propriedade],
              }))}
              disabled={salvando}
              id="equipamento-propriedade"
            />
          </CampoFormulario>

          <CampoFormulario
            id="equipamento-status"
            rotulo="Situação"
            obrigatorio
            erro={form.formState.errors.status?.message}
          >
            <Combobox
              valor={form.watch("status")}
              onValorChange={(valor) =>
                form.setValue(
                  "status",
                  valor as EquipamentoFormInput["status"],
                  { shouldValidate: true, shouldDirty: true },
                )
              }
              opcoes={STATUS_EQUIPAMENTO.map((status) => ({
                valor: status,
                rotulo: ROTULO_STATUS_EQUIPAMENTO[status],
              }))}
              disabled={salvando}
              id="equipamento-status"
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos colunas={2}>
          <CampoFormulario
            id="equipamento-medicao-inicial"
            rotulo={controleValor === "km" ? "Km inicial" : "Horímetro inicial"}
            erro={form.formState.errors.medicaoInicial?.message}
          >
            <InputQuantidade
              id="equipamento-medicao-inicial"
              valor={form.watch("medicaoInicial")}
              onValorChange={(valor) =>
                form.setValue("medicaoInicial", valor, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              disabled={salvando || controleValor === "nenhum"}
            />
          </CampoFormulario>

          <CampoFormulario
            id="equipamento-numero-serie"
            rotulo="Número de série"
            erro={form.formState.errors.numeroSerie?.message}
          >
            <Input
              id="equipamento-numero-serie"
              autoComplete="off"
              disabled={salvando}
              {...form.register("numeroSerie")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos colunas={2}>
          <CampoFormulario
            id="equipamento-data-aquisicao"
            rotulo="Data de aquisição"
            erro={form.formState.errors.dataAquisicao?.message}
          >
            <Input
              id="equipamento-data-aquisicao"
              type="date"
              disabled={salvando}
              {...form.register("dataAquisicao")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="equipamento-data-venda"
            rotulo="Data de venda"
            erro={form.formState.errors.dataVenda?.message}
          >
            <Input
              id="equipamento-data-venda"
              type="date"
              disabled={salvando}
              {...form.register("dataVenda")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <SelectAtivo
          value={form.watch("ativo")}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
        />
      </form>

      {editando ? (
        <>
          <SecaoFichaTecnica
            key={equipamento.id}
            equipamentoId={equipamento.id}
            controlePor={equipamento.controlePor}
            podeEditar={podeEditar}
            onSujaChange={setFichaSuja}
          />
          <SecaoDocumentos
            equipamentoId={equipamento.id}
            documentos={documentos}
            podeEditar={podeEditar}
          />
        </>
      ) : (
        <p className="mt-6 border-t border-border pt-5 text-detalhe text-muted-foreground">
          Salve o equipamento para registrar a ficha técnica e os documentos
          dele.
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

type CargaAnexos =
  | { estado: "carregando" }
  | { estado: "erro"; mensagem: string }
  | { estado: "pronto"; porDocumento: Record<string, AnexoDoDocumento[]> };

/**
 * Anexos dos documentos do equipamento, carregados quando a seção monta (o
 * drawer só a monta com o equipamento salvo), igual à ficha técnica. A
 * listagem de equipamentos não traz anexo nenhum.
 *
 * `recarregar` não volta para "carregando": a seção de anexos aberta não
 * desmonta no meio do envio, só recebe a lista nova.
 */
function useAnexosDosDocumentos(equipamentoId: string) {
  const [carga, setCarga] = React.useState<CargaAnexos>({
    estado: "carregando",
  });
  const [tentativa, setTentativa] = React.useState(0);

  React.useEffect(() => {
    let ativo = true;
    carregarAnexosDosDocumentos(equipamentoId)
      .then((resultado) => {
        if (!ativo) return;
        if ("erro" in resultado) {
          setCarga({ estado: "erro", mensagem: resultado.erro });
          return;
        }
        setCarga({ estado: "pronto", porDocumento: resultado.anexos });
      })
      .catch(() => {
        if (!ativo) return;
        setCarga({
          estado: "erro",
          mensagem:
            "Não foi possível carregar os anexos dos documentos. Tente novamente",
        });
      });
    return () => {
      ativo = false;
    };
  }, [equipamentoId, tentativa]);

  const recarregar = React.useCallback(() => setTentativa((n) => n + 1), []);
  const tentarDeNovo = React.useCallback(() => {
    setCarga({ estado: "carregando" });
    setTentativa((n) => n + 1);
  }, []);

  return { carga, recarregar, tentarDeNovo };
}

/**
 * Seção de documentos no detalhe do equipamento: subtabela com vencimento
 * formatado e badge âmbar quando vencido ou perto, mais o formulário de
 * adicionar. Remoção pede confirmação. Cada linha abre os anexos do
 * documento (componente canônico `Anexos`).
 */
function SecaoDocumentos({
  equipamentoId,
  documentos,
  podeEditar,
}: SecaoDocumentosProps) {
  const [adicionando, setAdicionando] = React.useState(false);
  const [paraRemover, setParaRemover] =
    React.useState<EquipamentoDocumento | null>(null);
  const [anexosAbertos, setAnexosAbertos] = React.useState<Set<string>>(
    () => new Set(),
  );
  const {
    carga: cargaAnexos,
    recarregar,
    tentarDeNovo,
  } = useAnexosDosDocumentos(equipamentoId);

  function alternarAnexos(documentoId: string) {
    setAnexosAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(documentoId)) proximo.delete(documentoId);
      else proximo.add(documentoId);
      return proximo;
    });
  }

  /** null enquanto carrega ou quando falhou: nunca "Sem anexo" por engano. */
  function anexosDe(documentoId: string): AnexoDoDocumento[] | null {
    if (cargaAnexos.estado !== "pronto") return null;
    return cargaAnexos.porDocumento[documentoId] ?? [];
  }

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
          onSubmit={submeterComAviso(form, aoAdicionar)}
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
            const anexos = anexosDe(documento.id);
            const anexosAberto =
              anexos !== null && anexosAbertos.has(documento.id);
            return (
              <li key={documento.id} className="flex flex-col">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
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
                    <BotaoAnexosDocumento
                      tipoDocumento={documento.tipo}
                      anexos={anexos}
                      aberto={anexosAberto}
                      onAlternar={() => alternarAnexos(documento.id)}
                    />
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
                </div>
                {anexosAberto ? (
                  <AnexosDocumentoEquipamento
                    documentoId={documento.id}
                    anexos={anexos}
                    podeEditar={podeEditar}
                    onMudou={recarregar}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {documentos.length > 0 && cargaAnexos.estado === "erro" ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-status-rejeitado/30 px-3 py-2 text-legenda text-status-rejeitado"
        >
          <span>{cargaAnexos.mensagem}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={tentarDeNovo}
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}

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
