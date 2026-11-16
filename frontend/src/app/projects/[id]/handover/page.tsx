"use client";

import { use, useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  ShieldCheck,
  UserCheck,
  AlertCircle,
  FileCheck2,
  Clock,
  Download,
  Printer,
  Sparkles,
  FileText,
  Quote,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  Award,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  SendHorizontal
} from "lucide-react";

interface HandoverSummary {
  project_id: string;
  total_sources: number;
  total_snippets: number;
  total_claims: number;
  claims_by_status: Record<string, number>;
  pending_gaps: number;
  resolved_gaps: number;
  acknowledgements: {
    id: string;
    project_id: string;
    user_id: string;
    acknowledged_at: string;
    notes?: string;
    score?: number;
    time_taken_seconds?: number;
    completed_rehearsal?: boolean;
    missed_topics?: string;
  }[];
}

interface RehearsalQuestion {
  id: string;
  scenario: string;
  claim_ids: string[];
  category: string;
  guidance?: string;
}

interface QuestionGrade {
  question_id: string;
  score: number;
  passed: boolean;
  feedback: string;
  claim_ids: string[];
  topic: string;
}

interface RehearsalResult {
  attempt_id: string;
  score: number;
  passed: boolean;
  total_questions: number;
  correct_count: number;
  weak_topics: string[];
  grades: QuestionGrade[];
  time_taken_seconds: number;
}

interface WeakTopicItem {
  attempt_id: string;
  user_id: string;
  user_name?: string;
  topic: string;
  question_scenario: string;
  claim_ids: string[];
  submitted_answer?: string;
  created_at: string;
}

