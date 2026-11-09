"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, AlertCircle, ShieldCheck, Lock, User, Mail, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function RegisterPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Password strength calculation
  const getPasswordStrength = (pwd: string) => {
    let score = 0;
    if (pwd.length >= 12) score += 1;
    if (pwd.length >= 16) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
    return score;
  };

  const strength = getPasswordStrength(password);
  const strengthLabels = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
  const strengthColors = ["bg-rose-500", "bg-rose-400", "bg-amber-400", "bg-emerald-400", "bg-emerald-500"];

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 12) {
      setError("Password must be at least 12 characters long.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      await apiRequest("/api/auth/register", {
        method: "POST",
        data: {
          name,
          email,
          password,
          invite_code: inviteCode.trim() || undefined,
        },
      });
      await refreshUser();
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Unable to complete registration. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/20">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-primary" />
            <span className="font-serif text-2xl font-bold tracking-tight">Baton</span>
          </Link>
          <h1 className="text-xl font-bold">Create your account</h1>
          <p className="text-xs text-muted-foreground">
            Join a technical handover workspace with verified claim evidence.
          </p>
        </div>

        <Card className="border shadow-sm">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-base font-semibold">Registration</CardTitle>
            <CardDescription className="text-xs">
              Project roles are assigned automatically or via an invite code.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="name">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    id="name"
                    required
                    placeholder="Elena Vance"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-sm pl-9 pr-3 py-2 rounded-md border bg-background text-foreground focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="email">
                  Work Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    required
                    placeholder="elena@orbitrobotics.io"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-sm pl-9 pr-3 py-2 rounded-md border bg-background text-foreground focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="password">
                  Password (min 12 characters)
                </label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={12}
                    placeholder="••••••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full text-sm pl-9 pr-3 py-2 rounded-md border bg-background text-foreground focus:ring-1 focus:ring-primary"
                  />
                </div>

                {password.length > 0 && (
                  <div className="pt-2 space-y-1.5">
                    <div className="flex gap-1 h-1.5">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <div
                          key={level}
                          className={`flex-1 rounded-full transition-all ${
                            strength >= level ? strengthColors[strength - 1] : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                      <span>Strength: {strengthLabels[Math.max(0, strength - 1)]}</span>
                      <span>{password.length}/12 min chars</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1 pt-1 border-t">
                <label className="text-xs font-medium flex items-center justify-between" htmlFor="inviteCode">
                  <span>Project Invite Code (Optional)</span>
                  <span className="text-[10px] text-muted-foreground">Provided by approver</span>
                </label>
                <div className="relative">
                  <Ticket className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    id="inviteCode"
                    placeholder="e.g. inv_ab12cd34ef56"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    className="w-full text-sm font-mono pl-9 pr-3 py-2 rounded-md border bg-background text-foreground focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full mt-2 font-semibold" disabled={loading}>
                {loading ? "Creating Account..." : "Create Account"}
              </Button>
            </form>

            <div className="mt-4 pt-4 border-t text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline font-semibold">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

