"use client";

import * as React from "react";

import { Combobox, GradeEdicao, type ColunaGrade, type MudancaCelula } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  NENHUM,
  edicaoDaCelula,
  maquinaRepetida,
  montarLote,
  operadorComPendente,
  pessoaComPendente,
  semAlocacao,
} from "@/modules/mapa/alocacao";
import type { ItemAlocacao } from "@/modules/mapa/schemas";
import type {
  CentroCustoOpcaoMapa,
  EquipamentoMapa,
  LocalidadeMapa,
  ObraMapa,
  PessoaMapa,
} from "@/modules/mapa/tipos";

/**
 * Quadro de alocação (Tiago, 17/10/2026: "o mais rápido para 30 pessoas"): uma linha por pessoa
 * (ou por máquina), edição em grade com teclado (GradeEdicao), filtro por obra e "sem alocação".
 * Várias linhas selecionadas recebem a mesma edição. Nada grava até "Salvar", que manda um lote só
 * para fn_mapa_alocar (tudo ou nada).
 */

export type PedidoQuadro = {
  /** Só estas pessoas, já selecionadas (o "Alocar" da seleção múltipla). */
  idsPessoas?: readonly string[];
  /** Abre filtrado em quem ainda não tem máquina, local nem obra. */
  soSemAlocacao?: boolean;
};

const TODAS = "__todas__";
const porNome = (a: { nome: string }, b: { nome: string }) =>
  a.nome.localeCompare(b.nome, "pt-BR");

