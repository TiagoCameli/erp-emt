"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown } from "lucide-react";

import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ROTULO_STATUS_CRONOGRAMA, STATUS_CRONOGRAMA, type StatusCronograma } from "@/modules/execucao/_shared/rotulos";
import { mudarStatus } from "@/modules/execucao/cronogramas/actions";
import { CalendarioDrawer } from "@/modules/execucao/modelos/components/calendario-drawer";
import type { Calendario, Excecao } from "@/modules/execucao/modelos/queries";

/** Botão "Calendário": abre o calendário próprio do cronograma. Salvar recalcula as datas e a página relê. */
export function CalendarioDoCronograma({ calendario, excecoes }: { calendario: Calendario; excecoes: Excecao[] }) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setAberto(true)}>
        <CalendarDays />
        Calendário
      </Button>
      <CalendarioDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        calendario={calendario}
        excecoes={excecoes}
        onSalvo={() => semDerrubarSucesso("execucao.cronogramas.calendario.refresh", () => router.refresh())}
      />
    </>
  );
}

/** Seletor da situação do cronograma (rascunho, ativo, concluído, arquivado). */
export function SituacaoCronograma({ id, status }: { id: string; status: StatusCronograma }) {
  const router = useRouter();
  const [mudando, iniciar] = React.useTransition();

  function mudar(novo: StatusCronograma) {
    if (novo === status) return;
    iniciar(async () => {
      const r = await mudarStatus(id, novo);
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      toast.success(`Cronograma ${ROTULO_STATUS_CRONOGRAMA[novo].toLowerCase()}`);
      semDerrubarSucesso("execucao.cronogramas.status.refresh", () => router.refresh());
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={mudando}>
          Mudar situação
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {STATUS_CRONOGRAMA.map((s) => (
          <DropdownMenuItem key={s} disabled={s === status} onSelect={() => mudar(s)}>
            {ROTULO_STATUS_CRONOGRAMA[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
