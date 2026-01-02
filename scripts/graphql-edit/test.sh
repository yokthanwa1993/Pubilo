#!/bin/bash
# Test GraphQL Edit - โพสต์รูปแล้วลบรูปผ่าน GraphQL
# ใช้ cookie จาก database + เพิ่ม i_user

cd "$(dirname "$0")/../.."

# ดึง cookie จาก database และเพิ่ม i_user
export FB_COOKIE=$(bun scripts/graphql-edit/get-cookie.ts)

bun run test_graphql_manual.ts
