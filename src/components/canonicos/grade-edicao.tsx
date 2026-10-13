"use client";

import * as React from "react";
import { observeElementRect, useVirtualizer } from "@tanstack/react-virtual";

import { Checkbox } from "@/components/ui/checkbox";
import { lerBlocoColado } from "@/lib/bloco-colado";
import { cn } from "@/lib/utils";
import { acaoDaTecla, type AtalhoGrade, type PosicaoCelula } from "@/components/canonicos/grade-edicao-teclado";

/**
 * Grade estilo planilha: célula ativa, edição com teclado, colar bloco do Excel e edição em várias
 * linhas selecionadas de uma vez. Não é o DataTable (que é tabela de leitura): aqui o contrato é
 * célula a célula. A grade não guarda dado nenhum; só emite `MudancaCelula` e quem decide é a tela.
 */
export interface ColunaGrade<T> {
  id: string;
  titulo: string;
  largura: number;
  direita?: boolean;
  mono?: boolean;
  exibir: (linha: T) => React.ReactNode;
  /** Ausente = só leitura. `opcoes` vira lista no editor. */
  editar?: { texto: (linha: T) => string; opcoes?: { valor: string; rotulo: string }[]; podeEditar?: (linha: T) => boolean };
  recuo?: (linha: T) => number;
  /** Texto do Ctrl+C. Sem ele: texto de edição (rótulo da opção, quando há `opcoes`), ou `exibir` só se der texto ou número. */
  copiar?: (linha: T) => string;
}
export type MudancaCelula = { idLinha: string; idColuna: string; texto: string };
export interface GradeEdicaoProps<T> {
  linhas: readonly T[];
  colunas: readonly ColunaGrade<T>[];
  idDaLinha: (linha: T) => string;
  onEditar: (mudancas: MudancaCelula[]) => void;
  onColarAlem?: (bloco: string[][], idColunaInicial: string) => void;
  onAtalho?: (atalho: AtalhoGrade, idLinha: string) => void;
  selecionadas: ReadonlySet<string>;
  onSelecionadasChange: (ids: Set<string>) => void;
  classeDaLinha?: (linha: T) => string | undefined;
  somenteLeitura?: boolean;
  alturaLinha?: number; // padrão 32
  alturaInicial?: number; // padrão 600; usado também no jsdom (initialRect do virtualizer)
  rotulo: string; // aria-label da grade
}

/** Coluna fixa da esquerda: nº da linha e caixa de seleção. */
const LARGURA_NUMERO = 64;
const RECUO_POR_NIVEL = 16;

