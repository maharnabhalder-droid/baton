"use client";

import React, { useState, useRef, useEffect } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import {
  AlertCircle,
  CheckCircle2,
  MessageSquarePlus,
  User,
  Star,
  Sparkles,
  Clock,
  Mic,
  Square,
  RotateCcw,
  Volume2,
  FileText,
  Loader2,
} from "lucide-react";
import { apiRequest } from "@/lib/api";

export interface GapItem {
  id: string;
  project_id: string;
  gap_type: "decision_without_rationale" | "task_without_owner" | "single_owner_area" | "dependency_without_contact";
  title: string;
  description: string;
  entity_id?: string;
  answer?: string;
  answered_by?: string;
  answered_at?: string;
  created_at: string;
}

interface GapCardProps {
  gap: GapItem;
  onAnswer: (gapId: string, answer: string) => Promise<void>;
}

export function GapCard({ gap, onAnswer }: GapCardProps) {
  const [isAnswering, setIsAnswering] = useState(false);
  const [answerText, setAnswerText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingStatusMsg, setRecordingStatusMsg] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, [audioUrl]);

  const gapTypeLabels: Record<string, { label: string; color: string }> = {
    decision_without_rationale: {
      label: "Decision Without Rationale",
      color: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    },
    task_without_owner: {
      label: "Task Without Owner",
      color: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    },
    single_owner_area: {
      label: "Single Owner Area (SPOF)",
      color: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    },
    dependency_without_contact: {
      label: "Dependency Without Contact",
      color: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    },
  };

  const currentType = gapTypeLabels[gap.gap_type] || {
    label: gap.gap_type,
    color: "bg-muted text-muted-foreground",
  };

  const stopRecording = (reason?: "auto" | "manual") => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (reason === "auto") {
      setRecordingStatusMsg("Maximum recording limit reached (2 minutes). Your voice note has been captured and is ready for review.");
      setLiveAnnouncement("Recording reached the 2-minute limit and stopped. You can preview, re-record, or transcribe.");
    } else {
      setLiveAnnouncement("Recording stopped. You can preview, re-record, or transcribe.");
    }
  };

  const startRecording = async () => {
    setTranscriptionError(null);
    setErrorMsg(null);
    setRecordingStatusMsg(null);

    if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setTranscriptionError("Voice recording is not supported in this browser. You can type your answer directly into the text field below.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(fullBlob);
        const url = URL.createObjectURL(fullBlob);
        setAudioUrl(url);
        // Stop all tracks to release mic
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      setLiveAnnouncement("Recording voice note. 2 minutes maximum.");

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 119) {
            stopRecording("auto");
            return 120;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setTranscriptionError("Microphone access was denied or is unavailable. You can type your answer directly into the text field below.");
    }
  };

  const handleTranscribe = async () => {
    if (!audioBlob) return;
    setTranscribing(true);
    setTranscriptionError(null);
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "voice_note.webm");

      const data = await apiRequest<{ transcript: string; duration_seconds: number; status: string }>(
        `/api/projects/${gap.project_id}/gaps/${gap.id}/transcribe`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (data.transcript) {
        setAnswerText(data.transcript);
        setLiveAnnouncement("Voice note transcribed successfully. You can edit the text before saving.");
      }
    } catch (err: any) {
      setTranscriptionError(err.message || "Failed to transcribe audio. You can still type your answer directly.");
    } finally {
      setTranscribing(false);
    }
  };

  const resetRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setAudioBlob(null);
    setRecordingSeconds(0);
    setTranscriptionError(null);
    setRecordingStatusMsg(null);
    setLiveAnnouncement("Voice recording reset.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (answerText.trim().length < 5) {
      setErrorMsg("Answer must be at least 5 characters to establish valid evidence.");
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onAnswer(gap.id, answerText.trim());
      setIsAnswering(false);
      setAnswerText("");
      resetRecording();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to record answer");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border border-border/60 bg-card/60 backdrop-blur-sm hover:border-amber-400/30 transition-all">
      <CardHeader className="p-4 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className={`text-xs font-semibold ${currentType.color}`}>
            {currentType.label}
          </Badge>

          {gap.answer ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
              <Star className="h-3 w-3 fill-emerald-400 text-emerald-400" />
              <span>Ignited & Answered</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
              <Star className="h-3 w-3 text-amber-400" />
              <span>Unlit Star</span>
            </span>
          )}
        </div>
        <CardTitle className="text-base font-serif font-bold text-foreground leading-snug">
          {gap.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 pt-1 space-y-3">
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {gap.description}
        </p>

        {gap.answer ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
              <span className="flex items-center gap-1.5 font-mono">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                Evidence Tag: stated by departing member
              </span>
              {gap.answered_at && (
                <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(gap.answered_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-sans pt-1">
              {gap.answer}
            </p>
          </div>
        ) : isAnswering ? (
          <div className="space-y-4 pt-2">
            {/* Voice Note Module */}
            <div className="p-3 bg-muted/30 border border-border/70 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-semibold text-foreground">Voice Note Gap Interview</span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Audio is processed in memory; strictly never stored to disk or database.
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {!isRecording && !audioBlob && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={startRecording}
                    className="text-xs h-8 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 flex items-center gap-1.5"
                    aria-label="Start recording voice note"
                  >
                    <Mic className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
                    Record Voice Note
                  </Button>
                )}

                {/* Accessible live announcements for screen readers */}
                <div className="sr-only" aria-live="polite" role="status">
                  {liveAnnouncement}
                </div>

                {isRecording && (() => {
                  const remaining = Math.max(0, 120 - recordingSeconds);
                  const mins = Math.floor(remaining / 60);
                  const secs = remaining % 60;
                  const formattedCountdown = `Remaining ${mins}:${secs < 10 ? "0" : ""}${secs}`;
                  return (
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-2 text-xs font-mono text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded">
                        <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                        Recording... {formattedCountdown} (120s limit)
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => stopRecording("manual")}
                        className="text-xs h-8 flex items-center gap-1.5"
                        aria-label="Stop recording voice note"
                      >
                        <Square className="h-3 w-3 fill-white" />
                        Stop
                      </Button>
                    </div>
                  );
                })()}

                {recordingStatusMsg && (
                  <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2 rounded flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>{recordingStatusMsg}</span>
                  </div>
                )}

                {audioBlob && !isRecording && (
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    {audioUrl && (
                      <audio controls src={audioUrl} className="h-8 max-w-[220px]" aria-label="Recorded audio preview" />
                    )}
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleTranscribe}
                      disabled={transcribing}
                      className="text-xs h-8 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center gap-1.5"
                      aria-label="Transcribe recorded audio with Gemini"
                    >
                      {transcribing ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Transcribing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          Transcribe with Gemini
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={resetRecording}
                      disabled={transcribing}
                      className="text-xs h-8 text-muted-foreground hover:text-foreground flex items-center gap-1"
                      aria-label="Re-record voice note"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Re-record
                    </Button>
                  </div>
                )}
              </div>

              {transcriptionError && (
                <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{transcriptionError}</span>
                </div>
              )}
            </div>

            {/* Form for reviewing/typing and confirming answer */}
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div className="space-y-1">
                <label htmlFor={`gap-answer-${gap.id}`} className="text-xs font-medium text-foreground flex items-center justify-between">
                  <span>Editable Transcript / Written Response</span>
                  <span className="text-[10px] text-muted-foreground font-mono">Review & edit before confirming</span>
                </label>
                <textarea
                  id={`gap-answer-${gap.id}`}
                  aria-label="Departing member answer or rationale"
                  required
                  rows={4}
                  placeholder="State the decision rationale, task owner, or critical contact..."
                  value={answerText}
                  onChange={(e) => {
                    setAnswerText(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  className="w-full text-xs p-2.5 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400 font-sans"
                />
              </div>

              {errorMsg && (
                <p className="text-xs text-rose-400 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errorMsg}
                </p>
              )}

              <p className="text-[11px] text-muted-foreground">
                Your confirmed response will be recorded into the project evidence graph tagged:{" "}
                <strong className="text-amber-400 font-mono">"stated by departing member"</strong>.
                Nothing is saved until you click Confirm & Save.
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => {
                    setIsAnswering(false);
                    resetRecording();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting || transcribing || isRecording}
                  className="text-xs h-8 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
                  aria-label="Confirm and save response to knowledge graph"
                >
                  {submitting ? "Saving Evidence..." : "Confirm & Save (Ignite Star)"}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAnswering(true)}
              className="text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10 h-7"
            >
              <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
              Answer as Departing Member
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}