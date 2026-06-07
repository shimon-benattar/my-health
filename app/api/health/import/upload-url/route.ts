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

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      token: readWriteToken,
      body,
      request,
      onBeforeGenerateToken: async () => {
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

    return Response.json(jsonResponse);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
