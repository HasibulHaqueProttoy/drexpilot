import type { SocialAccount } from "../db/schema.js";

export interface PublishResult {
  externalPostId: string;
  url?: string;
  rawResponse?: unknown;
}

export interface ContentValidationResult {
  valid: boolean;
  error?: string;
}

export interface IPublisher {
  readonly platform: string;
  validateContent(content: string): ContentValidationResult;
  publish(account: SocialAccount, content: string): Promise<PublishResult>;
}
