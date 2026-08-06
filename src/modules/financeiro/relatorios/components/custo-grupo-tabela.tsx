"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { MoneyText } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarQuantidade } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { CLASSE_COR_GRUPO } from "@/modules/cadastros/_shared/insumo-grupos";
import { insumosDaSubcategoria } from "@/modules/financeiro/relatorios/actions";
import type { CustoPorGrupo } from "@/modules/financeiro/relatorios/queries";

export interface CustoGrupoTabelaProps {
  custo: CustoPorGrupo;
  /** Mês de referência (yyyy-MM), repassado ao carregar o nível de insumo. */
  mes: string;
}

interface LinhaInsumo {
  nome: string;
  quantidade: number;
  valor: number;
}

/**
 * Custo por grupo com drill-down em três níveis: grupo, subcategoria e insumo.
 *
 * Grupo e subcategoria vêm prontos do servidor (são poucas linhas). O nível de
 * insumo é buscado sob demanda ao abrir a subcategoria: é o único que pode ter
 * centenas de linhas, e ninguém abre todas.
 */
export function CustoGrupoTabela({ custo, mes }: CustoGrupoTabelaProps) {
  const [gruposAbertos, setGruposAbertos] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [subsAbertas, setSubsAbertas] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [insumos, setInsumos] = React.useState<Record<string, LinhaInsumo[]>>(
    {},
  );
  const [carregando, setCarregando] = React.useState<string | null>(null);

  function alternarGrupo(chave: string) {
    setGruposAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  async function alternarSub(categoriaId: string) {
    const aberta = subsAbertas.has(categoriaId);
    setSubsAbertas((atual) => {
      const proximo = new Set(atual);
      if (aberta) proximo.delete(categoriaId);
      else proximo.add(categoriaId);
      return proximo;
    });
    if (aberta || insumos[categoriaId]) return;

    setCarregando(categoriaId);
    const resultado = await insumosDaSubcategoria(categoriaId, mes);
    setCarregando(null);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    setInsumos((atual) => ({ ...atual, [categoriaId]: resultado.insumos }));
  }

  const percentual = (valor: number) =>
    custo.total === 0 ? 0 : (valor / custo.total) * 100;

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-detalhe">
        <thead className="bg-surface">
          <tr className="border-b border-border text-legenda text-muted-foreground">
            {/* A ÚNICA coluna do app que continua à esquerda, e é de propósito:
                aqui o recuo (pl-12 na subcategoria, pl-24 no insumo) é o que diz
                de quem a linha é filha. Centralizar centraliza dentro do recuo e
                a hierarquia do drill-down desaparece. As colunas de percentual e
                de dinheiro seguem à direita, como no resto do app. */}
            <th className="px-3 py-2 text-left font-medium">
              Grupo, subcategoria e insumo
            </th>
            <th className="w-28 px-3 py-2 text-right font-medium">% do mês</th>
            <th className="w-40 px-3 py-2 text-right font-medium">Custo</th>
          </tr>
        </thead>
        <tbody>
          {custo.grupos.map((grupo) => {
            const chave = grupo.grupoId ?? "sem-insumo";
            const aberto = gruposAbertos.has(chave);
            return (
              <React.Fragment key={chave}>
                <tr className="border-b border-border">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {grupo.subcategorias.length > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={
                            aberto
                              ? `Fechar ${grupo.nome}`
                              : `Abrir ${grupo.nome}`
                          }
                          onClick={() => alternarGrupo(chave)}
                        >
                          {aberto ? <ChevronDown /> : <ChevronRight />}
                        </Button>
                      ) : (
                        <span className="inline-block w-8" />
                      )}
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-legenda font-medium",
                          CLASSE_COR_GRUPO[grupo.cor],
                        )}
                      >
                        {grupo.nome}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {percentual(grupo.valor).toLocaleString("pt-BR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                    %
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText valor={grupo.valor} className="font-medium" />
                  </td>
                </tr>

                {aberto
                  ? grupo.subcategorias.map((sub) => {
                      const subAberta = subsAbertas.has(sub.categoriaId);
                      const linhas = insumos[sub.categoriaId] ?? [];
                      return (
                        <React.Fragment key={sub.categoriaId}>
                          <tr className="border-b border-border bg-surface/40">
                            <td className="px-3 py-1.5 pl-12">
                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={
                                    subAberta
                                      ? `Fechar ${sub.nome}`
                                      : `Abrir ${sub.nome}`
                                  }
                                  onClick={() =>
                                    void alternarSub(sub.categoriaId)
                                  }
                                >
                                  {carregando === sub.categoriaId ? (
                                    <LoaderCircle className="animate-spin" />
                                  ) : subAberta ? (
                                    <ChevronDown />
                                  ) : (
                                    <ChevronRight />
                                  )}
                                </Button>
                                {sub.nome}
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                              {percentual(sub.valor).toLocaleString("pt-BR", {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })}
                              %
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <MoneyText valor={sub.valor} />
                            </td>
                          </tr>

                          {subAberta
                            ? linhas.map((insumo) => (
                                <tr
                                  key={insumo.nome}
                                  className="border-b border-border"
                                >
                                  <td className="px-3 py-1.5 pl-24 text-muted-foreground">
                                    {insumo.nome}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                    {formatarQuantidade(insumo.quantidade)}
                                  </td>
                                  <td className="px-3 py-1.5 text-right">
                                    <MoneyText valor={insumo.valor} />
                                  </td>
                                </tr>
                              ))
                            : null}
                        </React.Fragment>
                      );
                    })
                  : null}
              </React.Fragment>
            );
          })}

          <tr className="bg-surface font-medium">
            <td className="px-3 py-2">Total do mês</td>
            <td className="px-3 py-2 text-right tabular-nums">100,0%</td>
            <td className="px-3 py-2 text-right">
              <MoneyText valor={custo.total} className="font-semibold" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
