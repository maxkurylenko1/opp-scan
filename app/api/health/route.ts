import { NextResponse } from "next/server";
import { hasSupabase } from "@/lib/config";
export async function GET(){return NextResponse.json({ok:true,supabase:hasSupabase,at:new Date().toISOString()})}
