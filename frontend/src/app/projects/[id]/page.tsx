"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Users,
  Sparkles,
  FileCheck2,
} from "lucide-react";

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const router = useRouter();
  const { user } = useAuth();

  const [project, setProject] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiRequest(`/api/projects/${projectId}`),
      apiRequest(`/api/projects/${projectId}/handover/summary`),
    ])
      .then(([projData, summaryData]) => {
        setProject(projData);
        setSummary(summaryData);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar projectId={projectId} />
        <div className="container mx-auto p-8 space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-4 gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar projectId={projectId} />
      <main className="container mx-auto px-4 sm:px-8 py-8 flex-1 space-y-8">
        {/* Project Header */}
        <div className="border-b border-border/40 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {project?.name}
              </h1>
              <Badge variant="outline" className="border-amber-500/30 text-amber-400 font-mono text-[10px]">
                Active Constellation
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {project?.description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline" className="text-xs border-border/60">
              <Link href={`/projects/${projectId}/members`}>
                <Users className="h-3.5 w-3.5 mr-1 text-amber-400" />
                Team & Invites
              </Link>
            </Button>
            <Button asChild size="sm" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs">
              <Link href={`/projects/${projectId}/handover`}>
                <FileCheck2 className="h-3.5 w-3.5 mr-1" />
                Handover Summary
              </Link>
            </Button>
          </div>
        </div>

        {/* Readiness Metric Badges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 border-border/60 bg-card/60 backdrop-blur-sm">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Sources</span>
            <p className="text-2xl font-bold mt-1 text-foreground font-mono">{summary?.total_sources || 0}</p>
          </Card>
          <Card className="p-4 border-border/60 bg-card/60 backdrop-blur-sm">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Evidence Snippets</span>
            <p className="text-2xl font-bold mt-1 text-foreground font-mono">{summary?.total_snippets || 0}</p>
          </Card>
          <Card className="p-4 border-border/60 bg-card/60 backdrop-blur-sm">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Extracted Claims</span>
            <p className="text-2xl font-bold mt-1 text-foreground font-mono">{summary?.total_claims || 0}</p>
          </Card>
          <Card className="p-4 border-border/60 bg-card/60 backdrop-blur-sm">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Pending Gaps</span>
            <p className="text-2xl font-bold mt-1 text-amber-400 font-mono">
              {summary?.pending_gaps || 0}
            </p>
          </Card>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <Card className="border-border/60 bg-card/60 hover:border-amber-400/40 transition-colors">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-serif font-bold flex items-center gap-2 text-foreground">
                <FileText className="h-4 w-4 text-amber-400" />
                Upload & Ingest Sources
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Add markdown, chat exports, PDFs, or CSVs with explicit role access levels (public, team, restricted).
              </p>
              <Button asChild size="sm" variant="outline" className="w-full text-xs border-border/60">
                <Link href={`/projects/${projectId}/sources`}>Manage Sources</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 hover:border-amber-400/40 transition-colors">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-serif font-bold flex items-center gap-2 text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Claims & Review Panel
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Review claims, inspect verbatim cited snippets, detect contradictions, and approve with revision history.
              </p>
              <Button asChild size="sm" className="w-full text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
                <Link href={`/projects/${projectId}/claims`}>Open Review Screen</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 hover:border-amber-400/40 transition-colors">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-serif font-bold flex items-center gap-2 text-foreground">
                <AlertTriangle className="h-4 w-4 text-rose-400" />
                Knowledge Gap Checklist
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Identify unreasoned decisions, orphan tasks, and unassigned dependencies. Answer to record evidence.
              </p>
              <Button asChild size="sm" variant="outline" className="w-full text-xs border-border/60">
                <Link href={`/projects/${projectId}/gaps`}>Resolve Gaps</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
