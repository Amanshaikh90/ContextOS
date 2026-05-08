/**
 * Shared message types for communication between 
 * the Extension Host and the Webview.
 */
export enum WebviewMessageType {
  Info = "onInfo",
  Error = "onError",
  FileChanged = "fileChanged",
}

export interface WebviewMessage {
  type: WebviewMessageType;
  value?: any;
  file?: string;
}