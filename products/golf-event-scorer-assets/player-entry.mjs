await import('./app.js');
const code=new URLSearchParams(location.search).get('join');
if(code){const input=document.getElementById('quickJoinCode');if(input)input.value=code.toUpperCase();setTimeout(()=>document.getElementById('quickJoinEvent')?.click(),300);}
