// Type augmentation to fix broken @elizaos/core type exports
// The package's type definitions reference source files that don't exist in the installed package
declare module '@elizaos/core' {
  // Base types (using any for complex types that reference broken source files)
  type IAgentRuntime = any;
  type Action = any;
  type Provider = any;
  type Evaluator = any;
  type IDatabaseAdapter = any;
  type TestSuite = any;
  type Service = any;
  type EventHandler<K extends string> = any;
  type EventPayloadMap = any;
  type Content = any;
  type UUID = string;

  // ContentType enum
  export enum ContentType {
    IMAGE = "image",
    VIDEO = "video",
    AUDIO = "audio",
    DOCUMENT = "document",
    LINK = "link"
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
    getService?: (serviceType: string) => any;
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

  export type PluginEvents = {
    [K in keyof EventPayloadMap]?: EventHandler<K>[];
  } & {
    [key: string]: ((params: any) => Promise<any>)[];
  };

  export interface Plugin {
    name: string;
    description: string;
    init?: (config: Record<string, string>, runtime: IAgentRuntime) => Promise<void>;
    config?: {
      [key: string]: any;
    };
    services?: (typeof Service)[];
    componentTypes?: {
      name: string;
      schema: Record<string, unknown>;
      validator?: (data: any) => boolean;
    }[];
    actions?: Action[];
    providers?: Provider[];
    evaluators?: Evaluator[];
    adapter?: IDatabaseAdapter;
    models?: {
      [key: string]: (...args: any[]) => Promise<any>;
    };
    events?: PluginEvents;
    routes?: Route[];
    tests?: TestSuite[];
    dependencies?: string[];
    testDependencies?: string[];
    priority?: number;
    schema?: any;
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

