"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api";
import { Navbar } from "@/components/navbar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Cell
} from "recharts";
import {
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  ChevronDown,
  FileText,
  User,
  Clock,
  ExternalLink,
  Layers,
  HelpCircle,
  X
} from "lucide-react";

interface RadarArea {
  id: string;
  name: string;
  rank: number;
  score: number;
  severity: "Critical" | "Elevated" | "Moderate";
  breakdown: {
    owner_concentration: { score: number; max: number; explanation: string };
    recurrence: { score: number; max: number; explanation: string };
    time_to_deadline: { score: number; max: number; explanation: string };
    unresolved_status: { score: number; max: number; explanation: string };
  };
  evidence: {
    snippet_id: string;
    location: string;
    author: string;
    content: string;
  }[];
  claims_count: number;
  gaps_count: number;
}

export default function BusFactorRadarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const { user } = useAuth();

  const [radarData, setRadarData] = useState<RadarArea[]>([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(null);
  const [activeEvidenceModal, setActiveEvidenceModal] = useState<RadarArea | null>(null);

  useEffect(() => {
    Promise.all([
      apiRequest<RadarArea[]>(`/api/projects/${projectId}/radar`),
      apiRequest<any>(`/api/projects/${projectId}`)
    ])
      .then(([radar, proj]) => {
        setRadarData(radar);
        setProject(proj);
        if (radar.length > 0) {
          setExpandedAreaId(radar[0].id);
        }
      })
      .catch((err) => {
        console.error("Failed to load radar data:", err);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  // Chart data format
  const chartData = radarData.map((a) => ({
    subject: a.name.split("&")[0].trim(),
    score: a.score,
    fullMark: 100,
  }));

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "Critical":
        return <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] uppercase font-mono">Critical Risk</Badge>;
      case "Elevated":
        return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] uppercase font-mono">Elevated</Badge>;
      default:
        return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] uppercase font-mono">Moderate</Badge>;
    }
  };

  const getSeverityColor = (score: number) => {
    if (score >= 70) return "#f43f5e"; // rose-500
    if (score >= 45) return "#f59e0b"; // amber-500
    return "#10b981"; // emerald-500
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar projectId={projectId} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-amber-600 dark:text-amber-400 font-mono">Knowledge Topology</span>
              <Badge variant="outline" className="text-[10px] uppercase font-mono border-amber-500/30 text-amber-600 dark:text-amber-400">
                {user?.role} clearance
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-foreground mt-1 flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              Bus-Factor Radar
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Identifies and ranks fragile single-owner areas, recurring failure traps, uncontacted dependencies, and deadline pressure.
            </p>
          </div>
        </div>

        {/* Visibility Audit Note */}
        <div className="rounded-lg border border-border/60 p-4 bg-muted/20 text-xs leading-relaxed space-y-1">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Clearance-Enforced Analysis:
          </p>
          <p className="text-muted-foreground">
            Radar fragility scores are calculated exclusively over evidence visible to your role (<strong className="text-foreground">{user?.role}</strong>).
            Restricted areas and private financial logs are filtered out at the row level without exposing titles, quotes, or risk scores.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Skeleton className="h-96 lg:col-span-6" />
            <Skeleton className="h-96 lg:col-span-6" />
          </div>
        ) : radarData.length === 0 ? (
          <Card className="border border-border/60 bg-card/60 p-12 text-center space-y-3">
            <p className="text-sm font-semibold text-foreground">No Fragile Areas Detected</p>
            <p className="text-xs text-muted-foreground">
              Ingest technical sources or run the claims extraction pipeline to generate topology risks.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Visual Chart Card */}
            <Card className="lg:col-span-5 border border-border/60 bg-card/60 backdrop-blur-sm p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-serif font-bold text-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Fragility Landscape
                </CardTitle>
                <span className="text-[11px] font-mono text-muted-foreground">0 = Safe | 100 = Fragile</span>
              </div>

              {/* Radar Chart */}
              <div className="h-[280px] w-full" aria-label="Bus Factor Radar Visualization">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 500 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="hsl(var(--border))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                    <Radar
                      name="Fragility Score"
                      dataKey="score"
                      stroke="#f59e0b"
                      fill="#f59e0b"
                      fillOpacity={0.35}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Accessible Summary Table for screen readers */}
              <div className="sr-only">
                <table>
                  <caption>Bus Factor Fragility Rankings</caption>
                  <thead>
                    <tr>
                      <th>Area</th>
                      <th>Rank</th>
                      <th>Score</th>
                      <th>Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {radarData.map((a) => (
                      <tr key={a.id}>
                        <td>{a.name}</td>
                        <td>{a.rank}</td>
                        <td>{a.score}</td>
                        <td>{a.severity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-3 border-t border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
                <span>Top Risk Area:</span>
                <span className="font-bold text-foreground font-mono">{radarData[0]?.name}</span>
              </div>
            </Card>

            {/* Ranked List & Score Breakdown */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Ranked Fragile Areas ({radarData.length})
                </span>
                <span className="text-[11px] text-muted-foreground">Click to inspect formula breakdown</span>
              </div>

              {radarData.map((area) => {
                const isExpanded = expandedAreaId === area.id;
                return (
                  <Card
                    key={area.id}
                    className={`border transition-all duration-200 overflow-hidden ${
                      isExpanded
                        ? "border-amber-500/40 bg-card/90 shadow-md shadow-amber-500/5"
                        : "border-border/60 bg-card/60 hover:border-border"
                    }`}
                  >
                    {/* Header Row */}
                    <button
                      onClick={() => setExpandedAreaId(isExpanded ? null : area.id)}
                      className="w-full p-4 flex items-center justify-between text-left gap-3 focus:outline-none focus:ring-1 focus:ring-amber-400 rounded-t"
                      aria-expanded={isExpanded}
                    >
                      <div className="flex items-center gap-3">
                        <span className="h-7 w-7 rounded-md bg-muted/60 border border-border/60 flex items-center justify-center font-mono font-bold text-xs text-amber-600 dark:text-amber-400 shrink-0">
                          #{area.rank}
                        </span>
                        <div>
                          <h2 className="text-sm font-semibold text-foreground">{area.name}</h2>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                            <span>{area.evidence.length} cited evidence</span>
                            <span>•</span>
                            <span>{area.claims_count} claims</span>
                            {area.gaps_count > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-amber-600 dark:text-amber-400/90">{area.gaps_count} open gaps</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {getSeverityBadge(area.severity)}
                        <div className="text-right">
                          <span
                            className="font-mono text-base font-bold"
                            style={{ color: getSeverityColor(area.score) }}
                          >
                            {area.score}
                          </span>
                          <span className="text-[10px] text-muted-foreground block font-mono">/100</span>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Breakdown */}
                    {isExpanded && (
                      <div className="p-4 pt-1 border-t border-border/40 bg-muted/10 space-y-4 text-xs animate-in fade-in">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                          Transparent Fragility Score Breakdown (30% Owner Concentration + 30% Problem Recurrence + 20% Time to Deadline + 20% Unresolved Status):
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {/* Owner concentration */}
                          <div className="p-3 rounded-md border border-border/40 bg-background/50 space-y-1">
                            <div className="flex items-center justify-between font-semibold">
                              <span className="flex items-center gap-1.5 text-foreground">
                                <User className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                Owner Concentration
                              </span>
                              <span className="font-mono text-amber-600 dark:text-amber-400">
                                {area.breakdown.owner_concentration.score} / {area.breakdown.owner_concentration.max}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {area.breakdown.owner_concentration.explanation}
                            </p>
                          </div>

                          {/* Recurrence */}
                          <div className="p-3 rounded-md border border-border/40 bg-background/50 space-y-1">
                            <div className="flex items-center justify-between font-semibold">
                              <span className="flex items-center gap-1.5 text-foreground">
                                <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                                Problem Recurrence
                              </span>
                              <span className="font-mono text-rose-600 dark:text-rose-400">
                                {area.breakdown.recurrence.score} / {area.breakdown.recurrence.max}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {area.breakdown.recurrence.explanation}
                            </p>
                          </div>

                          {/* Time to deadline */}
                          <div className="p-3 rounded-md border border-border/40 bg-background/50 space-y-1">
                            <div className="flex items-center justify-between font-semibold">
                              <span className="flex items-center gap-1.5 text-foreground">
                                <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                Time to Deadline
                              </span>
                              <span className="font-mono text-blue-600 dark:text-blue-400">
                                {area.breakdown.time_to_deadline.score} / {area.breakdown.time_to_deadline.max}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {area.breakdown.time_to_deadline.explanation}
                            </p>
                          </div>

                          {/* Unresolved Status */}
                          <div className="p-3 rounded-md border border-border/40 bg-background/50 space-y-1">
                            <div className="flex items-center justify-between font-semibold">
                              <span className="flex items-center gap-1.5 text-foreground">
                                <HelpCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                Unresolved & Conflicts
                              </span>
                              <span className="font-mono text-amber-600 dark:text-amber-400">
                                {area.breakdown.unresolved_status.score} / {area.breakdown.unresolved_status.max}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {area.breakdown.unresolved_status.explanation}
                            </p>
                          </div>
                        </div>

                        {/* Evidence Action */}
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-[11px] text-muted-foreground">
                            {area.evidence.length} verbatim evidence snippets backing this score.
                          </span>
                          <Button
                            onClick={() => setActiveEvidenceModal(area)}
                            variant="outline"
                            size="sm"
                            className="text-xs border-border/60 hover:border-amber-400/50"
                          >
                            <FileText className="h-3.5 w-3.5 mr-1.5 text-amber-600 dark:text-amber-400" />
                            Drill Down into Evidence
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Evidence Drill-down Modal / Drawer */}
        {activeEvidenceModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="evidence-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in"
          >
            <div
              className="relative w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl space-y-4 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div>
                  <h3 id="evidence-modal-title" className="text-base font-serif font-bold text-foreground">
                    Evidence Drill-Down: {activeEvidenceModal.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Verbatim quotes backing the {activeEvidenceModal.score}/100 fragility rating.
                  </p>
                </div>
                <button
                  onClick={() => setActiveEvidenceModal(null)}
                  className="rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
                {activeEvidenceModal.evidence.length === 0 ? (
                  <p className="text-muted-foreground italic py-4 text-center">No snippets available.</p>
                ) : (
                  activeEvidenceModal.evidence.map((snippet, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-lg border border-border/50 bg-muted/20 space-y-2"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                        <span className="flex items-center gap-1.5 text-foreground font-semibold">
                          <FileText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          Snippet: {snippet.snippet_id.slice(0, 8)}...
                        </span>
                        <span>Location: {snippet.location || "source"}</span>
                      </div>
                      <blockquote className="border-l-2 border-amber-400 pl-3 py-0.5 text-foreground italic leading-relaxed">
                        "{snippet.content}"
                      </blockquote>
                      <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                        <User className="h-3 w-3 text-muted-foreground" />
                        Author: {snippet.author}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-3 border-t border-border/40 flex justify-end">
                <Button
                  onClick={() => setActiveEvidenceModal(null)}
                  size="sm"
                  variant="outline"
                  className="text-xs"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