export function QuadroAlocacao({
  pedido,
  onFechar,
  telaLarga,
  pessoas,
  maquinas,
  localidades,
  obras,
  centrosCusto,
  salvando,
  onSalvar,
}: {
  /** null = fechado. */
  pedido: PedidoQuadro | null;
  onFechar: () => void;
  /** Computador: folha lateral; celular: folha de baixo. */
  telaLarga: boolean;
  pessoas: readonly PessoaMapa[];
  maquinas: readonly EquipamentoMapa[];
  localidades: readonly LocalidadeMapa[];
  obras: readonly ObraMapa[];
  centrosCusto: readonly CentroCustoOpcaoMapa[];
  salvando: boolean;
  onSalvar: (itens: ItemAlocacao[]) => Promise<boolean>;
}) {
  return (
    <Sheet open={pedido !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <SheetContent
        side={telaLarga ? "right" : "bottom"}
        className={
          telaLarga
            ? "w-full gap-2 sm:max-w-4xl"
            : "h-[88dvh] gap-2"
        }
      >
        {pedido ? (
          <Conteudo
            key={JSON.stringify(pedido)}
            pedido={pedido}
            pessoas={pessoas}
            maquinas={maquinas}
            localidades={localidades}
            obras={obras}
            centrosCusto={centrosCusto}
            salvando={salvando}
            onSalvar={onSalvar}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Conteudo({
  pedido,
  pessoas,
  maquinas,
  localidades,
  obras,
  centrosCusto,
  salvando,
  onSalvar,
}: {
  pedido: PedidoQuadro;
  pessoas: readonly PessoaMapa[];
  maquinas: readonly EquipamentoMapa[];
  localidades: readonly LocalidadeMapa[];
  obras: readonly ObraMapa[];
  centrosCusto: readonly CentroCustoOpcaoMapa[];
  salvando: boolean;
  onSalvar: (itens: ItemAlocacao[]) => Promise<boolean>;
}) {
  const [aba, setAba] = React.useState<"pessoas" | "maquinas">("pessoas");
  const [obraId, setObraId] = React.useState(TODAS);
  const [soSem, setSoSem] = React.useState(pedido.soSemAlocacao ?? false);
  const [pendentes, setPendentes] = React.useState<Map<string, ItemAlocacao>>(
    () => new Map(),
  );
  const [selPessoas, setSelPessoas] = React.useState<Set<string>>(
    () => new Set(pedido.idsPessoas ?? []),
  );
  const [selMaquinas, setSelMaquinas] = React.useState<Set<string>>(
    () => new Set(),
  );

  const somente = React.useMemo(
    () => (pedido.idsPessoas ? new Set(pedido.idsPessoas) : null),
    [pedido.idsPessoas],
  );
  const nomeDe = React.useMemo(
    () => new Map(pessoas.map((p) => [p.id, p.nome])),
    [pessoas],
  );

  const juntar = (itens: readonly (ItemAlocacao | null)[]) =>
    setPendentes((antes) => {
      const novo = new Map(antes);
      for (const item of itens) {
        if (!item) continue;
        const atual = novo.get(item.colaboradorId);
        novo.set(item.colaboradorId, { ...atual, ...item });
      }
      return novo;
    });

  // ---- Pessoas
  const linhasPessoas = React.useMemo(
    () =>
      [...pessoas]
        .filter((p) => !somente || somente.has(p.id))
        .filter((p) => obraId === TODAS || p.obraId === obraId)
        .filter((p) => !soSem || semAlocacao(p))
        .sort(porNome)
        .map((p) => pessoaComPendente(p, pendentes.get(p.id))),
    [pessoas, somente, obraId, soSem, pendentes],
  );
  const opcoesMaquina = React.useMemo(
    () => [
      { valor: NENHUM, rotulo: "Nenhuma" },
      ...[...maquinas]
        .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR"))
        .map((m) => ({
          valor: m.id,
          rotulo: [m.codigo, m.descricao, m.operadorNome && `com ${m.operadorNome}`]
            .filter(Boolean)
            .join(" · "),
        })),
    ],
    [maquinas],
  );
  const opcoesLugar = React.useMemo(
    () => [
      { valor: NENHUM, rotulo: "Sem local" },
      ...[...obras].sort(porNome).map((o) => ({ valor: `obra:${o.id}`, rotulo: `Obra · ${o.nome}` })),
      ...[...localidades].sort(porNome).map((l) => ({ valor: `local:${l.id}`, rotulo: l.nome })),
    ],
    [obras, localidades],
  );
  const opcoesCentro = React.useMemo(
    () => [
      { valor: NENHUM, rotulo: "Segue a obra" },
      ...[...centrosCusto].sort(porNome).map((c) => ({ valor: c.id, rotulo: c.nome })),
    ],
    [centrosCusto],
  );
  const rotuloDe = (opcoes: { valor: string; rotulo: string }[], valor: string) =>
    opcoes.find((o) => o.valor === valor)?.rotulo ?? "–";
  const lugarTexto = (p: PessoaMapa) =>
    p.localidadeId ? `local:${p.localidadeId}` : p.obraMapaId ? `obra:${p.obraMapaId}` : NENHUM;

  const colunasPessoas: ColunaGrade<PessoaMapa>[] = [
    { id: "nome", titulo: "Pessoa", largura: 200, exibir: (p) => p.nome },
    { id: "funcao", titulo: "Função", largura: 150, exibir: (p) => p.funcao || "–" },
    {
      id: "maquina",
      titulo: "Máquina",
      largura: 170,
      exibir: (p) =>
        p.equipamentoId
          ? (maquinas.find((m) => m.id === p.equipamentoId)?.codigo ?? "–")
          : "–",
      editar: { texto: (p) => p.equipamentoId ?? NENHUM, opcoes: opcoesMaquina },
    },
    {
      id: "lugar",
      titulo: "Local / obra",
      largura: 190,
      // Quem opera trabalha onde a máquina está; um local escolhido mesmo assim aparece.
      exibir: (p) =>
        p.equipamentoId && !p.localidadeId
          ? `Acompanha ${maquinas.find((m) => m.id === p.equipamentoId)?.codigo ?? "a máquina"}`
          : rotuloDe(opcoesLugar, lugarTexto(p)),
      editar: { texto: lugarTexto, opcoes: opcoesLugar },
    },
    {
      id: "centro",
      titulo: "Centro de custo",
      largura: 200,
      exibir: (p) => rotuloDe(opcoesCentro, p.centroCustoId ?? NENHUM),
      editar: { texto: (p) => p.centroCustoId ?? NENHUM, opcoes: opcoesCentro },
    },
  ];

  const editarPessoas = (mudancas: MudancaCelula[]) =>
    juntar(
      mudancas.map((m) =>
        m.idColuna === "maquina" || m.idColuna === "lugar" || m.idColuna === "centro"
          ? edicaoDaCelula(m.idLinha, m.idColuna, m.texto)
          : null,
      ),
    );

  // ---- Máquinas
  const linhasMaquinas = React.useMemo(
    () =>
      [...maquinas]
        .filter((m) => obraId === TODAS || m.obraId === obraId)
        .filter((m) => !soSem || operadorComPendente(m, pendentes) === null)
        .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR")),
    [maquinas, obraId, soSem, pendentes],
  );
  const opcoesOperador = React.useMemo(
    () => [
      { valor: NENHUM, rotulo: "Sem operador" },
      ...[...pessoas]
        .sort(porNome)
        .map((p) => ({ valor: p.id, rotulo: p.funcao ? `${p.nome} · ${p.funcao}` : p.nome })),
    ],
    [pessoas],
  );
  const colunasMaquinas: ColunaGrade<EquipamentoMapa>[] = [
    { id: "codigo", titulo: "Máquina", largura: 110, mono: true, exibir: (m) => m.codigo },
    { id: "descricao", titulo: "Descrição", largura: 170, exibir: (m) => m.descricao || "–" },
    {
      id: "operador",
      titulo: "Operador",
      largura: 200,
      exibir: (m) => {
        const id = operadorComPendente(m, pendentes);
        return id ? (nomeDe.get(id) ?? "–") : "–";
      },
      editar: {
        texto: (m) => operadorComPendente(m, pendentes) ?? NENHUM,
        opcoes: opcoesOperador,
      },
    },
    {
      id: "local",
      titulo: "Local",
      largura: 180,
      exibir: (m) =>
        [m.localidadeNome, m.obraNome].filter(Boolean).join(" · ") || "–",
    },
    {
      id: "centro",
      titulo: "Centro de custo",
      largura: 150,
      exibir: (m) => (m.obraNome ? "Segue a obra" : "–"),
    },
  ];
  const editarMaquinas = (mudancas: MudancaCelula[]) =>
    juntar(
      mudancas.flatMap((m): ItemAlocacao[] => {
        if (m.idColuna !== "operador") return [];
        const maquina = maquinas.find((x) => x.id === m.idLinha);
        if (!maquina) return [];
        if (m.texto === NENHUM) {
          const atual = operadorComPendente(maquina, pendentes);
          return atual ? [{ colaboradorId: atual, equipamentoId: null }] : [];
        }
        return [{ colaboradorId: m.texto, equipamentoId: maquina.id }];
      }),
    );

  const lote = montarLote([...pendentes.values()]);
  const salvar = async () => {
    const repetida = maquinaRepetida(lote);
    if (repetida) {
      const codigo = maquinas.find((m) => m.id === repetida)?.codigo ?? "Uma máquina";
      toast.error(`${codigo} ficou com duas pessoas: um operador por máquina.`);
      return;
    }
    if (await onSalvar(lote)) setPendentes(new Map());
  };

  const opcoesObra = [
    { valor: TODAS, rotulo: "Todas as obras" },
    ...[...obras].sort(porNome).map((o) => ({ valor: o.id, rotulo: o.nome })),
  ];

  return (
    <>
      <SheetHeader className="pb-0">
        <SheetTitle>Alocação</SheetTitle>
        <SheetDescription>
          Edite com o teclado (Enter, setas, Tab) ou toque na célula. Com várias
          linhas selecionadas, a edição vale para todas. Nada grava até Salvar.
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-wrap items-center gap-2 px-4">
        <Tabs value={aba} onValueChange={(v) => setAba(v as "pessoas" | "maquinas")}>
          <TabsList>
            <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
            <TabsTrigger value="maquinas">Máquinas</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="w-56">
          <Combobox
            valor={obraId}
            onValorChange={(v) => setObraId(v || TODAS)}
            opcoes={opcoesObra}
            size="sm"
            ariaLabel="Filtrar por obra"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant={soSem ? "default" : "outline"}
          aria-pressed={soSem}
          onClick={() => setSoSem((v) => !v)}
        >
          {aba === "pessoas" ? "Sem alocação" : "Sem operador"}
        </Button>
        {somente ? (
          <span className="text-legenda text-muted-foreground">
            {somente.size} da seleção
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-4">
        {aba === "pessoas" ? (
          <GradeEdicao
            rotulo="Alocação das pessoas"
            linhas={linhasPessoas}
            colunas={colunasPessoas}
            idDaLinha={(p) => p.id}
            onEditar={editarPessoas}
            selecionadas={selPessoas}
            onSelecionadasChange={setSelPessoas}
            classeDaLinha={(p) => (pendentes.has(p.id) ? "bg-accent/60" : undefined)}
            alturaInicial={480}
          />
        ) : (
          <GradeEdicao
            rotulo="Alocação das máquinas"
            linhas={linhasMaquinas}
            colunas={colunasMaquinas}
            idDaLinha={(m) => m.id}
            onEditar={editarMaquinas}
            selecionadas={selMaquinas}
            onSelecionadasChange={setSelMaquinas}
            alturaInicial={480}
          />
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
        <span className="mr-auto text-detalhe text-muted-foreground">
          {lote.length === 0
            ? "Nenhuma alteração"
            : lote.length === 1
              ? "1 pessoa alterada"
              : `${lote.length} pessoas alteradas`}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={salvando || lote.length === 0}
          onClick={() => setPendentes(new Map())}
        >
          Descartar
        </Button>
        <Button
          type="button"
          disabled={salvando || lote.length === 0}
          onClick={() => void salvar()}
        >
          Salvar alocação
        </Button>
      </div>
    </>
  );
}
