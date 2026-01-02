/**
 * Test GraphQL Edit - ใช้ cookie จาก HAR file โดยตรง
 * 
 * Usage: bun run test_graphql_manual.ts
 */

const PAGE_ID = "168440993027073";
const DOC_ID = "25358568403813021";

// ===== ต้องใส่ค่าจาก HAR file =====
const USER_ID = "61554708539220";  // จาก HAR
const FB_DTSG = "NAfvD-SFtLInkLXMyyuFTEpO7q3XjPOXCN9UC2UT3ug8MOy3P6Td76g:39:1766806117";  // จาก HAR
const COOKIE = process.env.FB_COOKIE || "";   // ใส่จาก browser หรือ set env

// Page token จาก database
const PAGE_TOKEN = "EAAChZCKmUTDcBQRecUIXBGbx3dLO3WxtMM0jS05e72qXQwrH652ekZBpqufcqrHejaAMSeZCbpHmgcxfJdpDhpakL7g1F8xCdcqUw0meE5K95soCpjQxXSspluyROHRcyPhdqfWV7ZCZARTOtluZBpiLfU3Df1TEHb4ugrf69hXrPYEZCcPeTyylmV16ZC6PkjbTOedjrfb54VwCPH250XLpWH4ZD";

function postIdToStoryId(actorId: string, postId: string): string {
  const actualPostId = postId.includes('_') ? postId.split('_')[1] : postId;
  const raw = `S:_I${actorId}:${actualPostId}:${actualPostId}`;
  return Buffer.from(raw).toString('base64');
}

async function createPhotoPost(message: string, imageUrl: string) {
  console.log("\n📸 Creating photo post...");
  const res = await fetch(`https://graph.facebook.com/v21.0/${PAGE_ID}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: imageUrl, message, access_token: PAGE_TOKEN })
  });
  const data = await res.json();
  console.log("Response:", data);
  if (data.error) throw new Error(data.error.message);
  return data.post_id || data.id;
}

async function editPostGraphQL(storyId: string, newMessage: string) {
  console.log("\n✏️ Editing via GraphQL...");
  
  const sessionId = crypto.randomUUID();
  const variables = {
    input: {
      story_id: storyId,
      attachments: [],
      audience: { privacy: { allow: [], base_state: "EVERYONE", deny: [], tag_expansion_state: "UNSPECIFIED" } },
      message: { ranges: [], text: newMessage },
      with_tags_ids: [],
      text_format_preset_id: "0",
      reels_remix: { is_original_audio_reusable: true, remix_status: "ENABLED" },
      tracking: [null],
      logging: { composer_session_id: sessionId },
      editable_post_feature_capabilities: ["CONTAINED_LINK", "CONTAINED_MEDIA", "POLL"],
      actor_id: USER_ID,
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
    av: USER_ID,
    __user: USER_ID,
    __a: "1",
    fb_dtsg: FB_DTSG,
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "ComposerStoryEditMutation",
    variables: JSON.stringify(variables),
    doc_id: DOC_ID
  });

  const res = await fetch("https://www.facebook.com/api/graphql/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": COOKIE,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Origin": "https://www.facebook.com",
      "X-FB-Friendly-Name": "ComposerStoryEditMutation"
    },
    body: params.toString()
  });

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    console.log("Response:", JSON.stringify(data, null, 2).slice(0, 2000));
    return data;
  } catch {
    console.log("Raw:", text.slice(0, 500));
    return null;
  }
}

async function checkPost(postId: string) {
  console.log("\n🔍 Checking post...");
  const res = await fetch(`https://graph.facebook.com/v21.0/${postId}?fields=message,attachments&access_token=${PAGE_TOKEN}`);
  const data = await res.json();
  console.log("Attachments:", data.attachments?.data?.length || 0);
  return data;
}

async function main() {
  if (!COOKIE) {
    console.log("❌ ต้องใส่ COOKIE ก่อน!");
    console.log("\nวิธี 1: Set environment variable");
    console.log("  FB_COOKIE='...' bun run test_graphql_manual.ts");
    console.log("\nวิธี 2: Copy จาก browser");
    console.log("  1. เปิด Facebook > F12 > Network");
    console.log("  2. ดู request ใดก็ได้ > Request Headers > Cookie");
    console.log("  3. Copy ทั้งหมด");
    process.exit(1);
  }

  // Create photo post
  const postId = await createPhotoPost(
    `🧪 Test - ${new Date().toLocaleString('th-TH')}`,
    "https://picsum.photos/800/600"
  );
  console.log("✅ Created:", postId);

  await new Promise(r => setTimeout(r, 3000));
  await checkPost(postId);

  // Edit via GraphQL
  const storyId = postIdToStoryId(USER_ID, postId);
  console.log("\n📝 Story ID:", storyId);
  
  await editPostGraphQL(storyId, `✅ แก้ไขแล้ว - ${new Date().toLocaleString('th-TH')}`);

  await new Promise(r => setTimeout(r, 3000));
  await checkPost(postId);

  // Output post_id for scripts
  console.log("\n📋 POST_ID=" + postId);
}

main();
