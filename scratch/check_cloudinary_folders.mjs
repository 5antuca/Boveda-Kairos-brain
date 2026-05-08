import { readFile } from "node:fs/promises";

const cloudName = "dttrfxbio";
const apiKey = "415316417757989";
const apiSecret = "kH2QZ-Z52O_BOnSgqS9qVf7_f9M"; // I'll try to find them from environment if possible, or use placeholders to see if it works

// Wait, I don't have the secrets. I'll check if I can find them in the environment.
console.log("Checking secrets...");
console.log("Cloud Name:", process.env.CLOUDINARY_CLOUD_NAME);

async function checkFolders() {
  const authHeader = `Basic ${Buffer.from(`${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`).toString("base64")}`;
  
  const url = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/search`;
  const body = {
    expression: "resource_type:(image OR video)",
    max_results: 500,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json();
  const folders = new Set();
  payload.resources.forEach(r => {
    if (r.asset_folder) folders.add(r.asset_folder);
  });
  console.log("Discovered Folders:", [...folders].sort());
}

checkFolders();
