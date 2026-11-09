"use client";

import { use, useEffect, useState } from "react";
import { Users, Ticket, Copy, Check, Clock, ShieldCheck, UserCheck } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface Member {
  id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

interface Invite {
  id: string;
  code: string;
  role: string;
  expires_at: string | null;
  max_uses: number;
  uses_count: number;
  created_at: string;
}

export default function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const { user } = useAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite creation form
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<"incoming" | "restricted">("incoming");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresHours, setExpiresHours] = useState(72);
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchMembersAndInvites = () => {
    apiRequest<Member[]>(`/api/projects/${projectId}/members`)
      .then(setMembers)
      .catch(console.error);

    if (user?.role === "approver") {
      apiRequest<Invite[]>(`/api/projects/${projectId}/invites`)
        .then(setInvites)
        .catch(console.error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMembersAndInvites();
  }, [projectId, user]);

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiRequest(`/api/projects/${projectId}/invites`, {
        method: "POST",
        data: {
          role: inviteRole,
          max_uses: maxUses,
          expires_hours: expiresHours,
        },
      });
      setInviteOpen(false);
      fetchMembersAndInvites();
    } catch (err: any) {
      alert(`Failed to create invite: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar projectId={projectId} />

      <main className="container mx-auto px-4 sm:px-8 py-8 flex-1 space-y-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-tight">Project Access & Roles</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Team membership is strictly role-governed. Approvers generate single-use cryptographic invite tokens.
            </p>
          </div>

          {user?.role === "approver" && (
            <Button size="sm" onClick={() => setInviteOpen(true)} className="text-xs font-semibold">
              <Ticket className="h-3.5 w-3.5 mr-1.5" /> Generate Invite Code
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Members List */}
          <div className="space-y-4">
            <h2 className="font-serif text-base font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Active Project Members ({members.length})
            </h2>

            <div className="space-y-2.5">
              {members.map((m) => (
                <Card key={m.id} className="p-4 flex items-center justify-between border bg-card">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">{m.email}</p>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      Joined {new Date(m.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <Badge variant="outline" className="capitalize text-xs font-mono font-medium">
                    {m.role}
                  </Badge>
                </Card>
              ))}
            </div>
          </div>

          {/* Active Invites (Approver Only) */}
          {user?.role === "approver" && (
            <div className="space-y-4">
              <h2 className="font-serif text-base font-bold flex items-center gap-2">
                <Ticket className="h-4 w-4 text-primary" /> Pending Invite Tokens ({invites.length})
              </h2>

              {invites.length === 0 ? (
                <Card className="p-8 text-center border-dashed bg-card/40 space-y-2">
                  <Ticket className="h-6 w-6 mx-auto text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">
                    No active invite codes. Generate one to invite successors or contractors.
                  </p>
                </Card>
              ) : (
                <div className="space-y-2.5">
                  {invites.map((inv) => (
                    <Card key={inv.id} className="p-4 border bg-card space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-primary">{inv.code}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            Role: {inv.role}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => copyToClipboard(inv.code)}
                          >
                            {copiedCode === inv.code ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                        <span>Uses: {inv.uses_count}/{inv.max_uses}</span>
                        <span>
                          {inv.expires_at ? `Expires: ${new Date(inv.expires_at).toLocaleDateString()}` : "Never"}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Generate Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg font-bold flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" /> Generate Invite Code
            </DialogTitle>
            <DialogDescription className="text-xs">
              Recipients will join this project strictly locked to the role you choose.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateInvite} className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Assigned Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="w-full text-xs p-2 rounded border bg-background text-foreground"
              >
                <option value="incoming">Incoming Engineer (Team Scope)</option>
                <option value="restricted">Restricted Viewer (Public Evidence Only)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Max Uses</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxUses}
                  onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
                  className="w-full text-xs p-2 rounded border bg-background"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Expires in (Hours)</label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={expiresHours}
                  onChange={(e) => setExpiresHours(parseInt(e.target.value) || 72)}
                  className="w-full text-xs p-2 rounded border bg-background"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={creating} className="font-semibold">
                {creating ? "Generating..." : "Generate Token"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

