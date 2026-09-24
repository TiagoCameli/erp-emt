import { notFound } from "next/navigation";

import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { AjusteDetalheView } from "@/modules/frete/ajustes/components/ajuste-detalhe";
import {
  buscarAjuste,
  listarObrasAjuste,
  listarTransportadorasAjuste,
  trilhaAjuste,
  type OpcaoTransportadora,
} from "@/modules/frete/ajustes/queries";
import { acoesDoAjuste } from "@/modules/frete/ajustes/regras";

const RECURSO = "frete.ajustes" as const;

export default async function PaginaAjusteFrete({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();

  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const ajuste = await buscarAjuste(id);
  if (!ajuste) notFound();

  const permissoes = {
    criar: temPermissao(usuario, RECURSO, "criar"),
    aprovar: temPermissao(usuario, RECURSO, "aprovar"),
    desaprovar: temPermissao(usuario, RECURSO, "desaprovar"),
  };
  const podeEditar = acoesDoAjuste(ajuste.status, permissoes).editar;

  const [trilha, transportadoras, obras] = await Promise.all([
    trilhaAjuste(ajuste),
    podeEditar ? listarTransportadorasAjuste() : Promise.resolve<OpcaoTransportadora[]>([]),
    podeEditar ? listarObrasAjuste() : Promise.resolve<CentroCustoOpcao[]>([]),
  ]);

  return (
    <AjusteDetalheView
      ajuste={ajuste}
      permissoes={permissoes}
      trilha={trilha}
      transportadoras={transportadoras}
      obras={obras.map((o) => ({ id: o.id, nome: o.nome }))}
    />
  );
}
