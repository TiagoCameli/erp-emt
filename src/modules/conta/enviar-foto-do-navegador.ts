"use client";

import { createClient } from "@/lib/supabase/client";
import {
  FOTO_LADO_PX,
  FOTO_MIME,
  FOTO_ORIGEM_MAXIMO_MB,
  FOTO_QUALIDADE_JPEG,
  FOTO_TAMANHO_MAXIMO_MB,
} from "@/lib/foto-limite";
import {
  confirmarEnvioFoto,
  prepararEnvioFoto,
} from "@/modules/conta/actions";

/** Bucket das fotos. O mesmo nome do servidor (`BUCKET_AVATARES`). */
const BUCKET = "avatares";

const BYTES_POR_MB = 1024 * 1024;

export type ResultadoEnvioFoto = { ok: true } | { erro: string };

/**
 * Carrega o arquivo num `<img>` e espera ele decodificar.
 *
 * Usa `<img>`, e NÃO `createImageBitmap`, por causa da ORIENTAÇÃO EXIF. Foto de
 * celular em retrato vem com a rotação nos metadados, e o navegador aplica isso
 * ao renderizar um `<img>` — mas `createImageBitmap` a IGNORA por padrão
 * (`imageOrientation: 'none'`). Desenhando o bitmap direto, metade das fotos de
 * iPhone sairia com o rosto de lado, e a pessoa acharia que a tela quebrou.
 */
function carregarImagem(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolver, rejeitar) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolver(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rejeitar(new Error("nao decodificou"));
    };
    img.src = url;
  });
}

/**
 * Recorta o QUADRADO CENTRAL e reduz para 512x512 JPEG.
 *
 * Recorta em vez de esticar porque o avatar é um círculo: esticar uma foto
 * retrato para um quadrado achata o rosto. O quadrado central é a aposta certa
 * numa foto de perfil, onde a cabeça está no meio.
 *
 * A redução acontece NO NAVEGADOR, antes de subir, e não é só economia de
 * banda de upload: o avatar vive no LAYOUT, então a foto é baixada em toda
 * página. Guardar os 4 MB originais de uma foto de celular custaria isso a cada
 * navegação de cada pessoa.
 */
async function reduzirParaQuadrado(arquivo: File): Promise<Blob> {
  const img = await carregarImagem(arquivo);

  const lado = Math.min(img.naturalWidth, img.naturalHeight);
  const origemX = (img.naturalWidth - lado) / 2;
  const origemY = (img.naturalHeight - lado) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = FOTO_LADO_PX;
  canvas.height = FOTO_LADO_PX;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sem canvas");

  // Fundo branco antes de desenhar: PNG com transparência viraria fundo PRETO no
  // JPEG, que não tem canal alfa.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, FOTO_LADO_PX, FOTO_LADO_PX);
  ctx.drawImage(
    img,
    origemX,
    origemY,
    lado,
    lado,
    0,
    0,
    FOTO_LADO_PX,
    FOTO_LADO_PX,
  );

  const blob = await new Promise<Blob | null>((resolver) => {
    canvas.toBlob(resolver, FOTO_MIME, FOTO_QUALIDADE_JPEG);
  });
  if (!blob) throw new Error("nao gerou o jpeg");
  return blob;
}

/**
 * Envia a foto de perfil do navegador direto para o Storage.
 *
 * Três passos, e o do meio não passa pelo servidor da aplicação:
 *
 * 1. `prepararEnvioFoto` — a action decide o caminho (o da PRÓPRIA pessoa, de
 *    `auth.uid()`) e devolve um token que vale só para ele.
 * 2. `uploadToSignedUrl` — os BYTES vão do navegador para o Supabase.
 * 3. `confirmarEnvioFoto` — o servidor confere que o objeto chegou e só então
 *    aponta a linha para ele.
 *
 * Toda falha vira mensagem em pt-BR com o motivo. O que não pode acontecer é
 * sumir em silêncio, com a tela girando e a foto não aparecendo.
 */
export async function enviarFotoDoNavegador(
  arquivo: File,
): Promise<ResultadoEnvioFoto> {
  if (!arquivo.type.startsWith("image/")) {
    return { erro: "Escolha um arquivo de imagem" };
  }
  if (arquivo.size > FOTO_ORIGEM_MAXIMO_MB * BYTES_POR_MB) {
    return { erro: `A imagem passa de ${FOTO_ORIGEM_MAXIMO_MB} MB` };
  }

  let reduzida: Blob;
  try {
    reduzida = await reduzirParaQuadrado(arquivo);
  } catch {
    // Formato que o navegador não decodifica (HEIC no Chrome do desktop é o caso
    // comum) ou imagem grande demais para a memória do aparelho. A saída prática
    // é a pessoa mandar um JPG, e é isso que a mensagem diz.
    return {
      erro: "Não foi possível ler esta imagem. Tente salvar como JPG e enviar de novo",
    };
  }

  // Não deveria acontecer com 512x512, mas o bucket recusaria com mensagem em
  // inglês e genérica. Melhor dizer aqui.
  if (reduzida.size > FOTO_TAMANHO_MAXIMO_MB * BYTES_POR_MB) {
    return { erro: `A foto ficou maior que ${FOTO_TAMANHO_MAXIMO_MB} MB` };
  }

  let preparo;
  try {
    preparo = await prepararEnvioFoto();
  } catch {
    return { erro: "Não foi possível falar com o servidor. Tente de novo" };
  }
  if ("erro" in preparo) return { erro: preparo.erro };

  const supabase = createClient();
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(preparo.path, preparo.token, reduzida, {
      contentType: FOTO_MIME,
    });

  if (erroUpload) {
    const mensagem = (erroUpload.message ?? "").toLowerCase();
    if (mensagem.includes("exceeded") || mensagem.includes("too large")) {
      return { erro: `A foto passa do limite de ${FOTO_TAMANHO_MAXIMO_MB} MB` };
    }
    return { erro: "O envio da foto falhou. Tente de novo" };
  }

  try {
    return await confirmarEnvioFoto();
  } catch {
    // O binário está no bucket mas a linha não aponta para ele. Reenviar
    // sobrescreve o mesmo objeto (o caminho é determinístico), então isto não
    // deixa lixo acumulado.
    return { erro: "A foto subiu mas não foi registrada. Tente de novo" };
  }
}
