import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { PontoDetalheView } from "@/modules/rh/apontamentos/components/ponto-detalhe";
import {
  buscarPonto,
  listarColaboradoresComJornada,
} from "@/modules/rh/apontamentos/queries";

/**
 * Aprovar o ponto roda na função desta página e trava os apontamentos do dia
 * inteiro. Teto padrão da Vercel é 10 a 15s, e invocação morta não devolve nem
 * `{ erro }`. Mesma razão do `maxDuration` de /rh/folha/[id].
 */
export const maxDuration = 60;

export default async function PaginaPontoDetalhe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.apontamentos", "ver")) {
    notFound();
  }

  const { id } = await params;
  const ponto = await buscarPonto(id);
  if (!ponto) notFound();

  const colaboradores = await listarColaboradoresComJornada(ponto.data);

  const podeEditar = temPermissao(usuario, "rh.apontamentos", "editar");
  const podeAprovar = temPermissao(usuario, "rh.apontamentos", "aprovar");

  return (
    <PontoDetalheView
      ponto={ponto}
      colaboradores={colaboradores}
      podeEditar={podeEditar}
      podeAprovar={podeAprovar}
    />
  );
}
