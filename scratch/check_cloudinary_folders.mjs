import { readFile } from "node:fs/promises";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

async function searchLogos() {
  const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
  
  const logos = ["braidLogo", "chnbllogo", "carbonfibersolutionslogo", "neumaticosderossilogo", "rodeo", "RGBlogo", "Spinneybecklogo", "tapiceriamacarlogo", "GRlogo", "solga"];
  
  console.log("Searching for Provider Logos:");
  for (const name of logos) {
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/search`;
    const body = {
      expression: name,
      max_results: 1,
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
    if (payload.resources && payload.resources.length > 0) {
      console.log(`- ${name}: FOUND -> ${payload.resources[0].secure_url}`);
    } else {
      console.log(`- ${name}: NOT FOUND`);
    }
  }
}

searchLogos();
