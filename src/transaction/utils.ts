
/** Linear interpolation utility */
export function interpolate(from: number[], to: number[], f: number): number[] {
  if (from.length !== to.length) {
    throw new Error(`Mismatched interpolation args ${from} vs ${to}`);
  }
  return from.map((v,i) => v*(1-f) + to[i]*f);
}

/** Convert degrees to a 2x2 rotation matrix (flattened) */
export function convertRotationToMatrix(deg: number): number[] {
  const rad = deg * Math.PI/180;
  return [Math.cos(rad), -Math.sin(rad), Math.sin(rad), Math.cos(rad)];
}

/** Helper to return -1 for odd, 0 for even */
export function isOdd(num: number): number {
  return num % 2 ? -1 : 0;
}

export function floatToHex(xInput: number): string {
  const result: string[] = [];
  let x = xInput;
  let quotient = Math.floor(x);
  const fraction = x - quotient;
  while (quotient > 0) {
    const q = Math.floor(x/16);
    const rem = Math.floor(x - q*16);
    if (rem > 9) result.unshift(String.fromCharCode(rem+55));
    else result.unshift(rem.toString());
    x = q;
    quotient = Math.floor(x);
  }
  if (fraction === 0) {
    return result.join('');
  }
  result.push('.');
  let frac = fraction;
  while (frac > 0) {
    frac *= 16;
    const integer = Math.floor(frac);
    frac -= integer;
    if (integer > 9) result.push(String.fromCharCode(integer+55));
    else result.push(integer.toString());
  }
  return result.join('');
} 