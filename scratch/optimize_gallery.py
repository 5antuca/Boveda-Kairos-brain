import random
import re

current_content = """
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755308599/WhatsApp_Image_2025-08-15_at_21.43.45_llf2o2.jpg" alt="Gallery 1" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755294888/WhatsApp_Image_2025-08-15_at_17.20.26_xms7kf.jpg" alt="Gallery 2" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778162907/VID-20250425-WA0006_miw50i.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291677/35F889EE-5445-49CA-A5C4-2113E3AE04CC_10_11zon_l9kure.webp" alt="Gallery 4" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291677/36fc5e19-899e-491f-b1c7-0c8e72f2cea8_11_11zon_dycyza.webp" alt="Gallery 5" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291618/gallery-1_gufoly.webp" alt="Gallery 6" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291736/14486_69_11zon_wrf83t.webp" alt="Gallery 7" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755294881/WhatsApp_Image_2025-08-15_at_17.35.19_gtolym.jpg" alt="Gallery 8" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755294890/WhatsApp_Image_2025-08-15_at_17.09.31_xmd8da.jpg" alt="Gallery 9" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291783/71146_122_11zon_r3ly9d.webp" alt="Gallery 10" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291695/11052_49_11zon_khkl57.webp" alt="Gallery 11" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778169102/maserato_bcf8ps.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291734/14204_66_11zon_fhzrpq.webp" alt="Gallery 13" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755294887/WhatsApp_Image_2025-08-15_at_17.08.08_1_wmdzib.jpg" alt="Gallery 14" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1778171991/IMG_6057_1_dayfxt.jpg" alt="Gallery 15" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778168375/WhatsApp_Video_2026-05-07_at_10.39.52_snugbq.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755901755/WhatsApp_Image_2025-08-22_at_18.34.57_1_1_ky8q0e.jpg" alt="Gallery 17" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291738/14543_70_11zon_d4sd2a.webp" alt="Gallery 18" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1778133198/WhatsApp_Image_2026-05-06_at_19.17.32_jcx1wr.jpg" alt="Gallery 19" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291755/43162DC0-8EC5-4696-8A95-5406EFD7BED5_90_11zon_a3eazb.webp" alt="Gallery 20" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778096520/astonmartin2_ruicxq.mp4"></video></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778169310/lanrover2_rsybbr.mp4"></video></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778102842/astonmartindb5_denut5.mp4"></video></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778134925/WhatsApp_Video_2026-05-06_at_19.13.58_fdbqct.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755308603/WhatsApp_Image_2025-08-15_at_21.46.41_l0pb0x.jpg" alt="Gallery 25" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755294895/WhatsApp_Image_2025-08-15_at_17.18.40_lq7hlb.jpg" alt="Gallery 26" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291773/66302_111_11zon_gspjxd.webp" alt="Gallery 27" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291689/10826_36_11zon_fdsynu.webp" alt="Gallery 28" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778135190/WhatsApp_Video_2026-05-06_at_15.53.57_vasts1.mp4"></video></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778133721/WhatsApp_Video_2026-05-06_at_20.57.38_vfq6pj.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1778077760/83546_gjlcte.jpg" alt="Gallery 31" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291700/11254_57_11zon_givaud.webp" alt="Gallery 32" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1778085005/IMG_6294_xpwl3m.jpg" alt="Gallery 33" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778172587/101529_p3itpx.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755780419/WhatsApp_Image_2025-08-18_at_14.51.10_lcrbre.jpg" alt="Gallery 35" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1777925980/WhatsApp_Image_2026-05-04_at_16.48.12_bbn9wu.jpg" alt="Gallery 36" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1777926008/WhatsApp_Video_2026-05-04_at_16.42.58_tcqhsh.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291619/product-1_mqiatz.webp" alt="Gallery 38" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778134062/WhatsApp_Video_2026-05-06_at_19.56.09_r4ajih.mp4"></video></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778165208/jaguaretypev12_pmss25.mp4"></video></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778166658/mercedezpagoda_y4lqjv.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1778158274/Captura_de_pantalla_2026-05-07_a_la_s_09.50.20_llxhez.png" alt="Gallery 42" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291674/4A5C1C36-E673-401C-B710-11C9D2149471_3_11zon_j8z1nv.webp" alt="Gallery 43" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291778/69392_118_11zon_iqvupf.webp" alt="Gallery 44" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291697/11113_51_11zon_j1v5q0.webp" alt="Gallery 45" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291679/93E47AD4-B722-483A-8396-FF6849171B0F_16_11zon_aeafwy.webp" alt="Gallery 46" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755537622/WhatsApp_Image_2025-08-18_at_14.19.01_wwhleq.jpg" alt="Gallery 47" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1778133223/WhatsApp_Image_2026-05-06_at_19.21.21_lsrpk9.jpg" alt="Gallery 48" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755294880/WhatsApp_Image_2025-08-15_at_17.33.13_qdcvov.jpg" alt="Gallery 49" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1778135898/WhatsApp_Image_2026-05-06_at_21.42.57_vxexnz.jpg" alt="Gallery 50" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755294894/WhatsApp_Image_2025-08-15_at_17.24.18_yzluhl.jpg" alt="Gallery 51" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291620/team-2_rh4ebx.webp" alt="Gallery 52" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778157416/astonmartidb555_euizqk.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291676/9F73F6A0-93B2-413C-B917-6DF79D6619B7_8_11zon_ue9qqq.webp" alt="Gallery 54" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1778085004/IMG_6301_fnhtsa.jpg" alt="Gallery 55" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778104656/WhatsApp_Video_2026-05-06_at_18.49.41_kuiuqk.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291758/62160_93_11zon_umnwzb.webp" alt="Gallery 57" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1778030621/jscuawrupmypzpkacead.jpg" alt="Gallery 58" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1778135822/WhatsApp_Image_2026-05-06_at_21.40.49_ccuzl6.jpg" alt="Gallery 59" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291619/product-2_y4xogp.webp" alt="Gallery 60" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778168908/porsche65_ludf4o.mp4"></video></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778248928/WhatsApp_Video_2026-05-07_at_11.12.20_r6j2c8.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291738/14546_71_11zon_vbrcq3.webp" alt="Gallery 63" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291692/10947_41_11zon_dhjmfe.webp" alt="Gallery 64" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291697/11151_52_11zon_ppmqin.webp" alt="Gallery 65" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778167186/torino_opxcti.mp4"></video></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778165712/coupe_volcnw.mp4"></video></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778030659/jfv0xgbzt2en4gkdediw.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755901793/WhatsApp_Image_2025-08-22_at_18.37.05_3_1_wqprdx.jpg" alt="Gallery 69" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778133995/WhatsApp_Video_2026-05-06_at_19.52.09_krpjgb.mp4"></video></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778105293/Secuencia_01_jvsdt4.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291768/65244_106_11zon_yts6wa.webp" alt="Gallery 72" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291829/100273_4_11zon_afvloo.webp" alt="Gallery 73" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291753/41902_85_11zon_jgdbex.webp" alt="Gallery 74" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1778030624/pzu1rvgbnjj3luqdzwtz.jpg" alt="Gallery 75" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291739/14573_73_11zon_hz2kdr.webp" alt="Gallery 76" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291730/13072_63_11zon_rx96lo.webp" alt="Gallery 77" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291620/gallery-5_uarhoa.webp" alt="Gallery 78" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291619/gallery-2_amkhc7.webp" alt="Gallery 79" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291730/11444_62_11zon_hp0qa1.webp" alt="Gallery 80" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778248939/WhatsApp_Video_2026-05-07_at_11.19.54_fwljlo.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291758/44568_91_11zon_vss4ot.webp" alt="Gallery 82" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778133671/WhatsApp_Video_2026-05-06_at_20.56.31_aarktq.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755294891/WhatsApp_Image_2025-08-15_at_17.24.57_n3l365.jpg" alt="Gallery 84" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291754/41982_86_11zon_ahwjfo.webp" alt="Gallery 85" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1778172065/IMG_5552_khgebg.jpg" alt="Gallery 86" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291698/11219_55_11zon_kj75ft.webp" alt="Gallery 87" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291750/40083_83_11zon_ojftwk.webp" alt="Gallery 88" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291759/62409_96_11zon_s59boy.webp" alt="Gallery 89" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291759/62375_95_11zon_xqww5i.webp" alt="Gallery 90" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755780420/WhatsApp_Image_2025-08-18_at_15.05.44_bktcig.jpg" alt="Gallery 91" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1778171887/IMG_5092_q5yc7e.jpg" alt="Gallery 92" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291694/11003_44_11zon_r1rht8.webp" alt="Gallery 93" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755303707/WhatsApp_Image_2025-08-15_at_21.07.55_wrlahb.jpg" alt="Gallery 94" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291686/10749_33_11zon_tsbl4r.webp" alt="Gallery 95" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778158557/corvetemotor_dpicj5.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755900648/WhatsApp_Image_2025-08-22_at_18.37.04_2_1_mokc4r.jpg" alt="Gallery 97" /></div>
      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="https://res.cloudinary.com/dttrfxbio/video/upload/v1778248948/WhatsApp_Video_2026-05-07_at_12.49.08_pyk8fz.mp4"></video></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291677/016EF109-2CEE-4374-9280-5957F1D927E8_1__9_11zon_ixftmv.webp" alt="Gallery 99" /></div>
      <div class="carousel-slide"><img loading="lazy" src="https://res.cloudinary.com/dttrfxbio/image/upload/v1755291754/42523_88_11zon_rgm2p7.webp" alt="Gallery 100" /></div>
"""