export default function HandoverSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const { user } = useAuth();

  const [summary, setSummary] = useState<HandoverSummary | null>(null);
  const [project, setProject] = useState<any>(null);
  const [claims, setClaims] = useState<any[]>([]);
  const [gaps, setGaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [acknowledging, setAcknowledging] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Rehearsal State
  const [rehearsalState, setRehearsalState] = useState<"idle" | "loading" | "in_progress" | "evaluating" | "completed" | "unavailable">("idle");
  const [questions, setQuestions] = useState<RehearsalQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [rehearsalAnswers, setRehearsalAnswers] = useState<Record<string, string>>({});
  const [attemptId, setAttemptId] = useState<string>("");
  const [rehearsalResult, setRehearsalResult] = useState<RehearsalResult | null>(null);
  const [submittingAnswers, setSubmittingAnswers] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const questionHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // Approver Queue State
  const [weakQueue, setWeakQueue] = useState<WeakTopicItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);

  const showToast = useCallback((type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const fetchWeakQueue = useCallback(() => {
    setLoadingQueue(true);
    apiRequest<WeakTopicItem[]>(`/api/projects/${projectId}/handover/rehearsal/weak-queue`)
      .then((data) => setWeakQueue(data))
      .catch(() => setWeakQueue([]))
      .finally(() => setLoadingQueue(false));
  }, [projectId]);

  const fetchData = useCallback(() => {
    Promise.all([
      apiRequest<HandoverSummary>(`/api/projects/${projectId}/handover/summary`),
      apiRequest<any>(`/api/projects/${projectId}`),
      apiRequest<any[]>(`/api/projects/${projectId}/claims`).catch(() => []),
      apiRequest<any[]>(`/api/projects/${projectId}/gaps`).catch(() => []),
    ])
      .then(([summaryData, projectData, claimsData, gapsData]) => {
        setSummary(summaryData);
        setProject(projectData);
        setClaims(claimsData);
        setGaps(gapsData);
        const hasAcked = summaryData.acknowledgements.some((a) => a.user_id === user?.id);
        setAcknowledged(hasAcked);

        if (user?.role === "approver") {
          fetchWeakQueue();
        }
      })
      .catch((err) => showToast("error", `Failed to load handover details: ${err.message}`))
      .finally(() => setLoading(false));
  }, [projectId, user, fetchWeakQueue, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (rehearsalState === "in_progress") {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [rehearsalState]);

  const approvedClaimsCount = claims.filter((c) => c.review_status === "approved").length;
  const isIncoming = user?.role === "incoming";
  const rehearsalCompleted = rehearsalResult !== null || acknowledged;
  const canAcknowledge = !isIncoming || approvedClaimsCount === 0 || rehearsalCompleted;

  const storageKey = user?.id ? `baton_rehearsal_${user.id}_${projectId}` : null;

  // Restore mid-rehearsal state from sessionStorage on page load/refresh
  useEffect(() => {
    if (typeof window === "undefined" || !storageKey || !user?.id) return;
    try {
      const cached = sessionStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (
          parsed.userId === user.id &&
          parsed.projectId === projectId &&
          parsed.questions?.length > 0 &&
          parsed.attemptId
        ) {
          setQuestions(parsed.questions);
          setAttemptId(parsed.attemptId);
          setRehearsalAnswers(parsed.answers || {});
          setCurrentQIndex(parsed.currentIndex || 0);
          setElapsedSeconds(parsed.elapsedSeconds || 0);
          setRehearsalState("in_progress");
        } else {
          sessionStorage.removeItem(storageKey);
        }
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, [storageKey, user?.id, projectId]);

  const handleStartRehearsal = async () => {
    setRehearsalState("loading");
    setElapsedSeconds(0);
    try {
      const res = await apiRequest<{
        attempt_id: string;
        questions: RehearsalQuestion[];
        status: string;
        message?: string;
      }>(`/api/projects/${projectId}/handover/rehearsal/generate`, {
        method: "POST",
      });

      if (res.status === "unavailable_no_claims" || res.questions.length === 0) {
        setRehearsalState("unavailable");
        showToast("error", res.message || "No approved claims available to generate scenarios.");
        return;
      }

      setQuestions(res.questions);
      setAttemptId(res.attempt_id);
      setCurrentQIndex(0);
      setRehearsalAnswers({});
      setRehearsalState("in_progress");
      if (storageKey && user?.id) {
        try {
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({
              userId: user.id,
              projectId,
              attemptId: res.attempt_id,
              questions: res.questions,
              answers: {},
              currentIndex: 0,
              elapsedSeconds: 0,
            })
          );
        } catch {}
      }
    } catch (err: any) {
      setRehearsalState("idle");
      showToast("error", `Failed to generate rehearsal: ${err.message}`);
    }
  };

  const handleAnswerChange = (val: string) => {
    const qid = questions[currentQIndex]?.id;
    if (qid) {
      setRehearsalAnswers((prev) => {
        const next = { ...prev, [qid]: val };
        if (storageKey) {
          try {
            const cached = sessionStorage.getItem(storageKey);
            if (cached) {
              const parsed = JSON.parse(cached);
              parsed.answers = next;
              parsed.currentIndex = currentQIndex;
              sessionStorage.setItem(storageKey, JSON.stringify(parsed));
            }
          } catch {}
        }
        return next;
      });
    }
  };

  const handleNextQuestion = () => {
    if (currentQIndex < questions.length - 1) {
      setCurrentQIndex((prev) => prev + 1);
      setTimeout(() => {
        questionHeadingRef.current?.focus();
      }, 50);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQIndex > 0) {
      setCurrentQIndex((prev) => prev - 1);
      setTimeout(() => {
        questionHeadingRef.current?.focus();
      }, 50);
    }
  };

  const handleSubmitRehearsal = async () => {
    if (submittingAnswers) return;
    setSubmittingAnswers(true);
    setRehearsalState("evaluating");
    try {
      const answerPayload = questions.map((q) => ({
        question_id: q.id,
        answer_text: rehearsalAnswers[q.id] || "",
      }));

      const res = await apiRequest<RehearsalResult>(
        `/api/projects/${projectId}/handover/rehearsal/grade`,
        {
          method: "POST",
          data: {
            attempt_id: attemptId,
            answers: answerPayload,
            time_taken_seconds: elapsedSeconds,
          },
        }
      );

      setRehearsalResult(res);
      setRehearsalState("completed");
      setSubmittingAnswers(false);
      if (storageKey) {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
      }
      setTimeout(() => {
        resultsHeadingRef.current?.focus();
      }, 100);
      showToast(
        res.passed ? "success" : "error",
        `Rehearsal completed: Score ${res.score}% (${res.correct_count}/${res.total_questions} passed).`
      );
      if (user?.role === "approver") {
        fetchWeakQueue();
      }
    } catch (err: any) {
      setSubmittingAnswers(false);
      setRehearsalState("in_progress");
      showToast("error", `Grading failed: ${err.message}`);
    }
  };

  const handleAcknowledge = async () => {
    setAcknowledging(true);
    try {
      await apiRequest(`/api/projects/${projectId}/handover/acknowledge`, {
        method: "POST",
        data: {
          notes: notes.trim(),
          score: rehearsalResult?.score,
          missed_topics: rehearsalResult?.weak_topics,
          time_taken_seconds: rehearsalResult?.time_taken_seconds || elapsedSeconds,
          rehearsal_attempt_id: attemptId || undefined,
        },
      });
      setAcknowledged(true);
      showToast("success", "Handover receipt formally acknowledged and recorded in immutable audit log.");
      fetchData();
    } catch (err: any) {
      showToast("error", `Acknowledgement failed: ${err.message}`);
    } finally {
      setAcknowledging(false);
    }
  };

  const handleDownloadMarkdown = () => {
    if (!project || !summary) return;

    const timestamp = new Date().toISOString().split("T")[0];
    const role = user?.role || "incoming";

    let md = `# Technical Knowledge Handover Report\n`;
    md += `**Project:** ${project.name}\n`;
    md += `**Description:** ${project.description || "N/A"}\n`;
    md += `**Generated for Role:** ${role.toUpperCase()}\n`;
    md += `**Date:** ${timestamp}\n\n`;

    md += `---\n\n`;
    md += `## 1. Readiness & Verification Summary\n\n`;
    md += `| Metric | Count |\n`;
    md += `| :--- | :--- |\n`;
    md += `| Total Sources Ingested | ${summary.total_sources} |\n`;
    md += `| Verbatim Evidence Snippets | ${summary.total_snippets} |\n`;
    md += `| Total Visible Claims | ${summary.total_claims} |\n`;
    md += `| Verified Claims | ${summary.claims_by_status["Verified"] || 0} |\n`;
    md += `| Inferred Claims | ${summary.claims_by_status["Inferred"] || 0} |\n`;
    md += `| Conflicting Decisions | ${summary.claims_by_status["Conflicting"] || 0} |\n`;
    md += `| Missing Claims | ${summary.claims_by_status["Missing"] || 0} |\n`;
    md += `| Resolved Knowledge Gaps | ${summary.resolved_gaps} / ${summary.resolved_gaps + summary.pending_gaps} |\n\n`;

    if (rehearsalResult) {
      md += `## 2. Handover Rehearsal Verification\n\n`;
      md += `- **Rehearsal Score:** ${rehearsalResult.score}%\n`;
      md += `- **Status:** ${rehearsalResult.passed ? "PASSED (Qualified)" : "FLAGGED FOR REVIEW"}\n`;
      md += `- **Questions Answered:** ${rehearsalResult.correct_count} / ${rehearsalResult.total_questions}\n`;
      md += `- **Time Elapsed:** ${Math.floor(rehearsalResult.time_taken_seconds / 60)}m ${rehearsalResult.time_taken_seconds % 60}s\n`;
      if (rehearsalResult.weak_topics.length > 0) {
        md += `- **Flagged Review Topics:**\n`;
        rehearsalResult.weak_topics.forEach((t) => {
          md += `  - ${t}\n`;
        });
      }
      md += `\n`;
    }

    md += `## 3. Evidence-Backed Claims\n\n`;
    if (claims.length === 0) {
      md += `*No claims visible under ${role} clearance level.*\n\n`;
    } else {
      claims.forEach((c, idx) => {
        md += `### Claim ${idx + 1}: [${c.status.toUpperCase()}] ${c.category}\n`;
        md += `> ${c.claim_text}\n\n`;
        md += `- **Confidence:** ${(c.confidence * 100).toFixed(0)}%\n`;
        md += `- **Review Status:** ${c.review_status}\n`;
        if (c.citations && c.citations.length > 0) {
          md += `- **Citations:**\n`;
          c.citations.forEach((cit: any) => {
            md += `  - *"${cit.verbatim_quote || cit.quoted_text}"* (Snippet \`${cit.snippet_id.slice(0, 8)}\`)\n`;
          });
        }
        md += `\n`;
      });
    }

    md += `## 4. Knowledge Gap Resolutions\n\n`;
    if (gaps.length === 0) {
      md += `*No knowledge gaps recorded.*\n\n`;
    } else {
      gaps.forEach((g, idx) => {
        md += `### Gap ${idx + 1}: ${g.title}\n`;
        md += `**Category:** \`${g.gap_type}\`\n\n`;
        md += `${g.description}\n\n`;
        if (g.answer) {
          md += `**Departing Member Answer (Evidence Tag: *stated by departing member*):**\n`;
          md += `> ${g.answer}\n\n`;
        } else {
          md += `*Status: Unresolved*\n\n`;
        }
      });
    }

    md += `## 5. Formal Receipt Acknowledgements\n\n`;
    if (summary.acknowledgements.length === 0) {
      md += `*No formal acknowledgements signed yet.*\n\n`;
    } else {
      summary.acknowledgements.forEach((ack) => {
        md += `- **Acknowledged by User:** \`${ack.user_id}\`\n`;
        md += `  - **Timestamp:** ${new Date(ack.acknowledged_at).toUTCString()}\n`;
        if (ack.score !== undefined && ack.score !== null) {
          md += `  - **Rehearsal Score:** ${ack.score}%\n`;
        }
        if (ack.time_taken_seconds) {
          md += `  - **Rehearsal Time:** ${Math.floor(ack.time_taken_seconds / 60)}m ${ack.time_taken_seconds % 60}s\n`;
        }
        if (ack.notes) md += `  - **Notes:** ${ack.notes}\n`;
      });
    }

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `handover-report-${project.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${timestamp}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-96" />
        </main>
      </div>
    );
  }

  const currentQ = questions[currentQIndex];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Toast feedback banner */}
        {toastMessage && (
          <div
            role="alert"
            className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between transition-all ${
              toastMessage.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
            }`}
          >
            <span>{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-muted-foreground hover:text-foreground text-xs ml-4"
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header with Title and Export Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-amber-400 font-mono">Stage 4: Handover</span>
              <Badge variant="outline" className="text-[10px] uppercase font-mono border-amber-500/30 text-amber-400">
                {user?.role} clearance
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-foreground mt-1">
              Handover & Rehearsal Cockpit
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Evidence-backed verification, simulation rehearsal, and formal receipt acknowledgement.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleDownloadMarkdown}
              variant="outline"
              size="sm"
              className="text-xs border-border/60 hover:border-amber-400/50 hover:bg-amber-500/10"
              aria-label="Export Handover Report as Markdown"
            >
              <Download className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
              Export Report
            </Button>
            <Button
              onClick={() => window.print()}
              variant="outline"
              size="sm"
              className="text-xs border-border/60 hover:border-amber-400/50 hover:bg-amber-500/10"
              aria-label="Print Handover Report"
            >
              <Printer className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
              Print
            </Button>
          </div>
        </div>

        {/* Readiness Metric Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Card className="border border-border/60 bg-card/60 backdrop-blur-sm p-4">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">Sources & Evidence</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-foreground">{summary.total_sources}</span>
                <span className="text-xs text-muted-foreground">({summary.total_snippets} snippets)</span>
              </div>
            </Card>

            <Card className="border border-border/60 bg-card/60 backdrop-blur-sm p-4">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">Visible Claims</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-foreground">{summary.total_claims}</span>
                <span className="text-xs text-emerald-400 font-mono">
                  {summary.claims_by_status["Verified"] || 0} verified
                </span>
              </div>
            </Card>

            <Card className="border border-border/60 bg-card/60 backdrop-blur-sm p-4">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">Approved Claims</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-amber-400">{approvedClaimsCount}</span>
                <span className="text-xs text-muted-foreground">of {claims.length} total</span>
              </div>
            </Card>

            <Card className="border border-border/60 bg-card/60 backdrop-blur-sm p-4">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">Gap Resolution</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-foreground">{summary.resolved_gaps}</span>
                <span className="text-xs text-muted-foreground">/ {summary.resolved_gaps + summary.pending_gaps} resolved</span>
              </div>
            </Card>
          </div>
        )}

        {/* IMPROVEMENT 1: HANDOVER REHEARSAL SECTION */}
        <section aria-labelledby="rehearsal-heading" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 id="rehearsal-heading" className="text-lg font-serif font-bold text-foreground flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-400" />
                  Handover Scenario Rehearsal
                </h2>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-mono ${
                    rehearsalCompleted
                      ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                      : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                  }`}
                >
                  {rehearsalCompleted ? "Completed" : "Required Before Signing"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Answer practical scenario questions generated solely from approved claims you have permission to view.
              </p>
            </div>

            {rehearsalState === "idle" && !rehearsalCompleted && (
              <Button
                onClick={handleStartRehearsal}
                size="sm"
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Start Scenario Rehearsal
              </Button>
            )}

            {rehearsalCompleted && rehearsalState !== "in_progress" && (
              <Button
                onClick={handleStartRehearsal}
                variant="outline"
                size="sm"
                className="text-xs border-border/60 hover:border-amber-400/50"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
                Retake Rehearsal
              </Button>
            )}
          </div>

          {/* Rehearsal Loading State */}
          {rehearsalState === "loading" && (
            <Card className="border border-border/60 bg-card/60 p-8 text-center space-y-3">
              <div className="animate-spin h-8 w-8 border-2 border-amber-400 border-t-transparent rounded-full mx-auto" />
              <p className="text-sm font-medium text-foreground">
                Synthesizing realistic scenarios from approved claims...
              </p>
              <p className="text-xs text-muted-foreground">
                Analyzing verified citations to build operational questions.
              </p>
            </Card>
          )}

          {/* Rehearsal Evaluating State */}
          {rehearsalState === "evaluating" && (
            <Card className="border border-border/60 bg-card/60 p-8 text-center space-y-3">
              <div className="animate-spin h-8 w-8 border-2 border-amber-400 border-t-transparent rounded-full mx-auto" />
              <p className="text-sm font-medium text-foreground">
                Grading answers against approved claims and citations...
              </p>
              <p className="text-xs text-muted-foreground">
                Evaluating key concepts and generating actionable feedback.
              </p>
            </Card>
          )}

          {/* Rehearsal In-Progress Wizard */}
          {rehearsalState === "in_progress" && currentQ && (
            <Card className="border border-amber-500/30 bg-card/80 backdrop-blur-sm overflow-hidden">
              <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-amber-400">
                    Question {currentQIndex + 1} of {questions.length}
                  </span>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono border-amber-500/30 text-amber-300">
                    {currentQ.category}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 font-mono text-muted-foreground" aria-label={`Elapsed time: ${formatTime(elapsedSeconds)}`}>
                  <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span aria-hidden="true">Time: {formatTime(elapsedSeconds)}</span>
                  <span role="status" aria-live="polite" className="sr-only">
                    {elapsedSeconds > 0 && elapsedSeconds % 30 === 0
                      ? `${Math.floor(elapsedSeconds / 60)} minutes ${elapsedSeconds % 60} seconds elapsed`
                      : null}
                  </span>
                </div>
              </div>

              <CardContent className="p-6 space-y-5">
                {/* Progress Bar */}
                <div className="w-full bg-muted/40 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-400 h-full transition-all duration-300"
                    style={{ width: `${((currentQIndex + 1) / questions.length) * 100}%` }}
                  />
                </div>

                {/* Scenario text */}
                <div className="space-y-2">
                  <h3
                    ref={questionHeadingRef}
                    tabIndex={-1}
                    className="text-sm sm:text-base font-semibold text-foreground leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-1"
                  >
                    {currentQ.scenario}
                  </h3>
                  {currentQ.guidance && (
                    <div className="p-3 rounded-md bg-muted/30 border border-border/40 text-xs text-muted-foreground flex items-start gap-2">
                      <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <span>{currentQ.guidance}</span>
                    </div>
                  )}
                </div>

                {/* Answer Textarea */}
                <div className="space-y-1.5">
                  <label htmlFor="rehearsal-answer-input" className="text-xs font-medium text-muted-foreground">
                    Your Operational Response (explain concrete actions, constraints, or contacts):
                  </label>
                  <textarea
                    id="rehearsal-answer-input"
                    rows={4}
                    placeholder="Type your response based on the handover documentation..."
                    value={rehearsalAnswers[currentQ.id] || ""}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    className="w-full text-xs p-3 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>

                {/* Navigation and Submission Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <Button
                    onClick={handlePrevQuestion}
                    disabled={currentQIndex === 0}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                    Previous
                  </Button>

                  <div className="flex items-center gap-2">
                    {currentQIndex < questions.length - 1 ? (
                      <Button
                        onClick={handleNextQuestion}
                        size="sm"
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs"
                      >
                        Next
                        <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSubmitRehearsal}
                        disabled={submittingAnswers}
                        size="sm"
                        className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                      >
                        {submittingAnswers ? (
                          <>
                            <div className="animate-spin h-3.5 w-3.5 border-2 border-slate-950 border-t-transparent rounded-full mr-1.5" />
                            Evaluating Answers...
                          </>
                        ) : (
                          <>
                            <SendHorizontal className="h-3.5 w-3.5 mr-1.5" />
                            Submit Answers for Evaluation
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rehearsal Results Card */}
          {rehearsalResult && rehearsalState !== "in_progress" && (
            <Card
              role="status"
              aria-live="polite"
              className="border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden"
            >
              <CardHeader className="p-6 pb-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      Rehearsal Evaluation Summary
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono ${
                        rehearsalResult.passed
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                          : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                      }`}
                    >
                      {rehearsalResult.passed ? "Qualified / Passed" : "Action Required"}
                    </Badge>
                  </div>
                  <CardTitle
                    ref={resultsHeadingRef}
                    tabIndex={-1}
                    className="text-xl font-serif font-bold text-foreground mt-1 flex items-center gap-3 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-1"
                  >
                    Overall Score: {rehearsalResult.score}%
                    <span className="text-xs font-normal text-muted-foreground font-mono">
                      ({rehearsalResult.correct_count} of {rehearsalResult.total_questions} questions mastered in{" "}
                      {formatTime(rehearsalResult.time_taken_seconds)})
                    </span>
                  </CardTitle>
                </div>

                <div className="text-right">
                  <Button
                    onClick={handleStartRehearsal}
                    variant="outline"
                    size="sm"
                    className="text-xs border-border/60 hover:border-amber-400/50"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1 text-amber-400" />
                    Try Again
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-4">
                {/* Missed / Flagged Topics */}
                {rehearsalResult.weak_topics.length > 0 && (
                  <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                      <span>Topics Requiring Review (Sent to Approver's Queue):</span>
                    </div>
                    <ul className="list-disc list-inside text-xs text-amber-200/90 space-y-1 pl-2">
                      {rehearsalResult.weak_topics.map((t, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Per-Question Breakdown */}
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Detailed Answers & Feedback
                  </span>
                  <div className="space-y-2.5">
                    {rehearsalResult.grades.map((g, idx) => (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                          g.passed
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-amber-500/30 bg-amber-500/5"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            {g.passed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            )}
                            Question {idx + 1}: {g.topic}
                          </span>
                          <span
                            className={`font-mono text-[11px] font-bold ${
                              g.passed ? "text-emerald-400" : "text-amber-400"
                            }`}
                          >
                            {(g.score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed pl-5">{g.feedback}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Approver View: Weak Topics Queue */}
          {user?.role === "approver" && (
            <Card className="border border-border/60 bg-card/60 backdrop-blur-sm">
              <CardHeader className="p-4 sm:p-6 pb-2">
                <CardTitle className="text-base font-serif font-bold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-amber-400" />
                    Incoming Engineers: Not Yet Understood Queue
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono border-amber-500/30 text-amber-400">
                    {weakQueue.length} flagged items
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-2">
                {loadingQueue ? (
                  <Skeleton className="h-20" />
                ) : weakQueue.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    No weak topics recorded. Incoming members have either mastered all tested claims or haven't attempted rehearsals yet.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {weakQueue.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg border border-border/40 bg-muted/20 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            {item.topic}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {new Date(item.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-muted-foreground italic pl-5">
                          "{item.question_scenario.slice(0, 140)}..."
                        </p>
                        <div className="pl-5 text-[11px] text-amber-400/90 font-mono flex items-center gap-2">
                          <span>Engineer: {item.user_name || "Incoming Member"}</span>
                          {item.submitted_answer && (
                            <span className="text-muted-foreground truncate">
                              • Answer: "{item.submitted_answer.slice(0, 60)}..."
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </section>

        {/* Visibility Audit Note */}
        <div className="rounded-lg border border-border/60 p-4 bg-muted/20 text-xs leading-relaxed space-y-1">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-amber-400" />
            Row-Level & Evidence Visibility Policy:
          </p>
          <p className="text-muted-foreground">
            As a <strong className="text-foreground">{user?.role}</strong>, you see only the claims where ALL cited evidence snippets fall within your clearance level.
            Restricted financial data and contractor logs are filtered out unless viewed by an authorized approver.
          </p>
        </div>

        {/* Formal Acknowledgement Card */}
        <Card className="border border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="p-6 pb-3">
            <CardTitle className="text-base font-serif font-bold flex items-center gap-2 text-foreground">
              <FileCheck2 className="h-5 w-5 text-amber-400" />
              Receipt of Handover Acknowledgement
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2 space-y-4">
            {acknowledged ? (
              <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold text-emerald-300">
                    Handover Receipt Formally Acknowledged
                  </p>
                  <p className="text-emerald-400/90">
                    You have verified and recorded receipt of this technical handover. An immutable audit record has been stored.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  As the incoming engineer or designated recipient, acknowledge that you have reviewed the evidence-backed claims, completed scenario rehearsal, and verified the departing member's stated answers.
                </p>

                {!canAcknowledge && (
                  <div className="p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                    <span>
                      Rehearsal required: Complete the scenario rehearsal above before formal acknowledgement.
                    </span>
                  </div>
                )}

                <div className="space-y-1">
                  <label htmlFor="handover-notes" className="text-xs font-medium text-muted-foreground">
                    Receipt Notes / Transition Comments (Optional)
                  </label>
                  <textarea
                    id="handover-notes"
                    aria-label="Receipt Notes or Transition Comments"
                    rows={2}
                    placeholder="e.g. Completed rehearsal with 85% score, reviewed ZeroMQ transition plan."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <Button
                  onClick={handleAcknowledge}
                  disabled={acknowledging || !canAcknowledge}
                  size="sm"
                  className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
                >
                  <UserCheck className="h-4 w-4 mr-1.5" />
                  {acknowledging ? "Recording Acknowledgement..." : "Acknowledge Receipt of Handover"}
                </Button>
              </div>
            )}

            {summary && summary.acknowledgements.length > 0 && (
              <div className="pt-4 border-t border-border/40 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Audit Log of Acknowledgements ({summary.acknowledgements.length})
                </span>
                <div className="space-y-2">
                  {summary.acknowledgements.map((a) => (
                    <div
                      key={a.id}
                      className="p-2.5 rounded-md border border-border/40 bg-muted/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span className="font-mono text-muted-foreground">User {a.user_id.slice(0, 8)}...</span>
                        {a.score !== undefined && a.score !== null && (
                          <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400">
                            Score: {a.score}%
                          </Badge>
                        )}
                        {a.notes && <span className="text-foreground italic truncate">"{a.notes}"</span>}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1 shrink-0">
                        <Clock className="h-3 w-3" />
                        {new Date(a.acknowledged_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
