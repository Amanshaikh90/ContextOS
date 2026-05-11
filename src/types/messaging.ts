/**
 * Shared message types for communication between 
 * the Extension Host and the Webview.
 */
export enum WebviewMessageType {
  Info = "onInfo",
  Error = "onError",
  FileChanged = "fileChanged",
  ContextLoaded = "contextLoaded",
  SetLoading="setLoading",
}


export interface WebviewMessage {
  type: WebviewMessageType;
  value?: any;
  file?: string;
}


export interface ProjectContext {
  jira:any[];
  github:any[];
  aiSummary:string;
}