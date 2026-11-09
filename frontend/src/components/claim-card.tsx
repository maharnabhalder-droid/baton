"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  Check,
  X,
  Edit2,
  History,
  Quote,
  Star,
  AlertTriangle,
  User,
  Clock,
} from "lucide-react";

export interface ClaimHistoryItem {
  id: string;
  user_id: string;
  action: string;
  previous_state?: string;
  new_state: string;
  timestamp: string;
}

export interface ClaimItem {
  id: string;
  project_id: string;
  claim_text: string;
  status: "Verified" | "Inferred" | "Conflicting" | "Missing";
  category: string;
  confidence: number;
  review_status: "pending" | "approved" | "rejected";
  citations: any[];
  history: ClaimHistoryItem[];
  created_at: string;
}

interface ClaimCardProps {
  claim: ClaimItem;
  isSelected: boolean;
  onSelect: () => void;
  onReview?: (claimId: string, action: "approve" | "reject") => Promise<void>;
  onEdit?: (claimId: string, newText: string, newStatus: string) => Promise<void>;
  userRole?: string;
}

export function ClaimCard({
  claim,
  isSelected,
  onSelect,
  onReview,
  onEdit,
  userRole = "incoming",
}: ClaimCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(claim.claim_text);
  const [editStatus, setEditStatus] = useState(claim.status);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const renderStatusBadge = () => {
    switch (claim.status) {
      case "Verified":
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1 text-[11px]"
          >
            <Star className="h-3 w-3 fill-emerald-400 text-emerald-400" />
            Verified
          </Badge>
        );
      case "Inferred":
        return (
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-400 border-amber-500/30 flex items-center gap-1 text-[11px]"
          >
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            Inferred
          </Badge>
        );
      case "Conflicting":
        return (
          <Badge
            variant="outline"
            className="bg-rose-500/10 text-rose-400 border-rose-500/30 flex items-center gap-1 text-[11px]"
          >
            <AlertTriangle className="h-3 w-3 text-rose-400" />
            Conflicting
          </Badge>
        );
      case "Missing":
      default:
        return (
          <Badge
            variant="outline"
            className="bg-slate-500/10 text-slate-400 border-dashed border-slate-500/40 flex items-center gap-1 text-[11px]"
          >
            <Star className="h-3 w-3 text-slate-400" />
            Missing
          </Badge>
        );
    }
  };

  const reviewBadge: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    rejected: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };

  const handleSaveEdit = async () => {
    if (!onEdit) return;
    setLoading(true);
    try {
      await onEdit(claim.id, editText, editStatus);
      setIsEditing(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full"
    >
      <Card
        onClick={onSelect}
        className={`cursor-pointer transition-all border ${
          isSelected
            ? "border-amber-400 ring-1 ring-amber-400/40 bg-card/90 shadow-md shadow-amber-500/5"
            : "border-border/60 bg-card/60 hover:border-amber-400/30 hover:bg-card/80"
        }`}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {renderStatusBadge()}
              <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground border-border/50">
                {claim.category}
              </Badge>
              <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border ${reviewBadge[claim.review_status]}`}>
                {claim.review_status}
              </span>
            </div>

            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="Version history"
                  >
                    <History className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md bg-card border-border">
                  <DialogHeader>
                    <DialogTitle className="text-base font-serif font-bold flex items-center gap-2">
                      <History className="h-4 w-4 text-amber-400" />
                      Claim Revision History
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {claim.history.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        No revisions recorded. Original machine extraction state.
                      </p>
                    ) : (
                      claim.history.map((h) => (
                        <div key={h.id} className="text-xs border-l-2 border-amber-400/50 pl-3 py-1 space-y-1">
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span className="font-semibold uppercase tracking-wider text-[10px] text-amber-400">
                              {h.action}
                            </span>
                            <span className="font-mono text-[10px] flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(h.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span>Actor: {h.user_id ? h.user_id.slice(0, 8) + "..." : "System"}</span>
                          </div>
                          <p className="text-foreground/90 font-mono text-[11px] bg-muted/40 p-2 rounded border border-border/40">
                            {h.new_state}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              {userRole === "approver" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsEditing(!isEditing)}
                  title="Edit claim text"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-2.5" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full text-xs p-2.5 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
                rows={3}
              />
              <div className="flex items-center justify-between">
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="text-xs p-1.5 rounded-md border border-border bg-background text-foreground"
                >
                  <option value="Verified">Verified</option>
                  <option value="Inferred">Inferred</option>
                  <option value="Conflicting">Conflicting</option>
                  <option value="Missing">Missing</option>
                </select>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs h-7 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
                    onClick={handleSaveEdit}
                    disabled={loading}
                  >
                    Save Revision
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs sm:text-sm font-medium leading-relaxed text-foreground">
              {claim.claim_text}
            </p>
          )}

          <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-mono text-[11px]">
              <Quote className="h-3 w-3 text-amber-400" />
              {claim.citations.length} cited verbatim {claim.citations.length === 1 ? "quote" : "quotes"}
            </span>

            {/* Approver role can approve or reject claims */}
            {userRole === "approver" && onReview && (
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 border-border/60"
                  onClick={() => onReview(claim.id, "reject")}
                  disabled={claim.review_status === "rejected"}
                >
                  <X className="h-3 w-3 mr-1" />
                  Reject
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 border-border/60"
                  onClick={() => onReview(claim.id, "approve")}
                  disabled={claim.review_status === "approved"}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Approve
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
