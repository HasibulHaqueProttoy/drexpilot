import type { SocialAccount } from "../db/schema.js";

export interface PostMediaOptions {
  mediaType?: "none" | "image" | "video" | "carousel";
  mediaUrls?: string[];
  mediaTitle?: string | null;
}

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
  validateContent(content: string, media?: PostMediaOptions): ContentValidationResult;
  publish(account: SocialAccount, content: string, media?: PostMediaOptions): Promise<PublishResult>;
}
