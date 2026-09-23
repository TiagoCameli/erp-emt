import Link from "next/link";
import { ArrowDownToLine, Boxes, Package, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Links entre as telas do almoxarifado, nas ações do cabeçalho.
 *
 * Não é barra de abas: a regra do app é que as abas do módulo vivem no submenu
 * da sidebar, e o almoxarifado é UMA aba (`manutencao.almoxarifado`). Entradas,
 * peças e depósitos são sub-rotas dela, e o item da sidebar continua aceso nelas
 * porque a rota começa com `/manutencao/almoxarifado/`.
 */

export type TelaAlmoxarifado = "saldos" | "entradas" | "pecas" | "depositos";

const TELAS: { id: TelaAlmoxarifado; rotulo: string; rota: string; icone: LucideIcon }[] = [
  { id: "saldos", rotulo: "Saldos", rota: "/manutencao/almoxarifado", icone: Boxes },
  { id: "entradas", rotulo: "Entradas", rota: "/manutencao/almoxarifado/entradas", icone: ArrowDownToLine },
  { id: "pecas", rotulo: "Peças", rota: "/manutencao/almoxarifado/pecas", icone: Package },
  { id: "depositos", rotulo: "Depósitos", rota: "/manutencao/almoxarifado/depositos", icone: Warehouse },
];

export function NavegacaoAlmoxarifado({ atual }: { atual: TelaAlmoxarifado }) {
  return (
    <>
      {TELAS.filter((tela) => tela.id !== atual).map((tela) => {
        const Icone = tela.icone;
        return (
          <Button key={tela.id} asChild variant="outline" size="sm">
            <Link href={tela.rota}>
              <Icone />
              {tela.rotulo}
            </Link>
          </Button>
        );
      })}
    </>
  );
}
