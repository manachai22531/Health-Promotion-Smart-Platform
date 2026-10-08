const fs=require('fs');
const assert=require('assert');
const app=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
const html=fs.readFileSync('app.html','utf8');
const server=fs.readFileSync('server.js','utf8');

assert(css.includes('#searchView:not(.search-query-active) .search-main-stack>.search-card'));
assert(css.includes('min-height:150px!important'));
assert(app.includes("classList.toggle('search-query-active',personQ.length>=2||packageQ.length>=2)"));
assert(app.includes("classList.remove('search-query-active')"));
assert(html.includes('v=7.63.33-top5-first-screen'));
assert(server.includes("const RELEASE_NAME = 'v7.63.33-production'"));
console.log('v7.63.33 Top 5 first-screen regression: PASS');
