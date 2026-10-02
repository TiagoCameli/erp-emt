"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSearch, LoaderCircle, Save, X } from "lucide-react";

import { CelulaVazia, Combobox, ConfirmDialog, DataTable, FormDrawer, MoneyText, SecaoDetalhe, StatusBadge } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { Anexos } from "@/components/canonicos/anexos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { anexosDoDocumento } from "@/modules/_shared/anexos/actions";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { dataPtBr, dinheiroTexto } from "@/modules/medicao/alertas/formato";
import { gravarReajuste, lerPdfSiac, previaReajuste } from "@/modules/medicao/reajuste/actions";
import type { ItemCandidato } from "@/modules/medicao/reajuste/de-para";
import { diferencaReajuste, mesAno, rotuloSituacaoReajuste } from "@/modules/medicao/reajuste/formato";
import type { Escolhas, LeituraSiac, LinhaPrevia, PdfPendente, PreviaReajuste } from "@/modules/medicao/reajuste/tipos";

const ENTIDADE = "mc_reajuste";
const TAMANHO_PAGINA = 100;

type Ocupado = "lendo" | "previa" | "gravando" | null;

/** Selo da origem do casamento de cada linha: o que veio salvo, o sugerido, o que pede olho. */
const SELO_ORIGEM: Record<string, { rotulo: string; status: string }> = {
  salvo: { rotulo: "Salvo", status: "aprovado" },
  sugerido: { rotulo: "Sugerido", status: "rascunho" },
  conferir: { rotulo: "Conferir", status: "pendente_aprovacao" },
  sem_candidato: { rotulo: "Sem candidato", status: "rejeitado" },
  escolhido: { rotulo: "Escolhido", status: "aprovado" },
};

const chaveDe = (l: Pick<LinhaPrevia, "grupo" | "codigo">) => `${l.grupo}|${l.codigo}`;

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

function rotuloCandidato(c: ItemCandidato): string {
  return [c.codigo, c.descricao, c.unidade, dinheiroTexto(c.preco)].filter((p) => p !== null && p !== undefined && p !== "").join(" · ");
}

export interface ImportarSiacDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  medicaoId: string;
  numero: number;
  /** Anexos `mc_reajuste` da medição (todos; a tela mostra só os que não estão em relatório). */
  anexos: AnexoDoDocumento[];
  /** PDFs anexados que ainda não viraram relatório (`pdfsPendentes`). */
  pendentes: PdfPendente[];
  /** Arquivos que já estão em algum relatório (inclusive excluído): não são oferecidos de novo. */
  arquivosEmRelatorio: string[];
  onGravado?: () => void;
}

/**
 * Importar o relatório SIAC "Resumo da Medição". Passo 1: anexar o PDF à medição (ou escolher um
 * pendente) e ler; o servidor lê o PDF, confere as somas e devolve a prévia da RPC. Passo 2: a
 * prévia, com o cabeçalho lido, os avisos, o total do DNIT e a diferença para o que vale hoje, e por
 * linha o valor a PI do DNIT ao lado do nosso, o casamento com os nossos itens e o rateio que a RPC
 * fez. Toda troca de item ou de destino chama `previaReajuste` e a tela redesenha com a resposta:
 * nenhuma conta aqui (D7). Gravar só sem pendência, com confirmação.
 */
