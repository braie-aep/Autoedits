/**
 * Composition geometry shared with browser export.
 * Source pixels are center-cropped to completely fill the target frame.
 * Horizontal position is adjustable for landscape-to-portrait reframing.
 */
export function sourceCropRect(sourceWidth, sourceHeight, outputWidth, outputHeight, focusX = 50) {
  if (![sourceWidth, sourceHeight, outputWidth, outputHeight].every(n => Number.isFinite(n) && n > 0)) {
    throw new RangeError('Source and output dimensions must be positive finite numbers');
  }
  const sourceAspect = sourceWidth / sourceHeight;
  const outputAspect = outputWidth / outputHeight;
  if (sourceAspect > outputAspect) {
    const width = sourceHeight * outputAspect;
    const fraction = Math.min(1, Math.max(0, Number(focusX) / 100 || 0));
    return { x: (sourceWidth - width) * fraction, y: 0, width, height: sourceHeight };
  }
  const height = sourceWidth / outputAspect;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}

export function outputCanvasSize(sourceWidth, sourceHeight, targetAspect, maxDimension = 1280) {
  if (![sourceWidth, sourceHeight, targetAspect, maxDimension].every(n => Number.isFinite(n) && n > 0)) {
    throw new RangeError('Invalid output dimensions');
  }
  let width, height;
  if (sourceWidth / sourceHeight > targetAspect) {
    height = sourceHeight;
    width = sourceHeight * targetAspect;
  } else {
    width = sourceWidth;
    height = sourceWidth / targetAspect;
  }
  const scale = Math.min(1, maxDimension / width, maxDimension / height);
  return {
    width: Math.max(2, Math.round(width * scale / 2) * 2),
    height: Math.max(2, Math.round(height * scale / 2) * 2),
  };
}
