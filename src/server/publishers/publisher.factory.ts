import type { IPublisher } from "./publisher.interface.js";
import { LinkedInPublisher } from "./linkedin.publisher.js";

export class PublisherFactory {
  private static publishers: Map<string, IPublisher> = new Map([
    ["linkedin", new LinkedInPublisher()],
  ]);

  static getPublisher(platform: string): IPublisher {
    const pub = this.publishers.get(platform.toLowerCase());
    if (!pub) {
      throw new Error(
        `Unsupported platform: '${platform}'. Supported platforms: ${Array.from(this.publishers.keys()).join(", ")}`
      );
    }
    return pub;
  }

  static registerPublisher(platform: string, publisher: IPublisher) {
    this.publishers.set(platform.toLowerCase(), publisher);
  }

  static getSupportedPlatforms(): string[] {
    return Array.from(this.publishers.keys());
  }
}
