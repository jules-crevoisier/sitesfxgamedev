/**
 * Canvas waveform with center line, peak rails, and playhead.
 */
import { useEffect, useRef } from "react";
import type { WaveformData } from "@/lib/waveform";
import { cn } from "@/lib/utils";

interface WaveformProps {
  data: WaveformData | null;
  progress: number;
  guideDb?: number;
  height?: number;
  color?: string;
  label?: string;
  loading?: boolean;
  className?: string;
}

export function Waveform({
  data,
  progress,
  guideDb = -6,
  height = 72,
  color = "oklch(0.78 0.14 75)",
  label,
  loading = false,
  className,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "oklch(0.14 0.01 55)";
    ctx.fillRect(0, 0, width, height);

    const midY = height / 2;

    ctx.strokeStyle = "oklch(1 0 0 / 12%)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    ctx.strokeStyle = "oklch(1 0 0 / 18%)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(width, 2);
    ctx.moveTo(0, height - 2);
    ctx.lineTo(width, height - 2);
    ctx.stroke();

    const guideRatio = dbToLinear(guideDb);
    const guideOffset = midY * guideRatio;
    ctx.strokeStyle = "oklch(0.78 0.14 75 / 40%)";
    ctx.beginPath();
    ctx.moveTo(0, midY - guideOffset);
    ctx.lineTo(width, midY - guideOffset);
    ctx.moveTo(0, midY + guideOffset);
    ctx.lineTo(width, midY + guideOffset);
    ctx.stroke();
    ctx.setLineDash([]);

    if (loading || !data) {
      ctx.fillStyle = "oklch(0.7 0.02 75)";
      ctx.font = "12px Geist Variable, sans-serif";
      ctx.fillText(loading ? "analyse…" : "—", 10, midY + 4);
      return;
    }

    const { peaks } = data;
    const barWidth = width / peaks.length;

    ctx.fillStyle = color;
    for (let i = 0; i < peaks.length; i += 1) {
      const peak = peaks[i] ?? 0;
      const amp = peak * (midY - 3);
      const x = i * barWidth;
      const w = Math.max(1, barWidth * 0.75);
      ctx.fillRect(x, midY - amp, w, amp * 2);
    }

    if (progress > 0 && progress < 1) {
      const x = progress * width;
      ctx.strokeStyle = "oklch(0.7 0.18 25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }, [data, progress, guideDb, height, color, loading]);

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label ? (
        <span className="text-muted-foreground text-[0.7rem] font-medium tracking-wider uppercase">
          {label}
        </span>
      ) : null}
      <canvas
        ref={canvasRef}
        className="bg-background w-full rounded-md border"
        style={{ height }}
        aria-hidden="true"
      />
      {data ? (
        <div className="text-muted-foreground flex justify-between font-mono text-[0.68rem]">
          <span>{formatDuration(data.durationSec)}</span>
          <span>pic {data.peakDb.toFixed(1)} dB</span>
        </div>
      ) : null}
    </div>
  );
}

function dbToLinear(db: number): number {
  return Math.min(1, Math.pow(10, db / 20));
}

function formatDuration(sec: number): string {
  if (sec < 1) {
    return `${Math.round(sec * 1000)} ms`;
  }
  return `${sec.toFixed(2)} s`;
}
