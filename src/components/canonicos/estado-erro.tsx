"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/canonicos/empty-state";
import { Button } from "@/components/ui/button";

export interface EstadoErroProps {
  /** O que falhou, em pt-BR, do ponto de vista do usuário. */
  titulo?: string;
  descricao?: string;
  /** Tenta renderizar de novo (o `reset` do error boundary da rota). */
  onTentarDeNovo: () => void;
}

/**
 * Estado de erro canônico de uma tela: explica o que aconteceu e oferece
 * tentar de novo, em vez de deixar a página em branco. A mensagem técnica não
 * aparece para o usuário (em produção o Next já a esconde por segurança).
 */
export function EstadoErro({
  titulo = "Não foi possível carregar",
  descricao = "Pode ter sido uma falha de conexão. Tente de novo; se continuar, avise o suporte.",
  onTentarDeNovo,
}: EstadoErroProps) {
  return (
    <EmptyState
      icone={TriangleAlert}
      titulo={titulo}
      descricao={descricao}
      acao={
        <Button type="button" size="sm" variant="outline" onClick={onTentarDeNovo}>
          <RefreshCw />
          Tentar de novo
        </Button>
      }
    />
  );
}
