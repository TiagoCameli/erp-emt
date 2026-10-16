import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { saldosPorDepositoInsumo } from "@/modules/estoque/calculo";
import { listarEntradas, listarLocais, listarSaidas } from "@/modules/estoque/queries";
import { TransferenciasAcoesCabecalho } from "@/modules/estoque/transferencias/components/transferencias-acoes-cabecalho";
import { TransferenciasTabela } from "@/modules/estoque/transferencias/components/transferencias-tabela";
import { listarTransferencias } from "@/modules/estoque/transferencias/queries";

const RECURSO = "estoque.transferencias" as const;

/**
 * Transferências entre depósitos, tanques de material e pilhas. As do frete de
 * transferência nascem sozinhas quando o frete chega e só mudam pelo Frete.
 */
export default async function PaginaTransferenciasEstoque() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  const preenche = podeCriar || podeEditar;

  const [transferencias, locais, entradas, saidas] = await Promise.all([
    listarTransferencias(),
    listarLocais(),
    preenche ? listarEntradas() : Promise.resolve([]),
    preenche ? listarSaidas() : Promise.resolve([]),
  ]);

  const entradasAtivas = entradas.filter((e) => !e.excluida);
  const saidasAtivas = saidas.filter((s) => !s.excluida);
  const materiais = [
    ...new Map(entradasAtivas.map((e) => [e.insumoId, { id: e.insumoId, nome: e.insumoNome, unidade: e.unidade }])).values(),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const saldos = [...saldosPorDepositoInsumo(entradasAtivas, saidasAtivas)].map(([chave, saldo]) => ({ chave, saldo }));
  const opcoesLocais = locais.map((l) => ({ id: l.id, nome: l.nome, ativo: l.ativo, insumoId: l.insumoId }));

  return (
    <>
      <PageHeader
        modulo="Estoque"
        titulo="Transferências"
        descricao="Material levado de um local para outro. O frete de transferência entra aqui sozinho quando chega"
        acoes={
          <TransferenciasAcoesCabecalho
            podeCriar={podeCriar}
            locais={opcoesLocais}
            materiais={materiais}
            saldos={saldos}
          />
        }
      />
      <TransferenciasTabela
        transferencias={transferencias}
        locais={opcoesLocais}
        materiais={materiais}
        saldos={saldos}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
