import { it, expect } from 'vitest';
import { shoppingForPlan } from '../src/lib/mealplan.js';
import { setMyRecipes } from '../src/data/recipes.js';
import { packOf } from '../src/lib/shoppable-qty.js';
it('packs', () => {
  const r=(id,ing)=>({id,name:id,servings:2,time:20,costPerServing:1,ingredients:ing.map(([n,qty])=>({name:n,qty}))});
  setMyRecipes([r('a',[['chopped tomatoes','400g tin']]), r('b',[['chopped tomatoes','2 x 400g tins']]), r('c',[['coconut milk','1 tin (400 ml)']]), r('d',[['coconut milk','400 g']])]);
  const d=['2026-10-24','2026-10-25'];
  const list=(ids,people)=>shoppingForPlan({[d[0]]:{dinner:ids[0]},[d[1]]:{dinner:ids[1]}},d,{pantry:[],today:'2026-10-23',people});
  expect(list(['a','b'],2)[0].qty).toBe('3 tins (400 g)');
  expect(list(['a','b'],3)[0].qty).toBe('5 tins (400 g)');
  expect(list(['a','b'],3)[0].requiredQty).toBe('1.8 kg');
  expect(list(['c','d'],2).find(x=>/coconut/i.test(x.name)).qty).not.toMatch(/tins/);
  expect(packOf('1 tin (400 g)')).toEqual({size:400,unit:'g',word:'tin'});
  expect(packOf('3 cloves')).toBe(null);
});
