"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  ShieldCheck,
  LogOut,
  Sparkles,
  ChevronDown,
  LayoutDashboard,
  Users,
  FileText,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  FolderOpen,
} from "lucide-react";

interface ProjectOption {
  id: string;
  name: string;
}

export function Navbar({ projectId }: { projectId?: string }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectOption | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    if (user) {
      apiRequest<ProjectOption[]>("/api/projects")
        .then((data) => {
          setProjects(data);
          if (projectId) {
            const found = data.find((p) => p.id === projectId);
            if (found) setCurrentProject(found);
          }
        })
        .catch(() => {});
    }
  }, [user, projectId]);

  const roleColors: Record<string, string> = {
    approver: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
    incoming: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
    restricted: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/90 backdrop-blur-md">
      <div className="container mx-auto flex h-14 items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <span className="h-6 w-6 rounded-md bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-bold shadow-sm shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="font-serif font-bold text-lg tracking-tight text-foreground">
              Baton
            </span>
          </Link>

          {/* Project Switcher */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setSwitcherOpen(!switcherOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-border/60 bg-muted/40 hover:bg-muted text-foreground transition-colors"
                title="Switch project"
              >
                <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
                <span className="max-w-[130px] truncate">
                  {currentProject ? currentProject.name : "All Projects"}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground ml-0.5" />
              </button>

              {switcherOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setSwitcherOpen(false)}
                  />
                  <div className="absolute left-0 mt-1.5 w-56 rounded-md border border-border bg-popover p-1 shadow-lg z-50 animate-in fade-in zoom-in-95 text-xs">
                    <Link
                      href="/dashboard"
                      onClick={() => setSwitcherOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-muted text-foreground"
                    >
                      <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Projects Dashboard</span>
                    </Link>
                    <div className="my-1 border-t border-border/50" />
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Your Projects
                    </div>
                    {projects.map((p) => (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        onClick={() => {
                          setCurrentProject(p);
                          setSwitcherOpen(false);
                        }}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-muted transition-colors ${
                          p.id === projectId ? "font-semibold text-amber-400 bg-muted/50" : "text-foreground"
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        {p.id === projectId && (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        )}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Project Navigation Links */}
          {projectId && (
            <nav className="hidden lg:flex items-center gap-3 text-xs font-medium">
              <Link
                href={`/projects/${projectId}`}
                className={`transition-colors hover:text-foreground ${
                  pathname === `/projects/${projectId}` ? "text-amber-400 font-semibold" : "text-muted-foreground"
                }`}
              >
                Overview
              </Link>
              <Link
                href={`/projects/${projectId}/sources`}
                className={`transition-colors hover:text-foreground flex items-center gap-1 ${
                  pathname.includes("/sources") ? "text-amber-400 font-semibold" : "text-muted-foreground"
                }`}
              >
                <FileText className="h-3 w-3" />
                Sources
              </Link>
              <Link
                href={`/projects/${projectId}/claims`}
                className={`transition-colors hover:text-foreground flex items-center gap-1 ${
                  pathname.includes("/claims") ? "text-amber-400 font-semibold" : "text-muted-foreground"
                }`}
              >
                <CheckCircle2 className="h-3 w-3" />
                Claims
              </Link>
              <Link
                href={`/projects/${projectId}/gaps`}
                className={`transition-colors hover:text-foreground flex items-center gap-1 ${
                  pathname.includes("/gaps") ? "text-amber-400 font-semibold" : "text-muted-foreground"
                }`}
              >
                <AlertTriangle className="h-3 w-3" />
                Gaps
              </Link>
              <Link
                href={`/projects/${projectId}/handover`}
                className={`transition-colors hover:text-foreground flex items-center gap-1 ${
                  pathname.includes("/handover") ? "text-amber-400 font-semibold" : "text-muted-foreground"
                }`}
              >
                <FileCheck2 className="h-3 w-3" />
                Handover
              </Link>
              <Link
                href={`/projects/${projectId}/members`}
                className={`transition-colors hover:text-foreground flex items-center gap-1 ${
                  pathname.includes("/members") ? "text-amber-400 font-semibold" : "text-muted-foreground"
                }`}
              >
                <Users className="h-3 w-3" />
                Team & Invites
              </Link>
            </nav>
          )}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2.5">
          {user && (
            <div className="flex items-center gap-2">
              {user.is_demo && (
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                  Demo
                </Badge>
              )}
              <span className="hidden md:inline-block text-xs text-muted-foreground font-mono">
                {user.email}
              </span>
              <Badge variant="outline" className={`capitalize text-[11px] font-medium ${roleColors[user.role] || ""}`}>
                {user.role}
              </Badge>
              {user.mfa_enabled && (
                <span title="MFA Enabled">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                </span>
              )}
            </div>
          )}

          <ThemeToggle />

          {user && (
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Logout"
              aria-label="Logout"
              className="text-muted-foreground hover:text-destructive h-8 w-8"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
