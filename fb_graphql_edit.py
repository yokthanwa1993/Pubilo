#!/usr/bin/env python3
"""
Facebook GraphQL Story Edit - ใช้ ComposerStoryEditMutation
ต้องใส่ cookie และ fb_dtsg จาก browser
"""
import requests
import json

# ===== ต้องใส่ค่าเหล่านี้จาก browser =====
COOKIE = ""  # ใส่ cookie ทั้งหมดจาก browser
FB_DTSG = "NAftOJutylXqAUeoxP07wFzAh0SHUekHm0A9sNmWqNBUoYbbUltWchg:39:1766806117"  # จาก HAR
LSD = "qlg47xcmbxdXUbD68rQtX0"  # จาก HAR
USER_ID = "61554708539220"
DOC_ID = "25358568403813021"  # ComposerStoryEditMutation doc_id

def edit_post_graphql(story_id: str, new_message: str, attachments: list = None):
    """
    แก้ไขโพสต์ผ่าน GraphQL
    story_id: base64 encoded story ID (เช่น UzpfSTYxNTU0NzA4NTM5MjIwOjEyMjI0NzgyNDI1MjE1Njk1MToxMjIyNDc4MjQyNTIxNTY5NTE=)
    new_message: ข้อความใหม่
    attachments: list ของ attachments (ส่ง [] เพื่อลบ attachments)
    """
    
    url = "https://www.facebook.com/api/graphql/"
    
    variables = {
        "input": {
            "story_id": story_id,
            "attachments": attachments if attachments is not None else [],
            "audience": {
                "privacy": {
                    "allow": [],
                    "base_state": "EVERYONE",
                    "deny": [],
                    "tag_expansion_state": "UNSPECIFIED"
                }
            },
            "message": {
                "ranges": [],
                "text": new_message
            },
            "with_tags_ids": [],
            "text_format_preset_id": "0",
            "actor_id": USER_ID,
            "client_mutation_id": "1"
        },
        "feedLocation": "NEWSFEED",
        "feedbackSource": 1,
        "focusCommentID": None,
        "scale": 2,
        "privacySelectorRenderLocation": "COMET_STREAM",
        "renderLocation": "permalink",
        "useDefaultActor": False,
        "isGroupViewerContent": False,
        "isSocialLearning": False,
        "isWorkDraftFor": False
    }
    
    data = {
        "av": USER_ID,
        "__user": USER_ID,
        "__a": "1",
        "fb_dtsg": FB_DTSG,
        "lsd": LSD,
        "fb_api_caller_class": "RelayModern",
        "fb_api_req_friendly_name": "ComposerStoryEditMutation",
        "variables": json.dumps(variables),
        "doc_id": DOC_ID
    }
    
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": COOKIE,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Origin": "https://www.facebook.com",
        "X-FB-Friendly-Name": "ComposerStoryEditMutation",
        "X-FB-LSD": LSD
    }
    
    response = requests.post(url, data=data, headers=headers)
    return response.json()


if __name__ == "__main__":
    # ตัวอย่างการใช้งาน
    STORY_ID = "UzpfSTYxNTU0NzA4NTM5MjIwOjEyMjI0NzgyNDI1MjE1Njk1MToxMjIyNDc4MjQyNTIxNTY5NTE="
    
    print("⚠️  ต้องใส่ COOKIE จาก browser ก่อนใช้งาน!")
    print("\nวิธีหา cookie:")
    print("1. เปิด Facebook ใน browser")
    print("2. กด F12 > Network > เลือก request ใดก็ได้")
    print("3. ดูที่ Request Headers > Cookie")
    print("\n" + "="*50)
    
    if not COOKIE:
        print("❌ กรุณาใส่ COOKIE ในไฟล์ก่อน")
    else:
        result = edit_post_graphql(
            story_id=STORY_ID,
            new_message="ข้อความใหม่ที่ต้องการ",
            attachments=[]  # ส่ง [] เพื่อลบรูป
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
