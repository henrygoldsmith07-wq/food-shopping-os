import { describe, expect, it } from 'vitest';
import { canonicalName } from '../src/lib/aliases.js';

describe('more wordings merge on the shopping list', () => {
  it.each([
    ['boneless chicken thighs', 'chicken thighs'], ['dried spaghetti', 'penne'],
    ['broccoli florets', 'broccoli'], ['root ginger', 'fresh ginger'],
    ['juice of lemon', 'lemon'],
  ])('%s merges with %s', (a, b) => expect(canonicalName(a)).toBe(canonicalName(b)));
  it('does not merge different things', () => {
    expect(canonicalName('dried pasta')).not.toBe(canonicalName('rice'));
    expect(canonicalName('chicken thighs')).not.toBe(canonicalName('chicken breast'));
  });
});

describe('more everyday wordings merge on the shopping list', () => {
  it.each([
    ['spinach leaves', 'baby spinach'], ['cherry tomato', 'cherry tomatoes'],
    ['canned diced tomatoes', 'chopped tomatoes'], ['thyme sprigs', 'fresh thyme'], ['thyme', 'sprigs of thyme'],
    ['rosemary sprigs', 'fresh rosemary'], ['mint leaves', 'fresh mint'], ['tinned tuna', 'tuna chunks'],
    ['french beans', 'green beans'], ['whole wheat bread', 'wholemeal bread'], ['juice of lime', 'lime juice'],
  ])('%s merges with %s', (a, b) => expect(canonicalName(a)).toBe(canonicalName(b)));
  it('keeps different things apart', () => {
    expect(canonicalName('runner beans')).not.toBe(canonicalName('green beans'));
    expect(canonicalName('tuna')).not.toBe(canonicalName('salmon'));
  });
});

describe('herb, fish, tinned-pulse and prep wordings merge on the shopping list', () => {
  it.each([
    ['coriander sprigs', 'fresh coriander'], ['chopped parsley', 'parsley'], ['sprigs of basil', 'basil'],
    ['tiger prawns', 'king prawns'], ['fillet of cod', 'cod fillets'], ['tinned chickpeas', 'chickpeas'],
    ['canned kidney beans', 'kidney beans'], ['tinned cannellini beans', 'cannellini beans'],
    ['light olive oil', 'olive oil'], ['large carrots', 'carrots'], ['minced garlic', 'garlic cloves'],
  ])('%s merges with %s', (a, b) => expect(canonicalName(a)).toBe(canonicalName(b)));
  it('keeps different things apart', () => {
    expect(canonicalName('prawns')).not.toBe(canonicalName('cod'));
    expect(canonicalName('red onion')).not.toBe(canonicalName('garlic'));
  });
});

describe('mint, onion, celery, ginger and potato wordings merge', () => {
  it.each([
    ['chopped mint', 'fresh mint'], ['sprigs of mint', 'mint'], ['large onions', 'onions'], ['diced onion', 'onion'],
    ['medium red onion', 'red onions'], ['celery stick', 'celery stalks'], ['stalks of celery', 'celery'],
    ['grated ginger', 'root ginger'], ['large potatoes', 'potatoes'], ['baking potatoes', 'potato'],
  ])('%s merges with %s', (a, b) => expect(canonicalName(a)).toBe(canonicalName(b)));
  it('keeps different things apart', () => {
    expect(canonicalName('red onion')).not.toBe(canonicalName('onion'));
    expect(canonicalName('new potatoes')).not.toBe(canonicalName('potatoes'));
  });
});
