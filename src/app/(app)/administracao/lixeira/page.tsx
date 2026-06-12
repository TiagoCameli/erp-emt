import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { LixeiraTabela } from "@/modules/administracao/lixeira/components/lixeira-tabela";
import { listarLixeira } from "@/modules/administracao/lixeira/queries";

const TAMANHO_PADRAO = 25;
const TAMANHO_MAXIMO = 100;

interface LixeiraPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function inteiroDe(
  valor: string | string[] | undefined,
  padrao: number,
): number {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  const numero = Number(texto);
  return Number.isInteger(numero) && numero > 0 ? numero : padrao;
}

export default async function LixeiraPage({ searchParams }: LixeiraPageProps) {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "administracao.lixeira", "ver")) {
    notFound();
  }

  const params = await searchParams;
  const pagina = inteiroDe(params.pagina, 1) - 1;
  const tamanho = Math.min(
    inteiroDe(params.tamanho, TAMANHO_PADRAO),
    TAMANHO_MAXIMO,
  );
  const mostrarRestaurados = params.restaurados === "1";

  const { itens, total } = await listarLixeira({
    pagina,
    tamanho,
    somenteAtivos: !mostrarRestaurados,
  });

  return (
    <div>
      <PageHeader
        titulo="Lixeira"
        descricao="Registros excluídos com motivo, restauráveis por permissão"
      />
      <LixeiraTabela
        itens={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        mostrarRestaurados={mostrarRestaurados}
        podeEditar={temPermissao(usuario, "administracao.lixeira", "editar")}
      />
    </div>
  );
}
