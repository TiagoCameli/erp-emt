"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Download, FileSpreadsheet, Info, RotateCcw, Trash2, Upload } from "lucide-react";

import { CelulaVazia, ConfirmDialog, DataTable, EmptyState, PageHeader, SecaoDetalhe, StatusBadge } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { formatarData, formatarDataHora } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { urlDoAnexo } from "@/modules/_shared/anexos/actions";
import { aprovarVersao, desaprovarVersao, excluirVersao } from "@/modules/medicao/planilha/actions";
import { SeloVersao, ValorPrevisto } from "@/modules/medicao/planilha/components/versoes-tabela";
import { decimalPtBr } from "@/modules/medicao/planilha/formato";
import type { LinhaDaVersao, VersaoCarregada } from "@/modules/medicao/planilha/queries";

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

/** Recuo por nível: 1rem por nível abaixo da raiz. */
const recuo = (nivel: number) => ({ paddingLeft: `${Math.max(0, nivel - 1)}rem` });

export const colunasLinhas: ColumnDef<LinhaDaVersao, unknown>[] = [
  {
    accessorKey: "codigo",
    header: "Item",
    size: 150,
    meta: { fixa: true, atomico: true },
    cell: ({ row }) => (
      <span className={cn("font-mono", row.original.tipo === "titulo" && "font-semibold")} style={recuo(row.original.nivel)}>
        {row.original.codigo}
      </span>
    ),
  },
  {
    accessorKey: "descricao",
    header: "Discriminação",
    size: 380,
    cell: ({ row }) => (
      <span className={cn(row.original.tipo === "titulo" && "font-semibold")} style={recuo(row.original.nivel)}>
        {row.original.descricao}
      </span>
    ),
  },
  {
    accessorKey: "unidade",
    header: "Unid.",
    size: 70,
    cell: ({ row }) => row.original.unidade ?? (row.original.tipo === "servico" ? <CelulaVazia /> : null),
  },
  {
    // Texto do numeric COMPLETO: a casa escondida do xlsx aparece aqui como está no banco.
    accessorKey: "precoUnitario",
    header: "Preço unitário",
    size: 150,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{decimalPtBr(row.original.precoUnitario)}</span>,
  },
  {
    accessorKey: "quantidadePrevista",
    header: "Quantidade prevista",
    size: 150,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{decimalPtBr(row.original.quantidadePrevista)}</span>,
  },
  {
    id: "valor",
    header: "Valor previsto",
    size: 170,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) =>
      row.original.valorPrevisto === null ? (
        <CelulaVazia />
      ) : (
        <span className={cn(row.original.tipo === "titulo" && "font-semibold")}>
          <ValorPrevisto valor={row.original.valorPrevisto} />
        </span>
      ),
  },
];

export interface VersaoDetalheProps {
  dados: VersaoCarregada;
  /** Vínculo do xlsx importado (o anexo com o mesmo SHA-256 da versão), para baixar. */
  xlsx: { vinculoId: string; nome: string } | null;
  podeCriar: boolean;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
  podeExcluir: boolean;
}

type Dialogo = "aprovar" | "desaprovar" | "excluir" | null;

/**
 * Detalhe de uma versão da planilha: cabeçalho, linhas com a hierarquia recuada e as transições
 * (tornar vigente, voltar a rascunho, reimportar, excluir o rascunho). Nenhum valor é calculado
 * aqui: preço e quantidade são o texto do banco, valor e total saem das views.
 */
