/// <reference types="vite/client" />

declare module "google-news-decoder" {
  export default class GoogleNewsDecoder {
    decodeGoogleNewsUrl(
      url: string
    ): Promise<{ status: boolean; decodedUrl?: string }>;
  }
}
