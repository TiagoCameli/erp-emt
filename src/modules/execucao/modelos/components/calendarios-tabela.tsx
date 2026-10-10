"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarDays, Pencil, Plus } from "lucide-react";

import { DataTable, EmptyState, SecaoDetalhe, StatusBadge } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatarQuantidade } from "@/lib/formatadores";
import { CalendarioDrawer } from "@/modules/execucao/modelos/components/calendario-drawer";
import type { Calendario, Excecao } from "@/modules/execucao/modelos/queries";

const DIAS = [
  { rotulo: "seg", campo: "horasSeg" },
  { rotulo: "ter", campo: "horasTer" },
  { rotulo: "qua", campo: "horasQua" },
  { rotulo: "qui", campo: "horasQui" },
  { rotulo: "sex", campo: "horasSex" },
  { rotulo: "sáb", campo: "horasSab" },
  { rotulo: "dom", campo: "horasDom" },
] as const;

/** "seg a sex 9 h, sáb 5 h": dias seguidos com as mesmas horas viram uma faixa; dia sem horas não aparece. */
export function resumoDeHoras(c: Calendario): string {
  const partes: string[] = [];
  let i = 0;
  while (i < DIAS.length) {
    const h = Number(c[DIAS[i].campo]);
    let j = i;
    while (j + 1 < DIAS.length && Number(c[DIAS[j + 1].campo]) === h) j++;
    if (h > 0) {
      const dias = j > i ? `${DIAS[i].rotulo} a ${DIAS[j].rotulo}` : DIAS[i].rotulo;
      partes.push(`${dias} ${formatarQuantidade(h)} h`);
    }
    i = j + 1;
  }
  return partes.join(", ");
}

/** "Nacionais e AC", "Nacionais, AC e municipais (Rio Branco)". */
export function resumoDeFeriados(c: Calendario): string {
  const nomes = c.feriadosAbrangencia.map((a) =>
    a === "nacional" ? "Nacionais" : a === "AC" ? "AC" : `Municipais${c.municipio ? ` (${c.municipio})` : ""}`,
  );
  if (nomes.length === 0) return "Nenhum";
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

const colunas: ColumnDef<Calendario, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    size: 240,
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        {row.original.nome}
        {row.original.padraoEmpresa ? <StatusBadge status="padrao" rotulo="Padrão da empresa" discreto /> : null}
      </span>
    ),
  },
  { id: "horas", header: "Horas da semana", size: 260, cell: ({ row }) => resumoDeHoras(row.original) },
  { id: "feriados", header: "Feriados", size: 220, cell: ({ row }) => resumoDeFeriados(row.original) },
];

export interface CalendariosTabelaProps {
  calendarios: Calendario[];
  /** Exceções por calendário (o drawer mostra as do calendário aberto). */
  excecoesPorCalendario: Record<string, Excecao[]>;
  podeCriar: boolean;
  podeEditar: boolean;
}

export function CalendariosTabela({ calendarios, excecoesPorCalendario, podeCriar, podeEditar }: CalendariosTabelaProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<Calendario | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setAberto(true);
  }

  const botaoNovo = podeCriar ? (
    <Button type="button" size="sm" variant="outline" onClick={abrirNovo}>
      <Plus />
      Novo calendário
    </Button>
  ) : undefined;

  return (
    <SecaoDetalhe titulo="Calendários" acao={botaoNovo}>
      <p className="mb-3 text-detalhe text-muted-foreground">
        Cada cronograma tem o próprio calendário, criado a partir de um destes. Mudar um modelo recalcula as datas de todos os cronogramas que vêm dele.
      </p>
      <DataTable<Calendario>
        columns={colunas}
        data={calendarios}
        idDaLinha={(c) => c.id}
        acoesLinha={
          podeEditar
            ? (c) => (
                <DropdownMenuItem
                  onSelect={() => {
                    setEmEdicao(c);
                    setAberto(true);
                  }}
                >
                  <Pencil />
                  Editar
                </DropdownMenuItem>
              )
            : undefined
        }
        emptyState={
          <EmptyState
            icone={CalendarDays}
            titulo="Nenhum calendário modelo"
            descricao="Cadastre os calendários que os cronogramas vão usar como ponto de partida"
            acao={botaoNovo}
            className="border-none bg-transparent"
          />
        }
      />
      <CalendarioDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        calendario={emEdicao}
        excecoes={emEdicao ? (excecoesPorCalendario[emEdicao.id] ?? []) : []}
        onSalvo={() => semDerrubarSucesso("execucao.modelos.calendario.refresh", () => router.refresh())}
      />
    </SecaoDetalhe>
  );
}
