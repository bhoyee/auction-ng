# Your three slide images

Put your finished transparent PNG images in this folder, using these exact names:

| File | Slide |
| --- | --- |
| slide-1.png | Big upgrade. Smart move. |
| slide-2.png | Bid. Win. Save. / Join now |
| slide-3.png | Bid. Win. Make it yours. |

Use a transparent background (actual PNG transparency, not a white background or a checkerboard baked into the image). Supply product cutouts only: the website already supplies the wording, button and indigo background. Keep the products grouped together in each image, with clean edges and little empty padding. Recommended canvas: about 1600 � 1200 pixels; keep files reasonably small, ideally below 500 KB.

The image area uses the same indigo as the text area. Custom PNGs are displayed whole, without cropping or stretching. Existing photos remain as fallbacks until replacements are supplied.

After adding or replacing the files, tell the engineer to rebuild the local web container. Docker serves a built copy, so copying files here alone does not update the running preview. No code changes are needed for these three filenames. A normal web development restart/build also picks them up.

Supply images you own or are allowed to use. These are promotional images, not evidence of actual auction stock.

## Guide card images

guide-1.png, guide-2.png and guide-3.png replace the inner artwork in the three how-it-works cards, in order. The current owner-supplied files are identical wallet illustrations. Replace files individually when different artwork is ready, then rebuild the web preview. Headings and descriptions remain website text; images display whole without cropping.

Guide display copies: web builds automatically run scripts/prepare-guide-images.mjs. This trims empty transparent borders and creates 480/800/1200 px AVIF/WebP files in optimized/, with content-hashed filenames and a generated image manifest. The browser chooses a suitable size and format, loads the images lazily and caches them. Keep guide-1/2/3.png as the editable originals; after replacing them, rebuild the web preview. No manual compact-copy step remains.
