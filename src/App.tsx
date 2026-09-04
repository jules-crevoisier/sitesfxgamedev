import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  AudioLinesIcon,
  DownloadIcon,
  FolderOpenIcon,
  Loader2Icon,
  Trash2Icon,
  UploadIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AudioPlayer } from "@/components/AudioPlayer";
import { Waveform } from "@/components/Waveform";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AUDIO_ACCEPT,
  AUDIO_FORMATS_LABEL,
  isAcceptedAudioFile,
} from "@/lib/audioFormats";
import {
  DEFAULT_OPTIONS,
  getFFmpeg,
  processSfxFile,
  type ProcessOptions,
} from "@/lib/audioPipeline";
import { nearestOggPreset, OGG_PRESETS } from "@/lib/oggPresets";
import { cn } from "@/lib/utils";
import { loadWaveform, type WaveformData } from "@/lib/waveform";

type JobStatus = "queued" | "processing" | "done" | "error";

interface SfxJob {
  id: string;
  file: File;
  sourceUrl: string;
  status: JobStatus;
  progress: number;
  error?: string;
  resultUrl?: string;
  previewUrl?: string;
  resultName?: string;
  durationBeforeMs?: number;
  durationAfterMs?: number;
  gainAppliedDb?: number;
  peakBeforeDb?: number;
  peakAfterDb?: number;
  waveBefore?: WaveformData | null;
  waveAfter?: WaveformData | null;
  waveLoading?: boolean;
}

