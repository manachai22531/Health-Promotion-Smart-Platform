'use strict';
const fs=require('node:fs'),path=require('node:path');
function browserCandidates({env=process.env,platform=process.platform,exists=fs.existsSync,chromium}={}){
 const paths=[env.HEALTHCHECK_PDF_BROWSER];
 try{paths.push(chromium?.executablePath())}catch{}
 if(platform==='win32'){
  const bases=[env.ProgramFiles,env['ProgramFiles(x86)'],env.LOCALAPPDATA,'C:\\Program Files','C:\\Program Files (x86)'].filter(Boolean);
  for(const parts of [['Google','Chrome','Application','chrome.exe'],['Microsoft','Edge','Application','msedge.exe']])for(const base of bases)paths.push(path.win32.join(base,...parts));
 }else paths.push('/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome');
 const seen=new Set();return paths.filter(file=>{if(!file)return false;const key=platform==='win32'?file.toLowerCase():file;if(seen.has(key)||!exists(file))return false;seen.add(key);return true});
}
function unavailable(code){return Object.assign(Error(code==='PDF_BROWSER_MISSING'?'ไม่พบเบราว์เซอร์สำหรับสร้าง PDF บนเครื่องที่รันโปรแกรม กรุณาติดตั้ง Google Chrome หรือ Microsoft Edge แล้วลองใหม่':'เปิดระบบสร้าง PDF ไม่สำเร็จ กรุณาลองใหม่ หากยังพบปัญหาให้ผู้ดูแลตรวจสอบ Chrome/Edge บนเครื่องที่รันโปรแกรม ระหว่างนี้ใช้ปุ่มพิมพ์ A4 ได้'),{status:503,code})}
async function withPdfBrowser(work,{chromium=require('playwright-core').chromium,platform=process.platform,env=process.env,exists=fs.existsSync,logger=console,timeoutMs=45000}={}){
 const candidates=browserCandidates({chromium,platform,env,exists});if(!candidates.length)throw unavailable('PDF_BROWSER_MISSING');
 const deadline=Date.now()+timeoutMs;const remaining=()=>{const value=deadline-Date.now();if(value<=0)throw Error('PDF operation timeout');return value};
 for(const executablePath of candidates){
  if(Date.now()>=deadline)break;let browser;
  try{
   browser=await chromium.launch({executablePath,headless:true,timeout:Math.min(12000,remaining()),...(platform==='win32'?{ignoreDefaultArgs:['--headless'],args:['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check']}:{args:['--no-sandbox','--disable-dev-shm-usage']})});
   return await work(browser,remaining);
  }catch(error){logger.warn('[PDF_BROWSER_FAILED]',executablePath,error?.message||String(error))}
  finally{if(browser)await browser.close().catch(()=>{})}
 }
 throw unavailable('PDF_BROWSER_START_FAILED');
}
module.exports={browserCandidates,withPdfBrowser};
