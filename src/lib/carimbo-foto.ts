import { format } from "date-fns";
import { tz } from "@date-fns/tz";

import { TIMEZONE } from "@/lib/formatadores";

/**
 * Carimbo da foto tirada pela câmera: data, hora e GPS no rodapé da imagem, como
 * o AnexosUploader da origem (Gestão Obras). É prova de campo: a foto da bomba ou
 * do hodômetro diz quando e onde foi tirada. Foto escolhida da galeria NÃO passa
 * por aqui: preserva o original.
 *
 * Qualquer falha (HEIC que o navegador não abre, imagem grande demais para o
 * canvas do aparelho, GPS negado) devolve a foto original: o carimbo é um
 * acréscimo, nunca o motivo de a foto não subir.
 */

export interface Posicao {
  lat: number;
  lon: number;
  precisao: number;
}

/** As duas linhas do carimbo. A hora é a de Rio Branco, como o resto do app. */
export function linhasDoCarimbo(momento: Date, posicao: Posicao | null): [string, string] {
  const hora = format(momento, "dd/MM/yyyy HH:mm:ss", { in: tz(TIMEZONE) });
  const gps = posicao
    ? `GPS: ${posicao.lat.toFixed(6)}, ${posicao.lon.toFixed(6)} (precisão ${Math.round(posicao.precisao)} m)`
    : "GPS: indisponível";
  return [hora, gps];
}

/** Posição do aparelho, ou nulo sem permissão, sem GPS ou passado o tempo. */
export function posicaoAtual(esperaMs = 8000): Promise<Posicao | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const desistir = setTimeout(() => resolve(null), esperaMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(desistir);
        resolve({ lat: p.coords.latitude, lon: p.coords.longitude, precisao: p.coords.accuracy });
      },
      () => {
        clearTimeout(desistir);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: esperaMs, maximumAge: 30_000 },
    );
  });
}

/**
 * `<img>` e não `createImageBitmap`: o `<img>` aplica a orientação EXIF da foto de
 * celular, e o canvas copia o que foi renderizado.
 */
function carregar(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (erro) => {
      URL.revokeObjectURL(url);
      reject(erro);
    };
    img.src = url;
  });
}

/** Desenha o carimbo e devolve um JPEG novo; qualquer falha devolve o original. */
export async function carimbarFoto(arquivo: File, momento: Date, posicao: Posicao | null): Promise<File> {
  if (arquivo.type === "image/heic" || arquivo.type === "image/heif") return arquivo;
  try {
    const img = await carregar(arquivo);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx || canvas.width === 0 || canvas.height === 0) return arquivo;

    // Fundo branco: PNG transparente viraria preto no JPEG.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const [linha1, linha2] = linhasDoCarimbo(momento, posicao);
    const fonte = Math.max(20, Math.round(canvas.width / 50));
    const margem = Math.round(fonte * 0.6);
    const entrelinha = Math.round(fonte * 1.35);
    const altura = entrelinha * 2 + margem * 2;
    const topo = canvas.height - altura;
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, topo, canvas.width, altura);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${fonte}px Arial, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(linha1, margem, topo + margem);
    ctx.fillText(linha2, margem, topo + margem + entrelinha);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return arquivo;
    const base = arquivo.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
}

/** Posição uma vez, e o mesmo carimbo em todas as fotos da vez. */
export async function carimbarFotos(arquivos: File[]): Promise<File[]> {
  const posicao = await posicaoAtual();
  const momento = new Date();
  return Promise.all(arquivos.map((a) => carimbarFoto(a, momento, posicao)));
}
