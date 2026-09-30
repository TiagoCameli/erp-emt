"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/canonicos/toast";
import { formatarData } from "@/lib/formatadores";
import { conferirColagem, gravarColagem } from "@/modules/medicao/lancamentos/actions";
import { lerColagem, type LinhaColada } from "@/modules/medicao/lancamentos/colar";
import { numeroExibicao } from "@/modules/medicao/planilha/formato";
import type { ErroColagemBanco, LinhaParaColar, ServicoParaLancar } from "@/modules/medicao/lancamentos/tipos";

/** Uma linha da prévia: o que `lerColagem` resolveu (ou o erro dela) mais o que o banco disse. */
interface LinhaPrevia {
  linha: number;
  /** null: erro do PARSER (lerColagem) — nunca chega a ir ao banco. */
  colada: LinhaColada | null;
  erroLocal: string | null;
  erroBanco: string | null;
  excessoBanco: boolean;
  motivoExcesso: string;
}

export interface ColarLancamentosProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  contratoId: string;
  tipoLocalizacao: "rodovia" | "texto";
  /** Serviços das medições ABERTAS do contrato (servicosParaLancar). */
  servicos: ServicoParaLancar[];
  onGravado?: () => void;
}

const INSTRUCAO_COLUNAS = "Data | Item (código) | Quantidade | Km inicial | Km final | Estaca | Observação";

function linhaParaColar(l: LinhaColada, motivoExcesso: string): LinhaParaColar {
  return {
    linha: l.linha,
    data: l.data,
    itemId: l.itemId,
    quantidade: l.quantidade,
    kmInicial: l.kmInicial,
    kmFinal: l.kmFinal,
    estaca: l.estaca,
    observacao: l.observacao,
    motivoExcesso: motivoExcesso.trim() === "" ? null : motivoExcesso.trim(),
  };
}

/**
 * "Colar do Excel": área de texto -> `lerColagem` (puro, sem rede) resolve cada linha contra os
 * serviços das medições abertas -> `conferirColagem` (RPC, `p_gravar = false`) confere de novo no
 * banco -> a prévia mostra as duas fontes de erro juntas, uma tabela só. Linha com excesso (banco
 * devolve `excesso: true`) ganha um campo de motivo NA PRÓPRIA LINHA (ou um motivo só, aplicado a
 * todas as assinaladas). "Gravar N linhas" só liga sem nenhum erro pendente (nem local, nem do
 * banco) e sem excesso sem motivo; grava por `gravarColagem` (`p_gravar = true`, tudo ou nada) e,
 * se o banco achar erro novo na hora de gravar (corrida com outra colagem), a prévia é atualizada
 * de novo em vez de só um toast solto.
 */
