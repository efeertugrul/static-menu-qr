function m(e){return typeof e!="string"?"":e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function f(e,a){e.innerHTML="";const s=a.theme||{};if(s.fontFamily&&s.fontFamily.includes(",")){const t=s.fontFamily.split(",")[0].replace(/'/g,"").trim();if(t!=="Inter"){const i="dynamic-google-font";if(!document.getElementById(i)){const l=document.createElement("link");l.id=i,l.rel="stylesheet",l.href=`https://fonts.googleapis.com/css2?family=${t.replace(/ /g,"+")}:wght@400;700&display=swap`,document.head.appendChild(l)}}}e.style.setProperty("--primary-color",s.primaryColor||"#333"),e.style.setProperty("--text-color",s.textColor||"#555"),e.style.setProperty("--font-family",s.fontFamily||"'Inter', sans-serif");const r=document.createElement("div");r.className="menu-header",r.innerHTML=`<h1>${m(a.title||"Our Menu")}</h1>`,e.appendChild(r);const c=document.createElement("div");c.className="menu-content",!a.sections||a.sections.length===0?c.innerHTML='<p class="no-items">This menu is empty.</p>':a.sections.forEach(t=>{if(!t.name&&(!t.items||t.items.length===0))return;const i=document.createElement("div");i.className="menu-section";const o=(t.items||[]).map(n=>{const d=n.image?`<img src="${n.image}" alt="${m(n.name)}" class="menu-item-image">`:"",g=(n.tags||[]).map(p=>`<span class="item-tag item-tag-${p}">${p.replace(/_/g," ")}</span>`).join("");return`
            <div class="menu-item">
              <span class="menu-item-name">${m(n.name)}</span>
              <span class="menu-item-price">${m(n.price)}</span>
              <p class="menu-item-description">${m(n.description||"")}</p>
              ${d}
              <div class="item-tags">${g}</div>
            </div>
          `}).join("");o.trim()!==""&&(i.innerHTML=`
          <h3>${m(t.name)}</h3>
          <div class="menu-items">${o}</div>
        `,c.appendChild(i))}),e.appendChild(c)}export{f as r};
