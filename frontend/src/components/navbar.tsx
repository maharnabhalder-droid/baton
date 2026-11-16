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
  Menu,
  X,
  Loader2,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [serverWaking, setServerWaking] = useState(false);

  useEffect(() => {
    const handleServerWaking = (e: any) => {
      setServerWaking(Boolean(e.detail?.waking));
    };
    window.addEventListener("baton:server-waking", handleServerWaking);
    return () => window.removeEventListener("baton:server-waking", handleServerWaking);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
      {/* Cold Start Notice Banner */}
      {serverWaking && (
        <div
          role="status"
          aria-live="polite"
          className="bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs px-4 py-2 flex items-center justify-between animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400 shrink-0" />
            <span>Waking the server, this can take up to a minute on Render cold starts...</span>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="underline text-amber-200 hover:text-white ml-2 text-xs font-semibold focus:outline-none"
          >
            Retry
          </button>
        </div>
      )}
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
                href={`/projects/${projectId}/radar`}
                className={`transition-colors hover:text-foreground flex items-center gap-1 ${
                  pathname.includes("/radar") ? "text-amber-400 font-semibold" : "text-muted-foreground"
                }`}
              >
                <Sparkles className="h-3 w-3 text-amber-400" />
                Radar
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
              className="text-muted-foreground hover:text-destructive h-9 w-9 min-h-[44px] min-w-[44px]"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}

          {/* Mobile Menu Toggle Button */}
          {projectId && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden text-foreground h-9 w-9 min-h-[44px] min-w-[44px] p-2"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          )}
        </div>
      </div>

      {/* Accessible Mobile Scrollable Tab Strip (Always visible below 1024px when on a project) */}
      {projectId && (
        <div className="lg:hidden border-t border-border/40 bg-background/95 backdrop-blur-md overflow-x-auto no-scrollbar scroll-smooth">
          <nav className="flex items-center gap-1 px-3 py-1 min-w-max text-xs" aria-label="Mobile project navigation">
            <Link
              href={`/projects/${projectId}`}
              className={`inline-flex items-center px-3 py-2.5 min-h-[44px] rounded-md transition-colors ${
                pathname === `/projects/${projectId}` ? "text-amber-400 font-semibold bg-amber-500/10" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Overview
            </Link>
            <Link
              href={`/projects/${projectId}/sources`}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-md transition-colors ${
                pathname.includes("/sources") ? "text-amber-400 font-semibold bg-amber-500/10" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Sources
            </Link>
            <Link
              href={`/projects/${projectId}/claims`}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-md transition-colors ${
                pathname.includes("/claims") ? "text-amber-400 font-semibold bg-amber-500/10" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Claims
            </Link>
            <Link
              href={`/projects/${projectId}/gaps`}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-md transition-colors ${
                pathname.includes("/gaps") ? "text-amber-400 font-semibold bg-amber-500/10" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Gaps
            </Link>
            <Link
              href={`/projects/${projectId}/radar`}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-md transition-colors ${
                pathname.includes("/radar") ? "text-amber-400 font-semibold bg-amber-500/10" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              Radar
            </Link>
            <Link
              href={`/projects/${projectId}/handover`}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-md transition-colors ${
                pathname.includes("/handover") ? "text-amber-400 font-semibold bg-amber-500/10" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              Handover
            </Link>
            <Link
              href={`/projects/${projectId}/members`}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-md transition-colors ${
                pathname.includes("/members") ? "text-amber-400 font-semibold bg-amber-500/10" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Team
            </Link>
          </nav>
        </div>
      )}

      {/* Accessible Mobile Full Menu Overlay */}
      {projectId && mobileMenuOpen && (
        <div className="lg:hidden border-t border-border/60 bg-popover/95 backdrop-blur-md px-4 py-3 space-y-1 animate-in slide-in-from-top-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">
            Project Navigation
          </div>
          <Link
            href={`/projects/${projectId}`}
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-md text-sm text-foreground hover:bg-muted font-medium"
          >
            Overview
          </Link>
          <Link
            href={`/projects/${projectId}/sources`}
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-md text-sm text-foreground hover:bg-muted font-medium"
          >
            <FileText className="h-4 w-4 text-amber-400" />
            Sources
          </Link>
          <Link
            href={`/projects/${projectId}/claims`}
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-md text-sm text-foreground hover:bg-muted font-medium"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Claims & Review
          </Link>
          <Link
            href={`/projects/${projectId}/gaps`}
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-md text-sm text-foreground hover:bg-muted font-medium"
          >
            <AlertTriangle className="h-4 w-4 text-rose-400" />
            Gaps Checklist
          </Link>
          <Link
            href={`/projects/${projectId}/radar`}
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-md text-sm text-foreground hover:bg-muted font-medium"
          >
            <Sparkles className="h-4 w-4 text-amber-400" />
            Bus-Factor Radar
          </Link>
          <Link
            href={`/projects/${projectId}/handover`}
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-md text-sm text-foreground hover:bg-muted font-medium"
          >
            <FileCheck2 className="h-4 w-4 text-blue-400" />
            Handover Summary
          </Link>
          <Link
            href={`/projects/${projectId}/members`}
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-md text-sm text-foreground hover:bg-muted font-medium"
          >
            <Users className="h-4 w-4 text-purple-400" />
            Team & Invites
          </Link>
        </div>
      )}
    </header>
  );
}
