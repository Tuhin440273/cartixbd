import type { OptionGroup, Variant } from '@/lib/types';

/** Finds the variant that has exactly the selected option values (one per option group). */
export function findVariant(variants: Variant[], selected: Record<string, number | undefined>, groups: OptionGroup[]): Variant | null {
  if (groups.length === 0) return variants[0] ?? null;
  const ids = groups.map((g) => selected[g.code]);
  if (ids.some((id) => id === undefined)) return null;
  return variants.find((v) => ids.every((id) => v.option_value_ids.includes(id!))) ?? null;
}

/** True when choosing this value (keeping the other choices) leads to a variant that is in stock. */
export function valueAvailable(
  variants: Variant[],
  groups: OptionGroup[],
  selected: Record<string, number | undefined>,
  groupCode: string,
  valueId: number,
): boolean {
  const others = groups.filter((g) => g.code !== groupCode).map((g) => selected[g.code]).filter((x): x is number => x !== undefined);
  return variants.some((v) => v.in_stock && v.option_value_ids.includes(valueId) && others.every((o) => v.option_value_ids.includes(o)));
}

export function initialSelection(variants: Variant[], groups: OptionGroup[]): Record<string, number> {
  const start = variants.find((v) => v.is_default && v.in_stock) ?? variants.find((v) => v.in_stock) ?? variants[0];
  const out: Record<string, number> = {};
  if (!start) return out;
  for (const g of groups) {
    const match = g.values.find((val) => start.option_value_ids.includes(val.id));
    if (match) out[g.code] = match.id;
  }
  return out;
}

/**
 * Photos for the current choice. A photo linked to any variant of a color belongs to that color, so it
 * shows for every size of the color. Photos without a link are shared and come after the color's photos.
 * When the chosen color has no photos of its own, the shared photos (or else all photos) are shown.
 */
export function galleryFor<T extends { variant_id: number | null }>(
  images: T[],
  variants: Variant[],
  groups: OptionGroup[],
  selected: Record<string, number | undefined>,
  selectedVariantId: number | null,
): T[] {
  const colorIds = new Set(groups.find((g) => g.code === 'color')?.values.map((v) => v.id) ?? []);
  const shared = images.filter((i) => i.variant_id === null);
  const colorOf = (variantId: number | null) =>
    variants.find((v) => v.id === variantId)?.option_value_ids.find((id) => colorIds.has(id));

  let own: T[] = [];
  const color = selected.color;
  if (colorIds.size > 0 && color !== undefined) {
    own = images.filter((i) => i.variant_id !== null && colorOf(i.variant_id) === color);
  } else if (selectedVariantId !== null) {
    own = images.filter((i) => i.variant_id === selectedVariantId);
  }
  if (own.length > 0) return [...own, ...shared];
  return shared.length > 0 ? shared : images;
}
