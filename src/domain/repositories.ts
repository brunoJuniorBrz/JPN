import type { Material, Project, Settings } from "./models";

export interface ProjectRepository {
  list(): Project[];
  save(project: Project): void;
  remove(id: string): void;
  duplicate(id: string): Project;
}
export interface MaterialRepository {
  list(): Material[];
  save(material: Material): void;
  remove(id: string): void;
}
export interface SettingsRepository {
  get(): Settings;
  save(settings: Settings): void;
}