fixed_head_urls = [
    "https://res.cloudinary.com/dttrfxbio/video/upload/v1777926008/WhatsApp_Video_2026-05-04_at_16.42.58_tcqhsh.mp4",
    "https://res.cloudinary.com/dttrfxbio/image/upload/v1777925981/WhatsApp_Image_2026-05-04_at_17.00.41_cubigq.jpg",
    "https://res.cloudinary.com/dttrfxbio/image/upload/v1755901804/WhatsApp_Image_2025-08-22_at_18.37.07_1_1_rwxdtm.jpg",
    "https://res.cloudinary.com/dttrfxbio/image/upload/v1755900648/WhatsApp_Image_2025-08-22_at_18.37.04_2_1_mokc4r.jpg",
    "https://res.cloudinary.com/dttrfxbio/image/upload/v1755780420/WhatsApp_Image_2025-08-18_at_15.05.44_bktcig.jpg",
    "https://res.cloudinary.com/dttrfxbio/image/upload/v1755537622/WhatsApp_Image_2025-08-18_at_14.19.01_wwhleq.jpg",
    "https://res.cloudinary.com/dttrfxbio/image/upload/v1755294890/WhatsApp_Image_2025-08-15_at_17.09.31_xmd8da.jpg"
]

def extract_urls(text):
    return re.findall(r'https://res\.cloudinary\.com/[^\s"\'\u003e]+', text)

all_pool_urls = extract_urls(current_content)

# Filter pool to remove fixed head items
pool_without_head = [u for u in all_pool_urls if u not in fixed_head_urls]

# Shuffle pool
random.shuffle(pool_without_head)

# Combine
final_list = fixed_head_urls + pool_without_head

# Remove duplicates (just in case)
seen = set()
unique_final = []
for u in final_list:
    if u not in seen:
        unique_final.append(u)
        seen.add(u)

# Generate HTML
html_output = []
for i, url in enumerate(unique_final):
    is_video = '/video/' in url
    if is_video:
        html_output.append(f'      <div class="carousel-slide"><video loading="lazy" muted loop playsinline src="{url}"></video></div>')
    else:
        html_output.append(f'      <div class="carousel-slide"><img loading="lazy" src="{url}" alt="Gallery {i+1}" /></div>')

print("\\n".join(html_output))
print(f"Total items: {len(unique_final)}")
print(f"First item: {unique_final[0]}")
