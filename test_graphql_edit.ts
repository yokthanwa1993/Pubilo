/**
 * Test script: โพสต์รูปผ่าน Graph API แล้วลบรูปผ่าน GraphQL
 * 
 * Usage: bun run test_graphql_edit.ts
 */

import postgres from 'postgres';

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING || "";
const sql = postgres(dbUrl, { ssl: 'require' });

const PAGE_ID = "168440993027073";  // Good - กู๊ด
const DOC_ID = "25358568403813021"; // ComposerStoryEditMutation

// ใช้ user ที่เป็น admin ของ Page
const ADMIN_USER_ID = "100090320823561";  // Chanalai Supphakan

interface Tokens {
  user_id: string;
  access_token: string;
  post_token: string;
  fb_dtsg: string;
  cookie: string;
}

async function getTokens(): Promise<Tokens> {
  // ใช้ user ที่กำหนด
  const [row] = await sql`SELECT * FROM tokens WHERE user_id = ${ADMIN_USER_ID}`;
  if (!row) throw new Error("No tokens found");
  return {
    user_id: row.user_id,
    access_token: row.access_token,
    post_token: row.post_token,
    fb_dtsg: row.fb_dtsg,
    cookie: row.cookie
  };
}

async function getPageToken(): Promise<string> {
  const [row] = await sql`SELECT post_token FROM auto_post_config WHERE page_id = ${PAGE_ID}`;
  if (!row?.post_token) throw new Error("No page token found");
  return row.post_token;
}

// 1. โพสต์รูปผ่าน Graph API
async function createPhotoPost(pageToken: string, message: string, imageUrl: string) {
  console.log("\n📸 Creating photo post via Graph API...");
  
  const res = await fetch(`https://graph.facebook.com/v21.0/${PAGE_ID}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: imageUrl,
      message,
      access_token: pageToken
    })
  });
  
  const data = await res.json();
  console.log("Response:", data);
  
  if (data.error) throw new Error(data.error.message);
  return data.post_id || data.id;
}

// 2. แปลง post_id เป็น story_id (base64)
// สำหรับ Page post: ใช้ Page ID ไม่ใช่ User ID
function postIdToStoryId(pageId: string, postId: string): string {
  // Format: S:_I{pageId}:{postId}:{postId}
  // postId format: pageId_actualPostId -> ใช้แค่ actualPostId
  const actualPostId = postId.includes('_') ? postId.split('_')[1] : postId;
  const raw = `S:_I${pageId}:${actualPostId}:${actualPostId}`;
  console.log("Raw story_id:", raw);
  return Buffer.from(raw).toString('base64');
}

// 3. แก้ไขโพสต์ผ่าน GraphQL (ลบรูป)
async function editPostGraphQL(tokens: Tokens, storyId: string, newMessage: string) {
  console.log("\n✏️ Editing post via GraphQL (removing photo)...");
  console.log("Story ID:", storyId);
  
  const sessionId = crypto.randomUUID();
  
  const variables = {
    input: {
      story_id: storyId,
      attachments: [], // ส่ง [] เพื่อลบรูป
      audience: {
        privacy: {
          allow: [],
          base_state: "EVERYONE",
          deny: [],
          tag_expansion_state: "UNSPECIFIED"
        }
      },
      message: { ranges: [], text: newMessage },
      with_tags_ids: [],
      text_format_preset_id: "0",
      reels_remix: {
        is_original_audio_reusable: true,
        remix_status: "ENABLED"
      },
      tracking: [null],
      logging: { composer_session_id: sessionId },
      editable_post_feature_capabilities: ["CONTAINED_LINK", "CONTAINED_MEDIA", "POLL"],
      actor_id: tokens.user_id,
      client_mutation_id: "1"
    },
    feedLocation: "NEWSFEED",
    feedbackSource: 1,
    focusCommentID: null,
    scale: 2,
    privacySelectorRenderLocation: "COMET_STREAM",
    renderLocation: "permalink",
    useDefaultActor: false,
    isGroupViewerContent: false,
    isSocialLearning: false,
    isWorkDraftFor: false,
    // Relay internal variables
    "__relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider": false,
    "__relay_internal__pv__IsWorkUserrelayprovider": false,
    "__relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider": false,
    "__relay_internal__pv__TestPilotShouldIncludeDemoAdUseCaserelayprovider": false,
    "__relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider": true,
    "__relay_internal__pv__FeedDeepDiveTopicPillThreadViewEnabledrelayprovider": false,
    "__relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider": false,
    "__relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider": true,
    "__relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider": false,
    "__relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider": false,
    "__relay_internal__pv__IsMergQAPollsrelayprovider": false,
    "__relay_internal__pv__FBReels_enable_meta_ai_label_gkrelayprovider": true,
    "__relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider": true,
    "__relay_internal__pv__FBUnifiedLightweightVideoAttachmentWrapper_wearable_attribution_on_comet_reels_qerelayprovider": false,
    "__relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider": false,
    "__relay_internal__pv__CometUFIShareActionMigrationrelayprovider": true,
    "__relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider": false,
    "__relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider": false,
    "__relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider": true,
    "__relay_internal__pv__GroupsCometGYSJFeedItemHeightrelayprovider": 150,
    "__relay_internal__pv__ShouldEnableBakedInTextStoriesrelayprovider": true,
    "__relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider": false
  };

  const params = new URLSearchParams({
    av: tokens.user_id,
    __user: tokens.user_id,
    __a: "1",
    fb_dtsg: tokens.fb_dtsg,
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "ComposerStoryEditMutation",
    variables: JSON.stringify(variables),
    doc_id: DOC_ID
  });

  const res = await fetch("https://www.facebook.com/api/graphql/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": tokens.cookie,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Origin": "https://www.facebook.com",
      "X-FB-Friendly-Name": "ComposerStoryEditMutation"
    },
    body: params.toString()
  });

  const text = await res.text();
  console.log("Response status:", res.status);
  
  try {
    const data = JSON.parse(text);
    console.log("Response:", JSON.stringify(data, null, 2).slice(0, 1000));
    return data;
  } catch {
    console.log("Raw response:", text.slice(0, 500));
    return { error: "Parse error" };
  }
}

// 4. ตรวจสอบโพสต์
async function checkPost(pageToken: string, postId: string) {
  console.log("\n🔍 Checking post...");
  
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${postId}?fields=message,attachments&access_token=${pageToken}`
  );
  const data = await res.json();
  console.log("Post data:", JSON.stringify(data, null, 2));
  return data;
}

