/**
 * Play / pause control built on shadcn Button.
 */
import { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AudioPlayerProps {
  source: string | null;
  label?: string;
  onProgress?: (ratio: number) => void;
}

let sharedStop: (() => void) | null = null;

export function AudioPlayer({
  source,
  label = "Écouter",
  onProgress,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onProgressRef = useRef(onProgress);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number>(0);

  onProgressRef.current = onProgress;

  useEffect(() => {
    setPlaying(false);
    setError(null);
    onProgressRef.current?.(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [source]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
      if (sharedStop === stopSelf) {
        sharedStop = null;
      }
    };
  }, []);

  function stopSelf(): void {
    audioRef.current?.pause();
    setPlaying(false);
    onProgressRef.current?.(0);
    cancelAnimationFrame(rafRef.current);
  }

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = (): void => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        onProgressRef.current?.(audio.currentTime / audio.duration);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  async function toggle(): Promise<void> {
    if (!source) {
      return;
    }

    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = source;
      audio.addEventListener("ended", () => {
        setPlaying(false);
        onProgressRef.current?.(0);
      });
      audio.addEventListener("error", () => {
        setError("Lecture impossible");
        setPlaying(false);
      });
      audioRef.current = audio;
    }

    const audio = audioRef.current;
    if (playing) {
      stopSelf();
      return;
    }

    if (sharedStop && sharedStop !== stopSelf) {
      sharedStop();
    }
    sharedStop = stopSelf;

    try {
      setError(null);
      await audio.play();
      setPlaying(true);
    } catch {
      setError("Lecture bloquée");
      setPlaying(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={playing ? "default" : "outline"}
        size="sm"
        disabled={!source}
        onClick={() => {
          void toggle();
        }}
        aria-pressed={playing}
        title={source ? label : "Disponible après traitement"}
      >
        {playing ? (
          <PauseIcon data-icon="inline-start" />
        ) : (
          <PlayIcon data-icon="inline-start" />
        )}
        {playing ? "Pause" : label}
      </Button>
      {error ? (
        <span className="text-destructive font-mono text-xs">{error}</span>
      ) : null}
    </div>
  );
}
