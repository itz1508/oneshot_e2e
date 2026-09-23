/**
 * OneShot DeepAgents Filesystem Backend Protocol
 *
 * Implements the pluggable backend specification per:
 * https://docs.langchain.com/oss/python/deepagents/backends
 *
 * Exposes virtual filesystem operations:
 * - ls, read, write, edit, glob, grep, delete
 * - execute (for sandboxes / local shell execution environments)
 *
 * Structured result types return { error?: string } rather than throwing unhandled exceptions.
 */

export interface FileEntry {
  path: string;
  name: string;
  isDir: boolean;
  sizeBytes?: number;
  modifiedAt?: string;
}

export interface LsResult {
  entries: FileEntry[];
  error?: string;
}

export interface ReadResult {
  content?: string;
  bytesRead?: number;
  truncated?: boolean;
  isMultimodal?: boolean;
  mediaType?: string;
  error?: string;
}

export interface WriteResult {
  success: boolean;
  bytesWritten?: number;
  path: string;
  error?: string;
}

export interface EditResult {
  success: boolean;
  replacementsCount?: number;
  path: string;
  error?: string;
}

export interface GlobResult {
  matches: string[];
  error?: string;
}

export interface GrepMatch {
  path: string;
  lineNumber: number;
  lineContent: string;
}

export interface GrepResult {
  matches: GrepMatch[];
  error?: string;
}

export interface DeleteResult {
  success: boolean;
  path: string;
  error?: string;
}

export interface ExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  error?: string;
}

export interface BackendProtocol {
  readonly name: string;
  ls(path: string): Promise<LsResult>;
  read(filePath: string, offset?: number, limit?: number): Promise<ReadResult>;
  write(filePath: string, content: string): Promise<WriteResult>;
  edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<EditResult>;
  glob(pattern: string, path?: string): Promise<GlobResult>;
  grep(pattern: string, path?: string, globPattern?: string): Promise<GrepResult>;
  delete?(filePath: string): Promise<DeleteResult>;
}

export interface SandboxBackendProtocol extends BackendProtocol {
  execute(command: string, env?: Record<string, string>, timeoutMs?: number): Promise<ExecuteResult>;
}
