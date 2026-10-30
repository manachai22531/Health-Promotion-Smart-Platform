(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CustomerDisplayModel=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const defaults={titleTh:'ข้อมูลการตรวจสุขภาพของฉัน',titleEn:'My health checkup',subtitleTh:'ดูแพ็กเกจและเลือกรายการตรวจเพิ่มเติมระหว่างรอเรียก',subtitleEn:'View packages and choose additional checkup services',identityTitleTh:'ยืนยันตัวตน',identityTitleEn:'Verify your identity',identityHintTh:'กรอกข้อมูลให้ตรงกับรายชื่อที่บริษัทส่งมา ระบบจะแสดงเฉพาะข้อมูลของคุณ',identityHintEn:'Enter the details registered by your company. Only your own information will be shown.',buttonTh:'ดูข้อมูลของฉัน',buttonEn:'View my information',helpTh:'',helpEn:'',supportPhone:'',supportUrl:'',primaryColor:'#075574',secondaryColor:'#07918b',backgroundColor:'#f1f9fc',defaultLanguage:'th',width:'standard',density:'comfortable',showLogo:true,showLanguageSwitch:true,showCardReader:true,showIdentityHelp:true,showSupport:false,loginAdEnabled:false,loginAdImage:'',loginAdLink:'',loginAdAlt:'',shopAdEnabled:false,shopAdImage:'',shopAdLink:'',shopAdAlt:'',knowledgeEnabled:true,knowledgeArticles:[]};
 const limits={titleTh:120,titleEn:120,subtitleTh:240,subtitleEn:240,identityTitleTh:80,identityTitleEn:80,identityHintTh:400,identityHintEn:400,buttonTh:60,buttonEn:60,helpTh:600,helpEn:600,supportPhone:40,supportUrl:500,loginAdImage:2000,loginAdLink:2000,loginAdAlt:200,shopAdImage:2000,shopAdLink:2000,shopAdAlt:200};
 function normalize(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('รูปแบบการตั้งค่าไม่ถูกต้อง');
  const result={...defaults};
  for(const [key,value] of Object.entries(input)){
   if(!Object.hasOwn(defaults,key))throw Error('ไม่รองรับการตั้งค่า '+key);
   if(key==='knowledgeArticles'){
    if(!Array.isArray(value)||value.length>50)throw Error('บทความต้องเป็นรายการไม่เกิน 50 บทความ');
    result[key]=value.map((article,index)=>{
     if(!article||typeof article!=='object'||Array.isArray(article))throw Error('บทความไม่ถูกต้อง');
     const out={};for(const [field,max] of Object.entries({id:80,title:160,disease:120,body:12000,sourceName:240,sourceUrl:2000,reviewedBy:160,reviewedAt:10})){
      const v=article[field]??(field==='id'?'article-'+index:'');if(typeof v!=='string'||v.length>max)throw Error('ข้อมูลบทความไม่ถูกต้อง: '+field);out[field]=v.trim();
     }
     if(!out.id||!out.title||!out.body)throw Error('กรุณาระบุชื่อและเนื้อหาบทความ');
     if(out.sourceUrl){let u;try{u=new URL(out.sourceUrl)}catch{throw Error('URL แหล่งอ้างอิงไม่ถูกต้อง')}if(u.protocol!=='https:'||u.username||u.password)throw Error('แหล่งอ้างอิงต้องเป็น HTTPS');out.sourceUrl=u.href}
     if(out.reviewedAt&&!/^\d{4}-\d{2}-\d{2}$/.test(out.reviewedAt))throw Error('วันที่ทบทวนไม่ถูกต้อง');
     if(!Array.isArray(article.packageCodes)||article.packageCodes.length>100||article.packageCodes.some(c=>typeof c!=='string'||!c.trim()||c.length>160))throw Error('รหัสแพ็กเกจไม่ถูกต้อง');
     out.packageCodes=[...new Set(article.packageCodes.map(c=>c.trim()))];out.published=article.published===true;return out;
    });if(new Set(result[key].map(a=>a.id)).size!==result[key].length)throw Error('รหัสบทความซ้ำ');continue;
   }
   if(typeof defaults[key]==='boolean'){if(typeof value!=='boolean')throw Error('ค่าตัวเลือกไม่ถูกต้อง: '+key);result[key]=value;continue}
   if(typeof value!=='string')throw Error('ข้อความไม่ถูกต้อง: '+key);
   const text=value.trim();
   if(key.endsWith('Color')){if(!/^#[0-9a-f]{6}$/i.test(text))throw Error('สีต้องเป็นรหัส #RRGGBB');result[key]=text;continue}
   const options={defaultLanguage:['th','en'],width:['standard','wide'],density:['comfortable','compact']}[key];
   if(options){if(!options.includes(text))throw Error('ตัวเลือกไม่ถูกต้อง: '+key);result[key]=text;continue}
   if(text.length>limits[key])throw Error('ข้อความยาวเกินกำหนด: '+key);
   if(/^(title|identityTitle|button)/.test(key)&&!text)throw Error('กรุณาระบุข้อความ: '+key);
   result[key]=text;
  }
  if(result.supportPhone&&!/^[0-9+().\s-]+$/.test(result.supportPhone))throw Error('เบอร์ติดต่อไม่ถูกต้อง');
  if(result.supportUrl){let url;try{url=new URL(result.supportUrl)}catch{throw Error('ลิงก์ติดต่อไม่ถูกต้อง')}if(url.protocol!=='https:'||url.username||url.password)throw Error('ลิงก์ติดต่อต้องใช้ HTTPS และไม่มีรหัสผ่านใน URL');result.supportUrl=url.href}
  for(const prefix of ['loginAd','shopAd']){
   for(const suffix of ['Image','Link']){const key=prefix+suffix;if(!result[key])continue;let url;try{url=new URL(result[key])}catch{throw Error('URL โฆษณาไม่ถูกต้อง: '+key)}if(url.protocol!=='https:'||url.username||url.password)throw Error('รูปและลิงก์โฆษณาต้องใช้ HTTPS และไม่มีรหัสผ่านใน URL');result[key]=url.href}
   if(result[prefix+'Enabled']&&!result[prefix+'Image'])throw Error('กรุณาระบุ URL รูปก่อนเปิดโฆษณา');
  }
  return result;
 }
 function advertisementMarkup(value,language='th'){
  const settings=normalize(value),esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return ['loginAd','shopAd'].map(prefix=>{if(!settings[prefix+'Enabled'])return '';const label=language==='en'?'Promotion':'ประชาสัมพันธ์',alt=settings[prefix+'Alt']||label,img='<img src="'+esc(settings[prefix+'Image'])+'" alt="'+esc(alt)+'" referrerpolicy="no-referrer" loading="lazy">',link=settings[prefix+'Link'];return '<aside class="cd-ad cd-ad-'+prefix+'" aria-label="'+label+'"><small>'+label+'</small>'+(link?'<a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+img+'</a>':img)+'</aside>'}).join('');
 }
 return {defaults,limits,normalize,advertisementMarkup};
});
