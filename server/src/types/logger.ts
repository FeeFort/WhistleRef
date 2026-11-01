import type { LOG_LEVELS } from "../logger/logger.js";

// Logger types
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogScope = "core" | "stable" | "lazer";
export type LogFields = Readonly<Record<string, unknown>>;
export type LogFieldsInput = LogFields | (() => LogFields);

export interface LogRecord {
  readonly operation?: TraceOperationDetails;
  readonly kind?: "separator" | "banner";
  readonly banner?: StartupBannerInfo;
  readonly timestamp: Date;
  readonly level: LogLevel;
  readonly scope: LogScope;
  readonly component: string;
  readonly message: string;
  readonly fields: LogFields;
}

export interface TraceOperationDetails {
  readonly id: number;
  readonly phase: "start" | "end" | "failed";
  readonly durationMs?: number;
}

export interface TraceOperation {
  readonly id: number;
  end(fields?: LogFieldsInput): void;
  fail(error: unknown, level?: LogLevel, fields?: LogFieldsInput): void;
}

export interface StartupBannerInfo {
  version: string;
  url: string;
  nodeVersion: string;
  os: string;
  arch: string;
  level: LogLevel;
}

export type LogSink = (record: LogRecord) => void;
export type LogFileSink = ((record: LogRecord) => void) & { flush?: () => Promise<void> };

export interface LogFormatOptions {
  level?: LogLevel;
  colors: boolean;
  isTTY: boolean;
  columns?: number;
}

export interface LoggerOptions {
  level?: LogLevel;
  colors?: boolean;
  sink?: LogSink;
  fileSink?: LogFileSink;
  fileLevel?: LogLevel;
  now?: () => Date;
  monotonicNow?: () => number;
}

export interface LoggerRuntimeOptions {
  level: LogLevel;
  colors: boolean;
}

export interface FileLoggingOptions {
  enabled: boolean;
  directory: string;
  maxFileBytes?: number;
  retentionDays?: number;
  maxDirectoryBytes?: number;
}

export interface LoggerState {
  fileLevel: LogLevel;
  fileSink?: LogFileSink;
  operationSequence: number;
  bannerShown: boolean;
  level: LogLevel;
  colors: boolean;
  sink: LogSink;
  now: () => Date;
  monotonicNow: () => number;
}
