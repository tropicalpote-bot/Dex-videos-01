import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({ apify: Boolean(process.env.APIFY_TOKEN), shotstack: Boolean(process.env.SHOTSTACK_API_KEY), supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY), localEditor: true }, { headers: {'Cache-Control':'no-store'} });
}