async function main() {
  try {
    console.log("🚀 Starting test...\n");
    
    // Get tokens
    const tokens = await getTokens();
    const pageToken = await getPageToken();
    
    console.log("✅ Tokens loaded");
    console.log("  - User ID:", tokens.user_id);
    console.log("  - Has fb_dtsg:", !!tokens.fb_dtsg);
    console.log("  - Has cookie:", !!tokens.cookie);
    console.log("  - Has page token:", !!pageToken);

    // Step 1: Create photo post
    const testImage = "https://picsum.photos/800/600";
    const postId = await createPhotoPost(
      pageToken,
      `🧪 Test GraphQL Edit - ${new Date().toLocaleString('th-TH')}`,
      testImage
    );
    console.log("✅ Created post:", postId);

    // Wait a bit
    console.log("\n⏳ Waiting 3 seconds...");
    await new Promise(r => setTimeout(r, 3000));

    // Step 2: Check post (should have attachment)
    await checkPost(pageToken, postId);

    // Step 3: Convert to story_id (ใช้ User ID ของ admin)
    const storyId = postIdToStoryId(tokens.user_id, postId);
    console.log("\n📝 Story ID:", storyId);

    // Step 4: Edit via GraphQL (remove photo)
    const editResult = await editPostGraphQL(
      tokens,
      storyId,
      `✅ แก้ไขแล้ว - ลบรูปผ่าน GraphQL - ${new Date().toLocaleString('th-TH')}`
    );

    // Wait a bit
    console.log("\n⏳ Waiting 3 seconds...");
    await new Promise(r => setTimeout(r, 3000));

    // Step 5: Check post again (should have no attachment)
    await checkPost(pageToken, postId);

    console.log("\n✅ Test completed!");
    
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await sql.end();
  }
}

main();
