"use client";

import React, { useState } from "react";
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
} from "lucide-react";

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
          <form onSubmit={handleSubmit} className="space-y-2.5 pt-2">
            <label htmlFor={`gap-answer-${gap.id}`} className="sr-only">
              Departing member answer or rationale
            </label>
            <textarea
              id={`gap-answer-${gap.id}`}
              aria-label="Departing member answer or rationale"
              required
              rows={3}
              placeholder="State the decision rationale, task owner, or critical contact..."
              value={answerText}
              onChange={(e) => {
                setAnswerText(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              className="w-full text-xs p-2.5 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            {errorMsg && (
              <p className="text-xs text-rose-400 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {errorMsg}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Your response will be recorded into the project evidence graph tagged:{" "}
              <strong className="text-amber-400 font-mono">"stated by departing member"</strong>.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setIsAnswering(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting}
                className="text-xs h-7 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
              >
                {submitting ? "Saving..." : "Record & Ignite Star"}
              </Button>
            </div>
          </form>
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
