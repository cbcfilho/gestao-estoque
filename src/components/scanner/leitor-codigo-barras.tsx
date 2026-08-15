"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Camera, CameraOff, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Botao } from "@/components/ui/botao";
import { Alerta } from "@/components/ui/estados";
import { Modal } from "@/components/ui/modal";
import { useSuportaCamera } from "@/lib/hooks";

/** Formatos usados no varejo brasileiro. Restringir acelera o reconhecimento. */
const FORMATOS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.ITF,
];

function bipar() {
  try {
    const Contexto =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Contexto();
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();

    osc.type = "square";
    osc.frequency.value = 1750;
    ganho.gain.value = 0.06;

    osc.connect(ganho);
    ganho.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    setTimeout(() => void ctx.close(), 200);
  } catch {
    // Áudio bloqueado pelo navegador: a vibração e o retorno visual bastam.
  }
}

function vibrar() {
  try {
    navigator.vibrate?.(60);
  } catch {
    /* aparelho sem suporte */
  }
}

/**
 * Conteúdo da leitura. Fica num componente próprio, montado só enquanto o
 * modal está aberto — assim câmera, erro e último código nascem e morrem
 * junto com a sessão de leitura, sem precisar de efeito para "resetar".
 */
function ConteudoLeitor({
  aoLer,
  continuo,
}: {
  aoLer: (codigo: string) => void;
  continuo: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const ultimaLeituraRef = useRef<{ codigo: string; em: number }>({ codigo: "", em: 0 });

  const [erro, setErro] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraAtual, setCameraAtual] = useState<string | undefined>();
  const [ultimoCodigo, setUltimoCodigo] = useState<string | null>(null);

  const parar = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  useEffect(() => {
    let cancelado = false;

    async function iniciar() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro(
          "Este navegador não permite acesso à câmera. Use a digitação manual ou um leitor USB/Bluetooth.",
        );
        return;
      }

      try {
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATOS);
        hints.set(DecodeHintType.TRY_HARDER, false);

        const leitor = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });

        // Pede permissão antes de listar: sem isso os rótulos vêm vazios.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        stream.getTracks().forEach((t) => t.stop());

        const dispositivos = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "videoinput",
        );
        if (cancelado) return;

        setCameras(dispositivos);

        // Prefere a câmera traseira quando dá para identificar pelo rótulo.
        const traseira = dispositivos.find((d) => /back|rear|traseira|environment/i.test(d.label));
        const escolhida = cameraAtual ?? traseira?.deviceId ?? dispositivos[0]?.deviceId;
        setCameraAtual(escolhida);

        if (!videoRef.current) return;

        const controls = await leitor.decodeFromVideoDevice(
          escolhida,
          videoRef.current,
          (resultado) => {
            if (!resultado) return;

            const codigo = resultado.getText().trim();
            const agora = Date.now();

            // Evita disparar dez vezes o mesmo código enquanto a etiqueta
            // continua na frente da câmera.
            const ultima = ultimaLeituraRef.current;
            if (ultima.codigo === codigo && agora - ultima.em < 1500) return;
            ultimaLeituraRef.current = { codigo, em: agora };

            bipar();
            vibrar();
            setUltimoCodigo(codigo);
            aoLer(codigo);
          },
        );

        if (cancelado) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (e) {
        if (cancelado) return;
        const nome = (e as Error)?.name;
        if (nome === "NotAllowedError") {
          setErro(
            "Permissão de câmera negada. Libere o acesso nas configurações do navegador e tente de novo.",
          );
        } else if (nome === "NotFoundError") {
          setErro("Nenhuma câmera encontrada neste aparelho.");
        } else {
          setErro("Não foi possível abrir a câmera. Use a digitação manual.");
        }
      }
    }

    void iniciar();

    return () => {
      cancelado = true;
      parar();
    };
    // cameraAtual entra na lista para reiniciar a leitura ao trocar de câmera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraAtual]);

  function trocarCamera() {
    if (cameras.length < 2) return;
    const indice = cameras.findIndex((c) => c.deviceId === cameraAtual);
    parar();
    setCameraAtual(cameras[(indice + 1) % cameras.length]?.deviceId);
  }

  if (erro) {
    return (
      <Alerta tom="alerta" titulo="Câmera indisponível">
        {erro}
      </Alerta>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-4/3 overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} className="size-full object-cover" playsInline muted autoPlay />
        {/* Mira: ajuda a enquadrar sem exigir precisão do operador. */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-24 w-64 max-w-[80%] rounded-lg border-2 border-dourado-400 shadow-[0_0_0_100vmax_rgba(0,0,0,0.35)]" />
        </div>
      </div>

      {ultimoCodigo && (
        <p className="text-center text-sm">
          Último código lido: <span className="font-semibold tabular">{ultimoCodigo}</span>
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm texto-suave">
          <Camera className="mr-1 inline size-4" />
          Mantenha o código a uns 15 cm da câmera, com boa luz.
        </p>

        {cameras.length > 1 && (
          <Botao variante="contorno" tamanho="sm" onClick={trocarCamera}>
            <RefreshCw className="size-4" />
            Trocar câmera
          </Botao>
        )}
      </div>

      {!continuo && (
        <p className="text-center text-sm texto-suave">
          A janela fecha sozinha assim que um código for reconhecido.
        </p>
      )}
    </div>
  );
}

export function LeitorCodigoBarras({
  aberto,
  aoFechar,
  aoLer,
  titulo = "Ler código de barras",
  continuo = false,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoLer: (codigo: string) => void;
  titulo?: string;
  /** Mantém a câmera ativa após a leitura — usado no inventário. */
  continuo?: boolean;
}) {
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={titulo}
      descricao={
        continuo
          ? "A câmera fica ligada: aponte para cada etiqueta em sequência."
          : "Aponte a câmera para o código de barras do produto."
      }
      rodape={
        <Botao variante="contorno" onClick={aoFechar}>
          {continuo ? "Concluir" : "Cancelar"}
        </Botao>
      }
    >
      {aberto && (
        <ConteudoLeitor
          aoLer={(codigo) => {
            aoLer(codigo);
            if (!continuo) aoFechar();
          }}
          continuo={continuo}
        />
      )}
    </Modal>
  );
}

export function BotaoLerCodigo({
  aoLer,
  rotulo = "Ler código",
  continuo = false,
  className,
}: {
  aoLer: (codigo: string) => void;
  rotulo?: string;
  continuo?: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const suportado = useSuportaCamera();

  return (
    <>
      <Botao
        type="button"
        variante="contorno"
        onClick={() => setAberto(true)}
        disabled={!suportado}
        className={className}
        title={suportado ? undefined : "Câmera não disponível neste aparelho"}
        aria-label={rotulo || "Ler código de barras"}
      >
        {suportado ? <Camera className="size-4" /> : <CameraOff className="size-4" />}
        {rotulo}
      </Botao>

      <LeitorCodigoBarras
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        aoLer={aoLer}
        continuo={continuo}
      />
    </>
  );
}
