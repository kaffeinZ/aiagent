// Type augmentation to fix broken @elizaos/core type exports
// The package's type definitions reference source files that don't exist in the installed package
declare module '@elizaos/core' {
  // Base types
  export type UUID = string;
  export type Content = any;
  export type Provider = any;
  export type Evaluator = any;
  export type IDatabaseAdapter = any;
  export type TestSuite = any;
  export type EventPayloadMap = any;
  export type Character = any;
  export type Project = any;
  export type ProjectAgent = any;
  export type RouteRequest = any;
  export type RouteResponse = any;
  export type MessagePayload = any;
  export type WorldPayload = any;
  export type GenerateTextParams = any;
  export type ProviderResult = any;

  // Enums
  export enum EventType {
    MESSAGE_RECEIVED = "MESSAGE_RECEIVED",
    VOICE_MESSAGE_RECEIVED = "VOICE_MESSAGE_RECEIVED",
    WORLD_CONNECTED = "WORLD_CONNECTED",
    WORLD_JOINED = "WORLD_JOINED"
  }

  export enum ModelType {
    TEXT_SMALL = "text-small",
    TEXT_LARGE = "text-large",
    TEXT_EMBEDDING = "text-embedding",
    IMAGE = "image",
    VIDEO = "video",
    AUDIO = "audio"
  }

  // Service base class
  export class Service {
    constructor(runtime: IAgentRuntime);
    static start(runtime: IAgentRuntime): Promise<Service>;
    static stop(runtime: IAgentRuntime): Promise<void>;
    stop(): Promise<void>;
    capabilityDescription?: string;
    static serviceType?: string;
  }

  // Memory interface
  export interface Memory {
    id: UUID;
    type: string;
    content: Content;
    userId?: UUID;
    roomId?: UUID;
    agentId?: UUID;
    unique?: boolean;
    embedding?: number[];
    [key: string]: any;
  }

  // State interface
  export interface State {
    [key: string]: any;
    values: {
      [key: string]: any;
    };
    data: {
      [key: string]: any;
    };
    text: string;
  }

  // ActionResult interface
  export interface ActionResult {
    text?: string;
    values?: Record<string, any>;
    data?: Record<string, any>;
    success: boolean;
    error?: string | Error;
  }

  // HandlerCallback type
  export type HandlerCallback = (response: Content) => Promise<Memory[]>;

  // Action interface
  export interface Action {
    name: string;
    similes?: string[];
    description: string;
    validate: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<boolean>;
    handler: (runtime: IAgentRuntime, message: Memory, state?: State, options?: any, callback?: HandlerCallback, responses?: Memory[]) => Promise<ActionResult>;
    examples?: any[][];
    [key: string]: any;
  }

  // IAgentRuntime interface
  export interface IAgentRuntime {
    getService: <T = any>(serviceType: string) => T | null;
    getSetting?: (key: string) => string | null;
    [key: string]: any;
  }

  export type Route = {
    type: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'STATIC';
    path: string;
    filePath?: string;
    public?: boolean;
    name?: string;
    handler?: (req: any, res: any, runtime: IAgentRuntime) => Promise<void>;
    isMultipart?: boolean;
  };

  export interface Plugin {
    name: string;
    description: string;
    init?: (config: Record<string, string>, runtime: IAgentRuntime) => Promise<void>;
    config?: {
      [key: string]: any;
    };
    services?: (typeof Service)[];
    actions?: Action[];
    providers?: Provider[];
    evaluators?: Evaluator[];
    models?: {
      [key: string]: (...args: any[]) => Promise<any>;
    };
    events?: Record<string, ((params: any) => Promise<any>)[]>;
    routes?: Route[];
    tests?: TestSuite[];
    priority?: number;
  }

  export interface Logger {
    level: string;
    trace: (obj: Record<string, unknown> | string | Error, msg?: string, ...args: unknown[]) => void;
    debug: (obj: Record<string, unknown> | string | Error, msg?: string, ...args: unknown[]) => void;
    info: (obj: Record<string, unknown> | string | Error, msg?: string, ...args: unknown[]) => void;
    warn: (obj: Record<string, unknown> | string | Error, msg?: string, ...args: unknown[]) => void;
    error: (obj: Record<string, unknown> | string | Error, msg?: string, ...args: unknown[]) => void;
    fatal: (obj: Record<string, unknown> | string | Error, msg?: string, ...args: unknown[]) => void;
    success: (obj: Record<string, unknown> | string | Error, msg?: string, ...args: unknown[]) => void;
    progress: (obj: Record<string, unknown> | string | Error, msg?: string, ...args: unknown[]) => void;
    log: (obj: Record<string, unknown> | string | Error, msg?: string, ...args: unknown[]) => void;
    clear: () => void;
    child: (bindings: Record<string, unknown>) => Logger;
  }

  export const logger: Logger;
}
