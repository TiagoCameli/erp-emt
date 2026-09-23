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

/**
 * O cabeçalho gera o PDF das etiquetas QR (`gerarEtiquetasQr`), e a Server
 * Action roda na função DESTA página. Montar o PDF da frota inteira (um QR por
 * equipamento) passa fácil do teto padrão da Vercel (10 a 15s), e a função
 * morreria no meio devolvendo erro no lugar do arquivo. 60s é o máximo que vale
 * em qualquer plano. `max-duration-de-quem-exporta.test.ts` cobra isto.
 */
export const maxDuration = 60;

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

  const equipamentosAtivos = equipamentos
    .filter((equipamento) => equipamento.ativo)
    .map(({ id, codigo, descricao }) => ({ id, codigo, descricao }));

  const podeCriar = temPermissao(usuario, "cadastros.equipamentos", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.equipamentos", "editar");

  return (
    <>
      <PageHeader
        modulo="Cadastros"
        titulo="Equipamentos"
        descricao="Frota e maquinário. Cada equipamento vira uma etapa do centro de custo de Manutenção"
        acoes={
          <EquipamentosAcoesCabecalho
            podeCriar={podeCriar}
            equipamentosAtivos={equipamentosAtivos}
          />
        }
      />
      <EquipamentosTabela
        equipamentos={equipamentos}
        documentosPorEquipamento={documentosPorEquipamento}
        podeEditar={podeEditar}
      />
    </>
  );
}
