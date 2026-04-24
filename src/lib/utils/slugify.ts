/**
 * slugify - Convert a string to a URL-friendly slug
 * 
 * Converts "Sample Client" to "sample-client"
 * Removes special characters, converts to lowercase, replaces spaces with hyphens
 * 
 * @param text - The text to slugify
 * @returns The slugified string
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-');        // Replace multiple - with single -
}

/**
 * generateTenantId - Generate a unique tenant_id from a name
 * 
 * @param name - The tenant name
 * @param suffix - Optional suffix to ensure uniqueness
 * @returns The generated tenant_id
 */
export function generateTenantId(name: string, suffix?: string): string {
  const baseSlug = slugify(name);
  return suffix ? `${baseSlug}-${suffix}` : baseSlug;
}
