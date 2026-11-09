"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await apiRequest("/api/auth/change-password", {
        method: "POST",
        data: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      });
      await refreshUser();
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to change password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/20">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <div className="inline-flex p-3 rounded-full bg-primary/10 text-primary mb-2">
            <KeyRound className="h-8 w-8" />
          </div>
          <h1 className="font-serif text-2xl font-bold">Change Password</h1>
          <p className="text-xs text-muted-foreground">
            A password reset is required on first login or per security policy.
          </p>
        </div>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3 space-y-1">
            <CardTitle className="text-base font-semibold">Update Credentials</CardTitle>
            <CardDescription className="text-xs">
              Choose a strong password with at least 12 characters.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-4 p-3 rounded bg-destructive/10 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="current">
                  Current / Temporary Password
                </label>
                <input
                  id="current"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full text-sm p-2 rounded border bg-background text-foreground focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="new">
                  New Password (min 12 characters)
                </label>
                <input
                  id="new"
                  type="password"
                  required
                  minLength={12}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full text-sm p-2 rounded border bg-background text-foreground focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="confirm">
                  Confirm New Password
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  minLength={12}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full text-sm p-2 rounded border bg-background text-foreground focus:ring-1 focus:ring-primary"
                />
              </div>

              <Button type="submit" className="w-full font-semibold" disabled={loading}>
                {loading ? "Updating..." : "Update Password & Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

