"use client";
import { useData } from "@/components/data-provider";
import { PageHeading } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";
import { BackupPanel } from "@/components/backup-panel";
export default function SettingsPage() {
  const { data } = useData();
  return <><PageHeading eyebrow="SEU ESPAÇO DE TRABALHO" title="Configurações" description="Personalize sua empresa e mantenha uma cópia dos seus dados." /><div className="settings-layout"><SettingsForm initial={data.settings} /><BackupPanel /></div></>;
}
