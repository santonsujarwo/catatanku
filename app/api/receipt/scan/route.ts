import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xnuvmvajotdumpvrnxug.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_ui_mwub_iGt4CcQZFpTH0g_vS3sEAQ9";

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    const token = authorization.slice(7);
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Silakan login kembali." }, { status: 401 });

    const body = await request.json();
    const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
    if (!storagePath || !storagePath.startsWith(user.id + "/") || storagePath.includes("..")) {
      return NextResponse.json({ error: "Lokasi dokumen tidak valid." }, { status: 400 });
    }
    const { data: file, error: downloadError } = await supabase.storage.from("receipts").download(storagePath);
    if (downloadError || !file) return NextResponse.json({ error: "File nota tidak ditemukan atau tidak memiliki akses." }, { status: 404 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Ukuran file maksimal 10 MB." }, { status: 413 });

    const serviceUrl = process.env.OCR_SERVICE_URL;
    const serviceSecret = process.env.OCR_SERVICE_SECRET;
    if (!serviceUrl || !serviceSecret) {
      return NextResponse.json({ error: "Layanan OCR belum dikonfigurasi. Tambahkan OCR_SERVICE_URL dan OCR_SERVICE_SECRET di environment server." }, { status: 503 });
    }
    const form = new FormData();
    form.append("file", file, storagePath.split("/").pop() || "receipt");
    const ocrResponse = await fetch(new URL("/scan", serviceUrl), {
      method: "POST",
      headers: { "X-OCR-Secret": serviceSecret },
      body: form,
      signal: AbortSignal.timeout(55000),
      cache: "no-store"
    });
    const result = await ocrResponse.json().catch(() => null);
    if (!ocrResponse.ok || !result) return NextResponse.json({ error: result?.detail || "Layanan OCR gagal memproses dokumen." }, { status: 502 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan server.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
