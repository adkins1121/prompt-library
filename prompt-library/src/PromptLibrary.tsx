import React, { useMemo, useState, useEffect } from "react";
import { Search, Filter, Copy, Play, Download, Tag, X, Sparkles, Save, Trash2, Upload, FileSpreadsheet, Layers, BookMarked, FileText, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";           // Excel read/write
import * as pdfjsLib from "pdfjs-dist"; // PDF parse (workerless)
import * as mammoth from "mammoth";     // DOCX parse

// ------------------------------------------------------------------
// Types
export type Prompt = {
  id: string;
  title: string;
  function: "Operations" | "Customer Service" | "Finance" | "Sales" | "HR" | "General";
  stage: "Lightbulb" | "Everyday" | "Strategy" | "Advanced";
  tags: string[];
  description?: string;
  template: string; // may include {{variables}}
};

export type SavedPrompt = {
  id: string;
  promptId: string;
  title: string;
  filledText: string;
  savedAt: number;
};

// ------------------------------------------------------------------
// Seed data: a few example prompts
const PROMPTS: Prompt[] = [
  {
    id: "lb-email",
    title: "Draft or respond to an email",
    function: "General",
    stage: "Lightbulb",
    tags: ["email", "communication", "fast"],
    description: "Paste an email and get a clear, empathetic reply with next steps.",
    template:
      "I just received this email:\n\n---\n{{email_text}}\n---\n\nPlease draft a clear, professional, and empathetic response that addresses the sender’s concerns and proposes specific next steps."
  },
  {
    id: "ops-sop",
    title: "Create or improve an SOP",
    function: "Operations",
    stage: "Everyday",
    tags: ["SOP", "training", "quality"],
    description: "Step-by-step SOP with a checklist and training notes.",
    template:
      "Create a concise SOP for process: {{process_name}}.\nInclude: Purpose, Preconditions, Step-by-step procedure (numbered), Quality checks, Safety notes, Common errors, and a one-page checklist version for training.\nIf an existing SOP is pasted below, first identify 5 improvements.\n\nExisting SOP (optional):\n{{existing_sop}}"
  },
  {
    id: "fin-invoice-recon",
    title: "Invoice reconciliation by shipment",
    function: "Finance",
    stage: "Everyday",
    tags: ["AP", "invoices", "audit"],
    description: "Compare carrier invoices to AP ledger and flag issues.",
    template:
      "Compare these carrier invoices to the AP ledger. Break out discrepancies by shipment number and classify them (rate, fuel, accessorial, duplicate, missing).\n\nInvoices:\n{{invoices_text_or_csv}}\n\nAP Ledger:\n{{ap_ledger_text_or_csv}}"
  }
];

// ------------------------------------------------------------------
// Helpers
const FUNCTIONS = ["All", "Operations", "Customer Service", "Finance", "Sales", "HR", "General"] as const;
const STAGES = ["All", "Lightbulb", "Everyday", "Strategy", "Advanced"] as const;

const SAVED_KEY = "briefli_saved_prompts_v1";

export function extractVariables(template: string): string[] {
  const vars = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(template))) vars.add(m[1]);
  return Array.from(vars);
}

export function applyTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}/g, (_: unknown, k: string) => (values[k] ?? `{{${k}}}`));
}

// File parsers (TXT/PDF/DOCX)
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as ArrayBuffer);
    fr.onerror = rej;
    fr.readAsArrayBuffer(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsText(file);
  });
}

async function pdfToText(file: File): Promise<string> {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: buf, disableWorker: true }).promise;
  let out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let line = "";
    for (const item of content.items as any[]) {
      const str = (item.str ?? "").toString();
      line += (line ? " " : "") + str;
      if (item.hasEOL) {
        out.push(line.trim());
        line = "";
      }
    }
    if (line.trim()) out.push(line.trim());
  }
  return out.join("\n");
}

async function docxToText(file: File): Promise<string> {
  const buf = await readFileAsArrayBuffer(file);
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return (result.value || "").trim();
}

async function fileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return pdfToText(file);
  if (name.endsWith(".docx")) return docxToText(file);
  return readFileAsText(file); // .txt, .csv etc.
}

