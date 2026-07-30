import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { LixeiraTabela } from "@/modules/administracao/lixeira/components/lixeira-tabela";
import {
  listarLixeira,
  listarTabelasLixeira,
  listarUsuariosParaFiltro,
} from "@/modules/administracao/lixeira/queries";

const TAMANHO_PADRAO = 25;
const TAMANHO_MAXIMO = 100;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Teto do termo de busca no motivo: acima disso é texto colado por engano. */
const MAX_MOTIVO = 100;

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

function textoDe(valor: string | string[] | undefined): string | undefined {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return texto && texto.trim() !== "" ? texto.trim() : undefined;
}

/** Data yyyy-MM-dd da query string, ou undefined. Lixo nunca vai pro banco. */
function dataDe(valor: string | string[] | undefined): string | undefined {
  const texto = textoDe(valor);
  return texto && DATA_ISO.test(texto) ? texto : undefined;
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
  const tabela = textoDe(params.tabela);
  const excluidoPorBruto = textoDe(params.por);
  const excluidoPor =
    excluidoPorBruto && UUID.test(excluidoPorBruto)
      ? excluidoPorBruto
      : undefined;
  // Período invertido é trocado de lado: senão a lista volta vazia e o usuário
  // não tem como saber por quê.
  let de = dataDe(params.de);
  let ate = dataDe(params.ate);
  if (de && ate && de > ate) [de, ate] = [ate, de];
  const motivo = textoDe(params.motivo)?.slice(0, MAX_MOTIVO);

  const [{ itens, total }, tabelas, usuarios] = await Promise.all([
    listarLixeira({
      pagina,
      tamanho,
      somenteAtivos: !mostrarRestaurados,
      tabela,
      excluidoPor,
      de,
      ate,
      motivo,
    }),
    listarTabelasLixeira(),
    listarUsuariosParaFiltro(),
  ]);

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
        filtroTabela={tabela ?? ""}
        filtroPor={excluidoPor ?? ""}
        filtroDe={de ?? ""}
        filtroAte={ate ?? ""}
        filtroMotivo={motivo ?? ""}
        tabelas={tabelas}
        usuarios={usuarios}
        podeEditar={temPermissao(usuario, "administracao.lixeira", "editar")}
      />
    </div>
  );
}