export function ImportarSiacDrawer({ aberto, onAbertoChange, medicaoId, numero, anexos, pendentes, arquivosEmRelatorio, onGravado }: ImportarSiacDrawerProps) {
  const router = useRouter();
  const [leitura, setLeitura] = React.useState<LeituraSiac | null>(null);
  const [arquivoId, setArquivoId] = React.useState<string | null>(null);
  const [escolhas, setEscolhas] = React.useState<Escolhas>({});
  const [previa, setPrevia] = React.useState<PreviaReajuste | null>(null);
  const [editadas, setEditadas] = React.useState<ReadonlySet<string>>(new Set());
  const [erro, setErro] = React.useState<string | null>(null);
  const [ocupado, setOcupado] = React.useState<Ocupado>(null);
  const [confirmando, setConfirmando] = React.useState(false);

  const emRelatorio = React.useMemo(() => new Set(arquivosEmRelatorio), [arquivosEmRelatorio]);
  // Arquivos já vistos: o que aparecer depois de um envio é o PDF novo, lido na hora.
  const conhecidos = React.useRef(new Set(anexos.map((a) => a.arquivoId)));
  React.useEffect(() => {
    for (const a of anexos) conhecidos.current.add(a.arquivoId);
  }, [anexos]);

  const candidatos = React.useMemo(() => leitura?.candidatos ?? [], [leitura]);
  const candidatoPorId = React.useMemo(() => new Map(candidatos.map((c) => [c.itemId, c])), [candidatos]);
  const codigoDoItem = React.useCallback((id: string) => candidatoPorId.get(id)?.codigo ?? "item", [candidatoPorId]);

  async function ler(id: string) {
    setOcupado("lendo");
    setErro(null);
    try {
      const r = await lerPdfSiac(medicaoId, id);
      if ("erro" in r) {
        setErro(r.erro);
        setLeitura(null);
        setPrevia(null);
        return;
      }
      setLeitura(r);
      setArquivoId(id);
      setEscolhas(r.escolhas);
      setPrevia(r.previa);
      setEditadas(new Set());
    } finally {
      setOcupado(null);
    }
  }

  /**
   * Depois de enviar (ou remover) um anexo: acha o PDF que acabou de entrar e lê na hora. O refresh
   * da página (lista de pendentes) vem DEPOIS da comparação: antes, a lista nova chegaria pela prop e
   * o PDF novo já contaria como conhecido.
   */
  async function aoMudarAnexos() {
    let lista: AnexoDoDocumento[];
    try {
      lista = await anexosDoDocumento(ENTIDADE, medicaoId);
    } catch {
      toast.error("Não foi possível ver o PDF enviado. Recarregue a página e clique em Ler");
      return;
    }
    const novos = lista.filter((a) => !conhecidos.current.has(a.arquivoId) && !emRelatorio.has(a.arquivoId));
    for (const a of lista) conhecidos.current.add(a.arquivoId);
    semDerrubarSucesso("medicao.reajuste.anexos", () => router.refresh());
    const novo = novos[novos.length - 1];
    if (novo) await ler(novo.arquivoId);
  }

  /** Manda as escolhas novas à RPC; na recusa, volta às anteriores (a prévia é a delas). */
  async function atualizar(chave: string, nova: Escolhas[string]) {
    if (!arquivoId) return;
    const anteriores = escolhas;
    const novas = { ...escolhas, [chave]: nova };
    setEscolhas(novas);
    setEditadas((antes) => new Set(antes).add(chave));
    setOcupado("previa");
    setErro(null);
    try {
      const r = await previaReajuste(medicaoId, arquivoId, novas);
      if ("erro" in r) {
        setEscolhas(anteriores);
        setErro(r.erro);
        toast.error(r.erro);
        return;
      }
      setPrevia(r.previa);
    } finally {
      setOcupado(null);
    }
  }

  function escolhaDe(l: LinhaPrevia): Escolhas[string] {
    return escolhas[chaveDe(l)] ?? { itens: l.itens, destino: l.destino };
  }

  async function gravar(): Promise<boolean> {
    if (!arquivoId) return true;
    setOcupado("gravando");
    setErro(null);
    try {
      const r = await gravarReajuste(medicaoId, arquivoId, escolhas);
      if ("erro" in r) {
        // Fecha a confirmação e mostra a recusa no drawer, ao lado da prévia que a causou.
        setErro(r.erro);
        toast.error(r.erro);
        return true;
      }
      toast.success(`Reajuste gravado na ${numero}ª medição`);
      onAbertoChange(false);
      onGravado?.();
      return true;
    } finally {
      setOcupado(null);
    }
  }

  // As colunas leem o estado da prévia; recriadas a cada render (a tabela tem poucas dezenas de linhas).
  const colunas: ColumnDef<LinhaPrevia, unknown>[] = [
    { accessorKey: "grupo", header: "Grupo", size: 70, meta: { fixa: true, atomico: true }, cell: ({ row }) => <span className="font-mono">{row.original.grupo}</span> },
    { accessorKey: "codigo", header: "Código SICRO", size: 100, meta: { atomico: true }, cell: ({ row }) => <span className="font-mono">{row.original.codigo}</span> },
    { accessorKey: "descricao", header: "Descrição", size: 260 },
    { accessorKey: "unidade", header: "Unid.", size: 60, meta: { atomico: true } },
    {
      accessorKey: "valor_pi",
      header: "Valor a PI (DNIT)",
      size: 140,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <MoneyText valor={row.original.valor_pi} />,
    },
    {
      accessorKey: "valor_nosso",
      header: "Valor nosso",
      size: 140,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <MoneyText valor={row.original.valor_nosso} />,
    },
    {
      accessorKey: "reajuste",
      header: "Reajuste",
      size: 130,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <MoneyText valor={row.original.reajuste} />,
    },
    {
      id: "origem",
      header: "Casamento",
      size: 120,
      meta: { naoTruncar: true },
      cell: ({ row }) => {
        const chave = chaveDe(row.original);
        const tipo = editadas.has(chave)
          ? "escolhido"
          : leitura?.conferir.includes(chave)
            ? "conferir"
            : (leitura?.origem[chave] ?? "sem_candidato");
        const selo = SELO_ORIGEM[tipo] ?? SELO_ORIGEM.sem_candidato;
        return <StatusBadge status={selo.status} rotulo={selo.rotulo} />;
      },
    },
    {
      id: "itens",
      header: "Itens casados",
      size: 300,
      meta: { naoTruncar: true },
      cell: ({ row }) => {
        const l = row.original;
        const atual = escolhaDe(l);
        const rotuloLinha = `${l.grupo} ${l.codigo}`;
        const opcoes = candidatos.filter((c) => !atual.itens.includes(c.itemId)).map((c) => ({ valor: c.itemId, rotulo: rotuloCandidato(c) }));
        return (
          <div className="flex flex-col gap-1.5">
            {l.itens.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {l.itens.map((id) => (
                  <span key={id} className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-legenda">
                    {codigoDoItem(id)}
                    <button
                      type="button"
                      className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                      aria-label={`Tirar ${codigoDoItem(id)} da linha ${rotuloLinha}`}
                      disabled={ocupado !== null}
                      onClick={() =>
                        void atualizar(chaveDe(l), {
                          itens: atual.itens.filter((x) => x !== id),
                          destino: atual.destino === id ? null : atual.destino,
                        })
                      }
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <Combobox
              ariaLabel={`Casar item com a linha ${rotuloLinha}`}
              valor=""
              onValorChange={(id) => {
                if (id) void atualizar(chaveDe(l), { itens: [...atual.itens, id], destino: atual.destino });
              }}
              opcoes={opcoes}
              placeholder="Casar item"
              buscaPlaceholder="Código ou descrição"
              vazioTexto="Nenhum serviço da planilha desta medição"
              size="sm"
              disabled={ocupado !== null}
            />
          </div>
        );
      },
    },
    {
      id: "destino",
      header: "Destino",
      size: 220,
      meta: { naoTruncar: true },
      cell: ({ row }) => {
        const l = row.original;
        const atual = escolhaDe(l);
        const precisa = l.itens.length >= 2 && (l.pendencia !== null || atual.destino !== null);
        if (!precisa && l.pendencia === null) return null;
        return (
          <div className="flex flex-col gap-1.5">
            {precisa ? (
              <Combobox
                ariaLabel={`Item que recebe a linha ${l.grupo} ${l.codigo}`}
                valor={atual.destino ?? ""}
                onValorChange={(id) => void atualizar(chaveDe(l), { itens: atual.itens, destino: id === "" ? null : id })}
                opcoes={l.itens.map((id) => {
                  const c = candidatoPorId.get(id);
                  return { valor: id, rotulo: c ? rotuloCandidato(c) : id };
                })}
                placeholder="Escolha o item"
                size="sm"
                disabled={ocupado !== null}
              />
            ) : null}
            {l.pendencia ? <span className="text-legenda text-status-rejeitado">{l.pendencia}</span> : null}
          </div>
        );
      },
    },
    {
      id: "rateio",
      header: "Rateio",
      size: 220,
      meta: { naoTruncar: true },
      cell: ({ row }) => {
        const rateio = row.original.rateio ?? [];
        if (rateio.length === 0) return <CelulaVazia />;
        const rotulo = (r: (typeof rateio)[number]) => `${codigoDoItem(r.item_id)} · ${dinheiroTexto(r.valor)}`;
        if (rateio.length === 1) return <span className="tabular-nums">{rotulo(rateio[0])}</span>;
        return (
          <ul className="flex flex-col gap-0.5 tabular-nums">
            {rateio.map((r) => (
              <li key={r.item_id}>{rotulo(r)}</li>
            ))}
          </ul>
        );
      },
    },
  ];

  const pendencias = previa?.pendencias ?? 0;
  const c = leitura?.cabecalho;
  const pendentesParaLer = pendentes.filter((p) => !emRelatorio.has(p.arquivoId));
  const situacaoPlural = previa?.situacao === "definitivo" ? "definitivos" : "provisórios";

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={`Importar relatório SIAC na ${numero}ª medição`}
      descricao="O PDF do Resumo da Medição é lido no servidor. A prévia mostra o rateio que será gravado"
      temAlteracoesNaoSalvas={leitura !== null && ocupado !== "gravando"}
      larguraClassName="sm:max-w-[95vw]"
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={ocupado === "gravando"}>
            Cancelar
          </Button>
          {previa ? (
            <Button type="button" onClick={() => setConfirmando(true)} disabled={ocupado !== null || pendencias > 0}>
              {ocupado === "gravando" ? <LoaderCircle className="animate-spin" /> : <Save />}
              Gravar reajuste
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <SecaoDetalhe titulo="1. PDF do relatório" card>
          <Anexos
            entidade={ENTIDADE}
            entidadeId={medicaoId}
            anexos={anexos}
            podeEditar
            filtro={(a) => !emRelatorio.has(a.arquivoId)}
            aceitar="application/pdf"
            validarNovos={(arquivos) => {
              const aceitos = arquivos.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
              const recusados = arquivos.filter((f) => !aceitos.includes(f)).map((f) => `${f.name}: só o PDF do relatório SIAC entra aqui`);
              return { aceitos, recusados };
            }}
            onMudou={() => void aoMudarAnexos()}
            convite="Arraste o PDF do Resumo da Medição do SIAC"
            legenda="O PDF fica anexado à medição e é lido assim que termina de subir"
            textoVazio="Nenhum PDF pendente nesta medição"
          />
          {pendentesParaLer.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {pendentesParaLer.map((p) => (
                <li key={p.arquivoId} className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant={p.arquivoId === arquivoId ? "default" : "outline"}
                    aria-label={`Ler ${p.nome}`}
                    disabled={ocupado !== null}
                    onClick={() => void ler(p.arquivoId)}
                  >
                    {ocupado === "lendo" ? <LoaderCircle className="animate-spin" /> : <FileSearch />}
                    Ler
                  </Button>
                  <span className="min-w-0 truncate text-detalhe">{p.nome}</span>
                  <span className="text-legenda text-muted-foreground">anexado em {dataPtBr(p.criadoEm)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {erro ? (
            <p className="mt-3 text-detalhe text-status-rejeitado" role="alert">
              {erro}
            </p>
          ) : null}
        </SecaoDetalhe>

        {leitura && previa && c ? (
          <SecaoDetalhe titulo="2. Prévia" card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Dado rotulo="Contrato">{c.contratoTexto}</Dado>
              <Dado rotulo="Medição">{`${c.medicaoNumero}ª ${c.medicaoTipo}`}</Dado>
              <Dado rotulo="Índices">{rotuloSituacaoReajuste(c.situacao)}</Dado>
              <Dado rotulo="Período">
                <span className="tabular-nums">{`${dataPtBr(c.periodoInicio)} a ${dataPtBr(c.periodoFim)}`}</span>
              </Dado>
              <Dado rotulo="Data-base">
                <span className="tabular-nums">{mesAno(c.dataBase)}</span>
              </Dado>
              <Dado rotulo="Processado em">
                <span className="tabular-nums">{c.processadoEm ? dataPtBr(c.processadoEm) : "Não informado"}</span>
              </Dado>
            </div>

            {leitura.avisos.length > 0 ? (
              <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-detalhe text-status-pendente">
                {leitura.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Dado rotulo="Reajuste do DNIT">
                <MoneyText valor={previa.total} className="font-semibold" />
              </Dado>
              <Dado rotulo="Diferença para o que vale hoje">
                {previa.diferenca === null || !previa.anterior
                  ? "Primeiro relatório desta medição"
                  : `${diferencaReajuste(previa.diferenca).texto} (vale hoje o ${previa.anterior.sequencia}, ${dinheiroTexto(previa.anterior.total)})`}
              </Dado>
              <Dado rotulo="Valor a PI (DNIT)">
                <MoneyText valor={previa.valor_pi} />
              </Dado>
              <Dado rotulo="Valor da medição">
                {previa.medicao_valor === null ? "Sem regra de arredondamento" : <MoneyText valor={previa.medicao_valor} />}
              </Dado>
            </div>

            <p className={pendencias > 0 ? "mt-4 text-detalhe text-status-rejeitado" : "mt-4 text-detalhe text-muted-foreground"}>
              {pendencias > 0
                ? `${pendencias} ${pendencias === 1 ? "linha pendente" : "linhas pendentes"}: case os itens ou escolha o item que recebe a linha para gravar`
                : `${previa.linhas.length} linhas sem pendência. Confira os casamentos marcados para conferir`}
              {ocupado === "previa" ? " · atualizando a prévia..." : ""}
            </p>

            <div className="mt-3">
              <DataTable
                idTabela="medicao.reajuste.previa"
                columns={colunas}
                data={previa.linhas}
                idDaLinha={chaveDe}
                pageSize={TAMANHO_PAGINA}
                rodape={{ valor_pi: <MoneyText valor={previa.valor_pi} />, reajuste: <MoneyText valor={previa.total} /> }}
              />
            </div>
          </SecaoDetalhe>
        ) : null}
      </div>

      <ConfirmDialog
        aberto={confirmando}
        onAbertoChange={setConfirmando}
        titulo={previa ? `Gravar o reajuste de ${dinheiroTexto(previa.total)} (índices ${situacaoPlural}) na ${numero}ª medição?` : ""}
        descricao={
          previa?.anterior && previa.diferenca !== null
            ? `Passa a valer no lugar do relatório ${previa.anterior.sequencia} (${dinheiroTexto(previa.anterior.total)}): ${diferencaReajuste(previa.diferenca).texto}. O rateio por item é gravado agora.`
            : "É o primeiro reajuste desta medição. O rateio por item é gravado agora."
        }
        textoConfirmar="Gravar"
        onConfirmar={gravar}
      />
    </FormDrawer>
  );
}
