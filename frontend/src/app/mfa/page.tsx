"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ArrowRight, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function MFAPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initiate MFA setup to fetch QR Code
    apiRequest<{ secret: string; qr_data_uri: string }>("/api/auth/mfa/setup", { method: "POST" })
      .then((res) => {
        setQrCode(res.qr_data_uri);
        setSecret(res.secret);
      })
      .catch((err) => setError(err.message));
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiRequest("/api/auth/mfa/verify", {
        method: "POST",
        data: { code: code.trim() },
      });
      await refreshUser();
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/20">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <div className="inline-flex p-3 rounded-full bg-primary/10 text-primary mb-2">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="font-serif text-2xl font-bold">Multi-Factor Authentication</h1>
          <p className="text-xs text-muted-foreground">
            MFA is required for accounts with approver privileges.
          </p>
        </div>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3 space-y-1">
            <CardTitle className="text-base font-semibold">Scan QR Code</CardTitle>
            <CardDescription className="text-xs">
              Scan this barcode using Google Authenticator, Authy, or 1Password.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded bg-destructive/10 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-col items-center justify-center p-4 bg-background rounded border">
              {qrCode ? (
                <img src={qrCode} alt="TOTP MFA QR Code" className="w-48 h-48 rounded" />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-xs text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
              {secret && (
                <p className="mt-2 text-[11px] font-mono text-muted-foreground text-center">
                  Key: {secret}
                </p>
              )}
            </div>

            <form onSubmit={handleVerify} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="code">
                  Enter 6-Digit Authenticator Code
                </label>
                <input
                  id="code"
                  type="text"
                  maxLength={6}
                  required
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.trim())}
                  className="w-full text-center text-lg font-mono tracking-widest p-2 rounded border bg-background text-foreground focus:ring-1 focus:ring-primary"
                />
              </div>

              <Button type="submit" className="w-full font-semibold" disabled={loading || code.length !== 6}>
                {loading ? "Verifying..." : "Verify & Enable MFA"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

