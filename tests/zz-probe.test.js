import { it } from 'vitest';
import { shoppingItemsForRecipe } from '../src/lib/recipe-shopping.js';
it('p',()=>{
 const sets=[[['Lemon','1'],['Lemon juice','2 tbsp']],[['Spring onions','4'],['Scallions','2']],[['Canned chickpeas','1 tin'],['Chickpeas','1 tin']],[['Red onion','1'],['Onion','2']],[['Coriander','1 bunch'],['Fresh coriander','1 handful']],[['Parmesan','30 g'],['Grated parmesan','20 g']]];
 for(const s of sets){const rows=shoppingItemsForRecipe({id:'r',name:'R',ingredients:s.map(([name,qty])=>({name,qty}))},[],{today:'2026-09-22'});
 console.log(JSON.stringify(s),'=>',JSON.stringify(rows.map(r=>[r.name,r.qty])));}
});
