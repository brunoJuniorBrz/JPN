"use client";
import { useState } from "react";
import { QuickProjectForm } from "@/components/planning/quick-project-form";
import { ProjectEditor } from "@/components/projects/project-editor";
import { NewPhysicalModelImport } from "@/components/planning/physical-model-import";

export default function NewProjectPage() {
  const [advanced, setAdvanced] = useState(false);
  return advanced
    ? <><button type="button" className="button secondary" style={{ marginBottom: 16 }} onClick={() => setAdvanced(false)}>Voltar à entrada rápida</button><ProjectEditor /></>
    : <><NewPhysicalModelImport/><QuickProjectForm onAdvanced={() => setAdvanced(true)}/></>;
}
