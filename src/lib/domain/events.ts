import type { Person } from "./person";

export type SourceState = "pending" | "running" | "completed" | "partial" | "failed";

export type SourceName = "linkedin" | "gmail" | "contacts" | "calendar";

export interface SourceStatusEvent {
  type: "source.status";
  source: SourceName;
  state: SourceState;
  message?: string;
}

export interface PersonDiscoveredEvent {
  type: "network.person_discovered";
  person: Person;
}

export interface PersonMergedEvent {
  type: "network.person_merged";
  survivorId: string;
  mergedId: string;
  matchScore: number;
  signalsUsed: string[];
  mergedPerson: Person;
}

export interface MetricsUpdatedEvent {
  type: "network.metrics_updated";
  peopleDiscovered: number;
  uniquePeople: number;
  profilesEnriched: number;
  strongRelationships: number;
  elapsedMs: number;
}

export interface PipelineCompletedEvent {
  type: "network.completed";
  elapsedMs: number;
}

export type PipelineEvent =
  | SourceStatusEvent
  | PersonDiscoveredEvent
  | PersonMergedEvent
  | MetricsUpdatedEvent
  | PipelineCompletedEvent;
