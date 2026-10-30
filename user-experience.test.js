'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {experienceProgress,levelCost}=require('./user-experience');
test('all 100 level transitions and 10 shield ranks follow the EXP thresholds',()=>{
 let xp=0;
 for(let level=1;level<=100;level++){
  const p=experienceProgress(xp);assert.equal(p.level,level);assert.equal(p.tier,Math.floor((level-1)/10)+1);
  if(level<100){assert.equal(p.currentExp,0);assert.equal(experienceProgress(xp+levelCost(level)-1).level,level);xp+=levelCost(level)}
 }
 assert.equal(experienceProgress(xp+1000000).level,100);assert.equal(experienceProgress(xp+1000000).percent,100);
});
test('invalid and negative totals start at level one',()=>{for(const n of [null,undefined,'invalid',-10])assert.equal(experienceProgress(n).level,1)});