export function ColarLancamentos({ aberto, onAbertoChange, contratoId, tipoLocalizacao, servicos, onGravado }: ColarLancamentosProps) {
  const [texto, setTexto] = React.useState("");
  const [linhas, setLinhas] = React.useState<LinhaPrevia[] | null>(null);
  const [conferindo, setConferindo] = React.useState(false);
  const [gravando, setGravando] = React.useState(false);
  const [motivoParaTodas, setMotivoParaTodas] = React.useState("");

  function limpar() {
    setTexto("");
    setLinhas(null);
    setConferindo(false);
    setGravando(false);
    setMotivoParaTodas("");
  }

  function handleAbertoChange(novo: boolean) {
    if (!novo) limpar();
    onAbertoChange(novo);
  }

  function aplicarErrosDoBanco(errosBanco: ErroColagemBanco[]) {
    const porLinha = new Map(errosBanco.map((e) => [e.linha, e]));
    setLinhas((atual) =>
      (atual ?? []).map((p) => {
        const erro = porLinha.get(p.linha);
        return { ...p, erroBanco: erro?.erro ?? null, excessoBanco: erro?.excesso ?? false };
      }),
    );
  }

  async function conferir() {
    const lido = lerColagem(texto, servicos, tipoLocalizacao);
    // Erro geral do bloco (mais de 500 linhas, ver colar.ts): nenhuma linha processável.
    const erroGeral = lido.erros.find((e) => e.linha === 0);
    if (erroGeral) {
      toast.error(erroGeral.erro);
      return;
    }

    const previa: LinhaPrevia[] = [
      ...lido.linhas.map((l) => ({ linha: l.linha, colada: l, erroLocal: null, erroBanco: null, excessoBanco: false, motivoExcesso: "" })),
      ...lido.erros.map((e) => ({ linha: e.linha, colada: null, erroLocal: e.erro, erroBanco: null, excessoBanco: false, motivoExcesso: "" })),
    ].sort((a, b) => a.linha - b.linha);

    if (previa.length === 0) {
      toast.error("Cole pelo menos uma linha");
      return;
    }
    setLinhas(previa);

    const validas = previa.filter((p): p is LinhaPrevia & { colada: LinhaColada } => p.colada !== null);
    if (validas.length === 0) return;

    setConferindo(true);
    try {
      const resultado = await conferirColagem(
        contratoId,
        validas.map((p) => linhaParaColar(p.colada, "")),
      );
      if ("erro" in resultado) {
        // Falha ao CONFERIR (infra, permissão): não dá para saber se a linha está certa, então a
        // prévia não fica no ar sugerindo "sem erro" — volta para o texto colado, sem perdê-lo.
        toast.error(resultado.erro);
        setLinhas(null);
        return;
      }
      aplicarErrosDoBanco(resultado.resultado.erros);
    } finally {
      setConferindo(false);
    }
  }

  function mudarMotivo(linha: number, motivo: string) {
    setLinhas((atual) => (atual ?? []).map((p) => (p.linha === linha ? { ...p, motivoExcesso: motivo } : p)));
  }

  function aplicarMotivoATodas() {
    setLinhas((atual) => (atual ?? []).map((p) => (p.excessoBanco ? { ...p, motivoExcesso: motivoParaTodas } : p)));
  }

  const linhasValidas = (linhas ?? []).filter((p): p is LinhaPrevia & { colada: LinhaColada } => p.colada !== null);
  const semErro =
    (linhas ?? []).length > 0 && (linhas ?? []).every((p) => p.erroLocal === null && (p.erroBanco === null || p.excessoBanco));
  const excessoSemMotivo = (linhas ?? []).some((p) => p.excessoBanco && p.motivoExcesso.trim() === "");
  const podeGravar = semErro && !excessoSemMotivo && !conferindo && !gravando && linhasValidas.length > 0;
  const temAlgumExcesso = (linhas ?? []).some((p) => p.excessoBanco);

  async function gravar() {
    if (linhasValidas.length === 0) return;
    setGravando(true);
    try {
      const resultado = await gravarColagem(
        contratoId,
        linhasValidas.map((p) => linhaParaColar(p.colada, p.motivoExcesso)),
      );
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      if (resultado.resultado.erros.length > 0) {
        // O banco achou erro novo na hora de gravar (ex.: outra colagem entrou primeiro): a
        // prévia mostra de novo, em vez de um toast que não diz qual linha.
        aplicarErrosDoBanco(resultado.resultado.erros);
        toast.error(`Nada foi gravado: ${resultado.resultado.erros.length} linha(s) com erro`);
        return;
      }
      toast.success(resultado.resultado.gravadas === 1 ? "1 lançamento gravado" : `${resultado.resultado.gravadas} lançamentos gravados`);
      handleAbertoChange(false);
      onGravado?.();
    } finally {
      setGravando(false);
    }
  }

  function rotuloItem(itemId: string): string {
    const servico = servicos.find((s) => s.itemId === itemId);
    return servico ? `${servico.codigo} — ${servico.descricao}` : itemId;
  }

  return (
    <Dialog open={aberto} onOpenChange={handleAbertoChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Colar do Excel</DialogTitle>
          <DialogDescription>Cole as colunas nesta ordem: {INSTRUCAO_COLUNAS}. A 1ª linha pode ser o cabeçalho.</DialogDescription>
        </DialogHeader>

        {linhas === null ? (
          <Textarea
            aria-label="Texto colado do Excel"
            rows={12}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Cole aqui o bloco copiado do Excel"
            className="font-mono text-detalhe"
          />
        ) : (
          <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
            {temAlgumExcesso ? (
              <div className="flex items-end gap-2 rounded-md border border-status-pendente/40 bg-status-pendente/10 p-2">
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor="colar-motivo-todas" className="text-legenda text-muted-foreground">
                    Motivo do excesso para todas as linhas assinaladas
                  </label>
                  <Input id="colar-motivo-todas" value={motivoParaTodas} onChange={(e) => setMotivoParaTodas(e.target.value)} disabled={gravando} />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={aplicarMotivoATodas} disabled={gravando}>
                  Aplicar a todas
                </Button>
              </div>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">Linha</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((p) => (
                  <TableRow key={p.linha} data-linha={p.linha}>
                    <TableCell className="text-center tabular-nums">{p.linha}</TableCell>
                    <TableCell className="tabular-nums">{p.colada ? formatarData(p.colada.data) : <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="max-w-56 truncate">
                      {p.colada ? rotuloItem(p.colada.itemId) : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.colada ? numeroExibicao(p.colada.quantidade) : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-destructive">
                      {p.erroLocal ?? p.erroBanco ?? ""}
                      {p.excessoBanco ? (
                        <Input
                          aria-label={`Motivo do excesso da linha ${p.linha}`}
                          value={p.motivoExcesso}
                          onChange={(e) => mudarMotivo(p.linha, e.target.value)}
                          disabled={gravando}
                          className="mt-1"
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          {linhas === null ? (
            <Button type="button" onClick={() => void conferir()} disabled={texto.trim() === "" || conferindo}>
              {conferindo ? <LoaderCircle className="animate-spin" /> : null}
              Conferir
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setLinhas(null)} disabled={gravando}>
                Colar de novo
              </Button>
              <Button type="button" onClick={() => void gravar()} disabled={!podeGravar}>
                {gravando ? <LoaderCircle className="animate-spin" /> : null}
                Gravar {linhasValidas.length} {linhasValidas.length === 1 ? "linha" : "linhas"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
