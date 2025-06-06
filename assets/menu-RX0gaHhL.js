import{p as d}from"./pako.esm-QfSfXnLH.js";function l(r){const e=window.atob(r),n=e.length,t=new Uint8Array(n);for(let a=0;a<n;a++)t[a]=e.charCodeAt(a);return t}function i(r){return r?r.replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]):""}function m(r){const e=document.getElementById("menu-content");if(e.innerHTML="",!r||r.length===0){e.innerHTML='<p class="error">No menu data found.</p>';return}r.forEach(n=>{if(!n.name&&(!n.items||n.items.length===0))return;const t=document.createElement("div");t.className="section";let a="";n.items.forEach(o=>{!o.name&&!o.price||(a+=`
                <div class="item">
                    <div class="item-details">
                        <b>${i(o.name)}</b>
                        ${o.description?`<p>${i(o.description)}</p>`:""}
                    </div>
                    <div class="item-price">${i(o.price)}</div>
                </div>
            `)}),t.innerHTML=`
            <h2>${i(n.name)}</h2>
            ${a}
        `,e.appendChild(t)})}function p(){const r=document.getElementById("menu-content");try{const n=new URLSearchParams(window.location.search).get("data");if(!n)throw new Error("No 'data' parameter found in URL.");let t=n.replace(/-/g,"+").replace(/_/g,"/");const a="=".repeat((4-t.length%4)%4),o=l(t+a),c=d.inflate(o,{to:"string"}),s=JSON.parse(c);m(s)}catch(e){console.error("Failed to load or render menu:",e),r.innerHTML=`<p class="error">Error: Could not display the menu. The link may be corrupted. <br/>(${e.message})</p>`}}p();
