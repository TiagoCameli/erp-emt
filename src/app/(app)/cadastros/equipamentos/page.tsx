import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { EquipamentosAcoesCabecalho } from "@/modules/cadastros/equipamentos/components/equipamentos-acoes-cabecalho";
import { EquipamentosTabela } from "@/modules/cadastros/equipamentos/components/equipamentos-tabela";
import {
  listarDocumentos,
  listarEquipamentos,
  type EquipamentoDocumento,
} from "@/modules/cadastros/equipamentos/queries";

export default async function PaginaEquipamentos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.equipamentos", "ver")) {
    notFound();
  }

  const equipamentos = await listarEquipamentos();

  // Carrega os documentos de cada equipamento para o drawer mostrar a subtabela
  // sem ida e volta extra ao abrir.
  const listasDocumentos = await Promise.all(
    equipamentos.map((equipamento) => listarDocumentos(equipamento.id)),
  );
  const documentosPorEquipamento: Record<string, EquipamentoDocumento[]> = {};
  equipamentos.forEach((equipamento, indice) => {
    documentosPorEquipamento[equipamento.id] = listasDocumentos[indice] ?? [];
  });

  const podeCriar = temPermissao(usuario, "cadastros.equipamentos", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.equipamentos", "editar");

  return (
    <>
      <PageHeader
        titulo="Equipamentos"
        descricao="Frota e maquinário. Cada equipamento vira uma etapa do centro de custo de Manutenção"
        acoes={<EquipamentosAcoesCabecalho podeCriar={podeCriar} />}
      />
      <EquipamentosTabela
        equipamentos={equipamentos}
        documentosPorEquipamento={documentosPorEquipamento}
        podeEditar={podeEditar}
      />
    </>
  );
}
