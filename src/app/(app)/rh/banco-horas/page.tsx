import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { BancoHorasAcoesCabecalho } from "@/modules/rh/banco-horas/components/acoes-cabecalho";
import { MovimentosTabela } from "@/modules/rh/banco-horas/components/movimentos-tabela";
import { SaldosPainel } from "@/modules/rh/banco-horas/components/saldos-painel";
import {
  listarMovimentos,
  resumoSaldos,
} from "@/modules/rh/banco-horas/queries";
import { listarColaboradores } from "@/modules/rh/_shared/queries";

export default async function PaginaBancoHoras() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.banco-horas", "ver")) {
    notFound();
  }

  const [movimentos, saldos, colaboradores] = await Promise.all([
    listarMovimentos(),
    resumoSaldos(),
    listarColaboradores(),
  ]);

  const podeCriar = temPermissao(usuario, "rh.banco-horas", "criar");
  const podeEditar = temPermissao(usuario, "rh.banco-horas", "editar");

  return (
    <>
      <PageHeader
        titulo="Banco de horas"
        descricao="Créditos e débitos de horas por colaborador, com saldo acumulado"
        acoes={
          podeCriar ? (
            <BancoHorasAcoesCabecalho colaboradores={colaboradores} />
          ) : undefined
        }
      />

      <p className="mb-4 rounded-lg border border-dashed border-border bg-surface/50 px-4 py-3 text-detalhe text-muted-foreground">
        O banco de horas é opcional: use-o apenas para colaboradores que adotam
        compensação de jornada. Crédito soma e débito subtrai do saldo.
      </p>

      <section className="mb-6">
        <h2 className="mb-2 text-corpo font-medium">Saldos por colaborador</h2>
        <SaldosPainel saldos={saldos} />
      </section>

      <section>
        <h2 className="mb-2 text-corpo font-medium">Movimentos</h2>
        <MovimentosTabela
          movimentos={movimentos}
          colaboradores={colaboradores}
          podeCriar={podeCriar}
          podeEditar={podeEditar}
        />
      </section>
    </>
  );
}
