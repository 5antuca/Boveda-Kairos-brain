import { readFile, writeFile } from "node:fs/promises";

const cloudName = "dttrfxbio";
const apiKey = "416726481519382";
const apiSecret = "2npxwTpzqMM3Uy2ukien4gOPkcM";

const configPath = "/Users/5an/Documents/gerstner page/gerstnerwerks5-main/assets/projects.config.json";
const outputPath = "/Users/5an/Documents/gerstner page/gerstnerwerks5-main/assets/projects.generated.json";

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

const buildAssetUrl = (resource) => {
  const ext = resource.format ? `.${resource.format}` : "";
  const type = resource.resource_type || "image";
  const transformations = type === "video" ? "q_auto" : "q_auto,f_auto,c_limit,w_1400";
  return `https://res.cloudinary.com/${cloudName}/${type}/upload/${transformations}/${resource.public_id}${ext}`;
};

try {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const projectOverrides = config.projects || [];
  const excludedFolders = new Set(config.excludeFolders || []);

  const resources = await searchCloudinaryResources("resource_type:(image OR video)");
  const folderSet = new Set();
  resources.forEach((resource) => {
    const folder = resource?.asset_folder;
    if (!folder || excludedFolders.has(folder)) return;
    if (folder.includes("/")) return;
    folderSet.add(folder);
  });

  const discoveredFolders = [...folderSet];
  projectOverrides.forEach(p => { if (!discoveredFolders.includes(p.folder)) discoveredFolders.push(p.folder); });

  const generatedProjects = [];
  for (const folder of discoveredFolders) {
    const override = projectOverrides.find(p => p.folder === folder) || {};
    const folderResources = await searchCloudinaryResources(`asset_folder="${folder}" AND resource_type:(image OR video)`);
    
    const videoResources = folderResources.filter(r => r.resource_type === "video");
    const imageResources = folderResources.filter(r => r.resource_type === "image");

    const images = imageResources.map(buildAssetUrl);
    const videos = videoResources.map(buildAssetUrl);

    let coverVideo = override.coverVideo || (videos.length > 0 ? videos[0] : null);
    let coverImage = override.coverImage || (images.length > 0 ? images[0] : null);

    if (images.length === 0 && !coverVideo && !coverImage) continue;

    generatedProjects.push({
      title: override.title || folder,
      folder,
      coverVideo,
      coverImage,
      images,
    });
  }

  const order = projectOverrides.map(p => p.folder);
  generatedProjects.sort((a, b) => {
    const idxA = order.indexOf(a.folder);
    const idxB = order.indexOf(b.folder);
    if (idxA === -1 && idxB === -1) return a.folder.localeCompare(b.folder);
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  const output = {
    generatedAt: new Date().toISOString(),
    cloudName,
    projects: generatedProjects,
  };

  await writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`Generated ${generatedProjects.length} projects.`);
} catch (err) {
  console.error(err);
}
