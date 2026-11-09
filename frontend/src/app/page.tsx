"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, Shield, GitBranch, Layers, CheckCircle, Clock, BookOpen, UserCheck, ShieldAlert } from "lucide-react";
import { HeroConstellation } from "@/components/hero-constellation";
import { Reveal } from "@/components/reveal";
import { Counter } from "@/components/counter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function LandingPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const startDemo = async (role: "approver" | "incoming" | "restricted") => {
    setDemoLoading(true);
    try {
      const res = await apiRequest<{ project_id: string; message: string }>("/api/auth/demo", {
        method: "POST",
        data: { role },
      });
      await refreshUser();
      router.push(`/projects/${res.project_id}/claims`);
    } catch (err: any) {
      alert(`Demo creation failed: ${err.message}`);
    } finally {
      setDemoLoading(false);
      setDemoOpen(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top Navigation */}
      <header className="border-b border-border/40 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="block h-2.5 w-2.5 rounded-full bg-primary" />
            </div>
            <span className="font-serif text-xl tracking-tight font-bold">Baton</span>
          </Link>

          <nav className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link href="/login">Log in</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDemoOpen(true)} className="text-xs border-primary/40 hover:bg-primary/10">
              <Sparkles className="h-3 w-3 mr-1 text-primary" /> Try the demo
            </Button>
            <Button size="sm" asChild className="text-xs">
              <Link href="/register">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-24 overflow-hidden border-b border-border/40">
        <div className="container mx-auto px-4 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6 text-left">
              <Reveal direction="down">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium border border-primary/30 bg-primary/10 text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Evidence-Backed Knowledge Handover
                </span>
              </Reveal>

              <Reveal delay={0.1}>
                <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
                  Don't let knowledge walk out the door.
                </h1>
              </Reveal>

              <Reveal delay={0.2}>
                <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl">
                  Baton rebuilds your project's history as an evidence graph, asks the leaver only what the documents can't explain, and verifies the successor understood.
                </p>
              </Reveal>

              <Reveal delay={0.3}>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button asChild size="lg" className="text-sm font-semibold">
                    <Link href="/register">
                      Get started <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setDemoOpen(true)}
                    className="text-sm font-semibold border-primary/40 hover:bg-primary/10"
                  >
                    <Sparkles className="mr-1.5 h-4 w-4 text-primary" />
                    Try the demo
                  </Button>
                  <Button variant="ghost" size="lg" asChild className="text-sm text-muted-foreground">
                    <Link href="/login">Log in</Link>
                  </Button>
                </div>
              </Reveal>
            </div>

            <div className="lg:col-span-5">
              <Reveal delay={0.2} direction="none">
                <HeroConstellation />
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* The Problem Section */}
      <section className="py-20 border-b border-border/40 bg-card/30">
        <div className="container mx-auto px-4 sm:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto space-y-3 mb-16">
              <span className="text-xs font-mono uppercase tracking-widest text-primary">The Turnover Cliff</span>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold">Why Technical Handoffs Fail</h2>
              <p className="text-sm text-muted-foreground">
                Document dumps and exit wikis don't work. The facts stay trapped in departing minds until it's too late.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Reveal delay={0.1}>
              <div className="rounded-xl border border-border/60 bg-card p-8 space-y-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500" />
                <div className="text-5xl font-extrabold font-serif text-rose-500 tracking-tight">
                  <Counter end={65} suffix="%" />
                </div>
                <h3 className="text-lg font-bold">Projects Have a Truck Factor of ≤ 2</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  More than half of major software repositories rely entirely on one or two key contributors for core architectural memory.
                </p>
                <p className="text-[11px] font-mono text-muted-foreground/80 border-t pt-3">
                  Source: Avelino et al., <em>"A Novel Approach for Estimating Truck Factors"</em>, PeerJ Computer Science, 2016.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.2}>
              <div className="rounded-xl border border-border/60 bg-card p-8 space-y-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
                <div className="text-5xl font-extrabold font-serif text-amber-500 tracking-tight">
                  <Counter end={27} suffix="%" />
                </div>
                <h3 className="text-lg font-bold">Success Rate Following Developer Departure</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Only twenty-seven percent of codebases successfully regain their velocity and architectural stability after losing a core lead engineer.
                </p>
                <p className="text-[11px] font-mono text-muted-foreground/80 border-t pt-3">
                  Source: Coelho & Valente, <em>"Why Modern Open-Source Projects Fail"</em>, ACM/IEEE FSE, 2017.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* How it Works (6 Steps) */}
      <section className="py-20 border-b border-border/40">
        <div className="container mx-auto px-4 sm:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto space-y-3 mb-16">
              <span className="text-xs font-mono uppercase tracking-widest text-primary">Workflow</span>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold">How Baton Reconstructs Truth</h2>
              <p className="text-sm text-muted-foreground">
                From unorganized chat transcripts and markdown to an evidence-verified handover certificate.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Connect Sources",
                desc: "Ingest Markdown, RFCs, Slack logs, PDFs, and spreadsheets with granular public, team, or restricted labels.",
                icon: BookOpen,
              },
              {
                step: "02",
                title: "Reconstruct Snippets",
                desc: "Every source is parsed into timestamped snippet records preserving authors and exact line coordinates.",
                icon: Layers,
              },
              {
                step: "03",
                title: "Verbatim Claim Verification",
                desc: "AI extracts atomic claims. Every single claim must quote verbatim text that exists in the snippet, or it is purged.",
                icon: CheckCircle,
              },
              {
                step: "04",
                title: "Knowledge Gap Interview",
                desc: "Rule engines identify unreasoned choices and orphan tasks. The departing member answers, storing tagged evidence.",
                icon: UserCheck,
              },
              {
                step: "05",
                title: "Approver Review",
                desc: "Technical leads review and resolve contradictions with an immutable version history drawer and side panel.",
                icon: Shield,
              },
              {
                step: "06",
                title: "Handover Receipt",
                desc: "Successors view only evidence they have clearance for, verify understanding, and sign off the handover receipt.",
                icon: Sparkles,
              },
            ].map((s, idx) => (
              <Reveal key={s.step} delay={idx * 0.1}>
                <div className="p-6 rounded-xl border border-border/50 bg-card/60 space-y-3 h-full">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-primary">{s.step}</span>
                    <s.icon className="h-4 w-4 text-primary/70" />
                  </div>
                  <h3 className="font-serif text-lg font-bold">{s.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Four Feature Cards */}
      <section className="py-20 border-b border-border/40 bg-card/20">
        <div className="container mx-auto px-4 sm:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto space-y-3 mb-16">
              <span className="text-xs font-mono uppercase tracking-widest text-primary">Engineered For Rigor</span>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold">Four Pillars of Evidence Handover</h2>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Reveal delay={0.1}>
              <div className="p-8 rounded-xl border border-border/60 bg-card space-y-3">
                <span className="text-xs font-mono font-semibold text-emerald-400">01 &bull; Zero Hallucination</span>
                <h3 className="font-serif text-xl font-bold">Evidence Graph</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  No unbacked summaries. Every claim is an interactive star connected to verbatim text quotes in original documents. If a quote cannot be verified, it cannot enter the graph.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.2}>
              <div className="p-8 rounded-xl border border-border/60 bg-card space-y-3">
                <span className="text-xs font-mono font-semibold text-amber-400">02 &bull; Targeted Capture</span>
                <h3 className="font-serif text-xl font-bold">Gap Interview Engine</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Instead of forcing developers to write long exit wikis, plain Python rule engines detect decisions without rationale, orphan tasks, and uncontacted dependencies.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.3}>
              <div className="p-8 rounded-xl border border-border/60 bg-card space-y-3">
                <span className="text-xs font-mono font-semibold text-primary">03 &bull; Cryptographic Safety</span>
                <h3 className="font-serif text-xl font-bold">Permission-Aware Views</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  A claim is visible to an incoming engineer only if they possess permission to view every single cited snippet. Restricted financial sheets remain quarantined.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.4}>
              <div className="p-8 rounded-xl border border-border/60 bg-card space-y-3">
                <span className="text-xs font-mono font-semibold text-rose-400">04 &bull; Audit Trail</span>
                <h3 className="font-serif text-xl font-bold">Version History Drawer</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Every edit, status change, and approval is logged with who made it and when. Successors receive an indisputable certificate of handover with receipt acknowledgements.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 text-center">
        <div className="container mx-auto px-4 max-w-2xl space-y-6">
          <Reveal>
            <h2 className="font-serif text-4xl sm:text-5xl font-extrabold tracking-tight">
              Ready to pass the baton?
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-sm text-muted-foreground">
              Turn chaotic handoffs into a verified constellation of truth. Try the interactive Orbit Robotics demo in one click.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="flex items-center justify-center gap-4 pt-2">
              <Button size="lg" asChild className="font-semibold">
                <Link href="/register">Get started now</Link>
              </Button>
              <Button size="lg" variant="outline" onClick={() => setDemoOpen(true)} className="border-primary/40">
                <Sparkles className="h-4 w-4 mr-2 text-primary" /> Try the demo
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 bg-card/30">
        <div className="container mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="font-serif font-bold text-foreground">Baton</span> &bull; Evidence-backed knowledge handover
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="hover:text-foreground">Log in</Link>
            <Link href="/register" className="hover:text-foreground">Register</Link>
            <button onClick={() => setDemoOpen(true)} className="hover:text-foreground">Interactive Demo</button>
          </div>
        </div>
      </footer>

      {/* Demo Role Selector Dialog */}
      <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Try the Orbit Robotics Demo
            </DialogTitle>
            <DialogDescription className="text-xs">
              Choose which role you would like to test. An ephemeral sandbox session will be prepared immediately with the planted traps.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <button
              onClick={() => startDemo("approver")}
              disabled={demoLoading}
              className="w-full text-left p-3.5 rounded-lg border border-border/80 hover:border-primary/80 hover:bg-primary/5 transition-colors space-y-1 block"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-foreground">Approver (Departing Lead)</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-primary/20 text-primary">Full Access</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Can view all public, team, and restricted finance data; review and approve claims; run pipelines; and generate invite codes.
              </p>
            </button>

            <button
              onClick={() => startDemo("incoming")}
              disabled={demoLoading}
              className="w-full text-left p-3.5 rounded-lg border border-border/80 hover:border-primary/80 hover:bg-primary/5 transition-colors space-y-1 block"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-foreground">Incoming (Successor Engineer)</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">Team Scope</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Can view public and team claims; restricted financial sheets are automatically hidden; can formally acknowledge handover receipt.
              </p>
            </button>

            <button
              onClick={() => startDemo("restricted")}
              disabled={demoLoading}
              className="w-full text-left p-3.5 rounded-lg border border-border/80 hover:border-primary/80 hover:bg-primary/5 transition-colors space-y-1 block"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-foreground">Restricted Viewer (Contractor)</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-500/20 text-slate-400">Public Only</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Permitted to see only claims where 100% of the cited snippets are classified public. Team internals remain invisible.
              </p>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