export function VersaoDetalhe({ dados, xlsx, podeCriar, podeAprovar, podeDesaprovar, podeExcluir }: VersaoDetalheProps) {
  const router = useRouter();
  const [dialogo, setDialogo] = React.useState<Dialogo>(null);
  const { versao, contrato, linhas, totalPrevisto } = dados;
  const rascunho = versao.status === "rascunho";
  const naLixeira = versao.excluidoEm !== null;
  const semRegra = contrato.regraArredondamento === null;
  const voltar = `/medicao/planilha?contrato=${contrato.id}`;

  async function baixar() {
    if (!xlsx) return;
    const r = await urlDoAnexo(xlsx.vinculoId);
    if ("erro" in r) {
      toast.error(r.erro);
      return;
    }
    window.open(r.url, "_blank", "noopener");
  }

  async function confirmar(motivo?: string) {
    const acao = dialogo;
    if (!acao) return;
    const resultado =
      acao === "aprovar"
        ? await aprovarVersao(versao.id)
        : acao === "desaprovar"
          ? await desaprovarVersao(versao.id, motivo ?? "")
          : await excluirVersao(versao.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    setDialogo(null);
    if (acao === "excluir") {
      toast.success("Rascunho excluído. Ele foi para a lixeira");
      router.push(voltar);
      return;
    }
    toast.success(acao === "aprovar" ? `A versão v${versao.numero} está vigente` : `A versão v${versao.numero} voltou a rascunho`);
    semDerrubarSucesso("medicao.planilha.transicao", () => router.refresh());
  }

  // Versão na lixeira ou contrato na lixeira: só consulta, nenhuma transição nem importação.
  const contratoNaLixeira = contrato.excluidoEm !== null;
  const ativo = !naLixeira && !contratoNaLixeira;

  return (
    <>
      <PageHeader
        modulo="Medição"
        titulo={`Planilha v${versao.numero}`}
        descricao={`${contrato.codigo} · ${contrato.nomeObra}`}
        voltarPara={{ rota: voltar, rotulo: "Voltar para as versões da planilha" }}
        selos={naLixeira ? <StatusBadge status="rejeitado" rotulo="Na lixeira" /> : <SeloVersao status={versao.status} />}
        acoes={
          ativo ? (
            <>
              {rascunho && podeCriar ? (
                <Button type="button" size="sm" variant="outline" asChild>
                  <Link href={`/medicao/planilha/${versao.id}/importar`}>
                    <Upload />
                    {linhas.length === 0 ? "Importar planilha" : "Reimportar"}
                  </Link>
                </Button>
              ) : null}
              {rascunho && podeExcluir ? (
                <Button type="button" size="sm" variant="destructive" onClick={() => setDialogo("excluir")}>
                  <Trash2 />
                  Excluir rascunho
                </Button>
              ) : null}
              {!rascunho && podeDesaprovar ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setDialogo("desaprovar")}>
                  <RotateCcw />
                  Voltar a rascunho
                </Button>
              ) : null}
              {rascunho && podeAprovar && linhas.length > 0 ? (
                <Button type="button" size="sm" onClick={() => setDialogo("aprovar")}>
                  <CheckCircle2 />
                  Tornar vigente
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-6">
        {semRegra ? (
          <div role="note" className="flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-detalhe">
            <Info className="mt-0.5 size-4 shrink-0 text-status-pendente" aria-hidden />
            <p>
              O contrato ainda não tem regra de arredondamento. Os valores aparecem quando ela for definida no{" "}
              <Link href={`/medicao/contratos/${contrato.id}`} className="font-medium underline underline-offset-2">
                cadastro
              </Link>
              .
            </p>
          </div>
        ) : null}
        {naLixeira ? (
          <div role="note" className="flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-detalhe">
            <Info className="mt-0.5 size-4 shrink-0 text-status-rejeitado" aria-hidden />
            <p>Esta versão está na lixeira{versao.motivoExclusao ? `: ${versao.motivoExclusao}` : ""}.</p>
          </div>
        ) : null}
        {contratoNaLixeira && !naLixeira ? (
          <div role="note" className="flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-detalhe">
            <Info className="mt-0.5 size-4 shrink-0 text-status-rejeitado" aria-hidden />
            <p>O contrato desta versão está na lixeira. A planilha fica só para consulta até ele ser restaurado.</p>
          </div>
        ) : null}
        {rascunho && versao.motivoDesaprovacao ? (
          <div role="note" className="flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-detalhe">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p>Voltou a rascunho: {versao.motivoDesaprovacao}</p>
          </div>
        ) : null}

        <SecaoDetalhe titulo="Dados da versão" card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Dado rotulo="Versão">
              <span className="font-mono">v{versao.numero}</span>
            </Dado>
            <Dado rotulo="Vigente desde">{formatarData(versao.vigenteDesde)}</Dado>
            <Dado rotulo="Aditivo">
              {versao.numero === 0 ? "Planilha licitada" : versao.aditivoNumero !== null ? `Aditivo nº ${versao.aditivoNumero}` : <CelulaVazia />}
            </Dado>
            <Dado rotulo="Aprovada em">{versao.aprovadaEm ? formatarDataHora(versao.aprovadaEm) : <CelulaVazia />}</Dado>
            <Dado rotulo="Arquivo importado">
              {versao.arquivoNome ? (
                xlsx ? (
                  <button type="button" onClick={baixar} className="inline-flex items-center gap-1 text-left underline-offset-2 hover:underline">
                    <Download className="size-3.5 shrink-0" aria-hidden />
                    {versao.arquivoNome}
                  </button>
                ) : (
                  versao.arquivoNome
                )
              ) : (
                <span className="text-muted-foreground">Ainda não importado</span>
              )}
            </Dado>
            <Dado rotulo="Hash do arquivo (SHA-256)">
              {versao.arquivoHash ? (
                <span className="block truncate font-mono text-legenda" title={versao.arquivoHash}>
                  {versao.arquivoHash}
                </span>
              ) : (
                <CelulaVazia />
              )}
            </Dado>
            <Dado rotulo="Total previsto">
              <ValorPrevisto valor={totalPrevisto} />
            </Dado>
            <Dado rotulo="Linhas">
              <span className="tabular-nums">{linhas.length}</span>
            </Dado>
          </div>
          {versao.motivo ? <p className="mt-4 whitespace-pre-wrap text-detalhe text-muted-foreground">{versao.motivo}</p> : null}
        </SecaoDetalhe>

        <DataTable
          idTabela="medicao.planilha.linhas"
          columns={colunasLinhas}
          data={linhas}
          pageSize={100}
          rodape={{
            descricao: <span className="font-semibold">Total da versão</span>,
            valor: (
              <span className="font-semibold">
                <ValorPrevisto valor={totalPrevisto} />
              </span>
            ),
          }}
          emptyState={
            <EmptyState
              icone={FileSpreadsheet}
              titulo="A versão ainda não tem linhas"
              descricao={rascunho ? "Anexe o xlsx oficial e importe pela tela de importação" : "Nenhuma linha gravada"}
              acao={
                rascunho && podeCriar && ativo ? (
                  <Button type="button" size="sm" asChild>
                    <Link href={`/medicao/planilha/${versao.id}/importar`}>
                      <Upload />
                      Importar planilha
                    </Link>
                  </Button>
                ) : undefined
              }
              className="border-none bg-transparent"
            />
          }
        />
      </div>

      <ConfirmDialog
        aberto={dialogo === "aprovar"}
        onAbertoChange={(a) => !a && setDialogo(null)}
        titulo={`Tornar a v${versao.numero} vigente`}
        descricao="A versão fica imutável. Mudança depois só por aditivo"
        textoConfirmar="Tornar vigente"
        onConfirmar={confirmar}
      />
      <ConfirmDialog
        aberto={dialogo === "desaprovar"}
        onAbertoChange={(a) => !a && setDialogo(null)}
        titulo={`Voltar a v${versao.numero} a rascunho`}
        descricao="Só a última versão volta, e só se nenhuma medição usa ela. Informe o motivo."
        textoConfirmar="Voltar a rascunho"
        exigeMotivo
        onConfirmar={confirmar}
      />
      <ConfirmDialog
        aberto={dialogo === "excluir"}
        onAbertoChange={(a) => !a && setDialogo(null)}
        titulo={`Excluir o rascunho v${versao.numero}`}
        descricao="O rascunho vai para a lixeira, com as linhas importadas. Informe o motivo."
        textoConfirmar="Excluir rascunho"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={confirmar}
      />
    </>
  );
}
