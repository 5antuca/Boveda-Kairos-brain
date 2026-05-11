function replaceCloudinaryTransformations(url, newTransforms) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url;
  const parts = url.split('/image/upload/');
  let rest = parts[1];
  const segments = rest.split('/');
  
  if (segments.length > 1 && (segments[0].includes(',') || /^[qwfc]_/.test(segments[0]))) {
    segments.shift(); 
  }
  
  return `${parts[0]}/image/upload/${newTransforms}/${segments.join('/')}`;
}

const url = "https://res.cloudinary.com/dttrfxbio/image/upload/q_100,f_webp,c_limit,w_800/Disen%CC%83o_sin_ti%CC%81tulo_14_yuetsl.png";
console.log(replaceCloudinaryTransformations(url, 'w_30,e_blur:1500,f_webp,q_20'));

const url2 = "https://res.cloudinary.com/dttrfxbio/image/upload/v1778248909/WhatsApp_Image_2026-05-04_at_17.53.45_istsvj_klfxdz.jpg";
console.log(replaceCloudinaryTransformations(url2, 'w_30,e_blur:1500,f_webp,q_20'));
