export function toHex(color: string): string {
  if (color.startsWith('#')) {
    if (color.length === 4) {
      return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
    }
    return color.slice(0, 7);
  }
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    const r = match[1].padStart(2, '0');
    const g = match[2].padStart(2, '0');
    const b = match[3].padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return '#000000';
}

export function gradientValue(start: string, end: string): string {
  return `linear-gradient(135deg, ${start}, ${end})`;
}

export function parseGradient(value: string | null): [string, string] {
  if (!value) return ['#1A73E8', '#0A2540'];
  const match = value.match(/linear-gradient\([^,]+,\s*([^,]+),\s*([^)]+)\)/);
  if (match) return [match[1].trim(), match[2].trim()];
  return ['#1A73E8', '#0A2540'];
}

export function isGradient(value: string | null | undefined): boolean {
  return !!value && /linear-gradient|radial-gradient/.test(value);
}

export function isImageBackground(value: string | null | undefined): boolean {
  return !!value && (/url\(/.test(value) || /^https?:\/\//.test(value));
}
