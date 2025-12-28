export interface Config {
  accessToken: string;  // Ads Token (for creating ad creative)
  pageToken?: string;   // Page Token (for publishing - optional, will skip fetch if provided)
  fbDtsg?: string;      // fb_dtsg token (for GraphQL scheduling)
  cookie: string;
  adAccountId: string;
  pageId: string;
  defaults: {
    linkUrl: string;
    linkName: string;
    caption: string;
    description: string;
  };
}

export interface PublishOptions {
  imageUrl: string;
  linkUrl: string;
  linkName: string;
  caption?: string;
  description?: string;
  scheduledTime?: number; // Unix timestamp for Facebook scheduled post
}

export interface PublishResult {
  success: boolean;
  postId: string;
  url: string;
  creativeId?: string;
}

export interface FacebookError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export interface AdCreativePayload {
  object_story_spec: {
    link_data: {
      picture: string;
      description: string;
      link: string;
      name: string;
      multi_share_optimized: boolean;
      multi_share_end_card: boolean;
      caption: string;
      call_to_action: {
        type: string;
      };
    };
    page_id: string;
  };
}

export interface QueueItem {
  id: string;
  imageUrl: string;
  linkUrl: string;
  linkName: string;
  caption?: string;
  description?: string;
  status: "pending" | "processing" | "done" | "failed";
  createdAt: string;
  scheduledTime?: number; // Unix timestamp
  postUrl?: string;
  error?: string;
  // Tokens for publishing
  accessToken?: string;
  pageToken?: string;
  cookie?: string;
  adAccountId?: string;
  pageId?: string;
}

export interface ReferenceImage {
  data: string;
  mimeType: string;
}
