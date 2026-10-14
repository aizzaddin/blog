const sharp = require('sharp');

// Uploaded images are made no bigger than they're ever shown (at 2× for sharp screens), turned upright,
// and saved without camera data such as the GPS location phones add to photos.
const LIMITS = {
  avatar: 512, // shown as a 96–112 px circle
  story: 1600, // covers and images in a story, shown up to the 680 px text column
};

// Each format is saved as itself, so a PNG keeps its transparency and a GIF keeps moving.
const FORMATS = {
  jpeg: { ext: '.jpg', encode: (image) => image.jpeg({ quality: 82, mozjpeg: true }) },
  png: { ext: '.png', encode: (image) => image.png({ compressionLevel: 9 }) },
  webp: { ext: '.webp', encode: (image) => image.webp({ quality: 80 }) },
  gif: { ext: '.gif', encode: (image) => image.gif() },
  heif: { ext: '.avif', encode: (image) => image.avif({ quality: 55 }) },
};

// Images over 100 megapixels are refused rather than decoded.
const OPEN = { animated: true, limitInputPixels: 100_000_000 };

// Returns { buffer, ext } for an uploaded image, or throws if it can't be read.
async function shrink(input, purpose = 'story') {
  const max = LIMITS[purpose] || LIMITS.story;
  const { format } = await sharp(input, OPEN).metadata();
  const output = FORMATS[format];
  if (!output) throw new Error(`Unsupported image format: ${format}`);
  const image = sharp(input, OPEN)
    .rotate()
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true });
  return { buffer: await output.encode(image).toBuffer(), ext: output.ext };
}

module.exports = { LIMITS, shrink };
