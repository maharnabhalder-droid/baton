"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Ticket, FolderGit2, ArrowRight, Sparkles, Shield, UserCheck, AlertCircle } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ProgressConstellation } from "@/components/progress-constellation";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  // New Project Dialog
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Join Project Dialog
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const fetchProjects = () => {
    apiRequest<ProjectItem[]>("/api/projects")
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    setCreating(true);
    try {
      const created = await apiRequest<ProjectItem>("/api/projects", {
        method: "POST",
        data: { name: projectName, description: projectDesc },
      });
      setNewProjectOpen(false);
      setProjectName("");
      setProjectDesc("");
      router.push(`/projects/${created.id}/claims`);
    } catch (err: any) {
      alert(`Failed to create project: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await apiRequest<ProjectItem>("/api/projects/join", {
        method: "POST",
        data: { code: inviteCode.trim() },
      });
      setJoinOpen(false);
      setInviteCode("");
      router.push(`/projects/${res.id}/claims`);
    } catch (err: any) {
      setJoinError(err.message || "Invalid or expired invite code.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="container mx-auto px-4 sm:px-8 py-8 flex-1 space-y-8">
        {/* Welcome Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-6">
          <div className="space-y-1">
            <h1 className="font-serif text-3xl font-bold tracking-tight">
              Welcome, {user?.name || "Engineer"}
            </h1>
            <p className="text-xs text-muted-foreground">
              Knowledge handover repositories & constellation readiness.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button size="sm" variant="outline" onClick={() => setJoinOpen(true)} className="text-xs border-primary/30">
              <Ticket className="h-3.5 w-3.5 mr-1 text-primary" /> Join with Invite Code
            </Button>
            <Button size="sm" onClick={() => setNewProjectOpen(true)} className="text-xs font-semibold">
              <Plus className="h-3.5 w-3.5 mr-1" /> New Project
            </Button>
          </div>
        </div>

        {/* Constellation Aggregate Progress */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <ProgressConstellation verified={8} total={10} conflicts={2} />
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-bold">Your Repositories</h2>
              <span className="text-xs font-mono text-muted-foreground">{projects.length} Active</span>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-36 w-full" />
              </div>
            ) : projects.length === 0 ? (
              <Card className="p-8 text-center border-dashed bg-card/40 space-y-3">
                <FolderGit2 className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">No Projects Joined Yet</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Create a new repository as Approver or use an invite code provided by your departing lead.
                  </p>
                </div>
                <div className="pt-2 flex justify-center gap-2">
                  <Button size="sm" onClick={() => setNewProjectOpen(true)} className="text-xs">
                    Create Project
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setJoinOpen(true)} className="text-xs">
                    Enter Invite Code
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {projects.map((p) => (
                  <Card key={p.id} className="hover:border-primary/50 transition-colors flex flex-col justify-between">
                    <CardHeader className="p-5 pb-3 space-y-2">
                      <div className="flex items-center gap-2 text-primary">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          Repository
                        </span>
                      </div>
                      <CardTitle className="font-serif text-base font-bold leading-tight">{p.name}</CardTitle>
                      <CardDescription className="text-xs line-clamp-2 leading-relaxed">
                        {p.description || "No description provided."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 pt-0">
                      <Button asChild variant="outline" size="sm" className="w-full text-xs font-semibold">
                        <Link href={`/projects/${p.id}/claims`} className="flex items-center justify-center gap-1.5">
                          Enter Handover Workspace <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* New Project Dialog */}
      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg font-bold">New Handover Project</DialogTitle>
            <DialogDescription className="text-xs">
              As the project creator, you will automatically be assigned the <strong>Approver</strong> role.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateProject} className="space-y-3 pt-2">
            <div className="space-y-1">
              <label htmlFor="project-name" className="text-xs font-medium">Project Name</label>
              <input
                id="project-name"
                aria-label="Project Name"
                required
                placeholder="e.g. Telemetry Edge Cluster"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full text-sm p-2 rounded border bg-background text-foreground focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="project-desc" className="text-xs font-medium">Description</label>
              <textarea
                id="project-desc"
                aria-label="Project Description"
                rows={3}
                placeholder="High-level architecture, systems being transferred, and key responsibilities..."
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                className="w-full text-sm p-2 rounded border bg-background text-foreground focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setNewProjectOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={creating} className="font-semibold">
                {creating ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Join Project Dialog */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg font-bold flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />
              Join with Invite Code
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enter the invite code generated by your project's technical lead.
            </DialogDescription>
          </DialogHeader>

          {joinError && (
            <div className="p-3 rounded bg-destructive/10 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{joinError}</span>
            </div>
          )}

          <form onSubmit={handleJoinProject} className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Invite Token</label>
              <input
                required
                placeholder="e.g. inv_2dK8..."
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full text-sm font-mono p-2 rounded border bg-background text-foreground focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setJoinOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={joining} className="font-semibold">
                {joining ? "Joining..." : "Join Project"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

