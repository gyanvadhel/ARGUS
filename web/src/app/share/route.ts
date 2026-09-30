import { NextResponse, type NextRequest } from "next/server";
import { scanPathFor, sharedInput } from "@/lib/share";

// "Share to Argus" from another app (see share_target in manifest.ts). The service worker (public/sw.js) receives
// the share first: it keeps a shared screenshot for the scanner and sends links and messages here as a GET.

function toScan(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  return toScan(request, scanPathFor(sharedInput({ title: p.get("title"), text: p.get("text"), url: p.get("url") })));
}

// Only reached when the service worker isn't running yet (Argus was just installed). Text still works; an image
// can't be handed to the scanner from here, so the scanner asks for it to be shared again.
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const field = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" ? value : null;
  };
  const input = sharedInput({ title: field("title"), text: field("text"), url: field("url") });
  const image = form?.get("image");
  if (!input && image instanceof File && image.size) return toScan(request, "/scan?shared=retry");
  return toScan(request, scanPathFor(input));
}
