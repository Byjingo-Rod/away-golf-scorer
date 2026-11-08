(() => {
  'use strict';
  // Bound the complete JSON response, including its body. Never retry a write
  // here: a timed-out write may already have committed; revision-aware saving
  // must reconcile that uncertainty before a retry.
  const transport=window.fetch.bind(window);
  async function fetchWithDeadline(input,init={}) {
    const controller=new AbortController(),upstream=init.signal||input?.signal;
    let timer,abortListener;
    const cancelled=new Promise((_,reject)=>{
      abortListener=()=>{controller.abort(upstream?.reason);reject(upstream?.reason||new DOMException('Request cancelled','AbortError'));};
      if(upstream?.aborted)abortListener();else upstream?.addEventListener('abort',abortListener,{once:true});
      timer=setTimeout(()=>{const error=Object.assign(new Error('Cloud request timed out. Saved entries remain available for retry.'),{code:'GOLF_TIMEOUT'});reject(error);controller.abort(error);},20000);
    });
    try {
      if(controller.signal.aborted)return await cancelled;
      return await Promise.race([cancelled,(async()=>{
        const response=await transport(input,{...init,signal:controller.signal});
        const body=await response.arrayBuffer();
        return new Response([101,204,205,304].includes(response.status)?null:body,{status:response.status,statusText:response.statusText,headers:response.headers});
      })()]);
    } finally {clearTimeout(timer);upstream?.removeEventListener('abort',abortListener);}
  }
  window.GolfCloudRequest={fetch:fetchWithDeadline};
})();
