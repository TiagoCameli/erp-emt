import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarCentrosCusto, type CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { saldosPorDepositoInsumo } from "@/modules/estoque/calculo";
import { SaidasAcoesCabecalho } from "@/modules/estoque/components/acoes-cabecalho";
import { SaidasTabela } from "@/modules/estoque/components/saidas-tabela";
import { listarEntradas, listarLocais, listarSaidas } from "@/modules/estoque/queries";

const RECURSO = "estoque.saidas" as const;

export default async function PaginaSaidasEstoque() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");

  const [saidas, entradas, locais, centros] = await Promise.all([
    listarSaidas(),
    listarEntradas(),
    listarLocais(),
    podeCriar || podeEditar ? listarCentrosCusto() : Promise.resolve<CentroCustoOpcao[]>([]),
  ]);

  const entradasAtivas = entradas.filter((e) => !e.excluida);
  const saidasAtivas = saidas.filter((s) => !s.excluida);

  // Material que pode sair: o que já entrou pelo Estoque. Combustível e peças saem pelos módulos deles.
  const materiais = [
    ...new Map(entradasAtivas.map((e) => [e.insumoId, { id: e.insumoId, nome: e.insumoNome, unidade: e.unidade }])).values(),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const saldos = [...saldosPorDepositoInsumo(entradasAtivas, saidasAtivas)].map(([chave, saldo]) => ({ chave, saldo }));

  // Todos os locais, inativos também: a saída só esvazia, e o saldo pode estar num local já inativado.
  const todosLocais = locais.map((l) => ({ id: l.id, nome: l.nome }));

  const nomesRaiz = new Map<string, string>();
  for (const saida of saidas) {
    nomesRaiz.set(
      saida.centroCustoRaiz,
      saida.vinculo === "transferencia" ? "Transferências" : (saida.centroCustoRotulo.split(" › ")[0] ?? ""),
    );
  }
  const raizes = [...nomesRaiz].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <>
      <PageHeader
        modulo="Estoque"
        titulo="Saídas"
        descricao="Material que saiu do depósito, do tanque ou da pilha para um centro de custo (ou numa transferência), com o valor das entradas mais antigas (PEPS)"
        acoes={
          <SaidasAcoesCabecalho
            podeCriar={podeCriar}
            locais={todosLocais}
            materiais={materiais}
            saldos={saldos}
            centros={centros}
          />
        }
      />
      <SaidasTabela
        saidas={saidas}
        entradas={entradas}
        locais={todosLocais}
        materiais={materiais}
        centros={centros}
        raizes={raizes}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
