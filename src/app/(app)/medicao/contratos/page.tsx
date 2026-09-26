import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ContratosTabela } from "@/modules/medicao/contratos/components/contratos-tabela";
import { NovoContratoBotao } from "@/modules/medicao/contratos/components/novo-contrato-botao";
import { listarContratos } from "@/modules/medicao/contratos/queries";
import { STATUS_CONTRATO, TIPOS_CONTRATANTE } from "@/modules/medicao/_shared/rotulos";

const RECURSO = "medicao.contratos" as const;

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

export default async function PaginaContratos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");

  const params = await searchParams;
  const statusParam = primeiro(params.status);
  const tipoParam = primeiro(params.tipo);
  const status = (STATUS_CONTRATO as readonly string[]).includes(statusParam) ? statusParam : "";
  const tipo = (TIPOS_CONTRATANTE as readonly string[]).includes(tipoParam) ? tipoParam : "";
  const lixeira = podeExcluir && primeiro(params.lixeira) === "1";

  const contratos = await listarContratos({
    status: status || undefined,
    tipo: tipo || undefined,
    lixeira,
  });

  return (
    <>
      <PageHeader
        modulo="Medição"
        titulo="Contratos"
        descricao="Contratos medidos pelo módulo. Você só vê os contratos em que está na lista de acesso"
        acoes={podeCriar ? <NovoContratoBotao /> : undefined}
      />
      <ContratosTabela
        contratos={contratos}
        status={status}
        tipo={tipo}
        lixeira={lixeira}
        podeCriar={podeCriar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
