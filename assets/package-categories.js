(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HealthCheckPackageCategories=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function norm(v){return String(v==null?'':v).replace(/^\uFEFF|[\u200B-\u200D\u2060]/g,'').replace(/[（]/g,'(').replace(/[）]/g,')').replace(/[／]/g,'/').toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]+/g,'').trim()}
function inferPackageCategory(p){
  const explicit=String(p.category||'').trim(),explicitSub=String(p.subcategory||'').trim();if(explicit)return {category:explicit,subcategory:explicitSub||'ทั่วไป'};
  const text=norm(`${p.code||''} ${p.name||''}`),raw=String(`${p.code||''} ${p.name||''}`).toLowerCase();
  const has=(...terms)=>terms.some(term=>raw.includes(term.toLowerCase())||text.includes(norm(term)));
  if(has('vaccine','วัคซีน','influenza','flu vaccine','hpv vaccine','shingrix','pneumococcal'))return {category:'Vaccine',subcategory:'วัคซีน'};
  if(has('ultrasound','ultra sound','sonogram','sonography')){
    if(has('carotid','doppler','หลอดเลือด'))return {category:'Ultrasound',subcategory:'หลอดเลือด'};
    if(has('breast','เต้านม'))return {category:'Ultrasound',subcategory:'เต้านม'};
    if(has('thyroid','ไทรอยด์'))return {category:'Ultrasound',subcategory:'ไทรอยด์'};
    if(has('abdomen','ช่องท้อง','liver','ตับ'))return {category:'Ultrasound',subcategory:'ช่องท้อง'};
    return {category:'Ultrasound',subcategory:'อัลตราซาวด์อื่น ๆ'};
  }
  if(has('mammogram','x-ray','xray','ldct','low-dose ct','ct ','ctcalcium','ctc-','bmd','bone mineral','เอกซเรย์','ct scan'))return {category:'X-Ray & Imaging',subcategory:has('mammogram','breast','เต้านม')?'เต้านม':has('bmd','bone mineral','กระดูก')?'กระดูก':'เอกซเรย์ / CT'};
  if(has('ekg','ecg','echo','est','exercise stress','ankle brachial','abi','cardio','หัวใจ','คลื่นหัวใจ')){
    if(has('echo'))return {category:'Cardio',subcategory:'อัลตราซาวด์หัวใจ'};
    if(has('est','exercise stress'))return {category:'Cardio',subcategory:'สมรรถภาพหัวใจ'};
    if(has('abi','ankle brachial','carotid'))return {category:'Cardio',subcategory:'หลอดเลือด'};
    return {category:'Cardio',subcategory:'คลื่นไฟฟ้าหัวใจ'};
  }
  const lab=true;
  if(lab){
    if(has('cancer','มะเร็ง','afp','cea','ca19','ca 19','ca125','ca 125','psa','spot-mas','cellprep','thinprep','hpv dna','occult blood','fobtest'))return {category:'LAB',subcategory:'ตรวจมะเร็ง'};
    if(has('thyroid','tsh','t3','t4','cortisol','testosterone','hormone','ฮอร์โมน'))return {category:'LAB',subcategory:'ตรวจฮอร์โมน'};
    if(has('bun','creatinine','egfr','uric acid','uricacid','bilirubin','alkaline','sgot','sgpt','ast','alt','liver','kidney','ตับ','ไต'))return {category:'LAB',subcategory:'ตรวจตับ / ไต'};
    if(has('cholesterol','ldl','hdl','triglyceride','lipid','apolipoprotein','hba1c','glucose','blood sugar','เบาหวาน','ไขมัน'))return {category:'LAB',subcategory:'เบาหวาน / ไขมัน'};
    if(has('hepatitis','hbsag','anti-hb','rubella','vdrl','syphilis','hiv','antibody','antigen','ภูมิ','ไวรัส','ติดเชื้อ'))return {category:'LAB',subcategory:'ติดเชื้อ / ภูมิคุ้มกัน'};
    if(has('blood count','cbc','abo','rh group','blood group','hemoglobin','โลหิต','เลือด'))return {category:'LAB',subcategory:'ตรวจเลือดทั่วไป'};
    if(has('vitamin','calcium','sodium','mineral','วิตามิน','แคลเซียม'))return {category:'LAB',subcategory:'วิตามิน / แร่ธาตุ'};
    if(has('ige','allergen','allergy','ภูมิแพ้'))return {category:'LAB',subcategory:'ภูมิแพ้'};
    return {category:'LAB',subcategory:'LAB อื่น ๆ'};
  }
  return {category:'Other',subcategory:'อื่น ๆ'};
}
function packageMeta(p){const inferred=inferPackageCategory(p);return {category:String(p.category||'').trim()||inferred.category,subcategory:String(p.subcategory||'').trim()||inferred.subcategory}}
return {inferPackageCategory,packageMeta};});
