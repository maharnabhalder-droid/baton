"use client";

import { use, useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UploadCloud,
  FileText,
  Lock,
  Users,
  Globe,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  X,
  FileUp,
} from "lucide-react";

interface SourceItem {
  id: string;
  project_id: string;
  title: string;
  access_level: "public" | "team" | "restricted";
  author: string;
  original_filename: string;
  file_type: string;
  size_bytes: number;
  snippets_count: number;
  created_at: string;
}

export default function SourcesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const { user } = useAuth();

  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reconstructing, setReconstructing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState(user?.name || user?.email || "Departing Lead");
  const [accessLevel, setAccessLevel] = useState<"public" | "team" | "restricted">("team");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSources = () => {
    apiRequest<SourceItem[]>(`/api/projects/${projectId}/sources`)
      .then(setSources)
      .catch((err) => showToast("error", `Failed to load sources: ${err.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSources();
  }, [projectId]);

  const showToast = (type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);
      if (!title) {
        // Strip extension for friendly default title
        setTitle(droppedFile.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0];
      setFile(selected);
      if (!title) {
        setTitle(selected.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      showToast("error", "Please select a file to upload");
      return;
    }
    if (!title.trim()) {
      showToast("error", "Document title is required");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title.trim());
    formData.append("access_level", accessLevel);
    formData.append("author", author.trim());

    try {
      await apiRequest(`/api/projects/${projectId}/sources/upload`, {
        method: "POST",
        body: formData,
      });
      showToast("success", `"${title}" successfully ingested and split into verbatim snippets.`);
      setTitle("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchSources();
    } catch (err: any) {
      showToast("error", `Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleReconstruct = async () => {
    if (sources.length === 0) {
      showToast("error", "Please upload at least one source document before reconstructing the knowledge graph.");
      return;
    }

    setReconstructing(true);
    try {
      const extracted = await apiRequest<any[]>(`/api/projects/${projectId}/claims/pipeline/run`, {
        method: "POST",
      });
      showToast(
        "success",
        `Constellation reconstructed: ${extracted.length} verified claims extracted from sources.`
      );
    } catch (err: any) {
      showToast("error", `Reconstruction failed: ${err.message}`);
    } finally {
      setReconstructing(false);
    }
  };

  const accessBadge: Record<string, { label: string; class: string; icon: any }> = {
    public: {
      label: "Public",
      class: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      icon: Globe,
    },
    team: {
      label: "Team",
      class: "bg-blue-500/10 text-blue-400 border-blue-500/30",
      icon: Users,
    },
    restricted: {
      label: "Restricted",
      class: "bg-rose-500/10 text-rose-400 border-rose-500/30",
      icon: Lock,
    },
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar projectId={projectId} />

      {/* Floating Toast */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 shadow-xl text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 border ${
            toastMessage.type === "success"
              ? "bg-slate-900 text-emerald-400 border-emerald-500/30"
              : "bg-slate-900 text-rose-400 border-rose-500/30"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      <main className="container mx-auto px-4 sm:px-8 py-8 flex-1 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
          <div className="space-y-1">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Source Documents & Ingestion
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Upload architecture RFCs, meeting notes, slack exports, and data sheets with strict role-based access tags.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {user?.role === "approver" && (
              <Button
                onClick={handleReconstruct}
                disabled={reconstructing || sources.length === 0}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20"
              >
                <Sparkles className={`h-3.5 w-3.5 ${reconstructing ? "animate-spin" : ""}`} />
                {reconstructing ? "Reconstructing Evidence..." : "Reconstruct Knowledge Graph"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSources}
              className="text-xs flex items-center gap-1 border-border/60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Upload Form (5 cols) */}
          <div className="lg:col-span-5">
            <Card className="border border-border/60 bg-card/60 backdrop-blur-sm">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 font-serif text-foreground">
                  <UploadCloud className="h-4 w-4 text-amber-400" />
                  Ingest Source File
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <form onSubmit={handleUpload} className="space-y-4">
                  {/* Drag-and-drop file zone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all ${
                      isDragging
                        ? "border-amber-400 bg-amber-400/10"
                        : file
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-border/60 hover:border-amber-400/50 hover:bg-muted/30"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      aria-label="Upload source document file"
                      accept=".md,.txt,.pdf,.docx,.csv,.json"
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    {file ? (
                      <div className="flex items-center justify-between gap-2 text-left">
                        <div className="flex items-center gap-2.5 truncate">
                          <FileText className="h-5 w-5 text-emerald-400 shrink-0" />
                          <div className="truncate">
                            <p className="text-xs font-medium text-foreground truncate">{file.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFile(null);
                          }}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5 py-2">
                        <FileUp className="h-6 w-6 mx-auto text-amber-400" />
                        <p className="text-xs font-medium text-foreground">
                          Drag and drop source file here, or <span className="text-amber-400 underline">browse</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Supports Markdown, Text, PDF, DOCX, CSV, JSON
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Document Title */}
                  <div className="space-y-1">
                    <label htmlFor="doc-title" className="text-xs font-medium text-muted-foreground">Document Title</label>
                    <input
                      id="doc-title"
                      aria-label="Document Title"
                      required
                      placeholder="e.g. Telemetry Architecture RFC"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>

                  {/* Author */}
                  <div className="space-y-1">
                    <label htmlFor="doc-author" className="text-xs font-medium text-muted-foreground">Author / Contributor</label>
                    <input
                      id="doc-author"
                      aria-label="Author / Contributor"
                      required
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>

                  {/* Access Level Selector */}
                  <div className="space-y-1.5">
                    <label htmlFor="doc-access-level" className="text-xs font-medium text-muted-foreground">Access Clearance Level</label>
                    <select
                      id="doc-access-level"
                      aria-label="Access Clearance Level"
                      value={accessLevel}
                      onChange={(e) => setAccessLevel(e.target.value as any)}
                      className="w-full text-xs p-2.5 rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
                    >
                      <option value="public">Public - Visible to all roles (Approver, Incoming, Restricted)</option>
                      <option value="team">Team - Visible to Approver & Incoming Engineer</option>
                      {user?.role === "approver" && (
                        <option value="restricted">Restricted - Approver Only (Hidden from Incoming & Viewers)</option>
                      )}
                    </select>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Claims citing restricted sources are completely hidden from users lacking restricted clearance.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    size="sm"
                    className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
                    disabled={uploading || !file}
                  >
                    {uploading ? "Ingesting & Splitting..." : "Ingest Source Document"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Existing Ingested Sources (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Ingested Sources ({sources.length})
              </h2>
              <span className="text-[11px] text-muted-foreground font-mono">
                {sources.reduce((acc, s) => acc + s.snippets_count, 0)} total verbatim snippets
              </span>
            </div>

            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : sources.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-border/60 rounded-xl bg-card/30 space-y-3">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground/30" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">No source documents ingested yet</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Upload your architecture notes, post-mortems, or slack exports to begin constructing the knowledge constellation.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {sources.map((s) => {
                  const badge = accessBadge[s.access_level] || accessBadge.team;
                  const Icon = badge.icon;
                  return (
                    <Card
                      key={s.id}
                      className="border border-border/60 bg-card/60 hover:border-amber-400/40 transition-colors p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-foreground">{s.title}</h4>
                            <Badge variant="outline" className={`text-[10px] uppercase font-semibold ${badge.class}`}>
                              <Icon className="h-2.5 w-2.5 mr-1" />
                              {badge.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono">
                            {s.original_filename} • {(s.size_bytes / 1024).toFixed(1)} KB • By {s.author}
                          </p>
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                              <CheckCircle2 className="h-3 w-3" />
                              Parsed into {s.snippets_count} snippets
                            </span>
                          </div>
                        </div>

                        <div className="text-right text-[11px] text-muted-foreground font-mono">
                          {new Date(s.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