// ------------------------------------------------------------------
// Main Component
export default function PromptLibrary() {
  const [tab, setTab] = useState<"library"|"saved">("library");
  const [q, setQ] = useState("");
  const [fnFilter, setFnFilter] = useState<typeof FUNCTIONS[number]>("All");
  const [stageFilter, setStageFilter] = useState<typeof STAGES[number]>("All");
  const [selected, setSelected] = useState<Prompt | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<SavedPrompt[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (!selected) return;
    const vars = extractVariables(selected.template);
    const init: Record<string, string> = {};
    vars.forEach(v => (init[v] = values[v] ?? ""));
    setValues(init);
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return PROMPTS.filter(p => {
      const matchesText = !needle || [p.title, p.description ?? "", p.template, ...p.tags].join("\n").toLowerCase().includes(needle);
      const matchesFn = fnFilter === "All" || p.function === fnFilter;
      const matchesStage = stageFilter === "All" || p.stage === stageFilter;
      return matchesText && matchesFn && matchesStage;
    });
  }, [q, fnFilter, stageFilter]);

  // Save prompt
  const onSavePrompt = () => {
    if (!selected) return;
    const text = applyTemplate(selected.template, values);
    const title = prompt("Name this saved prompt", selected.title) || selected.title;
    const entry: SavedPrompt = { id: `${Date.now()}`, promptId: selected.id, title, filledText: text, savedAt: Date.now() };
    const next = [entry, ...saved];
    setSaved(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    alert("Saved ✅");
  };

  // Copy prompt
  const onCopy = async () => {
    if (!selected) return;
    const text = applyTemplate(selected.template, values);
    await navigator.clipboard.writeText(text);
    alert("Prompt copied ✨");
  };

  // Document upload into variable
  const handleVarFile = async (vKey: string, file?: File | null) => {
    if (!file) return;
    try {
      const text = await fileToText(file);
      setValues(prev => ({ ...prev, [vKey]: (prev[vKey] ? (prev[vKey] + "\n\n" + text) : text) }));
    } catch {
      alert("Could not read file. Please ensure it is PDF, DOCX, or TXT.");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><Sparkles className="w-5 h-5"/> AI Prompt Library</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <Button onClick={()=>setTab("library")} variant={tab==="library"?"default":"secondary"}><BookMarked className="w-4 h-4 mr-1"/>Library</Button>
        <Button onClick={()=>setTab("saved")} variant={tab==="saved"?"default":"secondary"}><Save className="w-4 h-4 mr-1"/>Saved</Button>
      </div>

      {/* Library */}
      {tab==="library" && (
        <>
          <Card className="mb-4">
            <CardContent className="p-3 flex gap-2 items-center">
              <Search className="w-4 h-4"/>
              <Input placeholder="Search prompts…" value={q} onChange={(e)=>setQ(e.target.value)} />
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(p=>(
              <Card key={p.id} onClick={()=>setSelected(p)} className="cursor-pointer hover:shadow">
                <CardHeader>
                  <CardTitle className="text-lg">{p.title}</CardTitle>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="secondary">{p.function}</Badge>
                    <Badge>{p.stage}</Badge>
                  </div>
                </CardHeader>
                <CardContent><p className="text-sm text-gray-600">{p.description}</p></CardContent>
              </Card>
            ))}
          </div>

          {selected && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={()=>setSelected(null)}>
              <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto p-6" onClick={e=>e.stopPropagation()}>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xl font-semibold">{selected.title}</h3>
                  <Button variant="ghost" onClick={()=>setSelected(null)}><X className="w-5 h-5"/></Button>
                </div>
                {selected.description && <p className="text-sm mb-4">{selected.description}</p>}

                <h4 className="text-sm font-semibold mb-2">Customize</h4>
                <div className="grid gap-4">
                  {extractVariables(selected.template).map(v=>(
                    <div key={v} className="flex flex-col gap-2">
                      <label className="text-xs text-gray-600">{v}</label>
                      <Textarea value={values[v]??""} onChange={(e)=>setValues(prev=>({...prev,[v]:e.target.value}))} rows={3} placeholder={`Enter ${v}… or upload a file`} />
                      <Input type="file" accept=".txt,.pdf,.docx" onChange={e=>handleVarFile(v, e.target.files?.[0])}/>
                    </div>
                  ))}
                </div>

                <h4 className="text-sm font-semibold mt-4 mb-2">Preview</h4>
                <pre className="bg-gray-50 text-sm p-3 rounded border whitespace-pre-wrap">
                  {applyTemplate(selected.template, values)}
                </pre>

                <div className="flex gap-2 mt-4">
                  <Button onClick={onCopy}><Copy className="w-4 h-4 mr-1"/>Copy</Button>
                  <Button onClick={onSavePrompt} variant="secondary"><Save className="w-4 h-4 mr-1"/>Save</Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Saved */}
      {tab==="saved" && (
        saved.length===0 ? <p className="text-sm text-gray-500">No saved prompts yet.</p> : (
          <div className="grid md:grid-cols-2 gap-4">
            {saved.map(sp=>(
              <Card key={sp.id}>
                <CardHeader>
                  <CardTitle className="text-base">{sp.title}</CardTitle>
                  <span className="text-xs text-gray-400">{new Date(sp.savedAt).toLocaleString()}</span>
                </CardHeader>
                <CardContent>
                  <pre className="bg-gray-50 text-xs p-3 rounded border whitespace-pre-wrap max-h-48 overflow-auto">{sp.filledText}</pre>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}
