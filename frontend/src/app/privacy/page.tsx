import React from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Lock, Database, Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Privacy Policy | Baton",
  description: "Baton privacy policy: what data is collected, essential cookie usage, and storage architecture.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between py-12 px-4 sm:px-8 max-w-4xl mx-auto space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2 text-xs text-muted-foreground">
          <Link href="/">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Baton
          </Link>
        </Button>

        <div className="space-y-3 border-b border-border/40 pb-6">
          <span className="text-xs font-mono uppercase tracking-widest text-primary flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Compliance & Transparency
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-xs text-muted-foreground">Last updated: November 2026</p>
        </div>
      </div>

      <div className="space-y-8 text-xs sm:text-sm text-foreground/90 leading-relaxed">
        <section className="space-y-2">
          <h2 className="font-serif text-lg font-bold flex items-center gap-2 text-foreground">
            <Lock className="h-4 w-4 text-primary" /> What Data We Collect
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Baton collects only the data necessary to provide and secure technical knowledge handovers:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li><strong>Account details:</strong> Your name, email address, hashed passwords (using Argon2id), and optional TOTP MFA configuration secret.</li>
            <li><strong>Handover artifacts:</strong> Technical documents, RFCs, chat transcripts, code snippets, claims, and handover receipts uploaded or generated in your projects.</li>
            <li><strong>Audit trail:</strong> Timestamps, actor identifiers, and action types for security logging and compliance verification.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-lg font-bold flex items-center gap-2 text-foreground">
            <Cookie className="h-4 w-4 text-primary" /> Essential Cookies Only
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Baton uses <strong>strictly essential cookies only</strong> to manage secure sessions and prevent cross-site request forgery:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li><code>access_token</code>: Secure, HttpOnly cookie storing your encrypted JSON Web Token for authentication.</li>
            <li><code>refresh_token</code>: Secure, HttpOnly cookie used strictly for silent token renewal on the refresh endpoint.</li>
            <li><code>csrf_token</code>: Cryptographically secure token used with double-submit cookie patterns to protect state-changing requests.</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            We use zero advertising cookies, zero third-party tracking pixels, and zero behavioral analytics. Because we only use strictly necessary cookies, no cookie consent banner is legally required.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-lg font-bold flex items-center gap-2 text-foreground">
            <Database className="h-4 w-4 text-primary" /> Where Data is Stored and Protected
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Data is stored in isolated PostgreSQL databases with mandatory Row-Level Security (RLS) enforcement. Files uploaded for analysis are processed in memory and encrypted at rest. We do not sell, rent, or share customer data with third parties.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-serif text-lg font-bold text-foreground">Data Retention & Deletion</h2>
          <p className="text-muted-foreground leading-relaxed">
            When a project or account is deleted, all associated sources, snippets, claims, and audit entries are cascaded and permanently purged.
          </p>
        </section>
      </div>

      <footer className="border-t border-border/40 pt-6 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-4">
        <span>© {new Date().getFullYear()} Baton. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <Link href="/login" className="hover:text-foreground">Sign in</Link>
          <Link href="/register" className="hover:text-foreground">Register</Link>
        </div>
      </footer>
    </div>
  );
}

