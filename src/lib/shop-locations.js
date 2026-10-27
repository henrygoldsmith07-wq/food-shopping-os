/**
 * Where bought groceries go in the pantry. A shop used to put every row in
 * one place; this suggests Fridge / Freezer / Cupboard per row from the
 * name and aisle the shopper already sees, and lets the shopper override it.
 * Rules are keyword-based and explicit, never a guess dressed as data.
 */
import { LOCATIONS } from '../data/pantry.js';

const FREEZER = /\b(frozen|ice ?cream|ice cubes?|fish fingers?|peas|sweetcorn|oven chips|chips|waffles?)\b/i;
const FRIDGE = /\b(milk|cream|yog(?:h)?urt|cheese|butter|eggs?|chicken|beef|pork|lamb|mince|bacon|sausages?|ham|salmon|cod|prawns?|fish|tofu|hummus|lettuce|spinach|salad|rocket|tomatoes?|cucumber|peppers?|carrots?|broccoli|mushrooms?|courgettes?|herbs?|coriander|parsley|basil|juice|fresh)\b/i;
const FRIDGE_AISLE = /(dairy|meat|fish|chilled|fresh|produce|veg|fruit|deli)/i;
const FREEZER_AISLE = /frozen/i;
const SHELF = ['Fridge', 'Freezer', 'Cupboard'];

export const SHOP_LOCATION_CHOICES = SHELF.filter((l) => LOCATIONS.includes(l));

/** The suggested pantry location for one bought row. */
export const suggestShopLocation = (item = {}) => {
  const name = String(item.name || '');
  const aisle = String(item.aisle || item.category || '');
  if (FREEZER_AISLE.test(aisle) || FREEZER.test(name)) return 'Freezer';
  if (FRIDGE.test(name) || FRIDGE_AISLE.test(aisle)) return 'Fridge';
  return 'Cupboard';
};

/** Rows grouped by suggested location, with the shopper's overrides applied. */
export const shopLocationPlan = (items = [], overrides = {}) => {
  const rows = (Array.isArray(items) ? items : []).filter((i) => i && i.checked && i.name)
    .map((item) => {
      const picked = overrides?.[item.id];
      const location = SHOP_LOCATION_CHOICES.includes(picked) ? picked : suggestShopLocation(item);
      return { id: item.id, name: item.name, qty: item.qty || '', location, changed: location !== suggestShopLocation(item) };
    });
  const counts = Object.fromEntries(SHOP_LOCATION_CHOICES.map((l) => [l, rows.filter((r) => r.location === l).length]));
  return { rows, counts };
};

/** id → location for recordShop, covering every checked row. */
export const shopLocationMap = (items, overrides) => Object.fromEntries(
  shopLocationPlan(items, overrides).rows.map((r) => [r.id, r.location]),
);