export function GradeEdicao<T>(props: GradeEdicaoProps<T>) {
  const { linhas, colunas, idDaLinha, onEditar, onColarAlem, onAtalho, selecionadas, onSelecionadasChange,
    classeDaLinha, somenteLeitura = false, alturaLinha = 32, alturaInicial = 600, rotulo } = props;
  const [ativaGuardada, setAtiva] = React.useState<PosicaoCelula>({ linha: 0, coluna: 0 });
  // Se linhas ou colunas encolherem, a célula ativa volta para dentro da grade (nunca aponta para nada).
  const ativa: PosicaoCelula = {
    linha: Math.max(0, Math.min(ativaGuardada.linha, linhas.length - 1)),
    coluna: Math.max(0, Math.min(ativaGuardada.coluna, colunas.length - 1)),
  };
  const vazia = linhas.length === 0 || colunas.length === 0;
  const [edicao, setEdicaoEstado] = React.useState<{ texto: string } | null>(null);
  const [ancora, setAncora] = React.useState<number | null>(null);
  const rolagem = React.useRef<HTMLDivElement>(null);
  const grade = React.useRef<HTMLDivElement>(null);
  // Espelho síncrono de `edicao`: quando Enter/Esc fecha o editor e devolve o foco à grade, o campo
  // perde o foco ainda montado e o onBlur dispararia uma segunda confirmação. O ref já está nulo nessa
  // hora, então o onBlur só confirma quando o foco sai por clique fora.
  const edicaoAberta = React.useRef(false);
  const setEdicao = (valor: { texto: string } | null) => {
    edicaoAberta.current = valor !== null;
    setEdicaoEstado(valor);
  };

  const virtual = useVirtualizer({
    count: linhas.length,
    getScrollElement: () => rolagem.current,
    estimateSize: () => alturaLinha,
    overscan: 12,
    initialRect: { width: 1200, height: alturaInicial },
    // O cabeçalho fixo mora dentro da área rolável: as linhas começam uma altura abaixo do topo, e a
    // rolagem até uma linha precisa descontar o cabeçalho que a cobre.
    scrollMargin: alturaLinha,
    scrollPaddingStart: alturaLinha,
    // Medida zero (jsdom, ou a grade numa aba ainda oculta) zeraria a faixa visível e nenhuma linha
    // apareceria. Nesse caso vale a altura inicial, que é a mesma que a área rolável recebe no estilo.
    observeElementRect: (instancia, cb) =>
      observeElementRect(instancia, (rect) => cb(rect.height > 0 ? rect : { width: rect.width || 1200, height: alturaInicial })),
  });

  const editavel = (linha: number, coluna: number) => {
    const c = colunas[coluna];
    const l = linhas[linha];
    return !somenteLeitura && !!c?.editar && !!l && (c.editar.podeEditar?.(l) ?? true);
  };

  // Linhas que recebem a edição: a ativa, ou todas as selecionadas quando ela está entre elas; sempre
  // filtradas pelo podeEditar de cada uma (mesma regra da colagem).
  const alvos = (linha: number, coluna: ColunaGrade<T>): string[] => {
    const atual = linhas[linha];
    const grupo = selecionadas.size > 1 && selecionadas.has(idDaLinha(atual)) ? linhas.filter((l) => selecionadas.has(idDaLinha(l))) : [atual];
    return grupo.filter((l) => coluna.editar?.podeEditar?.(l) ?? true).map(idDaLinha);
  };

  const confirmar = (texto: string) => {
    setEdicao(null);
    const coluna = colunas[ativa.coluna];
    if (vazia || !coluna) return;
    // Lista de opções: só grava valor que é opção (Delete numa coluna assim não apaga nada).
    if (coluna.editar?.opcoes && !coluna.editar.opcoes.some((o) => o.valor === texto)) return;
    // Enter, Tab ou clique fora sem mudar nada não emite: a linha cujo texto já é esse fica de fora.
    const porId = new Map(linhas.map((l) => [idDaLinha(l), l]));
    const ids = alvos(ativa.linha, coluna).filter((id) => {
      const linha = porId.get(id);
      return !linha || coluna.editar?.texto(linha) !== texto;
    });
    if (ids.length) onEditar(ids.map((idLinha) => ({ idLinha, idColuna: coluna.id, texto })));
  };

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (vazia) return;
    const acao = acaoDaTecla(e, { posicao: ativa, editando: edicao !== null, nLinhas: linhas.length, nColunas: colunas.length });
    switch (acao.tipo) {
      case "nada": return;
      case "mover":
        e.preventDefault(); setAtiva(acao.para); virtual.scrollToIndex(acao.para.linha); return;
      case "editar":
        if (!editavel(ativa.linha, ativa.coluna)) return;
        e.preventDefault();
        {
          const editar = colunas[ativa.coluna].editar!;
          // Lista de opções começa no valor atual: a tecla digitada não é um valor possível.
          const manter = acao.manterTexto || !!editar.opcoes;
          setEdicao({ texto: manter ? editar.texto(linhas[ativa.linha]) : (acao.textoInicial ?? "") });
        }
        return;
      case "confirmar":
        e.preventDefault(); confirmar(edicao?.texto ?? ""); setAtiva(acao.depois); virtual.scrollToIndex(acao.depois.linha);
        grade.current?.focus(); return;
      case "cancelar":
        e.preventDefault(); setEdicao(null); grade.current?.focus(); return;
      case "limpar":
        if (!editavel(ativa.linha, ativa.coluna)) return;
        e.preventDefault(); confirmar(""); return;
      case "atalho":
        e.preventDefault(); if (!somenteLeitura && linhas[ativa.linha]) onAtalho?.(acao.atalho as AtalhoGrade, idDaLinha(linhas[ativa.linha])); return;
    }
  };

  const aoColar = (e: React.ClipboardEvent) => {
    if (somenteLeitura || edicao !== null) return;
    e.preventDefault();
    const bloco = lerBlocoColado(e.clipboardData.getData("text/plain") || e.clipboardData.getData("text"));
    const colunasEditaveis = colunas.map((c, i) => ({ c, i })).filter(({ c, i }) => c.editar && i >= ativa.coluna);
    const mudancas: MudancaCelula[] = [];
    const alem: string[][] = [];
    bloco.forEach((valores, k) => {
      const linha = linhas[ativa.linha + k];
      if (!linha) { alem.push(valores); return; }
      valores.forEach((texto, j) => {
        const destino = colunasEditaveis[j];
        if (destino && (destino.c.editar!.podeEditar?.(linha) ?? true)) {
          mudancas.push({ idLinha: idDaLinha(linha), idColuna: destino.c.id, texto });
        }
      });
    });
    if (mudancas.length) onEditar(mudancas);
    if (alem.length && colunasEditaveis[0]) onColarAlem?.(alem, colunasEditaveis[0].c.id);
  };

  const aoCopiar = (e: React.ClipboardEvent) => {
    if (edicao !== null || vazia) return;
    e.preventDefault();
    const ids = selecionadas.size ? linhas.filter((l) => selecionadas.has(idDaLinha(l))) : [linhas[ativa.linha]];
    const textoDa = (l: T, c: ColunaGrade<T>): string => {
      if (c.copiar) return c.copiar(l);
      if (c.editar) {
        const texto = c.editar.texto(l);
        return c.editar.opcoes?.find((o) => o.valor === texto)?.rotulo ?? texto;
      }
      const exibido = c.exibir(l);
      return typeof exibido === "string" || typeof exibido === "number" ? String(exibido) : "";
    };
    const texto = selecionadas.size
      ? ids.map((l) => colunas.map((c) => textoDa(l, c)).join("\t")).join("\n")
      : textoDa(linhas[ativa.linha], colunas[ativa.coluna]);
    e.clipboardData.setData("text/plain", texto);
  };

  // Seleção: clique na caixa da linha alterna; Shift+clique marca a faixa desde a última âncora.
  const alternar = (indice: number, faixa: boolean) => {
    const novo = new Set(selecionadas);
    if (faixa && ancora !== null) {
      const [de, ate] = [Math.min(ancora, indice), Math.max(ancora, indice)];
      for (let i = de; i <= ate; i++) novo.add(idDaLinha(linhas[i]));
    } else {
      const id = idDaLinha(linhas[indice]);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      setAncora(indice);
    }
    onSelecionadasChange(novo);
  };

  const larguraTotal = LARGURA_NUMERO + colunas.reduce((soma, c) => soma + c.largura, 0);
  const classeAlinhamento = (c: ColunaGrade<T>) => cn(c.direita && "justify-end text-right tabular-nums", c.mono && "font-mono");

  const editor = (c: ColunaGrade<T>, nLinha: number) => {
    if (!edicao) return null;
    const rotuloCampo = `${c.titulo}, linha ${nLinha}`;
    const teclar = (e: React.KeyboardEvent) => {
      // Sem isto a mesma tecla sobe até o onKeyDown da grade e confirma duas vezes.
      e.stopPropagation();
      aoTeclar(e);
    };
    const sair = () => {
      if (edicaoAberta.current) confirmar(edicao.texto);
    };
    const classeCampo = cn(
      "h-full w-full min-w-0 bg-background px-2 text-sm text-foreground outline-none",
      c.direita && "text-right tabular-nums",
      c.mono && "font-mono",
    );
    if (c.editar?.opcoes) {
      return (
        <select
          aria-label={rotuloCampo}
          autoFocus
          value={edicao.texto}
          onChange={(e) => setEdicao({ texto: e.target.value })}
          onKeyDown={teclar}
          onBlur={sair}
          className={classeCampo}
        >
          {c.editar.opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type="text"
        aria-label={rotuloCampo}
        autoFocus
        value={edicao.texto}
        onChange={(e) => setEdicao({ texto: e.target.value })}
        onKeyDown={teclar}
        onBlur={sair}
        className={classeCampo}
      />
    );
  };

  return (
    <div
      ref={grade}
      role="grid"
      aria-label={rotulo}
      aria-rowcount={linhas.length + 1}
      aria-colcount={colunas.length + 1}
      aria-readonly={somenteLeitura || undefined}
      tabIndex={0}
      onKeyDown={(e) => {
        // Tecla vinda de outro elemento (a caixa de seleção da linha) não é da grade: Espaço ali marca a
        // caixa, não começa a editar. O campo de edição chama aoTeclar direto.
        if (e.target !== e.currentTarget) return;
        aoTeclar(e);
      }}
      onPaste={aoColar}
      onCopy={aoCopiar}
      className="foco-anel-dentro rounded-md border border-border bg-background text-sm"
    >
      <div ref={rolagem} className="relative overflow-auto" style={{ height: alturaInicial }}>
        <div style={{ width: larguraTotal }}>
          {/* Cabeçalho fixo no topo da área rolável, para acompanhar a rolagem horizontal. */}
          <div role="row" aria-rowindex={1} className="sticky top-0 z-20 flex border-b border-border bg-muted">
            <div
              role="columnheader"
              aria-colindex={1}
              className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-muted px-2 text-xs font-medium text-muted-foreground"
              style={{ width: LARGURA_NUMERO, height: alturaLinha }}
            >
              <span className="sr-only">Número da linha</span>
              <span aria-hidden="true">#</span>
            </div>
            {colunas.map((c, j) => (
              <div
                key={c.id}
                role="columnheader"
                aria-colindex={j + 2}
                className={cn(
                  "flex shrink-0 items-center truncate border-r border-border px-2 text-xs font-medium text-muted-foreground",
                  c.direita && "justify-end text-right",
                )}
                style={{ width: c.largura, height: alturaLinha }}
              >
                {c.titulo}
              </div>
            ))}
          </div>

          <div className="relative" style={{ height: virtual.getTotalSize() }}>
            {virtual.getVirtualItems().map((item) => {
              const linha = linhas[item.index];
              const id = idDaLinha(linha);
              const selecionada = selecionadas.has(id);
              const nLinha = item.index + 1;
              return (
                <div
                  key={id}
                  role="row"
                  aria-rowindex={item.index + 2}
                  aria-selected={selecionada}
                  className={cn(
                    "absolute top-0 left-0 flex w-full border-b border-border",
                    selecionada && "bg-muted",
                    classeDaLinha?.(linha),
                  )}
                  style={{ height: alturaLinha, transform: `translateY(${item.start - virtual.options.scrollMargin}px)` }}
                >
                  <div
                    role="rowheader"
                    aria-colindex={1}
                    className={cn(
                      "sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-border px-2 text-xs text-muted-foreground tabular-nums",
                      selecionada ? "bg-muted" : "bg-background",
                    )}
                    style={{ width: LARGURA_NUMERO }}
                  >
                    <Checkbox
                      checked={selecionada}
                      aria-label={`Selecionar linha ${nLinha}`}
                      tabIndex={-1}
                      onClick={(e) => {
                        // O clique decide sozinho (Shift marca a faixa); o onCheckedChange não roda.
                        e.preventDefault();
                        e.stopPropagation();
                        alternar(item.index, e.shiftKey);
                      }}
                    />
                    <span>{nLinha}</span>
                  </div>
                  {colunas.map((c, j) => {
                    const eAtiva = ativa.linha === item.index && ativa.coluna === j;
                    const emEdicao = eAtiva && edicao !== null;
                    const nivel = c.recuo?.(linha) ?? 0;
                    return (
                      <div
                        key={c.id}
                        role="gridcell"
                        aria-colindex={j + 2}
                        aria-selected={eAtiva}
                        aria-readonly={!editavel(item.index, j) || undefined}
                        onClick={() => {
                          if (eAtiva) return;
                          setAtiva({ linha: item.index, coluna: j });
                          grade.current?.focus();
                        }}
                        className={cn(
                          "relative flex shrink-0 items-center truncate border-r border-border",
                          !emEdicao && "px-2",
                          classeAlinhamento(c),
                          eAtiva && "outline-2 -outline-offset-2 outline-ring",
                        )}
                        style={{
                          width: c.largura,
                          paddingLeft: !emEdicao && nivel > 0 ? 8 + nivel * RECUO_POR_NIVEL : undefined,
                        }}
                      >
                        {emEdicao ? editor(c, nLinha) : c.exibir(linha)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
