import { notFound } from "next/navigation";

import { KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { formatarQuantidade } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  listarEquipamentos,
  listarOperadores,
  listarTanques,
} from "@/modules/estoque/_shared/queries";
import { AbastecimentosTabela } from "@/modules/estoque/tanques/components/abastecimentos-tabela";
import { TanquesAcoesCabecalho } from "@/modules/estoque/tanques/components/tanques-acoes-cabecalho";
import {
  listarAbastecimentos,
  listarNiveisTanques,
} from "@/modules/estoque/tanques/queries";

const TAMANHO_PADRAO = 25;
const REGEX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lê um uuid de filtro da query string (ignora valores inválidos). */
function uuidParam(valor: string | string[] | undefined): string | undefined {
  if (typeof valor !== "string") return undefined;
  return REGEX_UUID.test(valor) ? valor : undefined;
}

export default async function PaginaTanques({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "estoque.tanques", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "estoque.tanques", "criar");

  const params = await searchParams;

  const paginaParam = Number(params.pagina);
  const pagina =
    Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam - 1 : 0;

  const tamanhoParam = Number(params.tamanho);
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0
      ? tamanhoParam
      : TAMANHO_PADRAO;

  const tanqueId = uuidParam(params.tanque);
  const equipamentoId = uuidParam(params.equipamento);

  const [{ itens, total }, niveis, tanques, equipamentos, operadores] =
    await Promise.all([
      listarAbastecimentos({ pagina, tamanho, tanqueId, equipamentoId }),
      listarNiveisTanques(),
      listarTanques(),
      listarEquipamentos(),
      listarOperadores(),
    ]);

  return (
    <>
      <PageHeader
        titulo="Tanques"
        descricao="Abastecimento de equipamentos e nível dos tanques de combustível e betuminoso."
        acoes={
          podeCriar ? (
            <TanquesAcoesCabecalho
              tanques={tanques}
              equipamentos={equipamentos}
              operadores={operadores}
            />
          ) : undefined
        }
      />

      {tanques.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface/50 px-4 py-6 text-detalhe text-muted-foreground">
          Nenhum tanque cadastrado. Cadastre um depósito do tipo tanque de
          combustível ou betuminoso para acompanhar o nível e registrar
          abastecimentos.
        </p>
      ) : niveis.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {niveis.map((nivel) => (
            <KPICard
              key={nivel.depositoId}
              titulo={nivel.nome}
              valor={`${formatarQuantidade(nivel.quantidade)} ${nivel.unidadeSigla}`}
              detalhe={
                <span>
                  {nivel.insumoNome} ·{" "}
                  <MoneyText valor={nivel.valorTotal} className="text-right" />
                </span>
              }
            />
          ))}
        </div>
      ) : null}

      <AbastecimentosTabela
        abastecimentos={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        tanqueId={tanqueId ?? ""}
        equipamentoId={equipamentoId ?? ""}
        tanques={tanques}
        equipamentos={equipamentos}
      />
    </>
  );
}
