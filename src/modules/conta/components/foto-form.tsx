"use client";

import * as React from "react";
import { LoaderCircle, Trash2, Upload } from "lucide-react";

import { SecaoFormulario } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FOTO_LADO_PX } from "@/lib/foto-limite";
import { removerMinhaFoto } from "@/modules/conta/actions";
import { enviarFotoDoNavegador } from "@/modules/conta/enviar-foto-do-navegador";

/** Iniciais do nome, para o fallback. Mesma regra do avatar da sidebar. */
function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0].charAt(0);
  const ultima = partes.length > 1 ? partes[partes.length - 1].charAt(0) : "";
  return (primeira + ultima).toUpperCase();
}

export interface FotoFormProps {
  nome: string;
  /** URL ASSINADA da foto atual, ou null. Assinada pelo Server Component. */
  fotoUrl: string | null;
}

/**
 * Foto de perfil: prévia, trocar e remover.
 *
 * A foto NÃO tem "Salvar": escolher o arquivo já envia. É o gesto que a pessoa
 * espera de foto de perfil em qualquer app, e o formulário de dados ao lado tem
 * botão próprio — dois "Salvar" na mesma tela, um deles para um campo só,
 * confundiria qual salva o quê.
 *
 * O `input` de arquivo fica escondido atrás de um Button porque input de arquivo
 * cru não aceita estilo e sai destoando de todo o resto da tela.
 */
export function FotoForm({ nome, fotoUrl }: FotoFormProps) {
  const [enviando, setEnviando] = React.useState(false);
  const [removendo, setRemovendo] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const ocupado = enviando || removendo;

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    // Limpa o input ANTES de enviar: sem isso, escolher o mesmo arquivo de novo
    // (depois de um erro, por exemplo) não dispara `change`, porque o valor não
    // mudou — e o botão pareceria morto.
    evento.target.value = "";
    if (!arquivo) return;

    setEnviando(true);
    const resultado = await enviarFotoDoNavegador(arquivo);
    setEnviando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Foto atualizada");
  }

  async function aoRemover() {
    setRemovendo(true);
    const resultado = await removerMinhaFoto();
    setRemovendo(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Foto removida");
  }

  return (
    <SecaoFormulario titulo="Foto">
      <div className="flex items-center gap-4">
        <Avatar className="size-24">
          {fotoUrl ? <AvatarImage src={fotoUrl} alt="" /> : null}
          <AvatarFallback className="bg-accent text-corpo font-medium text-accent-foreground">
            {iniciaisDoNome(nome)}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col items-start gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() => inputRef.current?.click()}
            >
              {enviando ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Upload />
              )}
              {enviando
                ? "Enviando"
                : fotoUrl
                  ? "Trocar foto"
                  : "Escolher foto"}
            </Button>

            {fotoUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={ocupado}
                onClick={aoRemover}
              >
                {removendo ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
                Remover
              </Button>
            ) : null}
          </div>

          <p className="text-legenda text-muted-foreground">
            {/* Dizer o que vai acontecer com a imagem evita a surpresa de ver a
                foto recortada: o quadrado central é o que sobra, e é o que o
                círculo do avatar mostra. */}
            A imagem é recortada no quadrado central e reduzida para{" "}
            {FOTO_LADO_PX}x{FOTO_LADO_PX}. Sem foto, aparecem as suas iniciais.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={aoEscolher}
        // O input existe mesmo escondido para o teclado e o leitor de tela
        // alcançarem o campo pelo Button, que é quem tem o rótulo.
        aria-label="Escolher foto de perfil"
      />
    </SecaoFormulario>
  );
}
