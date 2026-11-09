"use client";

import { motion } from "framer-motion";
import { Badge } from "./ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { FileText, User, Clock, MapPin, ShieldAlert } from "lucide-react";

export interface Snippet {
  id: string;
  source_id: string;
  project_id: string;
  content: string;
  location: string;
  author: string;
  timestamp: string;
  access_level: "public" | "team" | "restricted";
}

export interface Citation {
  id: string;
  snippet_id: string;
  quoted_text: string;
  snippet?: Snippet;
}

interface EvidencePanelProps {
  selectedClaimId: string | null;
  claimText: string | null;
  citations: Citation[];
  onClose?: () => void;
}

export function EvidencePanel({
  selectedClaimId,
  claimText,
  citations,
  onClose,
}: EvidencePanelProps) {
  if (!selectedClaimId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground border rounded-lg bg-card/40">
        <FileText className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">Select a claim to inspect its cited evidence</p>
        <p className="text-xs text-muted-foreground mt-1">
          Every claim cites verbatim quotes verified against source documents.
        </p>
      </div>
    );
  }

  const accessBadge: Record<string, string> = {
    public: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    team: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
    restricted: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full space-y-4"
    >
      <div className="p-4 rounded-lg border bg-card">
        <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
          Inspecting Claim
        </span>
        <p className="mt-1 text-sm font-medium leading-relaxed">{claimText}</p>
      </div>

      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Cited Evidence Snippets ({citations.length})
        </h4>
      </div>

      <div className="space-y-3 overflow-y-auto pr-1">
        {citations.map((cit, idx) => {
          const snip = cit.snippet;
          return (
            <Card key={cit.id || idx} className="border shadow-none bg-background">
              <CardHeader className="p-3 pb-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] uppercase font-semibold ${accessBadge[snip?.access_level || "team"]}`}>
                      {snip?.access_level || "team"}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {snip?.location || "Unknown"}
                    </span>
                  </div>
                  {snip?.access_level === "restricted" && (
                    <span title="Restricted Access">
                      <ShieldAlert className="h-4 w-4 text-rose-500" />
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {snip?.author || "Author"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {snip?.timestamp || "Timestamp"}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="p-3 pt-0 space-y-2">
                <div className="rounded bg-muted/40 p-2 text-xs leading-relaxed font-sans text-foreground/90 border border-muted">
                  <p className="font-semibold text-[11px] uppercase tracking-wider text-primary mb-1">
                    Verbatim Cited Quote:
                  </p>
                  <blockquote className="border-l-2 border-primary pl-2 italic text-primary/95 font-medium">
                    "{cit.quoted_text}"
                  </blockquote>
                </div>

                {snip && (
                  <div className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    <p className="font-semibold text-[10px] uppercase text-muted-foreground mb-1">
                      Full Snippet Context:
                    </p>
                    <p className="line-clamp-4">{snip.content}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
}

