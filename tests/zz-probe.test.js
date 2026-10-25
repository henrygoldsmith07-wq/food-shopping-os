import { it } from 'vitest';
import { shoppingForPlan } from '../src/lib/mealplan.js';
import { setMyRecipes } from '../src/data/recipes.js';
const r=(id,i)=>({id,name:id,servings:2,time:20,costPerServing:1,ingredients:i.map(([n,qty])=>({name:n,qty}))});
it('p',()=>{
 const a=r('a',[['olive oil','2 tbsp'],['spring onions','1 bunch'],['tomatoes','400 g'],['rice','1 cup'],['eggs','3']]);
 const b=r('b',[['extra virgin olive oil','100 ml'],['scallions','4'],['tinned tomatoes','1 can'],['basmati rice','200 g'],['egg','2']]);
 setMyRecipes([a,b]);const d=['2026-10-24','2026-10-25'];
 console.log(JSON.stringify(shoppingForPlan({[d[0]]:{dinner:'a'},[d[1]]:{dinner:'b'}},d,{pantry:[],today:'2026-10-23',people:2}).map(x=>[x.name,x.qty])));
});
