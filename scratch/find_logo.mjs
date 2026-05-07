import fetch from "node-fetch";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.error("Missing Cloudinary credentials.");
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;

async function listRecentImages() {
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/search`;
  const body = {
    expression: "resource_type:image",
    max_results: 100,
    sort_by: [{ created_at: "desc" }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`Error: ${errorText}`);
    return;
  }

  const payload = await res.json();
  payload.resources.forEach(r => {
    console.log(`ID: ${r.public_id} | Created: ${r.created_at} | URL: ${r.secure_url}`);
  });
}

listRecentImages();
