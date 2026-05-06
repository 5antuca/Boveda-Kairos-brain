import { readFile, writeFile } from "node:fs/promises";

const cloudName = "dttrfxbio";
const apiKey = "416726481519382";
const apiSecret = "2npxwTpzqMM3Uy2ukien4gOPkcM";

const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;

const searchCloudinaryResources = async (expression, sortBy = [{ created_at: "desc" }]) => {
  let nextCursor = "";
  const all = [];

  while (true) {
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/search`;
    const body = {
      expression,
      max_results: 500,
      sort_by: sortBy,
    };
    if (nextCursor) body.next_cursor = nextCursor;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Cloudinary API error ${res.status}: ${text}`);
    }

    const payload = await res.json();
    const resources = Array.isArray(payload.resources) ? payload.resources : [];
    all.push(...resources);

    if (!payload.next_cursor) break;
    nextCursor = payload.next_cursor;
  }

  return all;
};

try {
  console.log("Searching for folders...");
  const resources = await searchCloudinaryResources("resource_type:(image OR video)");
  const folderSet = new Set();
  resources.forEach((resource) => {
    const folder = resource?.asset_folder;
    if (folder) folderSet.add(folder);
  });
  console.log("Discovered folders:", [...folderSet]);
} catch (err) {
  console.error(err);
}
