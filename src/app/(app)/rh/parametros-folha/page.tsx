import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FaixasInssSecao } from "@/modules/rh/parametros-folha/components/faixas-inss-secao";
import { FaixasIrrfSecao } from "@/modules/rh/parametros-folha/components/faixas-irrf-secao";
import { ParametrosForm } from "@/modules/rh/parametros-folha/components/parametros-form";
import {
  buscarParametros,
  listarFaixasInss,
  listarFaixasIrrf,
} from "@/modules/rh/parametros-folha/queries";

export default async function PaginaParametrosFolha() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.parametros-folha", "ver")) {
    notFound();
  }

  const [faixasInss, faixasIrrf, parametros] = await Promise.all([
    listarFaixasInss(),
    listarFaixasIrrf(),
    buscarParametros(),
  ]);

  const podeCriar = temPermissao(usuario, "rh.parametros-folha", "criar");
  const podeEditar = temPermissao(usuario, "rh.parametros-folha", "editar");
  const podeExcluir = temPermissao(usuario, "rh.parametros-folha", "excluir");

  return (
    <>
      <PageHeader
        modulo="RH"
        titulo="Parâmetros da folha"
        descricao="Faixas de INSS e IRRF e os parâmetros usados no cálculo da folha de pagamento"
      />

      <div className="flex flex-col gap-8">
        {/* INSS e IRRF lado a lado: são tabelas de 2 e 3 colunas estreitas, e
            empilhadas deixavam meia tela vazia à direita e empurravam os
            parâmetros para fora da dobra. */}
        <div className="grid gap-8 lg:grid-cols-2 [&>*]:min-w-0">
          <FaixasInssSecao
            faixas={faixasInss}
            podeCriar={podeCriar}
            podeEditar={podeEditar}
            podeExcluir={podeExcluir}
          />

          <FaixasIrrfSecao
            faixas={faixasIrrf}
            podeCriar={podeCriar}
            podeEditar={podeEditar}
            podeExcluir={podeExcluir}
          />
        </div>

        <ParametrosForm parametros={parametros} podeEditar={podeEditar} />
      </div>
    </>
  );
}
