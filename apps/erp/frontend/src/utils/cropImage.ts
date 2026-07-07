import type { Area } from 'react-easy-crop';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('Não foi possível carregar a imagem.')));
    img.src = src;
  });
}

const AVATAR_MAX_PX = 512;

/**
 * Recorta a região em pixels e exporta JPEG (redimensiona até 512px para arquivo leve).
 */
export async function getCroppedAvatarBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const { width, height, x, y } = pixelCrop;
  const scale = Math.min(1, AVATAR_MAX_PX / width, AVATAR_MAX_PX / height);
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Seu navegador não suporta recorte de imagem.');
  }

  ctx.drawImage(image, x, y, width, height, 0, 0, outW, outH);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Falha ao gerar a imagem recortada.'));
      },
      'image/jpeg',
      0.88,
    );
  });
}
