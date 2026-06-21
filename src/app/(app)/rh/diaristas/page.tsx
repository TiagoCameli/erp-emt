import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { AcoesCabecalho } from "@/modules/rh/diaristas/components/acoes-cabecalho";
import { DiariasTabela } from "@/modules/rh/diaristas/components/diarias-tabela";
import { FechamentosPainel } from "@/modules/rh/diaristas/components/fechamentos-painel";
import {
  listarDiarias,
  listarFechamentosPendentes,
} from "@/modules/rh/diaristas/queries";
import { listarDiaristas, listarObras } from "@/modules/rh/_shared/queries";

export default async function PaginaDiaristas() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.diaristas", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "rh.diaristas", "criar");
  const podeEditar = temPermissao(usuario, "rh.diaristas", "editar");

  const [diarias, fechamentos, diaristas, obras] = await Promise.all([
    listarDiarias(),
    listarFechamentosPendentes(),
    listarDiaristas(),
    listarObras(),
  ]);

  return (
    <>
      <PageHeader
        titulo="Diaristas"
        descricao="Diárias por diarista. O fechamento da competência gera um lançamento a pagar no financeiro"
        acoes={
          podeCriar ? (
            <AcoesCabecalho diaristas={diaristas} obras={obras} />
          ) : undefined
        }
      />

      {podeCriar ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-secao font-semibold">A fechar</h2>
          <FechamentosPainel fechamentos={fechamentos} />
        </section>
      ) : null}

      <DiariasTabela
        diarias={diarias}
        diaristas={diaristas}
        obras={obras}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
      />
    </>
  );
}
