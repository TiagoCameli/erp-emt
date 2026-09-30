import Link from "next/link";
import { ClipboardList, ShieldOff } from "lucide-react";

import { EmptyState } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { LancarCampo } from "@/modules/medicao/campo/components/lancar-campo";
import { contratosParaLancarCampo, servicosParaLancar } from "@/modules/medicao/lancamentos/queries";

export const metadata = { title: "Lançar medição" };

const RECURSO = "medicao.lancamentos" as const;

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

/**
 * Lançar medição pelo celular (Fase 4, Task 6): o contrato só é perguntado quando o usuário tem
 * mais de um com medição aberta agora — com um só, entra direto no formulário. Precisa de sinal,
 * sem fila offline (decisão do Tiago de 28/09/2026, igual ao Abastecer da Manutenção): quem grava
 * é o `LancarCampo`, com a foto carimbada (data, hora e GPS).
 */
export default async function LancarMedicaoCampoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "criar")) {
    return (
      <EmptyState
        icone={ShieldOff}
        titulo="Sem acesso à Medição"
        descricao="Peça acesso a quem cuida das permissões para lançar medição pelo celular."
      />
    );
  }

  const contratos = await contratosParaLancarCampo();
  if (contratos.length === 0) {
    return (
      <EmptyState
        icone={ClipboardList}
        titulo="Nenhuma medição aberta"
        descricao="Você não tem nenhum contrato com medição aberta agora. Peça para abrir a próxima medição antes de lançar."
      />
    );
  }

  const params = await searchParams;
  const contratoParam = primeiro(params.contrato);
  const contrato = contratos.length === 1 ? contratos[0]! : (contratos.find((c) => c.id === contratoParam) ?? null);

  if (!contrato) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-titulo font-semibold">Escolha o contrato</h1>
        <p className="text-detalhe text-muted-foreground">Você tem mais de um contrato com medição aberta agora.</p>
        <ul className="flex flex-col gap-2">
          {contratos.map((c) => (
            <li key={c.id}>
              <Link
                href={`/m/medicao?contrato=${c.id}`}
                className="flex flex-col gap-0.5 rounded-md border border-border bg-surface px-4 py-3 hover:bg-accent/20"
              >
                <span className="font-mono text-detalhe text-muted-foreground">{c.codigo}</span>
                <span className="font-medium">{c.nomeObra}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const servicos = await servicosParaLancar(contrato.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        {contratos.length > 1 ? (
          <Link href="/m/medicao" className="text-detalhe text-muted-foreground underline-offset-2 hover:underline">
            Trocar contrato
          </Link>
        ) : null}
        <h1 className="text-titulo font-semibold break-words">{contrato.nomeObra}</h1>
        <p className="font-mono text-detalhe text-muted-foreground">{contrato.codigo}</p>
      </div>

      {servicos.length === 0 ? (
        <EmptyState
          icone={ClipboardList}
          titulo="Nenhum serviço para lançar"
          descricao="A medição aberta deste contrato não tem serviço na planilha."
        />
      ) : (
        <LancarCampo contratoId={contrato.id} tipoLocalizacao={contrato.tipoLocalizacao} servicos={servicos} />
      )}
    </div>
  );
}
