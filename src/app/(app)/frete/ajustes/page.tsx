import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { AjustesTabela } from "@/modules/frete/ajustes/components/ajustes-tabela";
import { NovoAjusteBotao } from "@/modules/frete/ajustes/components/novo-ajuste-botao";
import { lerFiltrosAjustes } from "@/modules/frete/ajustes/filtros";
import { listarAjustes, listarObrasAjuste, listarTransportadorasAjuste } from "@/modules/frete/ajustes/queries";

const RECURSO = "frete.ajustes" as const;

export default async function PaginaAjustesFrete({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();

  const filtros = lerFiltrosAjustes(await searchParams);
  const podeCriar = temPermissao(usuario, RECURSO, "criar");

  const [ajustes, transportadoras, obras] = await Promise.all([
    listarAjustes(filtros),
    listarTransportadorasAjuste(),
    podeCriar ? listarObrasAjuste() : Promise.resolve<CentroCustoOpcao[]>([]),
  ]);

  return (
    <>
      <PageHeader
        modulo="Frete"
        titulo="Ajustes de saldo"
        descricao="Crédito ou débito manual na conta corrente da transportadora. Só o aprovado entra no saldo"
        acoes={
          podeCriar ? (
            <NovoAjusteBotao transportadoras={transportadoras} obras={obras.map((o) => ({ id: o.id, nome: o.nome }))} />
          ) : undefined
        }
      />
      <AjustesTabela
        ajustes={ajustes}
        transportadoras={transportadoras.map((t) => ({ id: t.id, nome: t.ativo ? t.nome : `${t.nome} (inativo)` }))}
        transportadoraId={filtros.transportadoraId ?? ""}
        status={filtros.status ?? ""}
        sinal={filtros.sinal ?? ""}
        de={filtros.de ?? ""}
        ate={filtros.ate ?? ""}
      />
    </>
  );
}
