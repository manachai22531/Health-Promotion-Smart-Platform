'use strict';
// Run from the installed application tree, using the same Node executable as its service.
(async()=>{
 for(const name of ['qrcode','pdf-lib','@pdf-lib/fontkit','playwright-core'])require(name);
 await import('pdfjs-dist/legacy/build/pdf.mjs');
 require('../checkup-summary-pdf');
 console.log('PDF runtime modules: OK');
})().catch(error=>{console.error('PDF runtime modules: FAILED',error.code||'',error.message);process.exitCode=1});
