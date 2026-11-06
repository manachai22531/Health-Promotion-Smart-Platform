(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HealthCheckOfflineExport=api})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const safeJson=v=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
function build({base,options,masters={},vendor,model,returnModel,client,template,templateId,hrModel=''}){let binary='';for(const b of new Uint8Array(base))binary+=String.fromCharCode(b);const data={schema:'healthcheck-customer-return-v1',templateId:templateId||Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),options,masters,base:btoa(binary),records:[]};const script=s=>'<script>'+s.replace(/<\/script/gi,'<\\/script')+'</script>';return template.replace('<!-- CUSTOMER_PAYLOAD -->',()=>'<script id="customerPayload" type="application/json">'+safeJson(data)+'</script>').replace('<!-- CUSTOMER_SCRIPTS -->',()=>[vendor,model,returnModel,hrModel,client].map(script).join('\n'))}
return {build,safeJson};
});
