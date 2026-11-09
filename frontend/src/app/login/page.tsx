"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkles, ShieldCheck, KeyRound, AlertCircle, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [showMfa, setShowMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (mfaCode) {
        headers["X-MFA-Code"] = mfaCode;
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.detail && data.detail.includes("MFA verification required")) {
          setShowMfa(true);
          setError("MFA code required for approver role. Please enter your 6-digit TOTP code.");
          return;
        }
        throw new Error(data.detail || "Invalid email or password");
      }

      await refreshUser();
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleTryDemo = async (role: "approver" | "incoming" | "restricted") => {
    setDemoLoading(true);
    setError(null);
    try {
      await apiRequest("/api/auth/demo", {
        method: "POST",
        data: { role },
      });
      await refreshUser();
      router.push("/dashboard");
    } catch (err: any) {
      setError(`Failed to create demo session: ${err.message}`);
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      {/* Subtle star glow background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-background to-background pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        <div className="flex flex-col items-center space-y-2 text-center">
          <Link href="/" className="inline-flex items-center gap-2 group mb-1">
            <span className="h-8 w-8 rounded-lg bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="font-serif font-bold text-2xl tracking-tight text-foreground">
              Baton
            </span>
          </Link>
          <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Sign In to Your Workspace
          </h1>
          <p className="text-xs text-muted-foreground">
            Evidence-backed technical knowledge transfer
          </p>
        </div>

        <Card className="border border-border/60 bg-card/60 backdrop-blur-md shadow-xl shadow-black/20">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-base font-semibold font-serif text-foreground">Welcome Back</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Enter your credentials to access project handovers
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
                  Work Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@orbitrobotics.io"
                  className="w-full text-xs p-2.5 rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full text-xs p-2.5 rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>

              {showMfa && (
                <div className="space-y-1.5 pt-3 border-t border-border/40">
                  <label className="text-xs font-semibold text-amber-400 flex items-center gap-1.5" htmlFor="mfaCode">
                    <ShieldCheck className="h-4 w-4" />
                    TOTP MFA Code (6 digits)
                  </label>
                  <input
                    id="mfaCode"
                    type="text"
                    maxLength={6}
                    required
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.trim())}
                    placeholder="123456"
                    className="w-full text-sm font-mono tracking-widest text-center p-2.5 rounded-md border border-amber-400/50 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs py-2.5 shadow-md shadow-amber-500/20"
                disabled={loading}
              >
                {loading ? "Authenticating..." : showMfa ? "Verify & Sign In" : "Sign In"}
              </Button>
            </form>

            <div className="mt-4 pt-3 border-t border-border/40 text-center text-xs space-y-2">
              <p className="text-muted-foreground">
                Don't have an account?{" "}
                <Link href="/register" className="text-amber-400 hover:underline font-medium">
                  Register here
                </Link>
              </p>
              <div className="pt-2">
                <span className="text-[11px] text-muted-foreground block mb-2">Or test immediately without credentials:</span>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTryDemo("approver")}
                    disabled={demoLoading}
                    className="text-[11px] h-7 border-border/60 hover:border-amber-400/50"
                  >
                    Demo Approver
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTryDemo("incoming")}
                    disabled={demoLoading}
                    className="text-[11px] h-7 border-border/60 hover:border-amber-400/50"
                  >
                    Demo Incoming
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
