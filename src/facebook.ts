import type { Config, PublishOptions, PublishResult, AdCreativePayload } from "./types";

const API_VERSION = "v21.0";
const API_BASE = `https://graph.facebook.com/${API_VERSION}`;

type LogFn = (message: string) => void;

export class FacebookPublisher {
  private config: Config;
  private log: LogFn;

  constructor(config: Config, log: LogFn = console.log) {
    this.config = config;
    this.log = log;
  }

  private getHeaders(): Record<string, string> {
    return {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      "Cookie": this.config.cookie,
    };
  }

  // Step 1: Create Ad Creative
  private async createAdCreative(options: PublishOptions): Promise<string> {
    this.log("STEP 1: Creating Ad Creative...");
    this.log(`   Using image: ${options.imageUrl}`);

    const payload: AdCreativePayload = {
      object_story_spec: {
        link_data: {
          picture: options.imageUrl,
          description: options.description || this.config.defaults.description,
          link: options.linkUrl,
          name: options.linkName,
          multi_share_optimized: true,
          multi_share_end_card: false,
          caption: options.caption || this.config.defaults.caption,
          call_to_action: { type: "LEARN_MORE" },
        },
        page_id: this.config.pageId,
      },
    };

    const url = `${API_BASE}/${this.config.adAccountId}/adcreatives?access_token=${this.config.accessToken}&fields=effective_object_story_id`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Failed to create ad creative: ${data.error.message}`);
    }

    this.log(`   Creative ID: ${data.id}`);
    return data.id;
  }

  // Step 2: Trigger processing
  private async triggerProcessing(creativeId: string): Promise<void> {
    this.log("STEP 2: Triggering post processing...");

    const url = `${API_BASE}/${creativeId}?access_token=${this.config.accessToken}&fields=effective_object_story_id`;

    const response = await fetch(url, {
      headers: this.getHeaders(),
    });

    if (response.ok) {
      this.log("   Trigger sent successfully");
    } else {
      this.log("   Trigger warning, but continuing...");
    }
  }

  // Step 3: Fetch Page Access Token
  private async fetchPageAccessToken(): Promise<string> {
    this.log(`STEP 3: Fetching Page Access Token for Page ID ${this.config.pageId}...`);

    const url = `${API_BASE}/${this.config.pageId}?access_token=${this.config.accessToken}&fields=access_token`;

    const response = await fetch(url, {
      headers: this.getHeaders(),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Failed to fetch page token: ${data.error.message}`);
    }

    if (!data.access_token) {
      throw new Error("No page access token in response");
    }

    this.log("   Got Page Access Token");
    return data.access_token;
  }

  // Step 4: Poll for Post ID
  private async waitForPostId(creativeId: string, maxAttempts = 10): Promise<string> {
    this.log("STEP 4: Waiting for Post ID...");

    const url = `${API_BASE}/${creativeId}?access_token=${this.config.accessToken}&fields=effective_object_story_id`;

    for (let i = 1; i <= maxAttempts; i++) {
      try {
        const response = await fetch(url, {
          headers: this.getHeaders(),
        });
        const data = await response.json();

        if (data.effective_object_story_id) {
          this.log(`   Post ID: ${data.effective_object_story_id}`);
          return data.effective_object_story_id;
        }
      } catch (err) {
        this.log(`   Error: ${err}`);
      }

      if (i < maxAttempts) {
        this.log(`   Attempt ${i}/${maxAttempts}, waiting 3s...`);
        await Bun.sleep(3000);
      }
    }

    throw new Error(`Post ID not available after ${maxAttempts} attempts`);
  }

  // Convert post ID to story ID format for GraphQL
  // e.g. "168440993027073_122247104042156951" -> "S:_I168440993027073:122247104042156951"
  private postIdToStoryId(postId: string): string {
    const parts = postId.split("_");
    if (parts.length !== 2) {
      throw new Error(`Invalid post ID format: ${postId}`);
    }
    return `S:_I${parts[0]}:${parts[1]}`;
  }

  // Step 5: Schedule post using GraphQL API (v2.fewfeed.com method)
  private async schedulePostGraphQL(postId: string, scheduledTime: number): Promise<void> {
    this.log(`STEP 5: Scheduling post via GraphQL for ${new Date(scheduledTime * 1000).toLocaleString('th-TH')}...`);

    if (!this.config.fbDtsg) {
      throw new Error("fb_dtsg is required for scheduling. Please refresh the page and try again.");
    }

    const storyId = this.postIdToStoryId(postId);
    this.log(`   Story ID: ${storyId}`);

    // GraphQL doc_id for scheduling (from v2.fewfeed.com HAR)
    const docId = "5001941423228398";

    const variables = JSON.stringify({
      input: {
        client_mutation_id: "1",
        actor_id: this.config.pageId,
        story_ids: [storyId],
        page_id: this.config.pageId,
        scheduled_publish_time: scheduledTime,
      },
    });

    // Build form data (same as v2.fewfeed.com)
    const formData = new FormData();
    formData.append("fb_dtsg", this.config.fbDtsg);
    formData.append("av", this.config.pageId);
    formData.append("server_timestamps", "true");
    formData.append("doc_id", docId);
    formData.append("variables", variables);

    const response = await fetch("https://business.facebook.com/api/graphql/", {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        "Origin": "https://business.facebook.com",
        "Referer": "https://business.facebook.com",
      },
      body: formData,
    });

    const text = await response.text();
    this.log(`   Response: ${text.substring(0, 200)}`);

    try {
      const data = JSON.parse(text);

      // Check for errors
      if (data.errors || data.error) {
        const errorMsg = data.errors?.[0]?.message || data.error?.message || "Unknown GraphQL error";
        throw new Error(`GraphQL scheduling failed: ${errorMsg}`);
      }

      // Check for success
      if (data.data?.publishing_action?.error === null) {
        this.log("   Post scheduled on Facebook successfully via GraphQL!");
        return;
      }

      // Check for publishing_action error
      if (data.data?.publishing_action?.error) {
        throw new Error(`Scheduling failed: ${data.data.publishing_action.error}`);
      }

      throw new Error("Unexpected GraphQL response");
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error(`Invalid response from GraphQL: ${text.substring(0, 100)}`);
      }
      throw e;
    }
  }

  // Step 5: Publish or Schedule post via REST API
  private async publishPost(postId: string, pageAccessToken: string, scheduledTime?: number): Promise<void> {
    if (scheduledTime) {
      this.log(`STEP 5: Scheduling post for ${new Date(scheduledTime * 1000).toLocaleString('th-TH')}...`);
    } else {
      this.log("STEP 5: Publishing the post...");
    }

    const url = `${API_BASE}/${postId}?access_token=${pageAccessToken}`;

    // For scheduling: set is_published=false and scheduled_publish_time
    // For immediate: set is_published=true
    const body = scheduledTime
      ? { is_published: false, scheduled_publish_time: scheduledTime }
      : { is_published: true };

    this.log(`   Request body: ${JSON.stringify(body)}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    this.log(`   Response: ${JSON.stringify(data)}`);

    if (data.error) {
      throw new Error(`Failed to ${scheduledTime ? 'schedule' : 'publish'}: ${data.error.message}`);
    }

    if (data.success) {
      this.log(scheduledTime ? "   Post scheduled successfully!" : "   Post published successfully!");
    } else {
      throw new Error("Publish returned unexpected response");
    }
  }

  async publish(options: PublishOptions): Promise<PublishResult> {
    if (options.scheduledTime) {
      this.log(`Creating post for scheduling at ${new Date(options.scheduledTime * 1000).toLocaleString('th-TH')}...\n`);
    } else {
      this.log("Starting Facebook publish...\n");
    }

    // Step 1: Create ad creative (uses Ads Token)
    const creativeId = await this.createAdCreative(options);

    // Step 2: Trigger processing
    await this.triggerProcessing(creativeId);

    // Step 3: Get Page Access Token
    const pageAccessToken = await this.fetchPageAccessToken();

    // Step 4: Wait for post ID
    const postId = await this.waitForPostId(creativeId);

    // Step 5: Publish immediately OR return for scheduling via extension GraphQL
    if (options.scheduledTime) {
      // For scheduling: DON'T publish here - return post ID for frontend to schedule via extension GraphQL
      // (Ads posts require GraphQL for scheduling - REST API doesn't work)
      this.log("   Post created (unpublished). Frontend will schedule via extension GraphQL.");

      const result: PublishResult = {
        success: true,
        postId,
        url: `https://www.facebook.com/${postId}`,
        creativeId,
        needsScheduling: true, // Flag to tell frontend to call extension
        scheduledTime: options.scheduledTime,
      };

      this.log(`\nPost ready for scheduling. Post ID: ${postId}`);
      return result;
    } else {
      // Immediate publish via REST API
      await this.publishPost(postId, pageAccessToken);

      const result: PublishResult = {
        success: true,
        postId,
        url: `https://www.facebook.com/${postId}`,
        creativeId,
      };

      this.log(`\nDone! View post: ${result.url}`);
      return result;
    }
  }
}
