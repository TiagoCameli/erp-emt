"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff, Search } from "lucide-react";

import { CampoFormulario } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { destinoDoQr, rotaDoDestino } from "@/modules/manutencao/campo/qr";

type Detector = (video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>;

interface BarcodeDetectorLike {
  detect(fonte: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/**
 * O leitor nativo (`BarcodeDetector`, Chrome do Android) quando existe; senão o jsQR,
 * carregado só aqui (iPhone não tem o nativo). Os dois leem o mesmo quadro do vídeo.
 */
async function criarDetector(): Promise<Detector> {
  const Nativo = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike })
    .BarcodeDetector;
  if (Nativo) {
    const detector = new Nativo({ formats: ["qr_code"] });
    return async (video) => {
      const [achado] = await detector.detect(video);
      return achado?.rawValue ?? null;
    };
  }
  const { default: jsQR } = await import("jsqr");
  return async (video, canvas) => {
    const largura = video.videoWidth;
    const altura = video.videoHeight;
    if (largura === 0 || altura === 0) return null;
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext("2d", { willReadFrequently: true });
    if (!contexto) return null;
    contexto.drawImage(video, 0, 0, largura, altura);
    const imagem = contexto.getImageData(0, 0, largura, altura);
    return jsQR(imagem.data, largura, altura, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

/**
 * Leitor de QR de dentro do app. Existe por causa dos adesivos antigos: a câmera do
 * celular abre o endereço gravado, e 57 deles gravaram `localhost`. Daqui, o endereço é
 * só texto e o que importa é o id.
 */
export function LeitorQr() {
  const router = useRouter();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [ligada, setLigada] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [digitado, setDigitado] = React.useState("");

  const desligar = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((trilha) => trilha.stop());
    streamRef.current = null;
    setLigada(false);
  }, []);

  React.useEffect(() => desligar, [desligar]);

  const ir = React.useCallback(
    (texto: string): boolean => {
      const destino = destinoDoQr(texto);
      if (!destino) return false;
      desligar();
      router.push(rotaDoDestino(destino));
      return true;
    },
    [desligar, router],
  );

  async function ligar() {
    setAviso(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setAviso("Este navegador não abre a câmera. Digite o código abaixo.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setLigada(true);

      const detectar = await criarDetector();
      const canvas = canvasRef.current!;
      const rodada = async () => {
        if (!streamRef.current) return;
        try {
          const texto = await detectar(video, canvas);
          if (texto) {
            if (ir(texto)) return;
            setAviso("Esse QR não é de equipamento.");
          }
        } catch {
          // quadro ruim: tenta o próximo
        }
        window.setTimeout(() => void rodada(), 250);
      };
      void rodada();
    } catch {
      desligar();
      setAviso("Não deu para abrir a câmera. Libere o acesso nas permissões do navegador ou digite o código.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-surface">
        <video ref={videoRef} className="size-full object-cover" playsInline muted aria-label="Câmera do leitor de QR" />
        {!ligada ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Camera className="size-10 text-muted-foreground" aria-hidden />
          </div>
        ) : null}
        <canvas ref={canvasRef} className="hidden" />
      </div>
      {ligada ? (
        <Button variant="outline" size="lg" className="h-12" onClick={desligar}>
          <CameraOff aria-hidden />
          Fechar câmera
        </Button>
      ) : (
        <Button size="lg" className="h-12" onClick={() => void ligar()}>
          <Camera aria-hidden />
          Ler QR do equipamento
        </Button>
      )}
      {aviso ? <p className="text-detalhe text-destructive">{aviso}</p> : null}

      <form
        className="flex items-end gap-2"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (!ir(digitado)) setAviso("Não reconheci esse código.");
        }}
      >
        <CampoFormulario id="codigo-qr" rotulo="Ou digite o código do adesivo" className="flex-1">
          <Input
            id="codigo-qr"
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            className="h-12"
          />
        </CampoFormulario>
        <Button type="submit" size="lg" className="h-12" aria-label="Abrir equipamento">
          <Search aria-hidden />
        </Button>
      </form>
    </div>
  );
}
