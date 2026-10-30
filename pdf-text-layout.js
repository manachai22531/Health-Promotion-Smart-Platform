'use strict';
// Per-render bounded cache; no document objects or customer text retained globally.
function createPdfWrapper(font){
 const widths=new Map(),segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('th',{granularity:'grapheme'}):null;
 function measure(text,size){const key=size+'|'+text;if(widths.has(key))return widths.get(key);const w=font.widthOfTextAtSize(text,size);if(widths.size>=4096)widths.clear();widths.set(key,w);return w}
 return function wrap(value,size,maxWidth){const result=[],limit=Math.max(5,maxWidth);for(const paragraph of String(value??'').replace(/\r\n?/g,'\n').split('\n')){
  const chars=segmenter?[...segmenter.segment(paragraph)].map(x=>x.segment):Array.from(paragraph);if(!chars.length){result.push('');continue}
  let start=0;while(start<chars.length){const count=chars.length-start;let fit=0,high=Math.min(16,count);while(measure(chars.slice(start,start+high).join(''),size)<=limit){fit=high;if(high===count)break;high=Math.min(count,high*2)}
   if(fit!==count){let low=fit+1,upper=high-1;while(low<=upper){const mid=Math.floor((low+upper)/2);if(measure(chars.slice(start,start+mid).join(''),size)<=limit){fit=mid;low=mid+1}else upper=mid-1}}
   fit=Math.max(1,fit);result.push(chars.slice(start,start+fit).join(''));start+=fit;
  }
 }return result.length?result:['']}
}
module.exports={createPdfWrapper};
