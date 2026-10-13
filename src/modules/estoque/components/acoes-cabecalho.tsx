"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import type { ItemOcDisponivel } from "@/modules/estoque/queries";
import type { InsumoOpcao, Opcao } from "@/modules/manutencao/almoxarifado/queries";
import { EntradaFormDrawer } from "./entrada-form-drawer";
import { SaidaFormDrawer } from "./saida-form-drawer";

export interface EntradasAcoesCabecalhoProps {
  podeCriar: boolean;
  depositos: Opcao[];
  insumos: InsumoOpcao[];
  itensOc: ItemOcDisponivel[];
}

/** Botão "Registrar entrada" do cabeçalho, com o drawer (avulsa ou de OC). */
export function EntradasAcoesCabecalho({ podeCriar, depositos, insumos, itensOc }: EntradasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);
  if (!podeCriar) return null;
  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Registrar entrada
      </Button>
      <EntradaFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        entrada={null}
        depositos={depositos}
        insumos={insumos}
        itensOc={itensOc}
      />
    </>
  );
}

export interface SaidasAcoesCabecalhoProps {
  podeCriar: boolean;
  depositos: Opcao[];
  materiais: InsumoOpcao[];
  /** Pares depósito × insumo com saldo, já como entradas (o mapa não atravessa a fronteira do servidor). */
  saldos: { chave: string; saldo: number }[];
  centros: CentroCustoOpcao[];
}

/** Botão "Registrar saída" do cabeçalho, com o drawer. */
export function SaidasAcoesCabecalho({ podeCriar, depositos, materiais, saldos, centros }: SaidasAcoesCabecalhoProps) {
  const [aberto, setAberto] = React.useState(false);
  const mapa = React.useMemo(() => new Map(saldos.map((s) => [s.chave, s.saldo])), [saldos]);
  if (!podeCriar) return null;
  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Registrar saída
      </Button>
      <SaidaFormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        saida={null}
        depositos={depositos}
        materiais={materiais}
        saldos={mapa}
        centros={centros}
      />
    </>
  );
}
