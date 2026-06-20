import { notFound } from "next/navigation";

import { KPICard, PageHeader } from "@/components/canonicos";
import { formatarQuantidade } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { AlertasAcoesCabecalho } from "@/modules/estoque/alertas/components/alertas-acoes-cabecalho";
import { AlertasTabela } from "@/modules/estoque/alertas/components/alertas-tabela";
import { listarMinimos } from "@/modules/estoque/alertas/queries";
import {
  listarDepositos,
  listarInsumos,
} from "@/modules/estoque/_shared/queries";

export default async function PaginaAlertas() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "estoque.alertas", "ver")) {
    notFound();
  }

  const podeEditar = temPermissao(usuario, "estoque.alertas", "editar");

  const [minimos, insumos, depositos] = await Promise.all([
    listarMinimos(),
    listarInsumos(),
    listarDepositos(),
  ]);

  const abaixo = minimos.filter((m) => m.abaixo);

  return (
    <>
      <PageHeader
        titulo="Alertas"
        descricao="Estoque mínimo por insumo e depósito. Itens abaixo do mínimo ficam em destaque."
        acoes={
          podeEditar ? (
            <AlertasAcoesCabecalho insumos={insumos} depositos={depositos} />
          ) : undefined
        }
      />

      {abaixo.length > 0 ? (
        <KPICard
          titulo="Itens abaixo do mínimo"
          valor={abaixo.length}
          detalhe={abaixo
            .slice(0, 3)
            .map(
              (item) =>
                `${item.insumoNome} (${item.depositoNome}): ${formatarQuantidade(
                  item.saldoAtual,
                )} de ${formatarQuantidade(item.minimo)}${
                  item.unidadeSigla ? ` ${item.unidadeSigla}` : ""
                }`,
            )
            .join(" · ")}
          className="max-w-xl"
        />
      ) : (
        <KPICard
          titulo="Estoque mínimo"
          valor="Tudo dentro do mínimo"
          detalhe={
            minimos.length > 0
              ? `${minimos.length} ${minimos.length === 1 ? "mínimo definido" : "mínimos definidos"}`
              : "Nenhum mínimo definido ainda"
          }
          className="max-w-xl"
        />
      )}

      <AlertasTabela
        minimos={minimos}
        podeEditar={podeEditar}
        insumos={insumos}
        depositos={depositos}
      />
    </>
  );
}
