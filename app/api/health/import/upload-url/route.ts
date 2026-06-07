import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const readWriteToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!readWriteToken) {
    return Response.json(
      {
        error:
          "Missing BLOB_READ_WRITE_TOKEN. Add it to your Vercel project environment variables and redeploy.",
      },
      { status: 500 }
    );
  }

  if (!readWriteToken.startsWith("vercel_blob_rw_")) {
    return Response.json(
      {
        error:
          "BLOB_READ_WRITE_TOKEN format looks invalid. Expected a Vercel Blob read-write token starting with 'vercel_blob_rw_'.",
      },
      { status: 500 }
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    console.log("[upload-url] Handling client token request");
    const jsonResponse = await handleUpload({
      token: readWriteToken,
      body,
      request,
      onBeforeGenerateToken: async () => {
        console.log("[upload-url] Generating client token");
        // Internal tool — no auth required.
        return {
          allowedContentTypes: [
            "application/zip",
            "application/x-zip-compressed",
            "application/x-zip",
            "application/octet-stream",
          ],
          maximumSizeInBytes: 5 * 1024 * 1024 * 1024, // 5 GB
          tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("[upload-url] Blob upload completed:", blob.url, tokenPayload);
      },
    });

    console.log("[upload-url] Token generated successfully");
    return Response.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[upload-url] Token generation failed:", message);
    return Response.json(
      {
        error:
          `Blob token generation failed: ${message}. ` +
          "Check Vercel logs and verify BLOB_READ_WRITE_TOKEN belongs to this Blob store.",
      },
      { status: 400 }
    );
  }
}