function formatMs(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function statusBadge(status: JobStatus): {
  label: string;
  variant: "secondary" | "default" | "outline" | "destructive";
} {
  switch (status) {
    case "queued":
      return { label: "En attente", variant: "secondary" };
    case "processing":
      return { label: "En cours", variant: "outline" };
    case "done":
      return { label: "OK", variant: "default" };
    case "error":
      return { label: "Erreur", variant: "destructive" };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<SfxJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [options, setOptions] = useState<ProcessOptions>(DEFAULT_OPTIONS);
  const [engineState, setEngineState] = useState<
    "idle" | "loading" | "ready" | "busy"
  >("idle");
  const [engineError, setEngineError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  const [playTarget, setPlayTarget] = useState<"before" | "after">("before");
  const busyRef = useRef(false);
  const jobsRef = useRef(jobs);
  const engineWarmRef = useRef(false);
  jobsRef.current = jobs;

  const selected = jobs.find((job) => job.id === selectedId) ?? null;
  const oggPreset = nearestOggPreset(options.oggQuality);
  const queuedCount = jobs.filter((job) => job.status === "queued").length;
  const doneCount = jobs.filter((job) => job.status === "done").length;
  const isBusy = engineState === "busy" || engineState === "loading";

  // Warm up ffmpeg when the first clip arrives (so Traiter works on first click)
  useEffect(() => {
    if (jobs.length === 0 || engineWarmRef.current) {
      return;
    }
    engineWarmRef.current = true;
    setEngineState("loading");
    void getFFmpeg()
      .then(() => {
        setEngineState((prev) => (prev === "loading" ? "ready" : prev));
      })
      .catch((error: unknown) => {
        engineWarmRef.current = false;
        const message =
          error instanceof Error ? error.message : "Chargement moteur échoué";
        setEngineError(
          `${message}. Vérifie SharedArrayBuffer (Chrome / Edge / Firefox récents).`,
        );
        setEngineState("idle");
      });
  }, [jobs.length]);

  function updateJob(id: string, patch: Partial<SfxJob>): void {
    setJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    );
  }

  function addFiles(fileList: FileList | File[]): void {
    const files = Array.from(fileList).filter(isAcceptedAudioFile);
    if (files.length === 0) {
      toast.error("Aucun fichier audio reconnu");
      return;
    }

    const created: SfxJob[] = files.map((file) => ({
      id: createId(),
      file,
      sourceUrl: URL.createObjectURL(file),
      status: "queued",
      progress: 0,
      waveLoading: true,
      waveBefore: null,
    }));

    setJobs((prev) => [...prev, ...created]);
    setSelectedId((prev) => prev ?? created[0]?.id ?? null);
    toast.success(
      `${created.length} fichier${created.length > 1 ? "s" : ""} ajouté${created.length > 1 ? "s" : ""}`,
    );

    for (const job of created) {
      void loadWaveform(job.file)
        .then((wave) => {
          updateJob(job.id, { waveBefore: wave, waveLoading: false });
        })
        .catch(() => {
          updateJob(job.id, { waveLoading: false });
        });
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>): void {
    if (event.target.files) {
      addFiles(event.target.files);
      event.target.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files);
    }
  }

  async function processQueue(): Promise<void> {
    if (busyRef.current) {
      return;
    }

    // Capture BEFORE any await — setState updaters after await are not sync
    const queuedSnapshot = jobsRef.current.filter(
      (job) => job.status === "queued",
    );
    if (queuedSnapshot.length === 0) {
      toast.message("Aucun fichier en attente");
      return;
    }

    busyRef.current = true;
    setEngineError(null);
    setEngineState("loading");

    try {
      toast.message("Préparation du moteur audio…");
      await getFFmpeg();
      setEngineState("busy");

      let ok = 0;
      let fail = 0;

      for (const job of queuedSnapshot) {
        updateJob(job.id, {
          status: "processing",
          progress: 0,
          error: undefined,
        });
        try {
          const result = await processSfxFile(job.file, options, (ratio) => {
            updateJob(job.id, { progress: Math.round(ratio * 100) });
          });
          const url = URL.createObjectURL(result.blob);
          const previewUrl = URL.createObjectURL(result.previewBlob);
          updateJob(job.id, {
            status: "done",
            progress: 100,
            resultUrl: url,
            previewUrl,
            resultName: result.fileName,
            durationBeforeMs: result.durationBeforeMs,
            durationAfterMs: result.durationAfterMs,
            gainAppliedDb: result.gainAppliedDb,
            peakBeforeDb: result.peakBeforeDb,
            peakAfterDb: result.peakAfterDb,
            waveLoading: true,
          });
          ok += 1;

          void loadWaveform(result.previewBlob)
            .then((wave) => {
              updateJob(job.id, { waveAfter: wave, waveLoading: false });
            })
            .catch(() => {
              updateJob(job.id, { waveLoading: false });
            });
        } catch (error) {
          fail += 1;
          updateJob(job.id, {
            status: "error",
            progress: 0,
            error:
              error instanceof Error ? error.message : "Erreur de traitement",
          });
        }
      }

      if (ok > 0) {
        toast.success(`${ok} SFX traité${ok > 1 ? "s" : ""}`);
      }
      if (fail > 0) {
        toast.error(`${fail} échec${fail > 1 ? "s" : ""}`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chargement moteur échoué";
      setEngineError(
        `${message}. Vérifie SharedArrayBuffer (Chrome / Edge / Firefox récents).`,
      );
      toast.error("Impossible de charger le moteur audio");
    } finally {
      busyRef.current = false;
      setEngineState("ready");
    }
  }

  function clearAll(): void {
    setJobs((prev) => {
      for (const job of prev) {
        URL.revokeObjectURL(job.sourceUrl);
        if (job.resultUrl) URL.revokeObjectURL(job.resultUrl);
        if (job.previewUrl) URL.revokeObjectURL(job.previewUrl);
      }
      return [];
    });
    setSelectedId(null);
  }

  function removeJob(id: string): void {
    setJobs((prev) => {
      const target = prev.find((job) => job.id === id);
      if (target) {
        URL.revokeObjectURL(target.sourceUrl);
        if (target.resultUrl) URL.revokeObjectURL(target.resultUrl);
        if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
      }
      const next = prev.filter((job) => job.id !== id);
      setSelectedId((current) =>
        current !== id ? current : (next[0]?.id ?? null),
      );
      return next;
    });
  }

  function downloadAll(): void {
    for (const job of jobs) {
      if (job.status === "done" && job.resultUrl && job.resultName) {
        const anchor = document.createElement("a");
        anchor.href = job.resultUrl;
        anchor.download = job.resultName;
        anchor.click();
      }
    }
    toast.message("Téléchargements lancés");
  }

  useEffect(() => {
    setPlayProgress(0);
    setPlayTarget(selected?.status === "done" ? "after" : "before");
  }, [selectedId, selected?.status]);

  return (
    <div className="from-background via-background to-muted/40 min-h-svh bg-gradient-to-b">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Game audio</Badge>
              <Badge variant="outline">Local · ffmpeg.wasm</Badge>
            </div>
            <div>
              <h1 className="font-heading text-4xl font-semibold tracking-tight md:text-5xl">
                SFX Lab
              </h1>
              <p className="text-muted-foreground mt-2 max-w-xl text-base leading-relaxed">
                Coupe le blanc, amplifie comme Audacity, normalise à −6 dB,
                exporte en .ogg — prêt pour ton jeu.
              </p>
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs font-medium tracking-wide uppercase">
              <span>Blanc</span>
              <span className="text-primary">→</span>
              <span>Amplify</span>
              <span className="text-primary">→</span>
              <span>−6 dB</span>
              <span className="text-primary">→</span>
              <span>OGG</span>
            </div>
          </div>
        </header>

        <Card
          className={cn(
            "border-dashed transition-colors",
            dragOver && "border-primary bg-primary/5",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadIcon />
              Importer des sons
            </CardTitle>
            <CardDescription>{AUDIO_FORMATS_LABEL}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept={AUDIO_ACCEPT}
              multiple
              className="hidden"
              onChange={onInputChange}
            />
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              <FolderOpenIcon data-icon="inline-start" />
              Choisir des fichiers
            </Button>
            <p className="text-muted-foreground text-sm">
              ou glisse-dépose ici — rien n’est uploadé
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Réglages</CardTitle>
            <CardDescription>
              Amplify colle le pic au niveau choisi (mode Audacity).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Field>
                  <FieldLabel>Seuil silence</FieldLabel>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={-70}
                      max={-30}
                      step={1}
                      value={[options.silenceThresholdDb]}
                      disabled={isBusy}
                      onValueChange={(value) =>
                        setOptions((prev) => ({
                          ...prev,
                          silenceThresholdDb: value[0] ?? prev.silenceThresholdDb,
                        }))
                      }
                    />
                    <span className="text-primary w-14 text-right font-mono text-sm">
                      {options.silenceThresholdDb} dB
                    </span>
                  </div>
                  <FieldDescription>
                    Sous ce niveau = blanc coupé (début / fin).
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>Amplify → pic final</FieldLabel>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={-12}
                      max={-1}
                      step={1}
                      value={[options.normalizePeakDb]}
                      disabled={isBusy}
                      onValueChange={(value) =>
                        setOptions((prev) => ({
                          ...prev,
                          normalizePeakDb: value[0] ?? prev.normalizePeakDb,
                        }))
                      }
                    />
                    <span className="text-primary w-14 text-right font-mono text-sm">
                      {options.normalizePeakDb} dB
                    </span>
                  </div>
                  <FieldDescription>
                    Le son est poussé pour coller aux lignes, pic final à{" "}
                    {options.normalizePeakDb} dB.
                  </FieldDescription>
                </Field>
              </div>

              <Field>
                <FieldLabel>Qualité OGG (compression)</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={2}
                  value={String(options.oggQuality)}
                  disabled={isBusy}
                  onValueChange={(value) => {
                    if (!value) return;
                    setOptions((prev) => ({
                      ...prev,
                      oggQuality: Number(value),
                    }));
                  }}
                  className="flex w-full flex-wrap"
                >
                  {OGG_PRESETS.map((preset) => (
                    <ToggleGroupItem
                      key={preset.q}
                      value={String(preset.q)}
                      className="h-auto flex-1 flex-col items-start gap-0.5 px-3 py-2.5 text-left"
                    >
                      <span className="text-sm font-medium">{preset.label}</span>
                      <span className="text-muted-foreground text-[0.68rem] font-normal normal-case">
                        {preset.hint}
                      </span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>
                  Ce n’est pas le volume — c’est la taille / fidélité du .ogg.
                  Pour du SFX, <strong>{oggPreset.label}</strong> suffit en
                  général.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2 border-t">
            <Button
              type="button"
              disabled={queuedCount === 0 || isBusy}
              onClick={() => {
                void processQueue();
              }}
            >
              {isBusy ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <WandSparklesIcon data-icon="inline-start" />
              )}
              {engineState === "loading"
                ? "Chargement moteur…"
                : engineState === "busy"
                  ? "Traitement…"
                  : `Traiter ${queuedCount} fichier${queuedCount > 1 ? "s" : ""}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={doneCount === 0 || isBusy}
              onClick={downloadAll}
            >
              <DownloadIcon data-icon="inline-start" />
              Tout télécharger
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={jobs.length === 0 || isBusy}
              onClick={clearAll}
            >
              <Trash2Icon data-icon="inline-start" />
              Vider
            </Button>
          </CardFooter>
        </Card>

        {engineError ? (
          <Alert variant="destructive">
            <AlertTitle>Moteur audio</AlertTitle>
            <AlertDescription>{engineError}</AlertDescription>
          </Alert>
        ) : null}

        {jobs.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AudioLinesIcon />
              </EmptyMedia>
              <EmptyTitle>Aucun clip</EmptyTitle>
              <EmptyDescription>
                Importe des sons pour voir les waveforms, écouter et traiter.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
              >
                <FolderOpenIcon data-icon="inline-start" />
                Ajouter des fichiers
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="min-w-0">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  Clips
                  <Badge variant="secondary">{jobs.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[min(32rem,70vh)]">
                  <ul className="flex flex-col gap-2 p-4">
                    {jobs.map((job) => {
                      const badge = statusBadge(job.status);
                      return (
                        <li key={job.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(job.id)}
                            className={cn(
                              "hover:bg-muted/60 flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                              selectedId === job.id &&
                                "border-primary bg-primary/5 ring-primary/20 ring-1",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium">
                                {job.file.name}
                              </span>
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                            </div>
                            <Waveform
                              data={job.waveAfter ?? job.waveBefore ?? null}
                              progress={
                                selectedId === job.id ? playProgress : 0
                              }
                              guideDb={options.normalizePeakDb}
                              height={44}
                              loading={job.waveLoading && !job.waveBefore}
                              color={
                                job.status === "done"
                                  ? "oklch(0.7 0.14 145)"
                                  : "oklch(0.78 0.14 75)"
                              }
                            />
                            {job.status === "processing" ? (
                              <Progress value={job.progress} />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="lg:sticky lg:top-4 lg:self-start">
              <CardHeader className="border-b">
                <CardTitle>Inspector</CardTitle>
                <CardDescription>
                  Waveform · lecture · stats
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selected ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium break-all">
                        {selected.file.name}
                      </p>
                      <p className="text-muted-foreground font-mono text-xs">
                        {(selected.file.size / 1024).toFixed(1)} Ko
                        {selected.durationBeforeMs !== undefined
                          ? ` · src ${formatMs(selected.durationBeforeMs)}`
                          : null}
                        {selected.durationAfterMs !== undefined
                          ? ` · out ${formatMs(selected.durationAfterMs)}`
                          : null}
                      </p>
                    </div>

                    <div className="flex flex-col gap-3">
                      <Waveform
                        data={selected.waveBefore ?? null}
                        progress={
                          playTarget === "before" ? playProgress : 0
                        }
                        guideDb={options.normalizePeakDb}
                        height={84}
                        label="Original"
                        loading={
                          selected.waveLoading && !selected.waveBefore
                        }
                        color="oklch(0.65 0.02 75)"
                      />
                      {selected.status === "done" ? (
                        <Waveform
                          data={selected.waveAfter ?? null}
                          progress={
                            playTarget === "after" ? playProgress : 0
                          }
                          guideDb={options.normalizePeakDb}
                          height={84}
                          label={`Après amplify → ${options.normalizePeakDb} dB`}
                          loading={
                            selected.waveLoading && !selected.waveAfter
                          }
                          color="oklch(0.7 0.14 145)"
                        />
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <AudioPlayer
                        source={selected.sourceUrl}
                        label="Original"
                        onProgress={(ratio) => {
                          setPlayTarget("before");
                          setPlayProgress(ratio);
                        }}
                      />
                      <AudioPlayer
                        source={selected.previewUrl ?? null}
                        label="Traité"
                        onProgress={(ratio) => {
                          setPlayTarget("after");
                          setPlayProgress(ratio);
                        }}
                      />
                      {selected.status === "done" &&
                      selected.resultUrl &&
                      selected.resultName ? (
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={selected.resultUrl}
                            download={selected.resultName}
                          >
                            <DownloadIcon data-icon="inline-start" />
                            .ogg
                          </a>
                        </Button>
                      ) : null}
                    </div>

                    {selected.gainAppliedDb !== undefined ? (
                      <div className="grid grid-cols-3 gap-2">
                        <Stat
                          label="Pic avant"
                          value={`${selected.peakBeforeDb?.toFixed(1)} dB`}
                        />
                        <Stat
                          label="Gain"
                          value={`${selected.gainAppliedDb > 0 ? "+" : ""}${selected.gainAppliedDb} dB`}
                        />
                        <Stat
                          label="Pic après"
                          value={`${selected.peakAfterDb} dB`}
                        />
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        Après traitement, la forme d’onde colle aux guides (
                        {options.normalizePeakDb} dB) — comme Amplify dans
                        Audacity.
                      </p>
                    )}

                    {selected.error ? (
                      <Alert variant="destructive">
                        <AlertTitle>Erreur</AlertTitle>
                        <AlertDescription>{selected.error}</AlertDescription>
                      </Alert>
                    ) : null}

                    <Separator />

                    {selected.status !== "processing" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeJob(selected.id)}
                      >
                        <XIcon data-icon="inline-start" />
                        Retirer ce clip
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Sélectionne un clip.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <footer className="text-muted-foreground flex flex-col gap-1 border-t pt-4 font-mono text-xs md:flex-row md:justify-between">
          <span>ffmpeg.wasm · 100 % local</span>
          <span>
            amplify → {options.normalizePeakDb} dBFS · OGG {oggPreset.label}
          </span>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg border px-2.5 py-2">
      <p className="text-muted-foreground text-[0.65rem] tracking-wide uppercase">
        {label}
      </p>
      <p className="text-primary mt-0.5 font-mono text-sm">{value}</p>
    </div>
  );
}
