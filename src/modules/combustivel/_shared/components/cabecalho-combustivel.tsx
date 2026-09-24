"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Truck, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { modoDaUrl, type Modo } from "@/modules/combustivel/anomalias/base";
import {
  abaAtiva,
  hrefComRecorte,
  hrefNovo,
  type GrupoAbas,
} from "@/modules/combustivel/_shared/navegacao";

const MODOS: { id: Modo; rotulo: string; Icone: typeof Wrench }[] = [
  { id: "proprios", rotulo: "Equipamentos Próprios", Icone: Wrench },
  { id: "carretas", rotulo: "Carretas Terceirizadas", Icone: Truck },
];

export interface CabecalhoCombustivelProps {
  /** Só os grupos e as abas que o usuário pode ver (o layout já filtrou). */
  grupos: GrupoAbas[];
  podeNovaEntrada: boolean;
  podeNovaSaida: boolean;
  podeNovaTransferencia: boolean;
}

/**
 * O topo da tela da origem (pages/Combustivel + ModeSwitch + CombustivelTabsNav), comum a
 * todas as abas: título, os três botões de lançamento, o modo de consumidor e as abas.
 */
export function CabecalhoCombustivel({
  grupos,
  podeNovaEntrada,
  podeNovaSaida,
  podeNovaTransferencia,
}: CabecalhoCombustivelProps) {
  const caminho = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const atual = new URLSearchParams(params.toString());
  const modo = modoDaUrl(params.get("modo") ?? undefined);
  const ativa = abaAtiva(
    caminho,
    grupos.flatMap((g) => g.abas.map((a) => a.rota)),
  );

  /** Trocar de modo limpa o que só existe no outro (como o setMode da origem). */
  function trocarModo(novo: Modo) {
    if (novo === modo) return;
    const proximo = new URLSearchParams(params.toString());
    for (const chave of ["equipamento", "transportadora", "placa", "pagina"]) proximo.delete(chave);
    if (novo === "proprios") proximo.delete("modo");
    else proximo.set("modo", novo);
    const query = proximo.toString();
    router.replace(query ? `${caminho}?${query}` : caminho, { scroll: false });
  }

  const botoes = [
    podeNovaEntrada ? { rotulo: "Nova Entrada", rota: "/combustivel/entradas" } : null,
    podeNovaSaida ? { rotulo: "Nova Saída", rota: "/combustivel/abastecimentos" } : null,
    podeNovaTransferencia ? { rotulo: "Nova Transferência", rota: "/combustivel/transferencias" } : null,
  ].filter((b) => b !== null);

  return (
    <div className="mb-4 flex flex-col gap-4">
      <h1 className="text-titulo font-semibold tracking-tight">Combustível</h1>

      {botoes.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {botoes.map((botao) => (
            <Button key={botao.rota} asChild>
              <Link href={hrefNovo(botao.rota, atual)} scroll={false}>
                <Plus />
                {botao.rotulo}
              </Link>
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="px-1 text-legenda font-semibold uppercase tracking-wide text-muted-foreground">
          Modo de consumidor
        </span>
        <div
          role="tablist"
          aria-label="Modo de consumidor de combustível"
          className="inline-flex w-full items-stretch self-start rounded-lg border border-border bg-surface p-1 sm:w-auto"
        >
          {MODOS.map(({ id, rotulo, Icone }) => {
            const selecionado = modo === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selecionado}
                onClick={() => trocarModo(id)}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition-colors sm:flex-none",
                  selecionado
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icone className="size-4" aria-hidden />
                {rotulo}
              </button>
            );
          })}
        </div>
      </div>

      <nav aria-label="Abas do Combustível" className="-mx-1 overflow-x-auto border-b border-border pb-2">
        <div className="flex min-w-max items-end gap-1 px-1">
          {grupos.map((grupo, indice) => (
            <div
              key={grupo.rotulo ?? `grupo-${indice}`}
              className={cn("flex flex-col gap-1", indice > 0 && "border-l border-border pl-2")}
            >
              <span
                className={cn(
                  "h-4 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
                  !grupo.rotulo && "invisible",
                )}
                aria-hidden={!grupo.rotulo}
              >
                {grupo.rotulo ?? "-"}
              </span>
              <div className="flex gap-1">
                {grupo.abas.map((aba) => {
                  const selecionada = ativa === aba.rota;
                  return (
                    <Link
                      key={aba.rota}
                      href={hrefComRecorte(aba.rota, atual)}
                      aria-current={selecionada ? "page" : undefined}
                      className={cn(
                        "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        selecionada
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {aba.rotulo}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
